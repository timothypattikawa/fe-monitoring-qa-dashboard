# BE: Synchronous Project Validation + QA Members CRUD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **This plan's tasks all live in the `ms-monitoring-qa-be` repo** (`/Users/admin/Documents/project-kiki/ms-monitoring-qa-be`), a sibling of this FE repo — run all commands and edits there, not here.

**Goal:** Make `POST /api/v1/projects` validate synchronously against Jira and Qase instead of enqueueing an async job, and add a full CRUD HTTP surface for QA members (no `qa-members` endpoint existed before this plan).

**Architecture:** Add two new single-resource connector calls (`Connector.JiraIssue`, `Connector.QaseProject`) that reuse the existing `x.do` retry/error-mapping helper in `internal/monitoring/connector.go`. Call them synchronously from the `POST /projects` handler before inserting a row, and delete the `SyncJob`/`SyncStep` creation block from `SaveProjectMapping`. Add an `Active bool` column to the existing `Member` GORM struct and four new handlers/routes (`GET/POST /qa-members`, `GET/PATCH /qa-members/{id}`) following the exact list/get/save patterns already used for `Project`.

**Tech Stack:** Go 1.25, Echo v4, GORM, PostgreSQL. Module: `github.com/Beyondtech-ID/ms-monitoring-qa-be`. Tests: stdlib `testing` + `httptest` (no testify in this package), table-driven style.

**Design reference:** `docs/superpowers/specs/2026-09-22-live-qa-dashboard-design.md` §2.2, §2.4 (in this FE repo).

---

### Task 1: Add `Connector.JiraIssue` and `Connector.QaseProject`

**Files (all in `ms-monitoring-qa-be`):**
- Modify: `internal/monitoring/connector.go`
- Test: `internal/monitoring/connector_test.go`

- [ ] **Step 1: Write the failing tests**

Add to `internal/monitoring/connector_test.go` (append new `Test...` functions in the same table-driven/`httptest.NewServer` style already used in that file):

```go
func TestJiraIssueFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/rest/api/3/issue/INIT-2401" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"id":"10042","key":"INIT-2401","fields":{"summary":"Checkout revamp","status":{"name":"In Progress"},"issuetype":{"name":"Initiative"}}}`))
	}))
	defer srv.Close()
	x := Connector{Client: srv.Client(), JiraBaseURL: srv.URL, JiraEmail: "qa@example.com", JiraToken: "token"}
	issue, err := x.JiraIssue(context.Background(), "INIT-2401")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if issue.ID != "10042" || issue.Key != "INIT-2401" {
		t.Fatalf("unexpected issue: %+v", issue)
	}
}

func TestJiraIssueNotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()
	x := Connector{Client: srv.Client(), JiraBaseURL: srv.URL, JiraEmail: "qa@example.com", JiraToken: "token"}
	if _, err := x.JiraIssue(context.Background(), "INIT-9999"); err == nil {
		t.Fatal("expected an error for a missing issue")
	}
}

func TestJiraIssueConfigMissing(t *testing.T) {
	x := Connector{}
	if _, err := x.JiraIssue(context.Background(), "INIT-2401"); err == nil || err.Error() != "JIRA_CONFIG_MISSING" {
		t.Fatalf("expected JIRA_CONFIG_MISSING, got %v", err)
	}
}

func TestQaseProjectFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/project/PAY" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":true,"result":{"code":"PAY","title":"Payments"}}`))
	}))
	defer srv.Close()
	x := Connector{Client: srv.Client(), QaseBaseURL: srv.URL, QaseToken: "token"}
	result, err := x.QaseProject(context.Background(), "PAY")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) == 0 {
		t.Fatal("expected a non-empty result payload")
	}
}

func TestQaseProjectNotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":false,"errorMessage":"Project not found"}`))
	}))
	defer srv.Close()
	x := Connector{Client: srv.Client(), QaseBaseURL: srv.URL, QaseToken: "token"}
	if _, err := x.QaseProject(context.Background(), "MISSING"); err == nil || err.Error() != "QASE_PROJECT_NOT_FOUND" {
		t.Fatalf("expected QASE_PROJECT_NOT_FOUND, got %v", err)
	}
}
```

`connector_test.go` already imports `context`, `net/http`, `net/http/httptest`, `testing` — no new imports needed.

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/monitoring/... -run 'TestJiraIssue|TestQaseProject' -v`
Expected: FAIL — `x.JiraIssue undefined (type Connector has no field or method JiraIssue)` and same for `QaseProject`.

