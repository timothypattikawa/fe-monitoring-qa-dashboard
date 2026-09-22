# Design: Single Live QA Dashboard (no mode switch) + Per-Page Sync + QA Members Menu

**Date:** 2026-09-22
**Status:** Approved by user, ready for implementation plan
**Relates to / supersedes (in scope described here):**
- `docs/IMPLEMENTATION-STATUS-AND-PLAN.md` (mode switch, project registration flow)
- `docs/BACKEND-TECHNICAL-DESIGN.md` §4.1 (async bootstrap validation), §6.2 (endpoint catalog)
- `docs/PRD-QA-Monitoring-Dashboard.md` (RBAC/SSO requirements — explicitly descoped here)

## 1. Context

The FE (`monitoring-qa-alfagift`, Angular) and BE (`ms-monitoring-qa-be`, Go) already implement a large part of the documented MVP: a Demo Mode (fixture data) and an API Mode (live PostgreSQL-backed data) behind a mode switch, plus a `sync_job` / `sync_job_step` / `sync_cursor` schema that already logs every synchronization with per-source detail.

This spec captures four deliberate deviations/decisions made with the product owner (QA Manager) to move from "demo + live toggle" to a single live dashboard used only by QA Leads, with a simpler synchronous project-registration flow and per-page sync instead of a single portfolio-wide sync.

There is no multi-role access model. The dashboard has one persona (QA Lead) and no RBAC/SSO gate is implemented as part of this scope — the existing `X-Manager-Key` header check may remain as a simple shared-secret gate for write endpoints, but no per-role permission matrix is introduced.

## 2. Decisions

### 2.1 Frontend: remove the Demo/API mode switch

Demo Mode's visual design (pages, cards, tables, filters, charts, dialogs) is the final, only design. It is no longer a fixture-backed alternate mode — it becomes the live dashboard.

- Delete the mode toggle UI and the branch in `dashboard-state.ts` that chooses between demo fixtures and live data.
- Delete `src/app/core/demo-data.ts` and any code path that renders it.
- `live-dashboard.store.ts` (or its renamed equivalent) becomes the only state source, always calling `dashboard-api.service.ts`.
- Loading/empty/error/source-freshness/sync-history states already built for API Mode become the states for all pages — no separate "demo" empty state.
- Routes stay: `/projects`, `/workflow`, `/workload`, `/bugs`, plus a new `/qa-members` (see §2.4).

### 2.2 Add QA Project: synchronous, validate-only submit

Deviates from `BACKEND-TECHNICAL-DESIGN.md` §4.1, which enqueues an async `PROJECT_BOOTSTRAP` job and returns `pending_validation` immediately.

New behavior for `POST /api/v1/projects`:

1. Validate request shape (dates, required fields) as today.
2. Synchronously call `GET /rest/api/3/issue/{jiraInitKey}` (Jira) to confirm the INIT ticket exists and is the expected issue type. No field harvesting beyond what's needed to confirm validity.
3. Synchronously call `GET /v1/project/{code}` (Qase) to confirm the Qase project code exists.
4. If both checks pass, insert into `qa_project` with status `ACTIVE` and return `201`.
5. If either check fails, return `422` with a clear error (`JIRA_INIT_NOT_FOUND`, `QASE_PROJECT_NOT_FOUND`, etc.) and do not insert the row.
6. No backfill (cases/runs/results/bugs) happens during this request. The project starts with zero stored Qase/Jira data until a sync is run (§2.3).

Because this is now two small synchronous upstream calls (not a paginated backfill), request latency stays low (roughly 1–2 seconds) and no polling/job-id is needed for this step. The existing `sync_job` bootstrap concept is dropped for project creation; `sync_job` is only used for the per-page sync described next.

### 2.3 Per-page sync — reuse existing sync-jobs endpoint, no new schema

