# Product Requirements Document: QA Monitoring Dashboard

| Field         | Value                            |
| ------------- | -------------------------------- |
| Version       | 3.1                              |
| Updated       | 13 September 2026                |
| Product owner | QA Team                          |
| Primary users | QA Manager, QA Lead, QA Engineer |
| Status        | Draft for review                 |
| Product       | Alfagift QA Monitoring Dashboard |

## 1. Executive summary

The dashboard gives QA management a single place to monitor project schedules, team workload, Qase execution, Jira bugs, Solr/RAG coverage, documentation readiness, and notifications. Jira, Qase, Solr, and the document repository remain the systems of record.

The product combines automatically synchronized data with controlled master data. Manual configuration is required where source systems cannot reliably provide capacity, cross-system project mapping, expected knowledge documents, or thresholds.

## 2. Problem statement

QA management currently opens several systems and manually reconciles data to answer basic operational questions:

- Who is overloaded or underallocated?
- Which projects are on track, at risk, or overdue?
- Which Qase runs or test cases are stalled?
- How many bugs did each QA member create for an INIT ticket, and how severe are they?
- Are the project test cases available and current in Solr?
- Which people need a reminder or escalation?

This fragmented workflow delays intervention, creates inconsistent metrics, and consumes time that should be spent improving quality.

## 3. Goals

- Provide one traceable view of QA workload, testing, bugs, schedules, and RAG readiness.
- Identify stalled testing, blockers, critical bugs, overloaded QA members, and approaching deadlines.
- Reduce manual weekly reporting effort by at least 50%.
- Preserve drill-down links to the original Jira, Qase, Solr, or document records.
- Keep at least six months of aggregate history for trend analysis.
- Show source freshness and data-quality limitations beside every material metric.

## 4. Non-goals

- Replacing Jira, Qase, Solr, Google Drive, or Google Sheets.
- Ranking employee performance from ticket count or activity alone.
- Changing Jira issue status or Qase results from the dashboard in the MVP.
- Providing a native mobile application.
- Automatically reallocating work without a manager decision.
- Measuring RAG answer quality from index coverage alone.

## 5. Users and access

| Role                          | Needs                                                                                       | Permissions                                |
| ----------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------ |
| QA Manager / QA Lead          | Monitor all projects, configure mappings and thresholds, manage assignments, send reminders | Full dashboard and configuration access    |
| QA Engineer                   | View assigned projects, testing, workload, and relevant knowledge                           | Read-only access to permitted project data |
| Project / Engineering Manager | View agreed project-level quality and schedule indicators                                   | Read-only access to permitted project data |

Dashboard access must not expand a user's permission to sensitive source data. The backend must filter records before aggregation and export. Use per-user OAuth when dashboard permissions must exactly match Jira permissions; otherwise use an approved read-only service account and dashboard-level project access rules.

## 6. MVP scope and priority

| Priority | Delivery                                                                                                                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | INIT registration, QA assignments, workload, Qase progress and stalled tests, bugs by INIT and creator, Qase-to-Solr coverage, manager-triggered email or Telegram reminders, SSO/RBAC, freshness, and audit history |
| P1       | Automatic notification rules, documentation readiness, run comparisons, production/canceled bug analysis, data-quality page, and CSV export                                                                          |
| P2       | PDF export, dark mode, velocity projections, and allocation suggestions based on sufficient historical data                                                                                                          |

All pages provide global filters for date range, project, team, and QA member when the underlying fields are available.

## 7. Functional requirements

### FR-01: Register and manage QA projects

The manager can add a project by entering a Jira INIT issue key, QA start and end dates, assigned QA members, a Qase project code, monitored runs or scope, and an optional Solr collection.

An INIT ticket is an initiative record, not a Jira project key or Qase project code. Cross-system relationships must use verified IDs or configured mappings; name similarity is insufficient.

Required fields:

- Jira INIT issue key and verified title.
- QA start date and end date.
- At least one active QA member and one primary owner.
- Planned QA hours per person and week.
- Qase project code and monitored run or suite scope.
- Solr collection and metadata mapping when RAG coverage is enabled.

Validation rules:

