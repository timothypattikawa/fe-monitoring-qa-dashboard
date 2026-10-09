import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, finalize, forkJoin, interval, Observable, of, Subscription } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ApiBug,
  ApiProject,
  DashboardApiService,
  PaginatedBugs,
  QaMember,
  QaTimelineRow,
  SourceStatus,
  SyncJob,
  WorkflowDay,
  WorkloadData,
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
  readonly productionBugs = signal<PaginatedBugs>({ items: [], page: 1, pageSize: 20, total: 0 });
  readonly productionBugsLoading = signal(false);
  readonly qaTimeline = signal<QaTimelineRow[]>([]);
  readonly qaTimelineLoading = signal(false);
  readonly jobs = signal<SyncJob[]>([]);
  readonly qaMembers = signal<QaMember[]>([]);
  readonly selectedProject = signal<ApiProject | null>(null);
  readonly selectedJob = signal<SyncJob | null>(null);
  readonly projectFormOpen = signal(false);
  readonly managerKey = signal('');
  /** Set when QA members changed (active flag, Qase mapping); the Workload page refreshes once when opened. */
  readonly workloadStale = signal(false);
  /** The in-flight full-sync job, while `sync()` is polling it to completion. */
  readonly syncingJob = signal<SyncJob | null>(null);
  /** 0-100 once the job reports steps, or null while still queued (indeterminate). */
  readonly syncProgressPercent = computed(() => {
    const steps = this.syncingJob()?.steps ?? [];
    if (!steps.length) return null;
    const done = steps.filter((s) => s.status === 'succeeded' || s.status === 'failed').length;
    return Math.round((done / steps.length) * 100);
  });
  readonly syncStatusLabel = computed(() => {
    const job = this.syncingJob();
    if (!job) return '';
    const steps = job.steps ?? [];
    const running = steps.find((s) => s.status === 'running');
    const done = steps.filter((s) => s.status === 'succeeded' || s.status === 'failed').length;
    if (running) return `Syncing ${running.source}… (${done}/${steps.length} steps done)`;
    if (steps.length) return `Syncing… (${done}/${steps.length} steps done)`;
    return 'Sync queued…';
  });
  readonly projectDraft = {
    jiraInitKey: '',
    name: '',
    qaseProjectCode: '',
    qaOwner: '',
    projectSize: '',
    stagingMtttMinutes: null as number | null,
    betaMtttMinutes: null as number | null,
    stagingStart: '',
    stagingEnd: '',
    betaStart: '',
    betaEnd: '',
  };

  refresh(onDone?: () => void) {
    this.loading.set(true);
    this.error.set('');
    forkJoin({
      projects: this.safe(this.api.projects()),
      workflow: this.safe(this.api.workflow()),
      workload: this.safe(this.api.workload()),
      bugs: this.safe(this.api.bugs({ page: 1, pageSize: 1000 })),
      jobs: this.safe(this.api.jobs(3)),
      qaMembers: this.safe(this.api.qaMembers()),
    }).subscribe({
      next: ({ projects, workflow, workload, bugs, jobs, qaMembers }) => {
        if (projects) this.projects.set(projects.data ?? []);
        if (workflow) this.workflowDays.set(workflow.data?.days ?? []);
        if (workload) this.workload.set(workload.data);
        if (bugs) this.bugs.set(bugs.data?.items ?? []);
        if (jobs) this.jobs.set(jobs.data ?? []);
        if (qaMembers) this.qaMembers.set(qaMembers.data ?? []);
        this.state.useLiveData({
          projects: projects?.data ?? [],
          workflowDays: workflow?.data?.days ?? [],
          workload: workload?.data ?? null,
          bugs: bugs?.data?.items ?? [],
        });
        const snapshot = projects ?? workflow ?? workload ?? bugs ?? jobs;
        if (snapshot) {
          this.asOf.set(snapshot.asOf);
          this.sources.set(snapshot.sources);
        }
        this.loading.set(false);
        onDone?.();
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
  loadProductionBugs(page = 1) {
    this.productionBugsLoading.set(true);
    this.api
      .productionBugs(page, 20)
      .pipe(finalize(() => this.productionBugsLoading.set(false)))
      .subscribe({
        next: (response) => this.productionBugs.set(response.data),
        error: (error: HttpErrorResponse) => this.error.set(this.message(error)),
      });
  }
  loadQaTimeline() {
    this.qaTimelineLoading.set(true);
    this.api
      .qaTimeline()
      .pipe(finalize(() => this.qaTimelineLoading.set(false)))
      .subscribe({
        next: (response) => this.qaTimeline.set(response.data ?? []),
        error: (error: HttpErrorResponse) => this.error.set(this.message(error)),
      });
  }
  /**
   * The single, global sync: overview (jira+qase) AND the expensive Qase
   * detail tier, for every registered project, in one job — so every other
   * page/dialog is a pure DB read until the next time this runs. Polls the
   * job to completion (2s poll) and exposes `syncingJob`/`syncProgressPercent`/
   * `syncStatusLabel` for the topbar progress bar.
   */
  sync(
    sources: ('jira' | 'qase' | 'qase-detail' | 'production-bugs' | 'qa-portfolio')[] = [
      'jira',
      'qase',
      'qase-detail',
    ],
  ) {
    if (this.submitting()) return;
    this.submitting.set(true);
    this.error.set('');
    this.notice.set('');
    this.api.sync(this.managerKey(), sources).subscribe({
      next: (job) => {
        this.selectedJob.set(job);
        this.syncingJob.set(job);
        this.pollSync(job.id, sources.length === 1 && sources[0] === 'production-bugs');
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(this.message(error));
      },
    });
  }
  /**
   * QA portfolio sync: re-reads Jira's QAs field (new members, projects,
   * statuses), then refreshes the dashboard — which also picks up any new
   * Qase mapping the QA lead saved in QA members.
   */
  syncQaPortfolio() {
    this.sync(['qa-portfolio']);
  }
  /** Production-bugs-only sync: the snapshot is all that changed, so skip the full refresh. */
  syncProductionBugs() {
    this.sync(['production-bugs']);
  }
  private pollSync(jobId: string, bugsOnly = false) {
    this.api.job(jobId).subscribe({
      next: ({ data }) => {
        this.syncingJob.set(data);
        if (data.status === 'queued' || data.status === 'running') {
          setTimeout(() => this.pollSync(jobId, bugsOnly), 2000);
          return;
        }
        this.selectedJob.set(data);
        this.notice.set(data.status === 'succeeded' ? 'Sync complete.' : `Sync ${data.status}.`);
        if (bugsOnly) {
          this.submitting.set(false);
          this.syncingJob.set(null);
          this.loadProductionBugs(1);
          return;
        }
        this.refresh(() => {
          this.submitting.set(false);
          this.syncingJob.set(null);
          if (this.state.page() === 'Quality Health') {
            this.loadProductionBugs(this.productionBugs().page);
            this.loadQaTimeline();
          }
        });
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.syncingJob.set(null);
        this.error.set(this.message(error));
      },
    });
  }
  addProject() {
    if (this.submitting()) return;
    const draft = this.projectDraft;
    if (
      !draft.jiraInitKey.trim() ||
      !draft.name.trim() ||
      !draft.qaseProjectCode.trim() ||
      !draft.qaOwner.trim() ||
      !draft.stagingStart ||
      !draft.stagingEnd ||
      !draft.betaStart ||
      !draft.betaEnd
    ) {
      this.error.set('INIT key, project, Qase run, QA owner, and release dates are required.');
      return;
    }
    if (draft.stagingEnd < draft.stagingStart || draft.betaEnd < draft.betaStart) {
      this.error.set('Each end date must be on or after its start date.');
      return;
    }
    this.submitting.set(true);
    this.api
      .addProject(
        {
          jiraInitKey: draft.jiraInitKey.trim(),
          name: draft.name.trim(),
          qaseProjectCode: draft.qaseProjectCode.trim().toUpperCase(),
          qaOwner: draft.qaOwner.trim(),
          projectSize: draft.projectSize || null,
          stagingMtttMinutes: draft.stagingMtttMinutes,
          betaMtttMinutes: draft.betaMtttMinutes,
          stagingStartAt: this.rfc3339(draft.stagingStart),
          stagingEndAt: this.rfc3339(draft.stagingEnd),
          betaStartAt: this.rfc3339(draft.betaStart),
          betaEndAt: this.rfc3339(draft.betaEnd),
        },
        this.managerKey(),
      )
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: (project) => {
          this.error.set('');
          this.notice.set(`${project.jiraInitKey} saved for validation.`);
          Object.assign(this.projectDraft, {
            jiraInitKey: '',
            name: '',
            qaseProjectCode: '',
            qaOwner: '',
            projectSize: '',
            stagingMtttMinutes: null,
            betaMtttMinutes: null,
            stagingStart: '',
            stagingEnd: '',
            betaStart: '',
            betaEnd: '',
          });
          this.projectFormOpen.set(false);
          this.refresh();
        },
        error: (error: HttpErrorResponse) => this.error.set(this.message(error)),
      });
  }
  showJob(job: SyncJob) {
    this.api.job(job.id).subscribe({
      next: (response) => this.selectedJob.set(response.data),
      error: (error: HttpErrorResponse) => this.error.set(this.message(error)),
    });
  }
  showProject(project: Pick<ApiProject, 'id'>, from?: string, to?: string) {
    this.api.project(project.id, from, to).subscribe({
      next: (response) => {
        this.selectedProject.set(response.data);
        this.state.useProjectDetail(response.data);
      },
      error: (error: HttpErrorResponse) => this.error.set(this.message(error)),
    });
  }
  private pollJobs() {
    this.api.jobs(3).subscribe({
      next: (response) => {
        const previous = this.jobs();
        const jobs = response.data ?? [];
        this.jobs.set(jobs);
        const selected = this.selectedJob();
        if (selected) {
          this.api.job(selected.id).subscribe({
            next: (detail) => this.selectedJob.set(detail.data),
            error: (error: HttpErrorResponse) => this.error.set(this.message(error)),
          });
        }
        if (jobs.some((job) => previous.find((old) => old.id === job.id)?.status !== job.status))
          this.refresh();
      },
      error: (error: HttpErrorResponse) => this.error.set(this.message(error)),
    });
  }
  private message(error: HttpErrorResponse): string {
    if (error.status === 0) return 'Go API is unavailable. Start the backend and retry.';
    const body = typeof error.error === 'string' ? error.error.toLowerCase() : '';
    const proxyFailure =
      error.status >= 500 &&
      error.status <= 504 &&
      error.headers.get('content-type')?.includes('text/plain') &&
      (!body.trim() ||
        body.includes('proxy') ||
        body.includes('econnrefused') ||
        body.includes('connect refused'));
    if (proxyFailure) {
      return 'Go API is unreachable through the local dev proxy. Start the backend and retry.';
    }
    return error.error?.message || `API request failed (${error.status}).`;
  }
  private rfc3339(date: string): string {
    return `${date}T00:00:00.000Z`;
  }
  private safe<T>(request: Observable<T>): Observable<T | null> {
    return request.pipe(
      catchError((error: HttpErrorResponse) => {
        this.error.set(this.message(error));
        return of(null);
      }),
    );
  }
}