`docs/BACKEND-TECHNICAL-DESIGN.md` §6.4 already defines `POST /api/v1/sync-jobs` with a `sources: ["JIRA","QASE","SOLR"]` array and project/portfolio `scope`. No backend schema change is needed for "per-page sync" — it is purely a matter of which `sources` the FE requests from which page.

| Page | `sources` sent | Reasoning |
| --- | --- | --- |
| Projects | `["JIRA","QASE"]` | Cards show both Jira-derived and Qase-derived fields |
| Workflow | `["QASE"]` | Daily execution/pass-rate charts are Qase-only |
| Workload | `["QASE"]` | Per-member daily execution is Qase-only |
| Bugs | `["JIRA"]` | Bugs are Jira issues only |

Each of the 4 pages gets its own "Sync" button (scoped to the current project or portfolio, same as today) that:

1. `POST /api/v1/sync-jobs` with the page's `sources` list and an idempotency key.
2. Polls `GET /api/v1/sync-jobs/{id}` (existing) the same way the current sync history UI already does.
3. On completion, refreshes only that page's dashboard query.

Error surfacing: `GET /api/v1/sync-status` (existing) already returns per-source `status`/`lastSucceededAt`. Each page reads only the entries for the sources it cares about and shows a page-scoped error banner (e.g., Bugs page shows a Jira error only; Workflow page shows a Qase error only), using the `sync_job_step.error_code` / `error_message` already modeled. No FK changes are needed — `sync_job` is the one durable "when did we last try to sync and what happened" table, `sync_job_step` already carries the FK to it plus per-source detail, and `sync_cursor` already tracks per-source watermarks. This is exactly the "1 table with FKs to Jira/Qase sync detail" the product owner described; it already exists.

### 2.4 QA Members: one new menu, simple CRUD, no RBAC

A 5th menu item, `/qa-members`, lets the QA Lead manage the list of QA members/leads used to populate the "QA owner" dropdown on Add QA Project.

New backend endpoints (extending the existing `GET /qa-members`, `GET /qa-members/{id}`):

- `POST /api/v1/qa-members` — create `{ displayName, email, team, title, weeklyCapacityHours }`.
- `PATCH /api/v1/qa-members/{id}` — edit fields or set `active: false` (soft-deactivate, matching existing `qa_member.active` column — never hard delete, consistent with the rest of the system's audit/retention approach).

New FE page: a table of QA members with add/edit/deactivate actions, reusing the existing form styling from Add QA Project. No separate role or permission is introduced — any user of this single-persona dashboard can manage this list, same as they can add projects and trigger sync.

## 3. What is explicitly out of scope here

- SSO, RBAC, and per-role permission matrices from the PRD (§5, §12 of `PRD-QA-Monitoring-Dashboard.md`) are not implemented. The existing `X-Manager-Key` shared-secret header may stay as-is for write endpoints; it is not a role system.
- Solr/RAG coverage, notifications (email/Telegram), and documentation-readiness modules are unaffected by this spec and remain as previously scoped (not part of this change).
- Async `PROJECT_BOOTSTRAP` backfill-on-create is removed in favor of §2.2; nothing else about the worker/backfill design (`SYNC-RUNBOOK-JIRA-QASE.md`) changes — the per-page Sync button still drives the same worker code and pagination rules already documented there.

## 4. Testing

- FE: remove/replace unit tests that assert mode-switch behavior; add tests for per-page sync button (correct `sources` sent per page) and QA Members CRUD form.
- BE: unit test for the new synchronous validate-then-insert path in `POST /projects` (valid INIT + valid Qase code → `201 ACTIVE`; invalid either → `422`, no row inserted). Unit/integration tests for `POST`/`PATCH /qa-members`. Existing sync-job/step/cursor tests are unaffected since no schema changes are introduced there.
- E2E smoke: add project (sync validation) → see it appear ACTIVE with empty charts → click Sync on Workflow page → charts populate → click Sync on Bugs page independently and confirm Workflow data is untouched → simulate a Jira failure on Bugs sync and confirm only the Bugs page shows the error while Workflow/Workload remain unaffected.