- Validate issue-key format, access, and configured issue type.
- Reject an end date before the start date.
- Reject a duplicate active INIT record.
- Confirm that Qase runs belong to the selected Qase project.
- Store local planning dates in Asia/Jakarta and integration timestamps in UTC.
- Require a reason when changing an approved schedule baseline.
- Archive records without deleting history.

Acceptance criteria:

1. A valid INIT with two QA members appears once in the project list.
2. Invalid date ranges and duplicate INIT records are rejected.
3. A failed Jira validation is not shown as successful.
4. Assignment changes update future workload calculations and preserve prior snapshots.
5. A read-only QA user cannot create or modify projects through the API.

### FR-02: Monitor team workload

The MVP uses planned QA hours as the common capacity unit. Story points, issue counts, test cases, and hours must not be added together.

- Weekly capacity equals available working hours minus approved leave and holidays.
- Planned utilization equals allocated QA hours divided by available capacity.
- Utilization at or below 100% is Within Capacity; above 100% is Overloaded.
- Missing capacity is Unknown, not zero.
- Zero capacity with an active assignment is Capacity Unavailable.
- Show assigned runs, remaining test cases, blockers, and created bugs as separate context fields.
- Show unassigned work explicitly.

Example: 42 allocated hours / 35 available hours = 120% planned utilization.

Acceptance criteria:

1. Two allocations of 20 and 22 hours produce 42 allocated hours.
2. Approved leave reduces capacity for the affected week.
3. Filtering by QA member updates both totals and drill-down records.
4. Unassigned work remains visible.
5. Historical workload does not change when a future assignment is edited.

### FR-03: Monitor Qase execution and stalled test cases

The counting unit is a test instance identified by Qase project, run, case, and configuration ID when available. The latest result determines current status; all result history remains available for trend analysis.

Normalized statuses are Passed, Failed, Blocked, Skipped, Invalid, In Progress, Not Run, and Unknown. Unmapped custom statuses become Unknown and create a data-quality warning.

Metric definitions:

- `execution_rate = (passed + failed) / planned_test_instances × 100%`
- `pass_rate = passed / (passed + failed) × 100%`
- A zero denominator displays N/A.
- Retry updates the current status and does not increase the denominator.
- Scope growth is recorded so percentage changes can be explained.

A test instance is Stalled when it is nonterminal in an active run and has no relevant result or progress for more than one working day. The initial calendar is Monday–Friday, 09:00–17:00 Asia/Jakarta; holidays and leave are configurable. Ordinary comments do not count as execution progress. An official pause stops the timer and requires a reason.

Do not flag a Not Run case before its planned start. If Qase data is more than two sync intervals old, preserve the last known condition and suspend new stalled classifications.

Project status precedence:

1. Completed: the manager completes the sign-off checklist.
2. Unknown: required data is missing or stale.
3. Off Track: the QA deadline has passed without sign-off.
4. At Risk: a critical blocker exists or actual progress trails expected working-time progress by at least 20 percentage points.
5. On Track: none of the above conditions apply.
6. Planned: the QA start date has not arrived.

Acceptance criteria:

1. A Failed-to-Passed retry remains one test instance.
2. Eight Passed, two Failed, and five Not Run produce 66.7% execution and 80% pass rate.
3. A weekend does not trigger a one-working-day stall.
4. Stale source data cannot create a new late or stalled accusation.
5. Drill-down record counts match the aggregate totals.

### FR-04: Monitor bugs by INIT and QA creator

Each INIT card shows unique bug count, open bugs, severity breakdown, and bugs created by each QA member. Clicking a severity or creator filters the issue list while retaining INIT context.

Bug-to-INIT relationships use a verified parent hierarchy, explicit issue-link type, or configured INIT custom field. A title or summary match is insufficient. Preserve relationship evidence for drill-down and reconciliation.

“Created by QA” uses Jira `creator.accountId`. Assignee and reporter appear separately. Bot-created tickets require an approved reported-by-QA field; otherwise they appear as Unattributed.

Severity comes from the agreed severity field. Jira priority is only used if an explicit mapping is approved. Blocker, Critical, Major, Minor, Trivial, and Unknown remain separate.

