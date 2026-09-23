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
  beforeEach(() => TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)],
  }));

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
    http.expectOne('/api/v1/projects').flush({ asOf: null, sources: {}, data: [] });
    http.expectOne('/api/v1/workflow').flush({ asOf: null, sources: {}, data: { days: [] } });
    http.expectOne('/api/v1/workload').flush({ asOf: null, sources: {}, data: { period: { from: '', to: '' }, members: [] } });
    http.expectOne('/api/v1/bugs').flush({ asOf: null, sources: {}, data: [] });
    http.expectOne('/api/v1/sync-jobs').flush({ asOf: null, sources: {}, data: [] });
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
      projects: [{
        id: 'project-1', jiraInitKey: 'INIT-358', name: 'Refund', status: 'active', health: 'on_track',
        qaOwner: 'Sheyla', qaseProjectCode: 'INIT', qaseTestRunId: 42,
        stagingStartAt: '2026-09-10T00:00:00Z', stagingEndAt: '2026-09-12T00:00:00Z',
        betaStartAt: '2026-09-15T00:00:00Z', betaEndAt: '2026-09-20T00:00:00Z',
        countsAvailable: true, counts: { passed: 8, failed: 2, blocked: 0, total: 10 }, runs: [],
      }],
      workflowDays: [
        { date: '2026-09-10', projectId: 'project-1', passed: 4, failed: 1, blocked: 0, total: 10 },
        { date: '2026-09-11', projectId: 'project-1', passed: 8, failed: 2, blocked: 0, total: 10 },
      ],
      workload: null,
      bugs: [],
    });

    expect(state.projects().map(project => project.key)).toEqual(['INIT-358']);
    expect(state.projectTrend(state.projects()[0])).toEqual([
      { date: '10 Sep', exec: 50, pass: 80 },
      { date: '11 Sep', exec: 100, pass: 80 },
    ]);
    expect(state.chartDates).toEqual(['10 Sep', '11 Sep']);
  });

  it('requests backend sync with a manager key and fresh idempotency key', () => {
    const api = TestBed.inject(DashboardApiService);
    const http = TestBed.inject(HttpTestingController);
    api.sync('test-manager-key').subscribe();
    const request = http.expectOne('/api/v1/sync-jobs');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('X-Manager-Key')).toBe('test-manager-key');
    expect(request.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(request.request.body.sources).toEqual(['jira', 'qase']);
    request.flush({ id: 'job-1', status: 'queued' });
    http.verify();
  });

  it('queues only one sync while the previous request is pending', () => {
    const store = TestBed.inject(LiveDashboardStore);
    const http = TestBed.inject(HttpTestingController);
    store.managerKey.set('test-manager-key');
    store.sync();
    store.sync();
    const requests = http.match('/api/v1/sync-jobs');
    expect(requests).toHaveLength(1);
    requests[0].flush({ id: 'job-1', status: 'queued', steps: [], events: [] });
    http.match(request => request.method === 'GET').forEach(request => request.flush({ asOf: null, sources: {}, data: [] }));
    http.verify();
  });

  it('validates project dates and posts the complete live registration payload', () => {
    const store = TestBed.inject(LiveDashboardStore);
    const http = TestBed.inject(HttpTestingController);
    const sources = { jira: { status: 'never_synced', syncedAt: null }, qase: { status: 'never_synced', syncedAt: null } };
    store.managerKey.set('test-manager-key');
    Object.assign(store.projectDraft, {
      jiraInitKey: 'INIT-358', name: 'Refund', qaseProjectCode: 'init', qaseTestRunId: 42,
      qaOwner: 'Sheyla', stagingStart: '2026-09-10', stagingEnd: '2026-09-09',
      betaStart: '2026-09-15', betaEnd: '2026-09-20',
    });

    store.addProject();
    http.expectNone('/api/v1/projects');
    expect(store.error()).toContain('end date');

    store.projectDraft.stagingEnd = '2026-09-12';
    store.addProject();
    const request = http.expectOne('/api/v1/projects');
    expect(request.request.body).toEqual({
      jiraInitKey: 'INIT-358', name: 'Refund', qaseProjectCode: 'INIT', qaseTestRunId: 42,
      qaOwner: 'Sheyla', stagingStartAt: '2026-09-10T00:00:00.000Z',
      stagingEndAt: '2026-09-12T00:00:00.000Z', betaStartAt: '2026-09-15T00:00:00.000Z',
      betaEndAt: '2026-09-20T00:00:00.000Z',
    });
    expect(request.request.body.jiraInitId).toBeUndefined();
    request.flush({ ...request.request.body, id: 'project-1', status: 'pending_validation', health: 'unknown', countsAvailable: false, counts: { passed: 0, failed: 0, blocked: 0, total: 0 } });
    http.expectOne('/api/v1/projects').flush({ asOf: null, sources, data: [] });
    http.expectOne('/api/v1/workflow').flush({ asOf: null, sources, data: { days: [] } });
    http.expectOne('/api/v1/workload').flush({ asOf: null, sources, data: { period: { from: '', to: '' }, members: [] } });
    http.expectOne('/api/v1/bugs').flush({ asOf: null, sources, data: [] });
    http.expectOne('/api/v1/sync-jobs').flush({ asOf: null, sources, data: [] });
    expect(store.projectFormOpen()).toBe(false);
    http.verify();
  });

  it('distinguishes an unreachable dev proxy from a Go API 500 response', () => {
    const store = TestBed.inject(LiveDashboardStore);
    const http = TestBed.inject(HttpTestingController);
    const job = { id: 'job-1', trigger: 'manual', status: 'queued', requestedAt: '', startedAt: null, finishedAt: null, steps: [], events: [] };
    store.showJob(job);
    http.expectOne('/api/v1/sync-jobs/job-1').flush('', { status: 500, statusText: 'Internal Server Error', headers: { 'Content-Type': 'text/plain' } });
    expect(store.error()).toContain('unreachable through the local dev proxy');

    store.showJob(job);
    http.expectOne('/api/v1/sync-jobs/job-1').flush({ code: 'INTERNAL', message: 'request failed' }, { status: 500, statusText: 'Internal Server Error', headers: { 'Content-Type': 'application/json' } });
    expect(store.error()).toBe('request failed');
    http.verify();
  });

  it('keeps live data empty on API failure and updates an open sync log during polling', () => {
    vi.useFakeTimers();
    const store = TestBed.inject(LiveDashboardStore);
    const http = TestBed.inject(HttpTestingController);
    const sources = { jira: { status: 'never_synced', syncedAt: null }, qase: { status: 'never_synced', syncedAt: null } };
    const job = { id: 'job-1', trigger: 'manual', status: 'queued', requestedAt: '2026-09-20T00:00:00Z', startedAt: null, finishedAt: null, steps: [], events: [] };

    store.connect();
    http.expectOne('/api/v1/projects').flush({ message: 'unavailable' }, { status: 503, statusText: 'Unavailable' });
    http.expectOne('/api/v1/workflow').flush({ asOf: null, sources, data: { days: [] } });
    http.expectOne('/api/v1/workload').flush({ asOf: null, sources, data: { period: { from: '', to: '' }, members: [] } });
    http.expectOne('/api/v1/bugs').flush({ asOf: null, sources, data: [] });
    http.expectOne('/api/v1/sync-jobs').flush({ asOf: null, sources, data: [job] });
    expect(store.projects()).toEqual([]);
    expect(store.error()).toContain('unavailable');

    store.showJob(job);
    http.expectOne('/api/v1/sync-jobs/job-1').flush({ asOf: null, sources, data: job });
    vi.advanceTimersByTime(15000);
    http.expectOne('/api/v1/sync-jobs').flush({ asOf: null, sources, data: [{ ...job, status: 'running' }] });
    http.expectOne('/api/v1/sync-jobs/job-1').flush({ asOf: null, sources, data: { ...job, status: 'running', events: [{ id: 'event-1', occurredAt: '2026-09-20T00:00:01Z', level: 'info', code: 'STARTED', message: 'Started' }] } });
    expect(store.selectedJob()?.status).toBe('running');
    expect(store.selectedJob()?.events).toHaveLength(1);

    http.expectOne('/api/v1/projects').flush({ asOf: null, sources, data: [] });
    http.expectOne('/api/v1/workflow').flush({ asOf: null, sources, data: { days: [] } });
    http.expectOne('/api/v1/workload').flush({ asOf: null, sources, data: { period: { from: '', to: '' }, members: [] } });
    http.expectOne('/api/v1/bugs').flush({ asOf: null, sources, data: [] });
    http.expectOne('/api/v1/sync-jobs').flush({ asOf: null, sources, data: [{ ...job, status: 'running', steps: [], events: [] }] });
    http.verify();
    vi.useRealTimers();
  });
});
