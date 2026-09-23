import { inject, Injectable, signal } from '@angular/core';
import { catchError, finalize, forkJoin, interval, Observable, of, Subscription } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ApiBug, ApiProject, DashboardApiService, SourceStatus, SyncJob, WorkflowDay, WorkloadData,
} from './dashboard-api.service';
import { DashboardState } from './dashboard-state';

@Injectable({ providedIn: 'root' })
export class LiveDashboardStore {
  private readonly api = inject(DashboardApiService);
  private readonly state = inject(DashboardState);
  private poll?: Subscription;
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly asOf = signal<string | null>(null);
  readonly sources = signal<Record<'jira' | 'qase', SourceStatus> | null>(null);
  readonly projects = signal<ApiProject[]>([]);
  readonly workflowDays = signal<WorkflowDay[]>([]);
  readonly workload = signal<WorkloadData | null>(null);
  readonly bugs = signal<ApiBug[]>([]);
  readonly jobs = signal<SyncJob[]>([]);
  readonly selectedProject = signal<ApiProject | null>(null);
  readonly selectedJob = signal<SyncJob | null>(null);
  readonly projectFormOpen = signal(false);
  readonly managerKey = signal('');
  readonly projectDraft = {
    jiraInitKey: '', name: '', qaseProjectCode: '', qaseTestRunId: null as number | null,
    qaOwner: '', stagingStart: '', stagingEnd: '', betaStart: '', betaEnd: '',
  };

  refresh() {
    this.loading.set(true);
    this.error.set('');
    forkJoin({
      projects: this.safe(this.api.projects()), workflow: this.safe(this.api.workflow()),
      workload: this.safe(this.api.workload()), bugs: this.safe(this.api.bugs()),
      jobs: this.safe(this.api.jobs()),
    }).subscribe({
      next: ({ projects, workflow, workload, bugs, jobs }) => {
        if (projects) this.projects.set(projects.data ?? []);
        if (workflow) this.workflowDays.set(workflow.data?.days ?? []);
        if (workload) this.workload.set(workload.data);
        if (bugs) this.bugs.set(bugs.data ?? []);
        if (jobs) this.jobs.set(jobs.data ?? []);
        this.state.useLiveData({
          projects: projects?.data ?? [],
          workflowDays: workflow?.data?.days ?? [],
          workload: workload?.data ?? null,
          bugs: bugs?.data ?? [],
        });
        const snapshot = projects ?? workflow ?? workload ?? bugs ?? jobs;
        if (snapshot) { this.asOf.set(snapshot.asOf); this.sources.set(snapshot.sources); }
        this.loading.set(false);
      },
    });
  }
  connect() {
    this.state.useLiveData({ projects: [], workflowDays: [], workload: null, bugs: [] });
    this.error.set('');
    this.notice.set('');
    this.refresh();
    this.poll?.unsubscribe();
    this.poll = interval(15000).subscribe(() => this.pollJobs());
  }
  sync() {
    if (this.submitting()) return;
    if (!this.managerKey()) { this.error.set('Enter the manager API key to queue a sync.'); return; }
    this.submitting.set(true);
    this.api.sync(this.managerKey()).pipe(finalize(() => this.submitting.set(false))).subscribe({
      next: job => {
        this.error.set('');
        this.notice.set(`Sync ${job.id} queued.`);
        this.selectedJob.set(job);
        this.refresh();
      },
      error: (error: HttpErrorResponse) => this.error.set(this.message(error)),
    });
  }
  addProject() {
    if (this.submitting()) return;
    if (!this.managerKey()) { this.error.set('Enter the manager API key to add a project.'); return; }
    const draft = this.projectDraft;
    if (!draft.jiraInitKey.trim() || !draft.name.trim() || !draft.qaseProjectCode.trim() ||
        !draft.qaOwner.trim() || !draft.stagingStart || !draft.stagingEnd || !draft.betaStart ||
        !draft.betaEnd || !Number.isInteger(draft.qaseTestRunId) || Number(draft.qaseTestRunId) < 1) {
      this.error.set('INIT key, project, Qase run, QA owner, and release dates are required.'); return;
    }
    if (draft.stagingEnd < draft.stagingStart || draft.betaEnd < draft.betaStart) {
      this.error.set('Each end date must be on or after its start date.'); return;
    }
    this.submitting.set(true);
    this.api.addProject({
      jiraInitKey: draft.jiraInitKey.trim(), name: draft.name.trim(),
      qaseProjectCode: draft.qaseProjectCode.trim().toUpperCase(), qaseTestRunId: Number(draft.qaseTestRunId),
      qaOwner: draft.qaOwner.trim(), stagingStartAt: this.rfc3339(draft.stagingStart),
      stagingEndAt: this.rfc3339(draft.stagingEnd), betaStartAt: this.rfc3339(draft.betaStart),
      betaEndAt: this.rfc3339(draft.betaEnd),
    }, this.managerKey()).pipe(finalize(() => this.submitting.set(false))).subscribe({
      next: project => {
        this.error.set('');
        this.notice.set(`${project.jiraInitKey} saved for validation.`);
        Object.assign(this.projectDraft, {
          jiraInitKey: '', name: '', qaseProjectCode: '', qaseTestRunId: null, qaOwner: '',
          stagingStart: '', stagingEnd: '', betaStart: '', betaEnd: '',
        });
        this.projectFormOpen.set(false);
        this.refresh();
      },
      error: (error: HttpErrorResponse) => this.error.set(this.message(error)),
    });
  }
  showJob(job: SyncJob) {
    this.api.job(job.id).subscribe({
      next: response => this.selectedJob.set(response.data),
      error: (error: HttpErrorResponse) => this.error.set(this.message(error)),
    });
  }
  showProject(project: ApiProject) {
    this.api.project(project.id).subscribe({
      next: response => this.selectedProject.set(response.data),
      error: (error: HttpErrorResponse) => this.error.set(this.message(error)),
    });
  }
  private pollJobs() {
    this.api.jobs().subscribe({
      next: response => {
        const previous = this.jobs();
        const jobs = response.data ?? [];
        this.jobs.set(jobs);
        const selected = this.selectedJob();
        if (selected) {
          this.api.job(selected.id).subscribe({
            next: detail => this.selectedJob.set(detail.data),
            error: (error: HttpErrorResponse) => this.error.set(this.message(error)),
          });
        }
        if (jobs.some(job => previous.find(old => old.id === job.id)?.status !== job.status)) this.refresh();
      },
      error: (error: HttpErrorResponse) => this.error.set(this.message(error)),
    });
  }
  private message(error: HttpErrorResponse): string {
    if (error.status === 0) return 'Go API is unavailable. Start the backend and retry.';
    const body = typeof error.error === 'string' ? error.error.toLowerCase() : '';
    const proxyFailure = error.status >= 500 && error.status <= 504
      && error.headers.get('content-type')?.includes('text/plain')
      && (!body.trim() || body.includes('proxy') || body.includes('econnrefused') || body.includes('connect refused'));
    if (proxyFailure) {
      return 'Go API is unreachable through the local dev proxy. Start the backend and retry.';
    }
    return error.error?.message || `API request failed (${error.status}).`;
  }
  private rfc3339(date: string): string {
    return `${date}T00:00:00.000Z`;
  }
  private safe<T>(request: Observable<T>): Observable<T | null> {
    return request.pipe(catchError((error: HttpErrorResponse) => {
      this.error.set(this.message(error));
      return of(null);
    }));
  }
}