Portfolio totals use distinct Jira issue IDs when a bug is linked to multiple INIT records. Canceled and duplicate bugs remain in history with their resolution reason.

Acceptance criteria:

1. A bug created by QA A and assigned to Developer B increments QA A's creator count.
2. A similarly named issue without a verified relationship is excluded.
3. A bug linked to two INIT records appears on both cards but once in portfolio totals.
4. Missing severity appears as Unknown.
5. Canceled bugs remain available in history.

### FR-05: Monitor Qase-to-Solr/RAG coverage

The denominator is the unique, active Qase cases in the selected scope. Solr document or chunk count must never be used as the test-case count.

The canonical key is `(qase_project_code, case_id)`. Solr metadata should also store the source update timestamp or content version/hash, index timestamp, collection, ingestion state, and expected chunk count when chunking is used.

Exclusive states:

- Fresh: source and indexed version match, and ingestion is complete.
- Outdated: a case is indexed with an older source version.
- Missing: no indexed record exists after a complete successful query.
- Error: the ingestion pipeline reports failure.
- Unknown: mapping, version, completion, permission, or query evidence is insufficient.

Metrics:

- `indexed_coverage = (fresh + outdated) / eligible_cases × 100%`
- `fresh_coverage = fresh / eligible_cases × 100%`
- An empty eligible scope displays N/A.

One test case split into ten chunks still counts as one case. The presence of one chunk does not prove complete ingestion unless a completion marker or chunk manifest exists.

Acceptance criteria:

1. A ten-chunk case counts once.
2. An older indexed version is Outdated.
3. A failed Solr query produces Unknown, not Missing.
4. A shared collection only counts records mapped to the selected project.
5. All query pages complete before a gap is classified as Missing.

### FR-06: Project schedule and progress

Show all active QA projects with start date, target date, remaining working days, execution progress, health status, and a plain-language status reason. Provide drill-down links to contributing Jira issues and Qase runs.

The project completion indicator does not imply testing approval. A run at 100% execution with failed cases still requires QA sign-off and exception handling.

Acceptance criteria:

1. Every active project appears exactly once from the project master mapping.
2. A project past its QA target date without sign-off is Off Track.
3. Progress totals reconcile with the selected Qase scope.
4. All displayed planning dates use Asia/Jakarta.

### FR-07: Daily progress and blockers

Show daily status changes, completed issues, Qase execution activity, active blockers, blocker age, and team throughput. Stalled labels apply to work items, not people. Do not label an individual Productive, Slow, or Idle from ticket activity alone.

Burndown or burnup charts are only shown when sprint scope and estimates are used consistently. Working-day calculations use the configured calendar; otherwise the UI explicitly labels calendar days.

### FR-08: Documentation readiness

Use a controlled manifest of required project documents. The MVP may use Google Sheets as the manifest and Google Drive for file metadata.

Supported states are Completed, In Progress, Not Started, Missing Link, Outdated, and Permission Error. A record without a usable link cannot be Completed. Required types initially include User Guide, Technical Document, Test Strategy, Test Plan, and Release Notes.

### FR-09: Manager-triggered and automatic notifications

For P0, a manager selects a project, QA member, or stalled test; chooses Email or Telegram; reviews and edits a preview; and submits the reminder. The UI reports queue and provider status but must not claim that a message was read.

Recipients must come from an approved internal directory. Email uses the company provider. Telegram requires a verified chat ID and bot onboarding. Credentials and destination IDs stay on the backend.

Default message content includes INIT key, QA member, condition, age or deadline in Asia/Jakarta, source timestamp, and an authenticated dashboard link. Sensitive bug details are excluded by default.

P1 automatic triggers include:

- A test stalled for more than one working day.
- A QA deadline within two days while execution is below 100%.
- A newly detected Critical bug.
- Planned utilization above 100%.
- Fresh RAG coverage below 95% within two days of deadline.

Default quiet hours are 18:00–09:00 Asia/Jakarta and company holidays. Critical out-of-hours escalation requires opt-in. A deduplication key and 24-hour cooldown prevent repeated alerts for the same episode.

