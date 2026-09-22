# Design: Single Live QA Dashboard (no mode switch) + Per-Page Sync + QA Members Menu

**Date:** 2026-09-22
**Status:** Approved by user, ready for implementation plan
**Relates to / supersedes (in scope described here):**
- `docs/IMPLEMENTATION-STATUS-AND-PLAN.md` (mode switch, project registration flow)
- `docs/BACKEND-TECHNICAL-DESIGN.md` §4.1 (async bootstrap validation), §6.2 (endpoint catalog)
- `docs/PRD-QA-Monitoring-Dashboard.md` (RBAC/SSO requirements — explicitly descoped here)

## 1. Context

The FE (`monitoring-qa-alfagift`, Angular) and BE (`ms-monitoring-qa-be`, Go) already implement a large part of the documented MVP: a Demo Mode (fixture data) and an API Mode (live PostgreSQL-backed data) behind a mode switch, plus a `SyncJob` / `SyncStep` schema (GORM tables `sync_jobs` / `sync_steps`) that already logs every synchronization with per-source detail.

This spec captures four deliberate deviations/decisions made with the product owner (QA Manager) to move from "demo + live toggle" to a single live dashboard used only by QA Leads, with a simpler synchronous project-registration flow and per-page sync instead of a single portfolio-wide sync.

There is no multi-role access model. The dashboard has one persona (QA Lead) and no RBAC/SSO gate is implemented as part of this scope — the existing `X-Manager-Key` header check may remain as a simple shared-secret gate for write endpoints, but no per-role permission matrix is introduced.

**Note on naming:** the design docs in this repo use conceptual names (`qa_project`, `sync_job`, `qa_member`) that do not match the actual Go/GORM identifiers. Research into the real `ms-monitoring-qa-be` code (2026-09-22) found the real names are `Project` (table `projects`), `SyncJob`/`SyncStep` (tables `sync_jobs`/`sync_steps`), and `Member` (table `members`, no HTTP surface yet). This spec uses the real names from here on. It also found two endpoints this spec originally assumed already existed do not: `GET /api/v1/qa-members` (no QA-member HTTP surface exists at all yet) and `GET /api/v1/sync-status` (freshness is already returned inline on every dashboard GET response instead — see §2.3).

## 2. Decisions

### 2.1 Frontend: remove the Demo/API mode switch

Demo Mode's visual design (pages, cards, tables, filters, charts, dialogs) is the final, only design. It is no longer a fixture-backed alternate mode — it becomes the live dashboard.

- Delete the mode toggle UI and the branch in `dashboard-state.ts` that chooses between demo fixtures and live data.
- Delete `src/app/core/demo-data.ts` and any code path that renders it.
- `live-dashboard.store.ts` (or its renamed equivalent) becomes the only state source, always calling `dashboard-api.service.ts`.
- Loading/empty/error/source-freshness/sync-history states already built for API Mode become the states for all pages — no separate "demo" empty state.
- Routes stay: `/projects`, `/workflow`, `/workload`, `/bugs`, plus a new `/qa-members` (see §2.4).

### 2.2 Add QA Project: synchronous, validate-only submit

Deviates from the current `internal/repository/monitoring.go` `SaveProjectMapping` (called by the `POST /projects` handler in `internal/monitoring/http.go`), which inserts the row with `Status = "pending_validation"` and enqueues a `SyncJob{Trigger: "project_validation"}` with two queued `SyncStep`s (`jira`, `qase`) for the worker to validate asynchronously.

New behavior for `POST /api/v1/projects`:

1. Validate request shape (dates, required fields) as today (`projectRegistration.validate()`).
2. Synchronously call a new `Connector.JiraIssue(ctx, key)` (to be added in `internal/monitoring/connector.go`, following the existing `x.do(req, dest)` retry/error-mapping helper, hitting `GET /rest/api/3/issue/{key}`) to confirm the INIT ticket exists and is the expected issue type.
3. Synchronously call a new `Connector.QaseProject(ctx, code)` (same file, same `x.do` pattern, hitting `GET /v1/project/{code}`) to confirm the Qase project code exists.
4. If both checks pass, insert the `Project` row and return `201`. **Do not set `Status` to a new sentinel value like `"ACTIVE"`.** The `Status` column is already used elsewhere as a mirror of the Jira issue's live status name — the worker's `syncJira` (`internal/monitoring/worker.go:242-249`) overwrites it with whatever `Jira issue status` says on every scheduled/global sync. Leave `Status` at its zero value (`""`) on creation; it gets populated the first time a sync runs. "Row exists in `projects`" is what "validated/registered" means now — no separate status flag is needed for that.
5. If either check fails, return `422` with a clear error (`JIRA_INIT_NOT_FOUND`, `QASE_PROJECT_NOT_FOUND`, etc.) and do not insert the row.
6. No backfill (cases/runs/results/bugs) happens during this request. The project starts with zero stored Qase/Jira data until a sync is run (§2.3).
7. Remove the `SyncJob`/`SyncStep` creation block from `SaveProjectMapping` (currently lines 536–544 of `internal/repository/monitoring.go`) — project creation no longer creates any sync job.

Because this is now two small synchronous upstream calls (not a paginated backfill), request latency stays low (roughly 1–2 seconds) and no polling/job-id is needed for this step. `SyncJob`/`SyncStep` are only created by the per-page sync described next.

### 2.3 Per-page sync — reuse existing sync-jobs endpoint, no new schema or endpoint

`internal/monitoring/http.go`'s `createJob` handler already implements `POST /api/v1/sync-jobs` accepting a `sources []string` array (values are **lower-case** `"jira"`/`"qase"`, not `"JIRA"`/`"QASE"`) and an optional `scope.projectId`. No backend schema or endpoint change is needed for "per-page sync" — it is purely a matter of which `sources` the FE requests from which page. `DashboardApiService.sync()` currently hardcodes `sources: ['jira', 'qase']`; it needs a `sources: string[]` parameter instead.

| Page | `sources` sent | Reasoning |
| --- | --- | --- |
| Projects | `['jira','qase']` | Cards show both Jira-derived and Qase-derived fields |
| Workflow | `['qase']` | Daily execution/pass-rate charts are Qase-only |
| Workload | `['qase']` | Per-member daily execution is Qase-only |
| Bugs | `['jira']` | Bugs are Jira issues only |

Each of the 4 pages gets its own "Sync" button that:

1. `POST /api/v1/sync-jobs` with the page's `sources` list and an `Idempotency-Key` header.
2. Polls `GET /api/v1/sync-jobs/{id}` (existing) until `SyncJob.status` is terminal.
3. On completion, refreshes only that page's own dashboard GET query.