- [ ] **Step 3: Implement `JiraIssue` and `QaseProject`**

In `internal/monitoring/connector.go`, add these two methods directly after the existing `JiraPages` function (they reuse the existing `jiraIssue` struct, `qaseEnvelope` struct, and `x.do` helper already in this file — no new types needed):

```go
func (x Connector) JiraIssue(ctx context.Context, key string) (jiraIssue, error) {
	if x.JiraBaseURL == "" || x.JiraEmail == "" || x.JiraToken == "" || key == "" {
		return jiraIssue{}, errors.New("JIRA_CONFIG_MISSING")
	}
	endpoint := fmt.Sprintf("%s/rest/api/3/issue/%s?fields=summary,status,issuetype", x.JiraBaseURL, url.PathEscape(key))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return jiraIssue{}, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(x.JiraEmail+":"+x.JiraToken)))
	var issue jiraIssue
	if err := x.do(req, &issue); err != nil {
		// x.do maps 404 into the same generic UPSTREAM_BAD_RESPONSE as other
		// non-2xx statuses; a plain single-issue GET has no other 4xx cause
		// worth distinguishing here, so treat any failure as "not found".
		return jiraIssue{}, errors.New("JIRA_ISSUE_NOT_FOUND")
	}
	if issue.ID == "" {
		return jiraIssue{}, errors.New("JIRA_ISSUE_NOT_FOUND")
	}
	return issue, nil
}

func (x Connector) QaseProject(ctx context.Context, code string) (json.RawMessage, error) {
	if x.QaseToken == "" || code == "" {
		return nil, errors.New("QASE_CONFIG_MISSING")
	}
	endpoint := fmt.Sprintf("%s/v1/project/%s", x.QaseBaseURL, url.PathEscape(code))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Token", x.QaseToken)
	var env qaseEnvelope
	if err := x.do(req, &env); err != nil {
		return nil, errors.New("QASE_PROJECT_NOT_FOUND")
	}
	if !env.Status || len(env.Result) == 0 || strings.TrimSpace(string(env.Result)) == "null" {
		return nil, errors.New("QASE_PROJECT_NOT_FOUND")
	}
	return env.Result, nil
}
```