Delivery states are Preview, Queued, Provider Accepted, Failed, and Unknown. Provider Accepted is not a read receipt. Use a transactional outbox and idempotency key to prevent double-click duplication. Retry transient failures up to three times with backoff.

Acceptance criteria:

1. Preview does not send a message.
2. Double-clicking submit creates one outbox job.
3. A recipient without a verified destination is rejected.
4. Provider failure is shown as Failed.
5. Every manual trigger records actor, recipient, channel, payload hash, source timestamp, and result.
6. Automatic notifications respect quiet hours, cooldown, and stale-source rules.

## 8. Data model

| Entity                           | Important fields                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `qa_project`                     | UUID, Jira INIT ID/key, name, start/end, baseline, lifecycle, sign-off, version                   |
| `qa_member` / `identity_mapping` | Internal ID, Jira account ID, Qase user ID, team, active flag, notification destination reference |
| `project_assignment`             | Project, member, effective interval, planned hours, primary owner                                 |
| `capacity_calendar`              | Member/week, available hours, leave, holiday calendar                                             |
| `source_scope`                   | Project, source, external project/run/collection, filters, mapping version                        |
| `test_instance` / `test_result`  | Composite external ID, latest status, assignee, due date, activity timestamp; unique result ID    |
| `bug` / `project_bug`            | Jira issue ID, creator, reporter, severity, status, timestamps, relationship evidence             |
| `rag_case_state`                 | Canonical case ID, source version, index version, ingestion status, indexed time                  |
| `daily_snapshot` / `sync_job`    | Source, scope, as-of time, aggregate, watermark, completion/error                                 |
| `notification` / `outbox`        | Idempotency key, rule episode, channel, recipient reference, status, attempts                     |
| `audit_event`                    | Actor, action, entity, before/after value, reason, timestamp                                      |

Database constraints enforce unique external IDs, ordered dates, nonnegative hours, valid foreign keys, and optimistic concurrency for manager edits.

## 9. Integration and API requirements

### Jira

Use Jira REST APIs and saved filter/JQL definitions rather than scraping rendered dashboard gadgets. For the existing dashboard `10105` and gadget `10142`, obtain the underlying saved filter ID or approved JQL. Request only required fields, paginate every search, respect issue security, and reconcile counts at the same timestamp and permission context.

### Qase

Synchronize projects, runs, cases, results, assignments, environments, priorities, and severity where available. Confirm external identifier semantics from sample API responses before implementation.

### Solr

Query configured collections through a read-only backend connection. Validate schema fields for canonical case ID, source version, ingestion completion, and project mapping. Do not expose Solr credentials to Angular.

When this product also owns knowledge ingestion, the backend may store normalized text chunks and dense vectors in Solr. The ingestion worker generates embeddings outside Solr, then upserts the chunk text, vector, source metadata, and a completion manifest. Original Qase, Jira, and document records remain the source of truth; Solr is the searchable retrieval index.

Use one collection per stable QA domain, such as `tc_payment` or `tc_promo`, while storing `project_key` and `qase_project_code` as filter fields. Do not create a collection for every INIT ticket. Reindex into a versioned collection and atomically switch a stable alias after validation.

Minimum indexed fields are `id`, `knowledge_id`, `chunk_no`, `chunk_count`, `source_type`, `source_key`, `project_key`, `qase_project_code`, `title`, `content`, `source_url`, `source_updated_at`, `content_hash`, `indexed_at`, `ingestion_status`, `embedding_model`, and `embedding`. The vector dimension must match the configured embedding model.

Knowledge backend endpoints:

- `POST /api/knowledge/sync` queues an incremental source synchronization.
- `POST /api/knowledge/collections/:collection/reindex` queues a full rebuild.
- `GET /api/knowledge/collections` returns coverage, freshness, last sync, and errors.
- `GET /api/knowledge/documents` returns searchable ingestion detail.
- `POST /api/knowledge/query` performs filtered hybrid retrieval and returns cited sources.

### Dashboard API

- `GET /api/overview`, `/api/projects`, `/api/projects/:id`
- `POST /api/projects`, `PATCH /api/projects/:id`
- `GET /api/workload`, `/api/test-instances`, `/api/bugs`, `/api/rag-coverage`
- `POST /api/notifications/preview`, `POST /api/notifications`
- `GET /api/notifications`, `/api/integrations/health`
- `GET /api/exports.csv`

