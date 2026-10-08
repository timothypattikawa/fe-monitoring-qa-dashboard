import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardState } from './core/dashboard-state';
import { DashboardApiService } from './core/dashboard-api.service';
import { LiveDashboardStore } from './core/live-dashboard.store';
import { vi } from 'vitest';
import { provideRouter, Router } from '@angular/router';
import { routes } from './app.routes';

describe('QA dashboard data boundary', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)],
    }),
  );

  it('keeps demo project filters in local state', () => {
    const state = TestBed.inject(DashboardState);
    const count = state.projects().length;
    state.query.set('unlikely-project-name');
    expect(state.filtered()).toHaveLength(0);
    expect(state.projects()).toHaveLength(count);
  });

  it('renders the approved Projects route in API mode without demo project leakage', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    const http = TestBed.inject(HttpTestingController);
    await router.navigateByUrl('/projects');
    fixture.detectChanges();
    http.expectOne('/api/v1/qa-alert-email/status').flush({ configured: false });
    http.expectOne('/api/v1/projects').flush({ asOf: null, sources: {}, data: [] });
    http.expectOne('/api/v1/workflow').flush({ asOf: null, sources: {}, data: { days: [] } });
    http
      .expectOne('/api/v1/workload')
      .flush({ asOf: null, sources: {}, data: { period: { from: '', to: '' }, members: [] } });
    http
      .expectOne('/api/v1/bugs?page=1&pageSize=1000')
      .flush({ asOf: null, sources: {}, data: { items: [], page: 1, pageSize: 500, total: 0 } });
    http.expectOne('/api/v1/sync-jobs?limit=3').flush({ asOf: null, sources: {}, data: [] });
    http.expectOne('/api/v1/qa-members').flush({ asOf: null, sources: {}, data: [] });
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.project-status-bar')).toBeTruthy();
    expect(element.querySelector('.project-detail-grid')).toBeTruthy();
    expect(element.textContent).toContain('No projects match the selected filters.');
    expect(element.textContent).not.toContain('Checkout & Payment Revamp');
    fixture.destroy();
    http.verify();
  });

  it('maps real workflow days into the approved trend', () => {
    const state = TestBed.inject(DashboardState);
    state.useLiveData({
      projects: [
        {
          id: 'project-1',
          jiraInitKey: 'INIT-358',
          name: 'Refund',
          status: 'active',
          health: 'on_track',
          qaOwner: 'Sheyla',
          qaseProjectCode: 'INIT',
          stagingStartAt: '2026-09-10T00:00:00Z',
          stagingEndAt: '2026-09-12T00:00:00Z',
          betaStartAt: '2026-09-15T00:00:00Z',
          betaEndAt: '2026-09-20T00:00:00Z',
          countsAvailable: true,
          counts: { passed: 8, failed: 2, blocked: 0, total: 10 },
          testerProgress: [],
          runs: [],
        },
      ],
      workflowDays: [
        { date: '2026-09-10', projectId: 'project-1', passed: 4, failed: 1, blocked: 0, total: 10 },
        { date: '2026-09-11', projectId: 'project-1', passed: 8, failed: 2, blocked: 0, total: 10 },
      ],
      workload: null,
      bugs: [],
    });

    expect(state.projects().map((project) => project.key)).toEqual(['INIT-358']);
    expect(state.projectTrend(state.projects()[0])).toEqual([
      { date: '10 Sep', exec: 50, pass: 80 },
      { date: '11 Sep', exec: 100, pass: 80 },
    ]);
    expect(state.chartDates).toEqual(['10 Sep', '11 Sep']);
  });

  it('maps testers, tester progress, and Jira bug fields from the live API instead of hardcoding them', () => {
    const state = TestBed.inject(DashboardState);
    state.useLiveData({
      projects: [
        {
          id: 'project-1',
          jiraInitKey: 'INIT-358',
          name: 'Refund',
          status: 'active',
          health: 'on_track',
          qaOwner: 'Sheyla',
          qaseProjectCode: 'INIT',
          stagingStartAt: '2026-09-10T00:00:00Z',
          stagingEndAt: '2026-09-12T00:00:00Z',
          betaStartAt: '2026-09-15T00:00:00Z',
          betaEndAt: '2026-09-20T00:00:00Z',
          countsAvailable: true,
          counts: { passed: 8, failed: 2, blocked: 0, total: 10 },
          testerProgress: [{ name: 'Sheyla', passed: 6, failed: 1, total: 7 }],
          runs: [
            {
              runId: 1,
              title: 'Run 1',
              environment: 'staging',
              platform: 'web',
              scope: 'Checkout',
              testers: ['Sheyla', 'Budi'],
              passed: 5,
              failed: 1,
              blocked: 0,
              total: 6,
              startedAt: '2026-09-10T00:00:00Z',
              finishedAt: '2026-09-10T01:00:00Z',
              elapsedSeconds: 3600,
            },
          ],
        },
      ],
      workflowDays: [],
      workload: null,
      bugs: [
        {
          id: 'bug-1',
          key: 'INIT-1',
          projectId: 'project-1',
          summary: 'Checkout fails',
          severity: 'critical',
          status: 'Open',
          creator: 'Sheyla',
          reporter: 'Sheyla',
          assignee: 'Budi',
          updatedAt: null,
          environment: 'staging',
          createdAt: new Date(Date.now() - 25 * 3_600_000).toISOString(),
        },
        {
          id: 'bug-4',
          key: 'INIT-4',
          projectId: 'project-1',
          summary: 'Refund partially applied',
          severity: 'major',
          status: 'In Progress',
          creator: 'Sheyla',
          reporter: 'Sheyla',
          assignee: 'Budi',
          updatedAt: null,
          environment: 'staging',
          createdAt: new Date(Date.now() - 25 * 3_600_000).toISOString(),
        },
        {
          id: 'bug-2',
          key: 'INIT-2',
          projectId: 'project-1',
          summary: 'Label typo',
          severity: 'low',
          status: 'Open',
          creator: 'Sheyla',
          reporter: 'Sheyla',
          assignee: 'Budi',
          updatedAt: null,
          environment: 'staging',
          createdAt: new Date(Date.now() - 25 * 3_600_000).toISOString(),
        },
        {
          id: 'bug-3',
          key: 'INIT-3',
          projectId: 'project-1',
          summary: 'Old crash, already fixed',
          severity: 'critical',
          status: 'Done',
          creator: 'Sheyla',
          reporter: 'Sheyla',
          assignee: 'Budi',
          updatedAt: null,
          environment: 'staging',
          createdAt: new Date(Date.now() - 25 * 3_600_000).toISOString(),
        },
      ],
    });

    const project = state.projects()[0];
    expect(project.testCaseAuthors).toEqual([{ name: 'Sheyla', count: 7 }]);
    expect(project.testRuns[0].testers).toEqual(['Sheyla', 'Budi']);
    expect(state.projectAssignees(project)).toEqual(['Sheyla', 'Budi']);

    const bug = state.defects[0];
    expect(bug.environment).toBe('STAGING');
    expect(bug.age).toBe('1d 1hr');
    expect(bug.owner).toBe('Budi');

    expect(state.defectReporters('INIT-358')).toEqual(['Sheyla']);
    // Board shows every bug; Open/In Progress + highest severity float to
    // the top, everything else (e.g. Done) sinks below regardless of severity.
    expect(state.reporterDefects('INIT-358', 'Sheyla').map((b) => b.key)).toEqual([
      'INIT-1',
      'INIT-4',
      'INIT-2',
      'INIT-3',
    ]);
    expect(state.reporterStatusCounts('INIT-358', 'Sheyla')).toEqual([
      { status: 'Open', count: 2 },
      { status: 'In Progress', count: 1 },
      { status: 'Done', count: 1 },
    ]);
  });

  it('requests backend sync with a manager key and fresh idempotency key', () => {
    const api = TestBed.inject(DashboardApiService);
    const http = TestBed.inject(HttpTestingController);
    api.sync('test-manager-key', ['jira', 'qase']).subscribe();
    const request = http.expectOne('/api/v1/sync-jobs');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('X-Manager-Key')).toBe('test-manager-key');
    expect(request.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(request.request.body.sources).toEqual(['jira', 'qase']);
    request.flush({ id: 'job-1', status: 'queued' });
    http.verify();
  });

  it('queues only one sync while the previous request is pending, then polls it to completion', () => {
    const store = TestBed.inject(LiveDashboardStore);
    const state = TestBed.inject(DashboardState);
    const http = TestBed.inject(HttpTestingController);
    const sources = {
      jira: { status: 'never_synced', syncedAt: null },
      qase: { status: 'never_synced', syncedAt: null },
    };
    state.page.set('Quality Health');
    store.managerKey.set('test-manager-key');
    store.sync();
    store.sync();
    const requests = http.match('/api/v1/sync-jobs');
    expect(requests).toHaveLength(1);
    expect(requests[0].request.body.sources).toEqual(['jira', 'qase', 'qase-detail']);
    requests[0].flush({ id: 'job-1', status: 'queued', steps: [], events: [] });

    // sync() polls the job instead of refreshing immediately.
    expect(store.submitting()).toBe(true);
    http.expectOne('/api/v1/sync-jobs/job-1').flush({
      asOf: null,
      sources,
      data: { id: 'job-1', status: 'succeeded', steps: [], events: [] },
    });

    http
      .match((request) => request.method === 'GET')
      .forEach((request) => request.flush({ asOf: null, sources, data: [] }));
    http.expectOne('/api/v1/production-bugs?page=1&pageSize=20').flush({
      asOf: null,
      sources,
      data: { items: [], page: 1, pageSize: 20, total: 0 },
    });
    http.expectOne('/api/v1/qa-timeline').flush({ asOf: null, sources, data: [] });
    expect(store.submitting()).toBe(false);
    http.verify();
  });

  it('validates project dates and posts the complete live registration payload', () => {
    const store = TestBed.inject(LiveDashboardStore);
    const http = TestBed.inject(HttpTestingController);
    const sources = {
      jira: { status: 'never_synced', syncedAt: null },
      qase: { status: 'never_synced', syncedAt: null },
    };
    store.managerKey.set('test-manager-key');
    Object.assign(store.projectDraft, {
      jiraInitKey: 'INIT-358',
      name: 'Refund',
      qaseProjectCode: 'init',
      qaOwner: 'Sheyla',
      projectSize: null,
      stagingMtttMinutes: null,
      betaMtttMinutes: null,
      stagingStart: '2026-09-10',
      stagingEnd: '2026-09-09',
      betaStart: '2026-09-15',
      betaEnd: '2026-09-20',
    });

    store.addProject();
    http.expectNone('/api/v1/projects');
    expect(store.error()).toContain('end date');

    store.projectDraft.stagingEnd = '2026-09-12';
    store.addProject();
    const request = http.expectOne('/api/v1/projects');
    expect(request.request.body).toEqual({
      jiraInitKey: 'INIT-358',
      name: 'Refund',
      qaseProjectCode: 'INIT',
      qaOwner: 'Sheyla',
      projectSize: null,
      stagingMtttMinutes: null,
      betaMtttMinutes: null,
      stagingStartAt: '2026-09-10T00:00:00.000Z',
      stagingEndAt: '2026-09-12T00:00:00.000Z',
      betaStartAt: '2026-09-15T00:00:00.000Z',
      betaEndAt: '2026-09-20T00:00:00.000Z',
    });
    expect(request.request.body.jiraInitId).toBeUndefined();
    request.flush({
      ...request.request.body,
      id: 'project-1',
      status: 'pending_validation',
      health: 'unknown',
      countsAvailable: false,
      counts: { passed: 0, failed: 0, blocked: 0, total: 0 },
    });
    http.expectOne('/api/v1/projects').flush({ asOf: null, sources, data: [] });
    http.expectOne('/api/v1/workflow').flush({ asOf: null, sources, data: { days: [] } });
    http
      .expectOne('/api/v1/workload')
      .flush({ asOf: null, sources, data: { period: { from: '', to: '' }, members: [] } });
    http
      .expectOne('/api/v1/bugs?page=1&pageSize=1000')
      .flush({ asOf: null, sources, data: { items: [], page: 1, pageSize: 500, total: 0 } });
    http.expectOne('/api/v1/sync-jobs?limit=3').flush({ asOf: null, sources, data: [] });
    http.expectOne('/api/v1/qa-members').flush({ asOf: null, sources, data: [] });
    expect(store.projectFormOpen()).toBe(false);
    http.verify();
  });

  it('distinguishes an unreachable dev proxy from a Go API 500 response', () => {
    const store = TestBed.inject(LiveDashboardStore);
    const http = TestBed.inject(HttpTestingController);
    const job = {
      id: 'job-1',
      trigger: 'manual',
      status: 'queued',
      requestedAt: '',
      startedAt: null,
      finishedAt: null,
      steps: [],
      events: [],
    };
    store.showJob(job);
    http.expectOne('/api/v1/sync-jobs/job-1').flush('', {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(store.error()).toContain('unreachable through the local dev proxy');

    store.showJob(job);
    http.expectOne('/api/v1/sync-jobs/job-1').flush(
      { code: 'INTERNAL', message: 'request failed' },
      {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'Content-Type': 'application/json' },
      },
    );
    expect(store.error()).toBe('request failed');
    http.verify();
  });

  it('keeps live data empty on API failure and updates an open sync log during polling', () => {
    vi.useFakeTimers();
    const store = TestBed.inject(LiveDashboardStore);
    const http = TestBed.inject(HttpTestingController);
    const sources = {
      jira: { status: 'never_synced', syncedAt: null },
      qase: { status: 'never_synced', syncedAt: null },
    };
    const job = {
      id: 'job-1',
      trigger: 'manual',
      status: 'queued',
      requestedAt: '2026-09-20T00:00:00Z',
      startedAt: null,
      finishedAt: null,
      steps: [],
      events: [],
    };

    store.connect();
    http
      .expectOne('/api/v1/projects')
      .flush({ message: 'unavailable' }, { status: 503, statusText: 'Unavailable' });
    http.expectOne('/api/v1/workflow').flush({ asOf: null, sources, data: { days: [] } });
    http
      .expectOne('/api/v1/workload')
      .flush({ asOf: null, sources, data: { period: { from: '', to: '' }, members: [] } });
    http
      .expectOne('/api/v1/bugs?page=1&pageSize=1000')
      .flush({ asOf: null, sources, data: { items: [], page: 1, pageSize: 500, total: 0 } });
    http.expectOne('/api/v1/sync-jobs?limit=3').flush({ asOf: null, sources, data: [job] });
    http.expectOne('/api/v1/qa-members').flush({ asOf: null, sources, data: [] });
    expect(store.projects()).toEqual([]);
    expect(store.error()).toContain('unavailable');

    store.showJob(job);
    http.expectOne('/api/v1/sync-jobs/job-1').flush({ asOf: null, sources, data: job });
    vi.advanceTimersByTime(15000);
    http
      .expectOne('/api/v1/sync-jobs?limit=3')
      .flush({ asOf: null, sources, data: [{ ...job, status: 'running' }] });
    http.expectOne('/api/v1/sync-jobs/job-1').flush({
      asOf: null,
      sources,
      data: {
        ...job,
        status: 'running',
        events: [
          {
            id: 'event-1',
            occurredAt: '2026-09-20T00:00:01Z',
            level: 'info',
            code: 'STARTED',
            message: 'Started',
          },
        ],
      },
    });
    expect(store.selectedJob()?.status).toBe('running');
    expect(store.selectedJob()?.events).toHaveLength(1);

    http.expectOne('/api/v1/projects').flush({ asOf: null, sources, data: [] });
    http.expectOne('/api/v1/workflow').flush({ asOf: null, sources, data: { days: [] } });
    http
      .expectOne('/api/v1/workload')
      .flush({ asOf: null, sources, data: { period: { from: '', to: '' }, members: [] } });
    http
      .expectOne('/api/v1/bugs?page=1&pageSize=1000')
      .flush({ asOf: null, sources, data: { items: [], page: 1, pageSize: 500, total: 0 } });
    http
      .expectOne('/api/v1/sync-jobs?limit=3')
      .flush({ asOf: null, sources, data: [{ ...job, status: 'running', steps: [], events: [] }] });
    http.expectOne('/api/v1/qa-members').flush({ asOf: null, sources, data: [] });
    http.verify();
    vi.useRealTimers();
  });
});