Note: `JIRA_CONFIG_MISSING`/`QASE_CONFIG_MISSING` (missing env credentials) intentionally stay distinguishable from `JIRA_ISSUE_NOT_FOUND`/`QASE_PROJECT_NOT_FOUND` (a real validation failure) so ops can tell "we forgot to configure the token" apart from "the QA Lead typed a bad ticket key".

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test ./internal/monitoring/... -run 'TestJiraIssue|TestQaseProject' -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/admin/Documents/project-kiki/ms-monitoring-qa-be
git add internal/monitoring/connector.go internal/monitoring/connector_test.go
git commit -m "feat: add single-issue Jira and single-project Qase connector lookups"
```

---

### Task 2: Make `POST /api/v1/projects` synchronous validate-then-insert

**Files (all in `ms-monitoring-qa-be`):**
- Modify: `internal/monitoring/http.go` (add `Connector` field to `API`, rewrite `createProject`)
- Modify: `internal/repository/monitoring.go` (`SaveProjectMapping` — drop the async job block)
- Create: `internal/repository/testing.go` (shared in-memory-DB test helper)
- Modify: `cmd/main.go` (wire the connector into `API{}`)
- Test: `internal/monitoring/http_test.go`

- [ ] **Step 1: Confirm the `Monitoring` struct's DB field name**

Run: `grep -n "type Monitoring struct" -A5 internal/repository/monitoring.go`
Expected: a field like `db *gorm.DB` (all existing methods reference `r.db`). Use the exact field name found here in Step 2 below.

- [ ] **Step 2: Add the SQLite in-memory test helper**

Run: `go get gorm.io/driver/sqlite`

Create `internal/repository/testing.go`:

```go
package repository

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// NewSQLiteForTest returns a Monitoring repository backed by an in-memory
// SQLite database with the full schema migrated, for handler/repository
// tests that need real query behavior instead of just schema-shape checks.
func NewSQLiteForTest(t *testing.T) *Monitoring {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(Models()...); err != nil {
		t.Fatalf("automigrate: %v", err)
	}
	return &Monitoring{db: db}
}
```

Run: `go build ./...` — if this fails because `db` is not the actual field name from Step 1, fix the field name here to match.

- [ ] **Step 3: Write the failing tests**

Add to `internal/monitoring/http_test.go`:

```go
func TestCreateProjectValidatesBeforeInsert(t *testing.T) {
	jira := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"id":"1","key":"INIT-3001","fields":{"summary":"x","status":{"name":"Open"},"issuetype":{"name":"Initiative"}}}`))
	}))
	defer jira.Close()
	qase := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":true,"result":{"code":"PAY"}}`))
	}))
	defer qase.Close()

	repo := repository.NewSQLiteForTest(t)
	api := API{Repo: repo, Connector: Connector{Client: jira.Client(), JiraBaseURL: jira.URL, JiraEmail: "qa@example.com", JiraToken: "token", QaseBaseURL: qase.URL, QaseToken: "token"}}

	e := echo.New()
	body := `{"jiraInitKey":"INIT-3001","name":"Checkout","qaseProjectCode":"PAY","qaseTestRunId":181,"qaOwner":"Nadia","stagingStartAt":"2026-09-01T00:00:00Z","stagingEndAt":"2026-09-10T00:00:00Z","betaStartAt":"2026-09-11T00:00:00Z","betaEndAt":"2026-09-20T00:00:00Z"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/projects", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	if err := api.createProject(e.NewContext(req, rec)); err != nil {
		t.Fatalf("unexpected handler error: %v", err)
	}
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateProjectRejectsUnknownJiraKey(t *testing.T) {
	jira := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer jira.Close()
	repo := repository.NewSQLiteForTest(t)
	api := API{Repo: repo, Connector: Connector{Client: jira.Client(), JiraBaseURL: jira.URL, JiraEmail: "qa@example.com", JiraToken: "token"}}

	e := echo.New()
	body := `{"jiraInitKey":"INIT-9999","name":"Checkout","qaseProjectCode":"PAY","qaseTestRunId":181,"qaOwner":"Nadia","stagingStartAt":"2026-09-01T00:00:00Z","stagingEndAt":"2026-09-10T00:00:00Z","betaStartAt":"2026-09-11T00:00:00Z","betaEndAt":"2026-09-20T00:00:00Z"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/projects", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	if err := api.createProject(e.NewContext(req, rec)); err != nil {
		t.Fatalf("unexpected handler error: %v", err)
	}
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", rec.Code, rec.Body.String())
	}
}
```

Check `internal/monitoring/http_test.go`'s existing imports and add any missing ones (`net/http/httptest`, `strings`, `github.com/Beyondtech-ID/ms-monitoring-qa-be/internal/repository`) — confirm with `grep -n '^import\|"' internal/monitoring/http_test.go | head -20` first.

- [ ] **Step 4: Run tests to verify they fail**

Run: `go test ./internal/monitoring/... -run 'TestCreateProject' -v`
Expected: FAIL — `API` has no field `Connector` yet.

- [ ] **Step 5: Add `Connector` field to `API` and rewrite `createProject`**

In `internal/monitoring/http.go`, change:

```go
type API struct{ Repo *repository.Monitoring }
```
to:
```go
type API struct {
	Repo      *repository.Monitoring
	Connector Connector
}
```

Replace the existing `createProject` function body with:

```go
func (a API) createProject(c echo.Context) error {
	var req projectRegistration
	if err := c.Bind(&req); err != nil {
		return invalidProject(c)
	}
	schedule, err := req.validate()
	if err != nil {
		return invalidProject(c)
	}
	ctx := c.Request().Context()
	if _, err := a.Connector.JiraIssue(ctx, req.JiraInitKey); err != nil {
		return c.JSON(http.StatusUnprocessableEntity, map[string]string{"code": "JIRA_INIT_NOT_FOUND", "message": "jiraInitKey could not be validated against Jira"})
	}
	if _, err := a.Connector.QaseProject(ctx, req.QaseProjectCode); err != nil {
		return c.JSON(http.StatusUnprocessableEntity, map[string]string{"code": "QASE_PROJECT_NOT_FOUND", "message": "qaseProjectCode could not be validated against Qase"})
	}
	p, err := a.Repo.SaveProjectMapping(req.JiraInitKey, req.Name, req.QaseProjectCode, req.QaseTestRunID, req.QAOwner, schedule.stagingStart, schedule.stagingEnd, schedule.betaStart, schedule.betaEnd)
	if errors.Is(err, repository.ErrJiraInitMapped) {
		return c.JSON(http.StatusConflict, map[string]string{"code": "JIRA_INIT_ALREADY_REGISTERED", "message": "jiraInitKey is already registered"})
	}
	if errors.Is(err, repository.ErrQaseRunMapped) {
		return c.JSON(http.StatusConflict, map[string]string{"code": "QASE_RUN_ALREADY_REGISTERED", "message": "qaseProjectCode and qaseTestRunId are already registered"})
	}
	if err != nil {
		return safeError(c, err)
	}
	return c.JSON(http.StatusCreated, p)
}
```

- [ ] **Step 6: Drop the async job block from `SaveProjectMapping`**

In `internal/repository/monitoring.go`, in `SaveProjectMapping`, replace:

```go
		p.Status = "pending_validation"
		if err := tx.Save(&p).Error; err != nil {
			return err
		}
		job := SyncJob{ID: uuid.NewString(), RequestKey: uuid.NewString(), Trigger: "project_validation", Status: "queued", ProjectID: p.ID, Sources: "jira,qase", RequestedAt: time.Now().UTC(), Actor: "manager"}
		if err := tx.Create(&job).Error; err != nil {
			return err
		}
		for _, source := range []string{"jira", "qase"} {
			if err := tx.Create(&SyncStep{ID: uuid.NewString(), JobID: job.ID, Source: source, Status: "queued"}).Error; err != nil {
				return err
			}
		}
		return nil