Aggregate responses include source-as-of timestamps, sync status, denominator, unknown count, applied filters, and pagination cursor. The API distinguishes validation, authentication, authorization, conflict, rate-limit, and upstream errors.

## 10. Recommended architecture

The existing repository uses Angular 21 and Tailwind CSS 4. Continue with Angular standalone components and Tailwind. Ionic is unnecessary for a desktop/tablet monitoring dashboard and should only be reconsidered if a mobile application becomes a committed requirement.

```text
Jira API ─────┐
Qase API ─────┼──> Sync / ingestion worker ──> Embedding API ──> Solr collections
Docs APIs ────┘                 │                                  │
                               └──> PostgreSQL <── RBAC backend <──┘──> Angular dashboard
                                         │
                                         └──> Transactional outbox ──> Email / Telegram
```

One scheduler/worker is sufficient initially. Add Redis or a message broker only when measured queue volume, throughput, or reliability requirements justify it.

Run automatic synchronization twice daily at 08:00 and 17:00 Asia/Jakarta. A manager-only Sync data action may queue an additional guarded job. All jobs use watermark overlap, pagination, deduplication, cooldown, and rate-limit retry. Advance a watermark only after the complete scope succeeds, reconcile mapped records during the evening run, and retain the last valid snapshot when a source is unavailable.

## 11. Non-functional requirements

### Performance and freshness

| Requirement         | MVP target                                         |
| ------------------- | -------------------------------------------------- |
| Overview load time  | p95 below 3 seconds from stored data               |
| Filter response     | p95 below 2 seconds for six months of aggregates   |
| Sync interval       | 08:00 and 17:00 Asia/Jakarta, configurable         |
| Manual sync         | Manager-triggered, queued, with 15-minute cooldown |
| Stale warning       | No successful source sync for more than 18 hours   |
| Concurrent users    | At least 20                                        |
| Aggregate retention | At least six months                                |

### Security

- Use company SSO when available.
- Enforce backend RBAC and project-level access.
- Use HTTPS for all connections.
- Store and rotate secrets in the approved secret manager.
- Apply least-privilege, read-only source access where possible.
- Never log tokens, authorization headers, chat IDs, or sensitive payload fields.
- Audit configuration, schedule, assignment, override, and notification changes.
- Prevent spreadsheet-formula injection in CSV exports.

### Reliability and operations

- Monthly availability target: 99.5%, excluding planned maintenance.
- Sync jobs must be idempotent.
- Show the last successful snapshot when a source is unavailable.
- Monitor job duration, page count, processed records, failed records, rate limits, and last success.
- Recovery point objective: 24 hours for configuration and snapshots.
- Recovery time objective: eight business hours for the MVP.

### Accessibility and responsive behavior

- Support desktop and tablet layouts, with a usable narrow-screen fallback.
- Never communicate status by color alone; include text and icons.
- Provide numeric summaries and accessible table alternatives for charts.
- Support keyboard navigation, visible focus, labeled inputs, and sufficient contrast.
- Dialogs retain focus and return it to the trigger when closed.
- Use clear navigation icons with accessible text labels.

## 12. Data quality and traceability

Provide a Data Quality view for projects without mappings, issues missing required fields, unmapped identities, cases without stable IDs or versions, documents without links, stale syncs, and reconciliation differences.

Unknown or incomplete data must not be silently converted to zero or excluded. Every aggregate supports drill-down or a visible metric definition.

## 13. Success metrics

| Metric                  | Target                                  | Measurement                                          |
| ----------------------- | --------------------------------------- | ---------------------------------------------------- |
| Weekly reporting effort | At least 50% reduction                  | Compare four weeks before and after adoption         |
| Data accuracy           | At least 95%                            | Reconcile Jira, Qase, and Solr at the same timestamp |
| Freshness               | 95% of syncs complete within 20 minutes | Scheduler logs                                       |
| QA Lead adoption        | Used in weekly QA review                | Audited sessions and review records                  |
| Drill-down validity     | At least 99% valid links in samples     | Automated link check and UAT                         |

