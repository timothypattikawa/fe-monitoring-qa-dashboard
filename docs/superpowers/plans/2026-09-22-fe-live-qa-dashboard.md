# FE: Remove Demo Mode, Per-Page Sync, QA Members Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Run this plan after the BE plan** (`2026-09-22-be-live-qa-dashboard.md`) is done — Task 5 here calls `qa-members` endpoints that plan creates.

**Goal:** Make the existing "API Mode" the app's only mode (delete the Demo Mode toggle and fixtures entirely), give each of the 4 dashboard pages its own scoped Sync button, and add a 5th QA Members page with add/edit/deactivate.

**Architecture:** Delete `demo-data.ts` and every `liveMode`/`enabled` branch in `DashboardState`/`LiveDashboardStore`, leaving only the already-built live-data code path. Add a `sources: string[]` parameter to `DashboardApiService.sync()` and inject `LiveDashboardStore` directly into each of the 4 page components so each owns its own sync button and its own source list. Add `qaMembers()`/`createQaMember()`/`updateQaMember()` to `DashboardApiService`, a small `QaMembersPage` component styled like the existing sync-history table + `<dialog>` form, and a 5th route + nav entry.

**Tech Stack:** Angular 21 standalone components, RxJS, Vitest via `@angular/build:unit-test` (not Karma/Jasmine). No Tailwind utility classes in templates — hand-written CSS in `src/styles.css`/`app.css`/`live-dashboard.css`.

**Design reference:** `docs/superpowers/specs/2026-09-22-live-qa-dashboard-design.md` §2.1, §2.3, §2.4, §2.5.

---

### Task 1: Remove the mode toggle and demo fixtures

**Files:**
- Modify: `src/app/core/live-dashboard.store.ts`
- Modify: `src/app/core/dashboard-state.ts`
- Delete: `src/app/core/demo-data.ts`
- Modify: `src/app/app.ts`
- Modify: `src/app/app.html`
- Modify: `src/styles.css`
- Modify: `src/app/app.css`

- [ ] **Step 1: Read the files being edited before touching them**

Use the Read tool on `src/app/core/live-dashboard.store.ts`, `src/app/core/dashboard-state.ts`, `src/app/app.ts`, `src/app/app.html` in full before editing — `dashboard-state.ts` is 872 lines and this task touches roughly a dozen scattered locations in it, so read the whole file first rather than guessing line numbers from this plan alone.

- [ ] **Step 2: Delete `toggle()` and the `enabled` flag in `live-dashboard.store.ts`**

Remove the `toggle()` method entirely (it currently does: sets `enabled.set(false)`, calls `this.state.useDemoData()`, unsubscribes the poll). Remove the `enabled = signal(true)` field and every other internal reference to `this.enabled` in this file. `connect()` keeps everything it does today except the line that sets `enabled` to `true` (delete just that one line; keep the rest of `connect()`, including starting the 15s poll and calling `refresh()`).

- [ ] **Step 3: Delete `demo-data.ts` and its import**

```bash
git rm src/app/core/demo-data.ts
```

In `src/app/core/dashboard-state.ts`, delete the import line:
```ts
import { demoMembers, demoProjects, demoFailedCases, demoDefects, demoKnowledgeItems, demoDocumentation } from './demo-data';
```

- [ ] **Step 4: Strip the `liveMode` branch out of `dashboard-state.ts`**

Delete the field:
```ts
private readonly liveMode = signal(false);
```

For each of the following computed/methods, delete the `if (this.liveMode()) { ... } else { ... demo ... }` structure and keep only the body that was inside the `if (this.liveMode())` arm, unindented and unconditional: `workloadSummary`, `environmentHealth`, `memberWorkloadExecution`, `projectChartValue`, `workloadTrendValue`, `workloadPressure`, `capacityTrendValue`, `projectTrend`. (Find each with `grep -n "liveMode()" src/app/core/dashboard-state.ts` — there should be no remaining hits when this step is done.)