```

with:

```go
		return tx.Save(&p).Error
```

`p.Status` is intentionally left at its zero value (`""`) — the worker's `syncJira` already overwrites `Status` with the live Jira issue status on the first real sync (`internal/monitoring/worker.go:242-249`), and inventing a new `"ACTIVE"` sentinel here would just get clobbered by that on the next sync. Row existence in `projects` is what "registered" means now.

After this edit, `time` and `uuid` are still used elsewhere in `monitoring.go` (used extensively by other functions in this file), so no import cleanup should be required; confirm with `go build ./...` in Step 8.

- [ ] **Step 7: Wire the connector into the running API**

In `cmd/main.go`, find the line `monitoring.API{Repo: repos.Monitoring}.Register(e)` and change it to:

```go
monitoring.API{Repo: repos.Monitoring, Connector: monitoring.NewConnector()}.Register(e)
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `go build ./... && go test ./... -v`
Expected: PASS, including `TestCreateProjectValidatesBeforeInsert` and `TestCreateProjectRejectsUnknownJiraKey`.

- [ ] **Step 9: Commit**

```bash
git add internal/monitoring/http.go internal/monitoring/http_test.go internal/repository/monitoring.go internal/repository/testing.go cmd/main.go go.mod go.sum
git commit -m "feat: validate INIT/Qase project synchronously on project creation instead of an async bootstrap job"
```

---

### Task 3: Add `Active` to `Member` and QA-members repository functions

**Files (all in `ms-monitoring-qa-be`):**
- Modify: `internal/repository/monitoring.go`
- Test: `internal/repository/monitoring_test.go`

- [ ] **Step 1: Write the failing test**

Add to `internal/repository/monitoring_test.go`:

```go
func TestMemberActiveDefaultsTrueAndFiltersWork(t *testing.T) {
	repo := NewSQLiteForTest(t)
	if err := repo.SaveMember(&Member{ID: "m1", Name: "Nadia Putri", WeeklyCapacityHours: 40, Active: true}); err != nil {
		t.Fatalf("save active member: %v", err)
	}
	if err := repo.SaveMember(&Member{ID: "m2", Name: "Old Member", WeeklyCapacityHours: 40, Active: false}); err != nil {
		t.Fatalf("save inactive member: %v", err)
	}
	active, err := repo.Members(false)
	if err != nil {
		t.Fatalf("list active members: %v", err)
	}
	if len(active) != 1 || active[0].ID != "m1" {
		t.Fatalf("expected only m1 in active list, got %+v", active)
	}
	all, err := repo.Members(true)
	if err != nil {
		t.Fatalf("list all members: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("expected 2 members total, got %d", len(all))
	}
	got, err := repo.Member("m2")
	if err != nil {
		t.Fatalf("get member: %v", err)
	}
	if got.Name != "Old Member" {
		t.Fatalf("unexpected member: %+v", got)
	}
}
```