Error surfacing does **not** need a new `GET /api/v1/sync-status` endpoint (no such endpoint exists today, and the design doc's assumption that it did was wrong). Two existing sources of truth already cover it:
- The polled `GET /sync-jobs/{id}` response already includes each `SyncStep`'s `errorCode` — the page can show that immediately if the job's sources for that page ended `"failed"`/`"partial"`.
- Every dashboard GET endpoint (`/projects`, `/workflow`, `/workload`, `/bugs`) already returns an envelope with a `sources: { jira: {status, syncedAt}, qase: {status, syncedAt} }` field (`DashboardApiService`'s `ApiResponse<T>`). After a page's sync completes and it re-fetches its own data, this same envelope shows updated freshness for only the sources that page cares about.

`SyncJob` is the one durable "when did we last try to sync and what happened" table, `SyncStep` already carries the FK to it plus per-source detail. This is exactly the "1 table with FKs to Jira/Qase sync detail" the product owner described; it already exists, unchanged by this spec.

### 2.4 QA Members: one new menu, simple CRUD, no RBAC

A 5th menu item, `/qa-members`, lets the QA Lead manage the list of QA members/leads used to populate the "QA owner" dropdown on Add QA Project.

**Correction from initial draft:** there is no existing `GET /qa-members` endpoint or QA-member HTTP surface at all today. The `Member` GORM struct already exists (`internal/repository/monitoring.go`, table `members`) with fields `ID`, `Name`, `JiraAccountID`, `QaseMemberID`, `WeeklyCapacityHours` — used today only internally by the Workload query. It has no `Active` field and no route of any kind. This spec builds the full CRUD surface from scratch, reusing only these existing fields (no `email`/`team`/`title` — those don't exist in the model and nothing requires them, so they are not added):

- `GET /api/v1/qa-members` — list members (add `active` to the response).
- `GET /api/v1/qa-members/{id}` — single member detail.
- `POST /api/v1/qa-members` — create `{ name, jiraAccountId, qaseMemberId, weeklyCapacityHours }`.
- `PATCH /api/v1/qa-members/{id}` — edit any of the above fields, or set `active: false` (soft-deactivate; add an `Active bool` column, default `true`, to the `Member` struct — never hard delete, consistent with the rest of the system's audit/retention approach).

New FE page: a table of QA members with add/edit/deactivate actions, following the existing table+`<dialog>`+store-draft pattern already used by `src/app/shared/live-dashboard/live-dashboard.html` (sync history table + Add-Project dialog) — this repo does not use Tailwind utility classes in templates despite it being a devDependency; all styling is hand-written CSS classes in `src/styles.css`/`app.css`/`live-dashboard.css`, so the new page follows that same convention rather than introducing Tailwind usage. The route must also be added to the sidebar nav array (`DashboardState.nav`/`iconIds`) and a new nav icon `<symbol>` added to the icon sprite in `app.html`. No separate role or permission is introduced — any user of this single-persona dashboard can manage this list, same as they can add projects and trigger sync.

### 2.5 FE removal scope (research findings, for plan precision)

`demo-data.ts` is only imported by `src/app/core/dashboard-state.ts` — safe to delete outright once that file's demo branches are gone. `DashboardState` (872 lines) is not a thin wrapper; the "demo vs live" branch (`private readonly liveMode = signal(false)`, always driven to `true` by `LiveDashboardStore.enabled`) touches roughly a dozen computed/methods (`workloadSummary`, `environmentHealth`, `memberWorkloadExecution`, `projectChartValue`, `workloadTrendValue`, `workloadPressure`, `capacityTrendValue`, `projectTrend`, plus the demo-only `addProject()`/`requestSync()` methods and `useDemoData()`). The rule for each: keep only the `if (this.liveMode())` arm, unbranched; delete the `else` (demo) arm entirely; delete `useDemoData()`, `requestSync()`, and the demo `addProject()`; seed previously demo-seeded signals (`memberData`, `defectData`, `projects`, `failedCases`, `knowledgeItems`, `documentation`) with empty values instead.

`LiveDashboardStore.enabled` (always `true` once the toggle is gone) and `toggle()` are deleted entirely; every `live.enabled()` check in `app.ts`/`app.html` is deleted along with its demo-branch alternative. `toggle()` currently doubles as the only place that unsubscribes the 15s poll (`this.poll?.unsubscribe()`) — since `LiveDashboardStore` is a root-provided singleton with no natural teardown point, the plan must decide where that subscription now gets cleaned up (acceptable answer for an app-lifetime singleton: it simply runs for the life of the app, matching how `connect()` is already called once from `App`'s constructor).

The `DashboardDialogsComponent`'s `#qaDetail` and `#detail` dialogs are **not** demo-only (they render live project/member detail) and must be kept; only its `#projectForm` (demo add-project dialog bound to `state.draft`) and `#reminder` (demo "simulate notification" dialog) are pure demo artifacts tied to `state.members` (demo data) and are deleted. Notifications (email/Telegram) are explicit PRD **P1** scope (`PRD-QA-Monitoring-Dashboard.md` §6, FR-09), not part of this MVP pass — the demo "simulate notification" dialog is removed rather than re-wired, and can be rebuilt properly against FR-09 in a future spec.

`src/app/app.spec.ts` is the only spec file in the repo (Angular 21 + Vitest via the `@angular/build:unit-test` builder, not Karma/Jasmine). It has two spots that break once the mode switch is gone: the test at lines 47–73 that calls `state.useDemoData()` and asserts a demo project reappears, and the `store.toggle();` call at line 179 inside the polling test. Both need rewriting, not just deleting, since they currently anchor real assertions about live-data mapping and polling behavior.

Adding a per-page Sync button is not a template-only change: none of the four page components (`src/app/pages/{projects,workflow,workload,bugs}/*.ts`, all ~13-line wrappers today) currently inject `LiveDashboardStore` or `DashboardApiService` — they only read from `DashboardState`. Each page component needs to inject the store (or a new leaner sync-trigger service) directly to own its page-scoped `sources` array and sync button state.

## 3. What is explicitly out of scope here

- SSO, RBAC, and per-role permission matrices from the PRD (§5, §12 of `PRD-QA-Monitoring-Dashboard.md`) are not implemented. The existing `X-Manager-Key` shared-secret header may stay as-is for write endpoints; it is not a role system.
- Secret-manager integration (Vault/AWS/GCP Secrets Manager) described in `BACKEND-TECHNICAL-DESIGN.md` §12 is not implemented. `JIRA_API_TOKEN`, `JIRA_EMAIL`, `JIRA_BASE_URL`, `QASE_API_TOKEN`, `QASE_BASE_URL`, and `MONITOR_MANAGER_API_KEY` stay as plain `.env` values loaded by the Go backend at startup, matching the existing pattern already documented in `IMPLEMENTATION-STATUS-AND-PLAN.md` §4. The `.env` file must not be committed to git (already covered by the repo's `.gitignore`).
- Solr/RAG coverage, notifications (email/Telegram), and documentation-readiness modules are unaffected by this spec and remain as previously scoped (not part of this change).
- Async `PROJECT_BOOTSTRAP` backfill-on-create is removed in favor of §2.2; nothing else about the worker/backfill design (`SYNC-RUNBOOK-JIRA-QASE.md`) changes — the per-page Sync button still drives the same worker code and pagination rules already documented there.

## 4. Testing

- FE: rewrite the two now-broken assertions in `src/app/app.spec.ts` (the `useDemoData()`-based test and the `store.toggle()` call in the polling test); add new spec files (there are none today besides `app.spec.ts`) for the per-page sync button (correct lower-case `sources` sent per page, using `HttpTestingController` the same way `app.spec.ts` does) and the QA Members CRUD page.
- BE: unit test (`internal/monitoring/http_test.go` style, table-driven, plain `testing` + `httptest`) for the new synchronous validate-then-insert path in `POST /projects` (valid INIT + valid Qase code → `201`, row inserted with empty `Status`; invalid either → `422`, no row inserted) and for the new `JiraIssue`/`QaseProject` connector functions (`internal/monitoring/connector_test.go` style, `httptest.NewServer` fakes). Unit/integration tests for `POST`/`PATCH /qa-members`. Existing `sync_jobs`/`sync_steps` tests are unaffected since no schema changes are introduced there.
- E2E smoke: add project (synchronous Jira+Qase validation) → see it appear with empty charts → click Sync on Workflow page (`sources: ['qase']`) → charts populate → click Sync on Bugs page independently (`sources: ['jira']`) and confirm Workflow data is untouched → simulate a Jira failure on Bugs sync and confirm only the Bugs page shows the error (from the job's step `errorCode`) while Workflow/Workload remain unaffected.