## 14. Delivery plan

| Phase                       | Deliverable                                                                    | Estimate  |
| --------------------------- | ------------------------------------------------------------------------------ | --------- |
| Discovery and data contract | Validate source access, fields, mappings, formulas, thresholds, and wireframes | 1–2 weeks |
| Integration foundation      | Backend sync, database, health status, authentication, and Angular shell       | 2 weeks   |
| Core MVP                    | Projects, testing, workload, bugs, RAG, and drill-down                         | 3–4 weeks |
| Supporting modules          | Notifications, blockers, documentation, data quality, and CSV export           | 2–3 weeks |
| UAT and launch              | Reconciliation, security review, fixes, runbook, and handover                  | 1–2 weeks |

Total indicative duration: 9–13 weeks after access and data contracts are available.

## 15. Release readiness

Development is ready when the team provides Jira platform confirmation and source access, saved filters or JQL, custom-field IDs, the bug-to-INIT relationship contract, Qase access and run ownership, Solr schema and completion metadata, QA identities and capacity calendar, notification destinations, SSO and hosting decisions, approved thresholds, and sample totals.

UAT fixtures include two INIT records, three QA members, two runs, a retry, a multi-chunk case, a bug linked to multiple INIT records, missing identities, leave, and a source outage. Release requires exact fixture aggregates, at least 95% source reconciliation with every difference explained, no open critical security issue, a successful backup restore, and an assigned operational owner.

## 16. Risks and mitigations

| Risk                                             | Impact                                           | Mitigation                                                               |
| ------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------ |
| Jira gadget does not expose its filter           | Existing query cannot be recovered automatically | Obtain the filter ID or approved JQL from Jira Admin                     |
| Inconsistent custom fields                       | Incorrect metrics                                | Define a per-project data contract and show missing classifications      |
| Jira or Qase rate limits                         | Delayed data                                     | Select fields, paginate, cache stored aggregates, and retry with backoff |
| Solr lacks source version or completion metadata | False Fresh results                              | Classify records as Unknown until the contract is available              |
| Capacity and workload use different units        | Misleading utilization                           | Refuse the calculation and show Unit Mismatch                            |
| Individual metrics are misused                   | Poor people-management decisions                 | Show workload context and avoid employee ranking                         |
| Source outage                                    | Stale dashboard                                  | Retain the last snapshot and show a prominent stale indicator            |
| Seven modules expand delivery scope              | Late release                                     | Deliver P0 first and review P1 after reconciliation                      |

## 17. Open decisions

1. Is INIT a Jira Initiative issue type, a key prefix, or an internal term?
2. Which hierarchy, issue link, or custom field binds a bug to an INIT?
3. Can one Qase project or run serve multiple INIT records, and how is scope separated?
4. Does Solr already store Qase case ID, source version, and ingestion completion?
5. Who owns capacity, holidays, project sign-off, and thresholds?
6. Which channel launches first: company email or Telegram?
7. Must dashboard permissions exactly match each user's Jira permissions?

## 18. References

- [Jira Cloud issue search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/)
- [Qase test runs](https://developers.qase.io/reference/get-runs)
- [Qase test results](https://developers.qase.io/reference/get-results)
- [Apache Solr query parameters](https://solr.apache.org/guide/solr/latest/query-guide/common-query-parameters.html)
- [Tailwind CSS with Angular](https://tailwindcss.com/docs/installation/framework-guides/angular)
- [Ionic Framework](https://ionicframework.com/docs)
- [Telegram Bot API sendMessage](https://core.telegram.org/bots/api#sendmessage)

Internal links supplied for discovery:

- Jira workload dashboard: `https://gli.atlassian.net/jira/dashboards/10105?maximized=10142`
- Documentation tracking sheet: `https://docs.google.com/spreadsheets/d/1txAvZr-dmYXQr_aM7BNG8URKqx_tZVOa69rrMF1Ysp0/edit?gid=899355803`
- Documentation folder: `https://drive.google.com/drive/folders/10UARoV30FDCuDT7FiZ8C7RFDbow5demc`

These internal links are pointers from the source brief. Their private contents were not inspected during mockup creation and must be validated during discovery.