(This test uses `NewSQLiteForTest` from Task 2 Step 2 — run Task 2 before this task.)

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/repository/... -run TestMemberActive -v`
Expected: FAIL — `Member` has no field `Active`, and no `Members`/`Member`/`SaveMember` methods exist yet.

- [ ] **Step 3: Add `Active` field and repository functions**

In `internal/repository/monitoring.go`, change the `Member` struct:

```go
type Member struct {
	ID                  string  `gorm:"primaryKey" json:"id"`
	Name                string  `json:"name"`
	JiraAccountID       string  `gorm:"index" json:"jiraAccountId"`
	QaseMemberID        string  `gorm:"index" json:"qaseMemberId"`
	WeeklyCapacityHours float64 `json:"weeklyCapacityHours"`
	Active              bool    `gorm:"not null;default:true" json:"active"`
}
```

Add these functions near the existing `Projects`/`Project`/`SaveProject` functions (same file), following their exact style:

```go
func (r *Monitoring) Members(includeInactive bool) ([]Member, error) {
	var v []Member
	q := r.db.Order("name asc")
	if !includeInactive {
		q = q.Where("active = ?", true)
	}
	err := q.Find(&v).Error
	return v, err
}

func (r *Monitoring) Member(id string) (Member, error) {
	var v Member
	err := r.db.First(&v, "id = ?", id).Error
	return v, err
}

func (r *Monitoring) SaveMember(v *Member) error { return r.db.Save(v).Error }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/repository/... -run TestMemberActive -v`
Expected: PASS.

- [ ] **Step 5: Confirm the `Member` alias exists in the `monitoring` package**

Run: `grep -n "type Member" internal/monitoring/model.go`

If it prints a line like `type Member = repository.Member`, nothing further is needed. If it prints nothing, add that line to `internal/monitoring/model.go` next to the existing `type Project = repository.Project` (and similar) aliases, so Task 4's handlers can use the unqualified `Member` name the same way `http.go` already uses unqualified `Project`/`SyncJob`.

- [ ] **Step 6: Run full test suite and commit**

Run: `go build ./... && go test ./...`
Expected: PASS.

```bash
git add internal/repository/monitoring.go internal/monitoring/model.go
git commit -m "feat: add active flag and list/get/save functions for qa members"
```

---

### Task 4: Add `qa-members` HTTP handlers and routes

**Files (all in `ms-monitoring-qa-be`):**
- Modify: `internal/monitoring/http.go`
- Test: `internal/monitoring/http_test.go`

- [ ] **Step 1: Write the failing tests**

Add to `internal/monitoring/http_test.go`:

```go
func TestCreateAndUpdateQaMember(t *testing.T) {
	repo := repository.NewSQLiteForTest(t)
	api := API{Repo: repo}
	e := echo.New()

	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/qa-members", strings.NewReader(`{"name":"Nadia Putri","jiraAccountId":"acc-1","qaseMemberId":"qm-1","weeklyCapacityHours":40}`))
	createReq.Header.Set("Content-Type", "application/json")
	createRec := httptest.NewRecorder()
	if err := api.createMember(e.NewContext(createReq, createRec)); err != nil {
		t.Fatalf("unexpected handler error: %v", err)
	}
	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", createRec.Code, createRec.Body.String())
	}
	var created repository.Member
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created member: %v", err)
	}
	if created.ID == "" || !created.Active {
		t.Fatalf("expected an active member with an id, got %+v", created)
	}

	updateReq := httptest.NewRequest(http.MethodPatch, "/api/v1/qa-members/"+created.ID, strings.NewReader(`{"active":false}`))
	updateReq.Header.Set("Content-Type", "application/json")
	updateRec := httptest.NewRecorder()
	ctx := e.NewContext(updateReq, updateRec)
	ctx.SetParamNames("id")
	ctx.SetParamValues(created.ID)
	if err := api.updateMember(ctx); err != nil {
		t.Fatalf("unexpected handler error: %v", err)
	}
	if updateRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", updateRec.Code, updateRec.Body.String())
	}
	var updated repository.Member
	if err := json.Unmarshal(updateRec.Body.Bytes(), &updated); err != nil {
		t.Fatalf("decode updated member: %v", err)
	}
	if updated.Active {
		t.Fatalf("expected member to be deactivated, got %+v", updated)
	}

	listed, err := repo.Members(false)
	if err != nil {
		t.Fatalf("list active members: %v", err)
	}
	if len(listed) != 0 {
		t.Fatalf("expected deactivated member to be excluded from active list, got %+v", listed)
	}
}

