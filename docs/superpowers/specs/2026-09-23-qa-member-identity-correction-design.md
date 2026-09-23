# QA Member Identity Correction (Qase & Jira) — Design

**Date:** 2026-09-23
**Status:** Draft, pending user review
**Repos affected:** `monitoring-qa-alfagift` (FE), `ms-monitoring-qa-be` (BE)

## Problem

QA Members store two "identity" fields meant to link a dashboard member to
external systems so we can compute per-person workload:

- `qaseMemberId` — assumed to be the Qase account ID that produced a test
  result (`QaseResult.member_id`, sourced straight from the Qase API's
  `member_id` field on each test run result).
- `jiraAccountId` — assumed to be the Jira Cloud `accountId` of the assignee.

Both assumptions are wrong for how Alfagift's QA team actually works:

- **Qase**: the whole QA team shares **one** Qase login. Every test run
  result's `member_id` is therefore the same shared account, regardless of
  who actually executed the test. Filtering
  `QaseResult WHERE member_id = member.qaseMemberId`
  (`internal/repository/monitoring.go:611,614`) can never distinguish
  individual QA members — it either matches everyone or no one.
  The real identity signal lives in **case-level custom fields**: `QA PIC`,
  `QA Tester`, `QA Tester Android`, `QA Tester IOS` (confirmed live against
  the Alfagift Qase workspace — see "Verified data" below). These are
  workspace-managed select/multiselect fields with a fixed list of names,
  not free accounts.
- **Jira**: each QA member *does* have their own individual Jira login
  (`email` + password), so `JiraIssue.assignee.accountId` genuinely
  identifies the right person. The bug is only in our own form: it asks the
  manager to type in an opaque `accountId` string, which nobody has
  memorized — they only know each other's email. (`Member.JiraAccountID` is
  also currently unused in any query — dead weight today.)

## Verified data (live, 2026-09-23)

Confirmed by hitting the real Qase workspace and Jira site with the tokens
provided this session (`QASE_BASE_URL=https://api.qase.io`,
`JIRA_BASE_URL=https://gli.atlassian.net`):

- `GET /v1/custom_field` (Qase) returns, among others:
  | id | title | type | entity |
  |----|-------|------|--------|
  | 7 | QA PIC | Multiselect | case |
  | 15 | QA Tester | selectbox | case |
  | 16 | QA Tester Android | selectbox | case |
  | 17 | QA Tester IOS | selectbox | case |

  Each field's `value` array is the fixed picklist:
  `{id, slug, title, isActive, ...}`. Example (field 7, QA PIC):
  `{"id":6,"slug":"melisa","title":"Melisa","isActive":true,...}`.

- `GET /v1/case/<project_code>?limit=...` returns each case's selected
  option(s) as **option IDs**, not titles:
  `"custom_fields":[{"id":7,"value":"6"},{"id":15,"value":"6"},{"id":19,"value":"6"}]`.
  So resolving a case's tester name requires: case custom field value (an
  option id, as a string) → look up that id in the matching field
  definition's `value` list → take `title`. (Field `id:19` is `Module`,
  unrelated — cases can carry other custom fields we don't care about.)