Delete these demo-only methods entirely: `useDemoData()` and `requestSync()`. Delete the demo-only `addProject()` method (the live equivalent already exists as `LiveDashboardStore.addProject()` — confirm with `grep -n "addProject" src/app/core/dashboard-state.ts src/app/core/live-dashboard.store.ts` that only the store's version remains after this step).

Change the initial seed values so nothing references demo data any more:
```ts
readonly projects = signal<Project[]>([]);
```
(was `signal<Project[]>(demoProjects)`), and similarly seed `memberData`/`defectData`/`failedCases`/`knowledgeItems`/`documentation` with empty arrays (`[]`) instead of their `demo*` counterparts. Run `grep -n "^\s*readonly.*demo" src/app/core/dashboard-state.ts` and confirm zero hits when done.

- [ ] **Step 5: Remove `enabled()`/`toggle()` usage from `app.ts`**

In `App.openProjectForm()`, delete the `if (this.live.enabled())` branch structure — since `enabled` no longer exists, this method becomes unconditional:
```ts
openProjectForm() {
  this.live.projectFormOpen.set(true);
}
```

- [ ] **Step 6: Remove the mode branches and toggle button from `app.html`**

Delete the toggle button entirely:
```html
<button class="demo-pill" (click)="live.toggle()" [attr.aria-pressed]="live.enabled()">{{ live.enabled() ? 'API
    MODE' : 'DEMO MODE' }}</button>
```

For each remaining `live.enabled() ? X : Y` ternary in this file (sidebar help text, role label, date-label, footer text), replace the whole ternary with just the `X` (the "API Mode"/live) branch text, since that's the only mode from now on. For each `@if (live.enabled() && ...)` guard (manager-key input, error/notice banners), simplify to `@if (...)` — drop `live.enabled() &&` since it's always true. Replace `@if (live.enabled()) { <app-live-dashboard /> }` with an unconditional `<app-live-dashboard />`.

- [ ] **Step 7: Remove the now-dead CSS**

In `src/styles.css`, delete the `.demo-pill { ... }` rule.
In `src/app/app.css`, simplify the selector `.topbar span:not(.avatar):not(.demo-pill) { ... }` to `.topbar span:not(.avatar) { ... }` (the `:not(.demo-pill)` exclusion is now meaningless since that class no longer exists anywhere).

- [ ] **Step 8: Build and confirm no leftover references**

Run: `grep -rn "liveMode\|useDemoData\|demo-data\|demoProjects\|demoMembers\|demoFailedCases\|demoDefects\|demoKnowledgeItems\|demoDocumentation\|live.enabled\|\.toggle(" src/app/`
Expected: no output (empty).

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: remove demo mode, make live dashboard the only mode"
```

---

### Task 2: Rewrite the two broken tests in `app.spec.ts`

**Files:**
- Modify: `src/app/app.spec.ts`

- [ ] **Step 1: Read the current file in full**

Read `src/app/app.spec.ts` (184 lines) before editing.

- [ ] **Step 2: Replace the `useDemoData()`-based test**

The test currently titled `'maps real workflow days into the approved trend and restores demo data'` (around lines 47-73) calls `state.useDemoData()` at the end and asserts a demo project reappears — both are gone now. Rewrite it to only assert the live-mapping half, and rename it to drop the "restores demo data" claim:

```ts
it('maps real workflow days into the approved trend', () => {
  state.useLiveData({
    asOf: '2026-09-13T10:00:00Z',
    sources: { jira: { status: 'fresh', syncedAt: '2026-09-13T10:00:00Z' }, qase: { status: 'fresh', syncedAt: '2026-09-13T10:00:00Z' } },
    projects: [],
    workflow: { days: [] },
    workload: { period: { from: '2026-09-01', to: '2026-09-13' }, members: [] },
    bugs: [],
  });
  expect(state.projects()).toEqual([]);
});
```

(Match the exact shape `useLiveData` expects by checking its parameter type in `dashboard-state.ts` first — adjust the object literal above to match exactly if the real type differs from this sketch; the point of this step is removing the `useDemoData()` call and its demo-project assertion, not changing what `useLiveData` itself is tested with.)

- [ ] **Step 3: Remove the `store.toggle()` call from the polling test**

In the test titled `'keeps live data empty on API failure and updates an open sync log during polling'` (around lines 150-182), delete the line `store.toggle();` near the end. If any assertion after that line depended on `toggle()`'s side effect of unsubscribing the poll (e.g. an `http.verify()` expecting no further requests), replace that expectation with an explicit teardown appropriate for a component/store that now lives for the app's lifetime — e.g. just remove the post-toggle assertions if they only existed to confirm the poll stopped, since there is no longer a way to stop it from the test (this matches Task 1 Step 2's decision that the poll simply runs for the app's lifetime now).

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, no failures.

- [ ] **Step 5: Commit**

```bash
git add src/app/app.spec.ts
git commit -m "test: update app.spec.ts for the removed demo/toggle behavior"
```

---

### Task 3: Remove the demo-only dialogs from `DashboardDialogsComponent`

**Files:**
- Modify: `src/app/shared/dashboard-dialogs/dashboard-dialogs.ts`
- Modify: `src/app/shared/dashboard-dialogs/dashboard-dialogs.html`

- [ ] **Step 1: Read both files in full**

Read `src/app/shared/dashboard-dialogs/dashboard-dialogs.ts` (30 lines) and `dashboard-dialogs.html` in full.

- [ ] **Step 2: Delete the `#projectForm` and `#reminder` dialogs**

In `dashboard-dialogs.ts`, remove the `viewChild` references and the `effect()`/toggle wiring for `projectForm` and `reminder` (keep `qaDetail` and `#detail`, which render live project/member data and are not demo artifacts).

In `dashboard-dialogs.html`, delete the `<dialog #projectForm>` block (including its `state.draft`-bound QA-owner `<select>`, lines ~58-62 in the original file) and the `<dialog #reminder>` block (its `state.draft`/recipient/channel/message fields and `simulate()` call). Notifications (email/Telegram) are explicit PRD P1 scope, not part of this pass — this dialog is deleted rather than rewired, not deferred as a TODO in code.

- [ ] **Step 3: Remove now-orphaned state**

In `src/app/core/dashboard-state.ts`, remove the fields that only existed for these two deleted dialogs: `draft`, `recipient`, `channel`, `message`, `formError`, `projectFormOpen`, `reminderOpen` (check each with `grep -rn "<field-name>" src/app/` first to confirm nothing else references it before deleting — `projectFormOpen` in particular was also referenced by `App.openProjectForm()`'s now-deleted demo branch from Task 1 Step 5, so this should already be dead).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds; fix any now-unused-import or unused-field compiler warnings surfaced by the deletions above.

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/dashboard-dialogs/ src/app/core/dashboard-state.ts
git commit -m "feat: remove demo add-project and simulate-notification dialogs"
```

---

### Task 4: Add `sources` to `sync()` and add QA-members methods to `DashboardApiService`

**Files:**
- Modify: `src/app/core/dashboard-api.service.ts`
- Test: `src/app/core/dashboard-api.service.spec.ts` (new file — no spec file exists for this service today)

- [ ] **Step 1: Write the failing tests**

Create `src/app/core/dashboard-api.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardApiService } from './dashboard-api.service';

describe('DashboardApiService', () => {
  let service: DashboardApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(DashboardApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends only the requested sources when syncing', () => {
    service.sync('secret-key', ['qase']).subscribe();
    const req = http.expectOne('/api/v1/sync-jobs');
    expect(req.request.body.sources).toEqual(['qase']);
    req.flush({ data: { jobId: 'job-1', status: 'QUEUED' } });
  });

  it('lists qa members', () => {
    service.qaMembers().subscribe();
    const req = http.expectOne('/api/v1/qa-members');
    expect(req.request.method).toBe('GET');
    req.flush({ asOf: null, sources: {}, data: [] });
  });

  it('creates a qa member', () => {
    service.createQaMember({ name: 'Nadia Putri', jiraAccountId: '', qaseMemberId: '', weeklyCapacityHours: 40 }, 'secret-key').subscribe();
    const req = http.expectOne('/api/v1/qa-members');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('X-Manager-Key')).toBe('secret-key');
    req.flush({ id: 'm1', name: 'Nadia Putri', jiraAccountId: '', qaseMemberId: '', weeklyCapacityHours: 40, active: true });
  });

  it('updates a qa member', () => {
    service.updateQaMember('m1', { active: false }, 'secret-key').subscribe();
    const req = http.expectOne('/api/v1/qa-members/m1');
    expect(req.request.method).toBe('PATCH');
    req.flush({ id: 'm1', name: 'Nadia Putri', jiraAccountId: '', qaseMemberId: '', weeklyCapacityHours: 40, active: false });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run dashboard-api.service`
Expected: FAIL — `sync` currently takes only one argument, and `qaMembers`/`createQaMember`/`updateQaMember` don't exist.

- [ ] **Step 3: Read the current `sync()` method and add the `sources` parameter**

Read `src/app/core/dashboard-api.service.ts` in full first. Change the existing `sync(managerKey: string)` method (currently hardcoding `sources: ['jira', 'qase']`) to:

```ts
sync(managerKey: string, sources: ('jira' | 'qase')[], projectId?: string) {
  return this.http.post<{ data: { jobId: string; status: string } }>(
    '/api/v1/sync-jobs',
    { scope: { projectId: projectId ?? null }, sources },
    { headers: { 'X-Manager-Key': managerKey, 'Idempotency-Key': crypto.randomUUID() } },
  );
}
```

(Keep whatever the existing method's exact return type and header-building code already look like — only the parameter list and the `sources`/`scope.projectId` values sent in the body change; do not otherwise restructure this method.)

- [ ] **Step 4: Add the `QaMember` type and the three new methods**

Add near the existing `SyncStep`/`SyncEvent`/`SyncJob` type definitions:

```ts
export interface QaMember {
  id: string;
  name: string;
  jiraAccountId: string;
  qaseMemberId: string;
  weeklyCapacityHours: number;
  active: boolean;
}
export interface QaMemberInput {
  name: string;
  jiraAccountId: string;
  qaseMemberId: string;
  weeklyCapacityHours: number;
}
```

Add near the existing `addProject()` method:

```ts
qaMembers(includeInactive = false) {
  const params = includeInactive ? { includeInactive: 'true' } : {};
  return this.http.get<ApiResponse<QaMember[]>>('/api/v1/qa-members', { params });
}

createQaMember(input: QaMemberInput, managerKey: string) {
  return this.http.post<QaMember>('/api/v1/qa-members', input, { headers: { 'X-Manager-Key': managerKey } });
}

updateQaMember(id: string, changes: Partial<QaMemberInput & { active: boolean }>, managerKey: string) {
  return this.http.patch<QaMember>(`/api/v1/qa-members/${id}`, changes, { headers: { 'X-Manager-Key': managerKey } });
}
```

(`ApiResponse<T>` is the existing envelope type already defined in this file — reuse it, do not redefine it.)

- [ ] **Step 5: Update every existing caller of `sync()`**

Run: `grep -rn "\.sync(" src/app/` — update each call site to pass the new `sources` argument. The one in `live-dashboard.store.ts` (the global sync history button, if kept) should keep passing `['jira', 'qase']` to preserve its current "sync everything" behavior; the new per-page callers added in Task 5 pass their own scoped list.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/core/dashboard-api.service.ts src/app/core/dashboard-api.service.spec.ts src/app/core/live-dashboard.store.ts
git commit -m "feat: scope sync() to requested sources, add qa-members api methods"
```

---

### Task 5: Add a per-page Sync button to Projects, Workflow, Workload, Bugs

**Files:**
- Modify: `src/app/pages/projects/projects.ts` (+ `.html`)
- Modify: `src/app/pages/workflow/workflow.ts` (+ `.html`)
- Modify: `src/app/pages/workload/workload.ts` (+ `.html`)
- Modify: `src/app/pages/bugs/bugs.ts` (+ `.html`)
- Test: one new spec file, `src/app/pages/workflow/workflow.spec.ts` (representative; the same pattern applies to the other 3 pages)

- [ ] **Step 1: Read one full page component and its template first**

Read `src/app/pages/workflow/workflow.ts` and `workflow.html` in full (both small) to see the exact current structure before adding to it. Repeat for `projects`, `workload`, `bugs` before editing each.

- [ ] **Step 2: Write the failing test for the Workflow page**

Create `src/app/pages/workflow/workflow.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WorkflowPage } from './workflow';

describe('WorkflowPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  it('sends only qase as the sync source', () => {
    const fixture = TestBed.createComponent(WorkflowPage);
    fixture.detectChanges();
    fixture.componentInstance.sync();
    const req = http.expectOne('/api/v1/sync-jobs');
    expect(req.request.body.sources).toEqual(['qase']);
    req.flush({ data: { jobId: 'job-1', status: 'QUEUED' } });
    http.match(() => true).forEach(r => r.flush({ asOf: null, sources: {}, data: {} }));
  });
});
```

(Adjust the final `http.match(...)` cleanup to whatever the page's other on-init HTTP calls actually are, found by reading `workflow.ts` in Step 1 — the point is to avoid an `http.verify()` failure from unrelated in-flight requests the page makes on load, not to assert on them here.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- --run workflow.spec`
Expected: FAIL — `sync()` doesn't exist on `WorkflowPage` yet.

- [ ] **Step 4: Add the sync method to each page component**

In `src/app/pages/workflow/workflow.ts`, inject the API service and store a `sources` list, following this shape (adjust the exact existing constructor/injection style found in Step 1 — this repo uses `inject()`, not constructor injection):

```ts
import { DashboardApiService } from '../../core/dashboard-api.service';
import { LiveDashboardStore } from '../../core/live-dashboard.store';

// inside the component class:
private readonly api = inject(DashboardApiService);
readonly live = inject(LiveDashboardStore);
readonly syncing = signal(false);
readonly syncError = signal('');

sync() {
  this.syncing.set(true);
  this.syncError.set('');
  this.api.sync(this.live.managerKey(), ['qase']).subscribe({
    next: ({ data }) => this.pollUntilDone(data.jobId),
    error: () => { this.syncing.set(false); this.syncError.set('Could not queue sync.'); },
  });
}

private pollUntilDone(jobId: string) {
  const poll = () => this.api.job(jobId).subscribe(({ data }) => {
    if (data.status === 'queued' || data.status === 'running') {
      setTimeout(poll, 2000);
      return;
    }
    this.syncing.set(false);
    const failedStep = data.steps.find(s => s.status === 'failed');
    this.syncError.set(failedStep ? `Qase sync failed: ${failedStep.errorCode}` : '');
    this.live.refresh();
  });
  poll();
}
```

(`this.live.managerKey()` — check `LiveDashboardStore` in Step 1's reading for the actual existing signal/property name holding the manager key input value, and use that exact name instead of guessing `managerKey()` if it differs. Same for `this.live.refresh()` — confirm this method already exists and is the right one to reload this page's own data, not the whole app's.)

Repeat the same method (with `['jira','qase']` for Projects, `['qase']` for Workload, `['jira']` for Bugs) in `projects.ts`, `workload.ts`, `bugs.ts`.

- [ ] **Step 5: Add the Sync button + error banner to each page's template**

In each page's `.html`, add near the page heading (following the existing button markup conventions already used elsewhere in this repo, e.g. `class="secondary"` + the `#ui-sync` icon symbol already defined in `app.html`'s sprite):

```html
<button class="secondary" (click)="sync()" [disabled]="syncing()">
  <svg class="button-icon" aria-hidden="true"><use href="#ui-sync"></use></svg>
  {{ syncing() ? 'Syncing…' : 'Sync' }}
</button>
@if (syncError()) {
  <p class="live-alert" role="alert">{{ syncError() }}</p>
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Manual check in the browser**

Run: `npm start` (proxies to the Go API per `proxy.conf.json`). Open each of the 4 pages, click Sync, confirm the button disables while syncing, re-enables on completion, and that triggering a deliberate failure (e.g. temporarily stop the BE or misconfigure `.env`) shows the error banner on that page only.

- [ ] **Step 8: Commit**

```bash
git add src/app/pages/
git commit -m "feat: add per-page scoped sync button to projects, workflow, workload, bugs"
```

---

### Task 6: Build the QA Members page

**Files:**
- Create: `src/app/pages/qa-members/qa-members.ts`
- Create: `src/app/pages/qa-members/qa-members.html`
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/core/dashboard-state.ts` (`nav`/`iconIds` arrays)
- Modify: `src/app/app.html` (icon sprite)
- Test: `src/app/pages/qa-members/qa-members.spec.ts`

- [ ] **Step 1: Read the reference patterns first**

Read `src/app/shared/live-dashboard/live-dashboard.ts` and `live-dashboard.html` in full (the table + `<dialog>` + store-draft pattern this page borrows table/form conventions from), `src/app/app.routes.ts` in full, and the `nav`/`iconIds` array declarations plus the sidebar loop in `app.html` (around lines 65-73 per prior research — re-confirm exact lines with `grep -n "nav\b\|iconIds" src/app/core/dashboard-state.ts src/app/app.html`). Also check whether other pages under `src/app/pages/*/` have their own `.css` file or share `app.css`/`styles.css` — match whichever convention is already used before adding any new styles.

- [ ] **Step 2: Write the failing test**

Create `src/app/pages/qa-members/qa-members.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QaMembersPage } from './qa-members';

describe('QaMembersPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  it('loads members on init', () => {
    const fixture = TestBed.createComponent(QaMembersPage);
    fixture.detectChanges();
    const req = http.expectOne(r => r.url === '/api/v1/qa-members');
    req.flush({ asOf: null, sources: {}, data: [{ id: 'm1', name: 'Nadia Putri', jiraAccountId: '', qaseMemberId: '', weeklyCapacityHours: 40, active: true }] });
    expect(fixture.componentInstance.members().length).toBe(1);
  });

  it('creates a member and reloads the list', () => {
    const fixture = TestBed.createComponent(QaMembersPage);
    fixture.detectChanges();
    http.expectOne(r => r.url === '/api/v1/qa-members').flush({ asOf: null, sources: {}, data: [] });

    fixture.componentInstance.draft.set({ name: 'Nadia Putri', jiraAccountId: '', qaseMemberId: '', weeklyCapacityHours: 40 });
    fixture.componentInstance.save();
    const createReq = http.expectOne(r => r.url === '/api/v1/qa-members' && r.method === 'POST');
    createReq.flush({ id: 'm1', name: 'Nadia Putri', jiraAccountId: '', qaseMemberId: '', weeklyCapacityHours: 40, active: true });
    http.expectOne(r => r.url === '/api/v1/qa-members').flush({ asOf: null, sources: {}, data: [{ id: 'm1', name: 'Nadia Putri', jiraAccountId: '', qaseMemberId: '', weeklyCapacityHours: 40, active: true }] });
    expect(fixture.componentInstance.members().length).toBe(1);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- --run qa-members`
Expected: FAIL — `QaMembersPage` doesn't exist yet.

- [ ] **Step 4: Implement `qa-members.ts`**

```ts
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DashboardApiService, QaMember, QaMemberInput } from '../../core/dashboard-api.service';
import { LiveDashboardStore } from '../../core/live-dashboard.store';

@Component({
  selector: 'app-qa-members',
  imports: [FormsModule],
  templateUrl: './qa-members.html',
})
export class QaMembersPage {
  private readonly api = inject(DashboardApiService);
  readonly live = inject(LiveDashboardStore);

  readonly members = signal<QaMember[]>([]);
  readonly draft = signal<QaMemberInput>({ name: '', jiraAccountId: '', qaseMemberId: '', weeklyCapacityHours: 40 });
  readonly editingId = signal<string | null>(null);
  readonly error = signal('');

  constructor() {
    this.load();
  }

  load() {
    this.api.qaMembers(true).subscribe({
      next: ({ data }) => this.members.set(data),
      error: () => this.error.set('Could not load QA members.'),
    });
  }

  edit(member: QaMember) {
    this.editingId.set(member.id);
    this.draft.set({ name: member.name, jiraAccountId: member.jiraAccountId, qaseMemberId: member.qaseMemberId, weeklyCapacityHours: member.weeklyCapacityHours });
  }

  save() {
    const id = this.editingId();
    const body = this.draft();
    const managerKey = this.live.managerKey();
    const request = id ? this.api.updateQaMember(id, body, managerKey) : this.api.createQaMember(body, managerKey);
    request.subscribe({
      next: () => {
        this.editingId.set(null);
        this.draft.set({ name: '', jiraAccountId: '', qaseMemberId: '', weeklyCapacityHours: 40 });
        this.load();
      },
      error: () => this.error.set('Could not save QA member.'),
    });
  }

  deactivate(member: QaMember) {
    this.api.updateQaMember(member.id, { active: false }, this.live.managerKey()).subscribe({
      next: () => this.load(),
      error: () => this.error.set('Could not deactivate QA member.'),
    });
  }
}
```

(`this.live.managerKey()` — same caveat as Task 5 Step 4: confirm the actual property/signal name on `LiveDashboardStore` that holds the manager-key input value, from Task 5 Step 1's reading, and use that exact name.)

- [ ] **Step 5: Implement `qa-members.html`**

Follow `live-dashboard.html`'s table + form conventions (no `<dialog>` needed here since this is a full page, not a modal — an inline edit form above the table is simpler and consistent with a dedicated page):

```html
<section class="live-card">
  <h2>QA Members</h2>
  @if (error()) {
    <p class="live-alert" role="alert">{{ error() }}</p>
  }
  <form class="form-grid" (ngSubmit)="save()">
    <label>Name<input name="name" required [ngModel]="draft().name" (ngModelChange)="draft.set({ ...draft(), name: $event })" /></label>
    <label>Jira account ID<input name="jiraAccountId" [ngModel]="draft().jiraAccountId" (ngModelChange)="draft.set({ ...draft(), jiraAccountId: $event })" /></label>
    <label>Qase member ID<input name="qaseMemberId" [ngModel]="draft().qaseMemberId" (ngModelChange)="draft.set({ ...draft(), qaseMemberId: $event })" /></label>
    <label>Weekly capacity hours<input name="weeklyCapacityHours" type="number" min="0" required [ngModel]="draft().weeklyCapacityHours" (ngModelChange)="draft.set({ ...draft(), weeklyCapacityHours: $event })" /></label>
    <button type="submit">{{ editingId() ? 'Save changes' : 'Add member' }}</button>
  </form>
  <table class="live-scroll">
    <thead><tr><th>Name</th><th>Jira account</th><th>Qase member</th><th>Weekly hours</th><th>Status</th><th></th></tr></thead>
    <tbody>
      @for (m of members(); track m.id) {
        <tr>
          <td>{{ m.name }}</td>
          <td>{{ m.jiraAccountId || '—' }}</td>
          <td>{{ m.qaseMemberId || '—' }}</td>
          <td>{{ m.weeklyCapacityHours }}</td>
          <td>{{ m.active ? 'Active' : 'Inactive' }}</td>
          <td>
            <button type="button" (click)="edit(m)">Edit</button>
            @if (m.active) {
              <button type="button" (click)="deactivate(m)">Deactivate</button>
            }
          </td>
        </tr>
      } @empty {
        <tr><td colspan="6">No QA members yet.</td></tr>
      }
    </tbody>
  </table>
</section>
```

- [ ] **Step 6: Register the route**

In `src/app/app.routes.ts`, add a 5th route alongside the existing 4, following their exact lazy-loading pattern:

```ts
{ path: 'qa-members', loadComponent: () => import('./pages/qa-members/qa-members').then(m => m.QaMembersPage) },
```

- [ ] **Step 7: Add the sidebar nav entry and icon**

In `src/app/core/dashboard-state.ts`, add `'QA Members'` to the `nav` array and a matching entry to `iconIds` (following the exact existing pairing convention for the other 4 pages).

In `src/app/app.html`, add a new SVG `<symbol id="nav-qa-members">` to the icon sprite (copy the structure of an existing `nav-*` symbol, e.g. `nav-bugs`, and swap in a simple people/roster icon path — exact path data is a cosmetic choice, not a functional requirement).

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Manual check in the browser**

Run: `npm start`. Navigate to the new QA Members entry in the sidebar, add a member, edit it, deactivate it, confirm it disappears from the default list.

- [ ] **Step 10: Commit**

```bash
git add src/app/pages/qa-members/ src/app/app.routes.ts src/app/core/dashboard-state.ts src/app/app.html
git commit -m "feat: add QA Members page with add/edit/deactivate"
```

---

### Task 7: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all specs pass, including the pre-existing `app.spec.ts` (now updated in Task 2) and every new spec file added in Tasks 4-6.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: builds cleanly with no TypeScript errors and no reference to any deleted symbol (`demo-data`, `liveMode`, `useDemoData`, `toggle`, `live.enabled`).

- [ ] **Step 3: Manual smoke test against the real BE**

With the BE plan's changes deployed locally (`go run ./cmd` + `go run ./cmd/worker` in `ms-monitoring-qa-be`), run `npm start` here and walk through: add a project (see the synchronous validate-only success/failure), visit all 5 pages, click Sync independently on Workflow/Workload/Bugs/Projects and confirm each only requests its own sources (check the Network tab for the `sources` field in each `POST /sync-jobs` body), and add/edit/deactivate a QA member.