func TestCreateQaMemberRejectsMissingName(t *testing.T) {
	repo := repository.NewSQLiteForTest(t)
	api := API{Repo: repo}
	e := echo.New()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/qa-members", strings.NewReader(`{"weeklyCapacityHours":40}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	if err := api.createMember(e.NewContext(req, rec)); err != nil {
		t.Fatalf("unexpected handler error: %v", err)
	}
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}
```

Check `internal/monitoring/http_test.go`'s existing imports — add `"encoding/json"` if not already present (used for decoding `createRec.Body.Bytes()`); check with `grep -n '"encoding/json"' internal/monitoring/http_test.go` first.

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/monitoring/... -run 'TestCreateAndUpdateQaMember|TestCreateQaMemberRejectsMissingName' -v`
Expected: FAIL — `api.createMember`/`api.updateMember` undefined.

- [ ] **Step 3: Implement the handlers**

In `internal/monitoring/http.go`, add near the existing `projectRegistration`/`validate()` code:

```go
type memberRegistration struct {
	Name                string  `json:"name"`
	JiraAccountID       string  `json:"jiraAccountId"`
	QaseMemberID        string  `json:"qaseMemberId"`
	WeeklyCapacityHours float64 `json:"weeklyCapacityHours"`
}

func (r *memberRegistration) validate() error {
	r.Name = strings.TrimSpace(r.Name)
	r.JiraAccountID = strings.TrimSpace(r.JiraAccountID)
	r.QaseMemberID = strings.TrimSpace(r.QaseMemberID)
	if r.Name == "" || r.WeeklyCapacityHours < 0 {
		return errors.New("missing required member field")
	}
	return nil
}

func invalidMember(c echo.Context) error {
	return c.JSON(http.StatusBadRequest, map[string]string{"code": "INVALID_MEMBER", "message": "name is required and weeklyCapacityHours must not be negative"})
}
```

Add these handlers (same file, near `projects`/`project`/`createProject`):

```go
func (a API) members(c echo.Context) error {
	rows, err := a.Repo.Members(c.QueryParam("includeInactive") == "true")
	if err != nil {
		return safeError(c, err)
	}
	return a.send(c, rows)
}

func (a API) member(c echo.Context) error {
	v, err := a.Repo.Member(c.Param("id"))
	if errors.Is(err, repository.ErrNotFound) {
		return c.JSON(http.StatusNotFound, map[string]string{"code": "NOT_FOUND", "message": "qa member not found"})
	}
	if err != nil {
		return safeError(c, err)
	}
	return a.send(c, v)
}

func (a API) createMember(c echo.Context) error {
	var req memberRegistration
	if err := c.Bind(&req); err != nil {
		return invalidMember(c)
	}
	if err := req.validate(); err != nil {
		return invalidMember(c)
	}
	v := Member{ID: uuid.NewString(), Name: req.Name, JiraAccountID: req.JiraAccountID, QaseMemberID: req.QaseMemberID, WeeklyCapacityHours: req.WeeklyCapacityHours, Active: true}
	if err := a.Repo.SaveMember(&v); err != nil {
		return safeError(c, err)
	}
	return c.JSON(http.StatusCreated, v)
}

func (a API) updateMember(c echo.Context) error {
	v, err := a.Repo.Member(c.Param("id"))
	if errors.Is(err, repository.ErrNotFound) {
		return c.JSON(http.StatusNotFound, map[string]string{"code": "NOT_FOUND", "message": "qa member not found"})
	}
	if err != nil {
		return safeError(c, err)
	}
	var req struct {
		Name                *string  `json:"name"`
		JiraAccountID       *string  `json:"jiraAccountId"`
		QaseMemberID        *string  `json:"qaseMemberId"`
		WeeklyCapacityHours *float64 `json:"weeklyCapacityHours"`
		Active              *bool    `json:"active"`
	}
	if err := c.Bind(&req); err != nil {
		return invalidMember(c)
	}
	if req.Name != nil {
		v.Name = strings.TrimSpace(*req.Name)
	}
	if req.JiraAccountID != nil {
		v.JiraAccountID = strings.TrimSpace(*req.JiraAccountID)
	}
	if req.QaseMemberID != nil {
		v.QaseMemberID = strings.TrimSpace(*req.QaseMemberID)
	}
	if req.WeeklyCapacityHours != nil {
		v.WeeklyCapacityHours = *req.WeeklyCapacityHours
	}
	if req.Active != nil {
		v.Active = *req.Active
	}
	if v.Name == "" || v.WeeklyCapacityHours < 0 {
		return invalidMember(c)
	}
	if err := a.Repo.SaveMember(&v); err != nil {
		return safeError(c, err)
	}
	return c.JSON(http.StatusOK, v)
}
```