- `GET /rest/api/3/user/search?query=<email>` (Jira) resolves an email to
  the real `accountId` and also returns `emailAddress` in the response
  (org's privacy settings do not hide it for our service account), e.g.
  `kiki.manurung@gli.id` → `accountId: 60e3cc8fc0db53006aa59eaf`.

## Design

### 1. Member model: two field renames, one new sync path

`Member` (repo `internal/repository/monitoring.go`) changes:

| Old field | New field | Meaning | Used for |
|---|---|---|---|
| `QaseMemberID` | `QaseDisplayName` | Free-text name, must exactly match a title in Qase's QA PIC/QA Tester(...) picklists | Matching case-level tester/PIC assignment |
| `JiraAccountID` | `JiraEmail` | The member's Jira login email | Resolved server-side to a Jira `accountId`, stored internally, used to match `JiraIssue.assignee` |

`JiraAccountID` is kept as an internal-only column (not exposed on
`QaMemberInput`), populated by resolving `JiraEmail` through Jira's user
search API on create/update. It's what the existing Jira workload queries
already join against, so no query changes needed on that side once it's
populated correctly.

Both `QaseDisplayName` and `JiraEmail` are optional — a member with neither
set just won't show Qase/Jira-sourced workload, same as today for members
with a blank ID.

### 2. Qase sync: ingest the 4 custom fields per case

`QaseCase` (`internal/repository/monitoring.go:69`) gains 4 columns:
`PicNames` (comma-joined, since QA PIC is Multiselect), `TesterName`,
`TesterAndroidName`, `TesterIosName` — all resolved titles, not raw option
IDs.

Connector (`internal/monitoring/connector.go`) gains:
- `QaseCustomFields(ctx) ([]qaseCustomField, error)` — calls
  `GET /v1/custom_field?limit=100` once per sync run (paginate if
  `total > 100`), returns field id → {title, entity, type, options map[id]title}.

Worker (`internal/monitoring/worker.go`), in the existing `case` branch
(around line 355-365): after building `row := QaseCase{...}`, parse
`item["custom_fields"]`, and for each entry whose `id` is one of
{7, 15, 16, 17} (configurable via env vars with these as defaults —
`QASE_FIELD_ID_PIC`, `QASE_FIELD_ID_TESTER`, `QASE_FIELD_ID_TESTER_ANDROID`,
`QASE_FIELD_ID_TESTER_IOS` — since a field ID is workspace-specific and this
account is the only one in play, a hardcoded default is fine; the env var
is just a lazy escape hatch if Qase's field IDs ever change), resolve the
option id(s) to title(s) using the custom-field definitions fetched once at
the start of `syncQaseProject`, and set the matching `QaseCase` column.

`// ponytail: field IDs hardcoded with env override, not dynamic
// title-based discovery — single Qase workspace, IDs don't change; if we
// ever support multiple workspaces, discover by title instead.`

### 3. Workload query: match by resolved name, not `member_id`

`internal/repository/monitoring.go:611,614` currently:
```go
Where("member_id = ? AND ended_at >= ? AND ended_at < ?", m.QaseMemberID, from, to)
```

New: join `QaseResult` to `QaseCase` on `(project_code, case_id)`, and match
on the tester column appropriate to the run's platform:

```sql
JOIN qase_cases qc ON qc.project_code = qr.project_code AND qc.case_id = qr.case_id
JOIN qase_runs run ON run.project_code = qr.project_code AND run.run_id = qr.run_id
WHERE (
  (run.platform = 'ios' AND qc.tester_ios_name = ?) OR
  (run.platform = 'android' AND qc.tester_android_name = ?) OR
  (run.platform NOT IN ('ios','android') AND qc.tester_name = ?)
) AND qr.ended_at >= ? AND qr.ended_at < ?
```
(`?` = `member.QaseDisplayName` in all three branches.) `run.platform` is
already populated today via `runPlatform(title)` (`worker.go:325`).

`QA PIC` (`qc.pic_names`, comma-joined) is not part of this query — nothing
in the current codebase computes a "scenarios authored" metric from it. Not
touched further; it's just there for future use once such a metric exists.
No point building it speculatively now.

### 4. Jira email resolution

Connector gains `JiraUserByEmail(ctx, email) (accountId string, err error)`
— `GET /rest/api/3/user/search?query=<email>`, take `results[0].accountId`.

`POST /qa-members` and `PATCH /qa-members/:id`
(`internal/monitoring/http.go`): when `jiraEmail` is present in the
request, call `JiraUserByEmail`; on success store the resolved `accountId`
in `Member.JiraAccountID` (internal); on failure (not found / API error),
still save the member, and include a warning in the response (see §5).

### 5. Soft validation warnings (non-blocking)

Both create and update responses gain an optional field:
```json
{ "...": "...", "warnings": { "qaseDisplayName": "...", "jiraEmail": "..." } }
```
- `qaseDisplayName`: set when the given name isn't found in the title list
  of *any* of the 4 Qase fields (QA PIC/Tester/Tester Android/Tester iOS) —
  "Nama '<name>' tidak ditemukan di opsi QA PIC/QA Tester di Qase saat ini."
- `jiraEmail`: set when `JiraUserByEmail` returns not-found —
  "Email '<email>' tidak ditemukan di Jira."

Neither warning blocks the save. If the Qase/Jira API call itself fails
(network/auth error, not "not found"), the member save still succeeds and
that specific warning is simply omitted (we don't want a flaky third-party
API to block QA member management) — logged server-side for visibility.

FE (`qa-members.ts`/`.html`) shows returned warnings as a yellow banner
after save; they don't block the form.

### 6. Frontend changes

- `dashboard-api.service.ts`: rename `QaMember.qaseMemberId` →
  `qaseDisplayName`, `jiraAccountId` → `jiraEmail`; add optional
  `warnings?: { qaseDisplayName?: string; jiraEmail?: string }` to the
  create/update response types.
- `qa-members.ts`/`.html`: rename form fields and labels accordingly; add
  helper text under each: "Harus sama persis dengan opsi QA PIC/QA Tester
  di Qase" and "Harus email yang terdaftar di Jira"; render `warnings` from
  the save response as a dismissible banner.

### 7. Migration

This repo has no migration file framework — schema is managed by
`gorm.AutoMigrate` at startup (`repository/monitoring.go:210`,
`worker.go:22`, `cmd/main.go:112`). `AutoMigrate` only *adds* missing
columns; it never renames or drops existing ones, so:

- `Member.QaseMemberID` → rename the **Go field** to `QaseDisplayName` but
  keep its `gorm:"column:qase_member_id"` tag pointing at the existing DB
  column. No data migration, no orphaned column, no risk of losing
  existing values — only the Go-level name and JSON key change.
- `Member.JiraAccountID` stays exactly as-is (Go name, column, JSON key) —
  it already means "resolved Jira accountId"; only *who populates it*
  changes (server, not client).
- `QaseCase` gains `PicNames`, `TesterName`, `TesterAndroidName`,
  `TesterIosName` (nullable text, no `gorm:"column:..."` override needed —
  these are genuinely new columns and `AutoMigrate` adds them for free on
  next boot).

### 8. Testing

- Backend: unit tests for the custom-field-id → title resolver (including
  multiselect comma-splitting), for the new workload query's
  platform-branch matching, and for the email→accountId resolution +
  warning path (mock Jira/Qase responses, don't hit the live API in CI).
- Frontend: update `qa-members.spec.ts` for renamed fields and the new
  warning banner.
- Manual: after implementing, re-run the same live curl checks used during
  this design session against `/v1/custom_field` and
  `/rest/api/3/user/search` to confirm the resolver code produces the same
  answers as the raw API calls did here.

## Out of scope

- Building a "scenarios authored" metric from `QA PIC` — no consumer exists
  today.
- Fetching Qase's picklist options into the FE to render a dropdown instead
  of free text (would remove typo risk entirely) — deferred; the warning
  covers the immediate need without an extra round-trip on every form open.
- Multi-workspace Qase support (dynamic field-id discovery by title) — this
  team has exactly one Qase account.