`Member` here refers to the `monitoring.Member` alias confirmed/added in Task 3 Step 5.

Register the routes in `Register`:

```go
func (a API) Register(e *echo.Echo) {
	g := e.Group("/api/v1")
	g.GET("/projects", a.projects)
	g.GET("/projects/:id", a.project)
	g.POST("/projects", a.createProject, a.managerAuth)
	g.GET("/workflow", a.workflow)
	g.GET("/workload", a.workload)
	g.GET("/bugs", a.bugs)
	g.GET("/qa-members", a.members)
	g.GET("/qa-members/:id", a.member)
	g.POST("/qa-members", a.createMember, a.managerAuth)
	g.PATCH("/qa-members/:id", a.updateMember, a.managerAuth)
	g.POST("/sync-jobs", a.createJob, a.managerAuth)
	g.GET("/sync-jobs", a.jobs)
	g.GET("/sync-jobs/:id", a.job)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `go build ./... && go test ./... -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/monitoring/http.go internal/monitoring/http_test.go
git commit -m "feat: add GET/POST/PATCH qa-members endpoints"
```

---

### Task 5: Manual end-to-end verification

**Files:** none (verification only, in `ms-monitoring-qa-be`)

- [ ] **Step 1: Start Postgres and the API locally**

Run: `go run ./cmd` (per README.md; ensure `.env` has `DATABASE_URL`, `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `QASE_API_TOKEN`, `MONITOR_MANAGER_API_KEY` set — per this feature's spec, these stay plain `.env` values, no secret manager).

- [ ] **Step 2: Exercise the new project-creation flow**

```bash
curl -i -X POST http://127.0.0.1:8080/api/v1/projects \
  -H "Content-Type: application/json" \
  -H "X-Manager-Key: $MONITOR_MANAGER_API_KEY" \
  -d '{"jiraInitKey":"INIT-2401","name":"Checkout","qaseProjectCode":"PAY","qaseTestRunId":181,"qaOwner":"Nadia Putri","stagingStartAt":"2026-09-01T00:00:00Z","stagingEndAt":"2026-09-10T00:00:00Z","betaStartAt":"2026-09-11T00:00:00Z","betaEndAt":"2026-09-20T00:00:00Z"}'
```
Expected: `201` if `INIT-2401`/`PAY` are real and reachable with the configured credentials, `422` with `JIRA_INIT_NOT_FOUND`/`QASE_PROJECT_NOT_FOUND` otherwise — confirm no `sync_jobs` row was created for this project (`SELECT * FROM sync_jobs WHERE project_id = '<returned id>';` should return zero rows).

- [ ] **Step 3: Exercise the qa-members endpoints**

```bash
curl -i -X POST http://127.0.0.1:8080/api/v1/qa-members \
  -H "Content-Type: application/json" -H "X-Manager-Key: $MONITOR_MANAGER_API_KEY" \
  -d '{"name":"Nadia Putri","jiraAccountId":"","qaseMemberId":"","weeklyCapacityHours":40}'
curl -s http://127.0.0.1:8080/api/v1/qa-members | jq .
curl -i -X PATCH http://127.0.0.1:8080/api/v1/qa-members/<id> \
  -H "Content-Type: application/json" -H "X-Manager-Key: $MONITOR_MANAGER_API_KEY" \
  -d '{"active": false}'
curl -s http://127.0.0.1:8080/api/v1/qa-members | jq .
```
Expected: created member appears in the first list, disappears from the default (active-only) list after deactivation, and still appears with `?includeInactive=true`.
