import { Injectable, computed, signal } from '@angular/core';
import type { Environment, Project, ProjectHealth, TestRun } from './dashboard.models';
import type { ApiBug, ApiProject, WorkflowDay, WorkloadData } from './dashboard-api.service';

const WORKLOAD_DAYS = 5;

type DashboardMember = {
  name: string;
  initials: string;
  role: string;
  hours: number;
  capacity: number;
  scenarios: number;
  execution: number;
  docs: number;
  project: string;
  dailyTarget: number;
  cumulative: number;
  dailyRuns: number;
  blocker: string;
  jiraProjects: { active: number; total: number };
  qaseExecution: { yearToDate: number; activeProjects: number };
  portfolio: {
    id: string;
    key: string;
    name: string;
    status?: string;
    stagingStartAt?: string;
  }[];
  nextProject: { id: string; key: string; name: string; stagingStartAt: string } | null;
  /** False until the QA lead sets the member's Qase display name (Jira data only until then). */
  qaseMapped: boolean;
  /** Name Qase records this QA's runs under — run testers match on it, not on `name`. */
  qaseName: string;
  /** Dashboard-registered projects this QA executed in during the workload window (Qase DB). */
  qaseProjects: { id: string; key: string; name: string; status?: string }[];
  color: string;
};
type DashboardDefect = {
  key: string;
  init: string;
  title: string;
  domain: string;
  severity: string;
  priority: string;
  cause: string;
  age: string;
  status: string;
  environment: Environment | '—';
  reporter: string;
  owner: string;
};
type LiveSnapshot = {
  projects: ApiProject[];
  workflowDays: WorkflowDay[];
  workload: WorkloadData | null;
  bugs: ApiBug[];
};

@Injectable({ providedIn: 'root' })
export class DashboardState {
  private readonly memberData = signal<DashboardMember[]>([]);
  private readonly defectData = signal<DashboardDefect[]>([]);
  private readonly chartDateData = signal(['10 Sep', '11 Sep', '14 Sep', '15 Sep', '16 Sep']);
  private readonly workloadDateData = signal([
    '03 Sep',
    '04 Sep',
    '07 Sep',
    '08 Sep',
    '09 Sep',
    '10 Sep',
    '11 Sep',
    '14 Sep',
    '15 Sep',
    '16 Sep',
  ]);
  private readonly workflowSeries = signal<
    Record<string, { date: string; exec: number; pass: number }[]>
  >({});
  private readonly workloadSeries = signal<
    Record<
      string,
      Record<string, { executed: number; passed: number; failed: number; blocked: number }>
    >
  >({});
  readonly nav = ['Projects', 'Workflow', 'Workload', 'Bugs', 'QA Members', 'Documentation', 'Knowledge & RAG'];
  readonly iconIds = ['projects', 'testing', 'workload', 'bugs', 'qa-members', 'documentation', 'knowledge'];
  get members() {
    return this.memberData();
  }
  get defects() {
    return this.defectData();
  }
  get chartDates() {
    return this.chartDateData();
  }
  get workloadDates() {
    return this.workloadDateData();
  }
  readonly projects = signal<Project[]>([]);
  readonly testRuns = computed(() =>
    this.projects().flatMap((project) =>
      project.testRuns.map((run) => ({
        ...run,
        key: project.key,
        projectName: project.name,
        eta: run.environment === 'STAGING' ? project.stagingEta : project.betaEta,
        daysLeft: run.environment === 'STAGING' ? project.stagingDaysLeft : project.betaDaysLeft,
      })),
    ),
  );
  readonly page = signal('Projects');
  readonly query = signal('');
  readonly owner = signal('All QA members');
  readonly projectStatus = signal<ProjectHealth | 'All'>('All');
  readonly projectStatuses: ProjectHealth[] = [
    'On Track',
    'At Risk',
    'Behind',
    'Stalled',
    'No Target Set',
  ];
  readonly selected = signal<Project | null>(null);
  readonly selectedMember = signal<DashboardMember | null>(null);
  readonly detailTab = signal('Testing');
  readonly detailTabs = [
    { id: 'Testing', label: 'Test execution' },
    { id: 'Team Progress', label: 'Team progress' },
    { id: 'Bugs', label: 'Jira bugs' },
  ];
  readonly workloadMetric = signal<'Executed' | 'Remaining' | 'Blocked'>('Executed');
  readonly workloadTrendMetric = signal<'Executed' | 'Failed' | 'Blocked'>('Executed');
  readonly workloadEnvironment = signal<'All environments' | Environment>('All environments');
  readonly bugEnvironment = signal<'All environments' | Environment>('All environments');
  readonly memberRunPage = signal(1);
  readonly executionHistoryPage = signal(1);
  readonly projectRunHistoryPage = signal(1);
  readonly tablePageSize = 10;
  readonly bugQuery = signal('');
  readonly bugProject = signal('All projects');
  readonly bugReporter = signal('All reporters');
  readonly bugSeverity = signal('All severities');
  readonly bugStatus = signal('All statuses');
  readonly bugPageEnvironment = signal<'All environments' | Environment>('All environments');
  readonly bugPageSize = 10;
  readonly bugPage = signal(1);
  readonly feedback = signal('');
  readonly filtered = computed(() =>
    this.projects().filter(
      (p) =>
        `${p.key} ${p.name} ${p.code} ${p.domain} ${p.qa}`
          .toLowerCase()
          .includes(this.query().toLowerCase()) &&
        (this.owner() === 'All QA members' || p.qa === this.owner()),
    ),
  );
  readonly totals = computed(() =>
    this.filtered().reduce(
      (a, p) => ({
        total: a.total + p.total,
        executed: a.executed + p.passed + p.failed,
        fresh: a.fresh + p.fresh,
        critical: a.critical + p.critical,
        bugs: a.bugs + p.bugs,
        escaped: a.escaped + p.escapedBugs,
      }),
      { total: 0, executed: 0, fresh: 0, critical: 0, bugs: 0, escaped: 0 },
    ),
  );
  readonly projectCards = computed(() =>
    this.filtered().filter(
      (project) =>
        this.projectStatus() === 'All' || this.projectHealth(project) === this.projectStatus(),
    ),
  );
  readonly workloadRuns = computed(() => {
    const query = this.query().toLowerCase();
    const projectKeys = new Set(
      this.projects()
        .filter((project) =>
          `${project.key} ${project.name} ${project.code} ${project.domain}`
            .toLowerCase()
            .includes(query),
        )
        .map((project) => project.key),
    );
    return this.testRuns().filter(
      (run) =>
        projectKeys.has(run.key) &&
        (this.owner() === 'All QA members' || run.testers.includes(this.owner())),
    );
  });
  /** Every QA (Jira portfolio cards), unmapped ones included. */
  readonly portfolioMembers = computed(() =>
    this.owner() === 'All QA members'
      ? this.members
      : this.members.filter((member) => member.name === this.owner()),
  );
  /** QAs with a Qase mapping — the ones the execution charts and totals are about. */
  readonly workloadMembers = computed(() =>
    this.portfolioMembers().filter((member) => member.qaseMapped),
  );
  readonly workloadSummary = computed(() => {
    const series = this.workloadSeries();
    const days = Object.values(series).flatMap((member) => Object.values(member));
    const passed = days.reduce((sum, day) => sum + day.passed, 0);
    const failed = days.reduce((sum, day) => sum + day.failed, 0);
    return {
      executed: passed + failed,
      runs: days.length,
      activeMembers: Object.values(series).filter((member) => Object.keys(member).length).length,
      activeProjects: new Set(this.workloadRuns().map((run) => run.key)).size,
      passRate: this.percent(passed, passed + failed),
    };
  });
  readonly seriesColors = ['#087a5b', '#2563a8', '#0e8f8a', '#d98a00', '#17243b'];
  readonly filteredDefects = computed(() => {
    const query = this.bugQuery().trim().toLowerCase();
    return this.defects.filter(
      (bug) =>
        this.isVisible(bug.init) &&
        (!query || `${bug.key} ${bug.title} ${bug.domain}`.toLowerCase().includes(query)) &&
        (this.bugProject() === 'All projects' || bug.init === this.bugProject()) &&
        (this.bugReporter() === 'All reporters' || bug.reporter === this.bugReporter()) &&
        (this.bugSeverity() === 'All severities' || bug.severity === this.bugSeverity()) &&
        (this.bugStatus() === 'All statuses' || bug.status === this.bugStatus()) &&
        (this.bugPageEnvironment() === 'All environments' ||
          bug.environment === this.bugPageEnvironment()),
    );
  });
  readonly bugPageCount = computed(() =>
    Math.max(1, Math.ceil(this.filteredDefects().length / this.bugPageSize)),
  );
  readonly pagedDefects = computed(() => {
    const page = Math.min(this.bugPage(), this.bugPageCount());
    const start = (page - 1) * this.bugPageSize;
    return this.filteredDefects().slice(start, start + this.bugPageSize);
  });
  readonly bugReporters = computed(() => [...new Set(this.defects.map((bug) => bug.reporter))]);
  readonly bugStatuses = computed(() => [...new Set(this.defects.map((bug) => bug.status))]);
  readonly bugSummary = computed(() => ({
    open: this.filteredDefects().filter((bug) => bug.status !== 'Ready').length,
    critical: this.filteredDefects().filter((bug) => bug.severity === 'Critical').length,
    reopened: this.filteredDefects().filter((bug) => ['Reopened', 'Blocked'].includes(bug.status))
      .length,
    projects: new Set(this.filteredDefects().map((bug) => bug.init)).size,
  }));
  readonly highPriorityDefects = computed(() =>
    this.defects
      .filter(
        (bug) => this.isVisible(bug.init) && ['HIGH', 'HIGHEST', 'BLOCKER'].includes(bug.priority),
      )
      .sort((a, b) => this.defectPriorityRank(a) - this.defectPriorityRank(b)),
  );
  readonly workloadChartMax = computed(() =>
    Math.max(1, ...this.workloadMembers().map((member) => this.memberChartValue(member.name))),
  );
  private hasLoadedLiveData = false;
  useLiveData(snapshot: LiveSnapshot) {
    if (!this.hasLoadedLiveData) {
      this.hasLoadedLiveData = true;
      this.resetViewState();
    }
    const bugsByProject = new Map<string, ApiBug[]>();
    for (const bug of snapshot.bugs) {
      bugsByProject.set(bug.projectId, [...(bugsByProject.get(bug.projectId) ?? []), bug]);
    }
    const projectKeys = new Map(
      snapshot.projects.map((project) => [project.id, project.jiraInitKey]),
    );
    const projects = snapshot.projects.map((project) =>
      this.mapProject(project, bugsByProject.get(project.id) ?? []),
    );
    this.projects.set(projects);

    const workflow: Record<string, { date: string; exec: number; pass: number }[]> = {};
    for (const day of [...snapshot.workflowDays].sort((a, b) => a.date.localeCompare(b.date))) {
      const key = projectKeys.get(day.projectId);
      if (!key) continue;
      (workflow[key] ??= []).push({
        date: this.dateLabel(day.date),
        exec: this.percent(day.passed + day.failed, day.total),
        pass: this.percent(day.passed, day.passed + day.failed),
      });
    }
    this.workflowSeries.set(workflow);
    this.chartDateData.set([
      ...new Set(
        snapshot.workflowDays
          .map((day) => day.date)
          .sort()
          .map((date) => this.dateLabel(date)),
      ),
    ]);

    // Workload charts cover a fixed window: today plus the previous
    // WORKLOAD_DAYS - 1 calendar days (it slides forward each day; days without
    // execution stay as empty columns).
    const windowDates = Array.from({ length: WORKLOAD_DAYS }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (WORKLOAD_DAYS - 1 - i));
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    });
    const inWindow = new Set(windowDates);
    const members = (snapshot.workload?.members ?? []).map((m) => ({
      ...m,
      dailyExecutions: m.dailyExecutions.filter((d) => inWindow.has(d.date.slice(0, 10))),
    }));
    const workloadSeries: Record<
      string,
      Record<string, { executed: number; passed: number; failed: number; blocked: number }>
    > = {};
    this.memberData.set(
      members.map((member, index) => {
        workloadSeries[member.name] = Object.fromEntries(
          member.dailyExecutions.map((day) => [this.dateLabel(day.date), day]),
        );
        const portfolio = member.projects ?? [];
        return {
          name: member.name,
          initials: this.initials(member.name),
          role: 'QA Engineer',
          hours: member.plannedHours,
          capacity: member.capacityHours,
          scenarios: 0,
          execution: member.qaseExecutions,
          docs: 0,
          project: portfolio[0] ? `${portfolio[0].key} · ${portfolio[0].name}` : '—',
          dailyTarget: 0,
          cumulative: 0,
          dailyRuns: member.dailyExecutions.length,
          blocker: '',
          jiraProjects: {
            active: member.activeProjects ?? portfolio.length,
            total: member.totalProjects ?? portfolio.length,
          },
          qaseExecution: { yearToDate: 0, activeProjects: member.qaseExecutions },
          portfolio,
          nextProject: member.nextProject ?? null,
          qaseMapped: member.qaseMapped ?? true,
          qaseName: member.qaseName || member.name,
          qaseProjects: member.qaseProjects ?? [],
          color: ['green-avatar', 'blue', 'orange'][index % 3],
        };
      }),
    );
    this.workloadSeries.set(workloadSeries);
    this.workloadDateData.set(windowDates.map((date) => this.dateLabel(date)));

    this.defectData.set(
      snapshot.bugs.map((bug) => ({
        key: bug.key,
        init: projectKeys.get(bug.projectId) ?? '—',
        title: bug.summary,
        domain: '—',
        severity: this.severity(bug.severity),
        priority: bug.severity?.trim().toUpperCase() || '—',
        cause: '—',
        age: this.ageLabel(bug.createdAt),
        status: bug.status,
        environment: (bug.environment?.toUpperCase() || '—') as Environment | '—',
        reporter: bug.reporter || bug.creator || '—',
        owner: bug.assignee || '—',
      })),
    );
  }
  private ageLabel(createdAt: string | null) {
    if (!createdAt) return '—';
    const hours = Math.max(0, (Date.now() - new Date(createdAt).getTime()) / 3_600_000);
    if (hours < 24) return `${Math.round(hours)}hr`;
    const days = Math.floor(hours / 24);
    return `${days}d ${Math.round(hours - days * 24)}hr`;
  }
  private mapProject(project: ApiProject, bugs: ApiBug[]): Project {
    const testRuns = (project.runs ?? []).flatMap((run) => {
      const environment = run.environment.toUpperCase();
      if (environment !== 'STAGING' && environment !== 'BETA') return [];
      return [
        {
          id: `RUN-${run.runId}`,
          date: (run.finishedAt ?? run.startedAt ?? '').slice(0, 10),
          environment: environment as Environment,
          scope: run.scope || run.platform || run.title || '—',
          testers: run.testers ?? [],
          passed: run.passed,
          failed: run.failed,
          blocked: run.blocked,
          total: run.total,
          elapsed: run.elapsedSeconds ? `${Math.round(run.elapsedSeconds / 60)}m` : '—',
        },
      ];
    });
    // stagingCounts/betaCounts come from the backend already deduped by
    // case ID across runs — a shared scenario tested on both IOS and
    // Android must count once, not once per run, or the percentage can
    // exceed 100%. Every staging/beta % on this page (inside the project
    // detail dialog and outside on the list card) must read from here, not
    // recompute its own sum over testRuns.
    const stagingCounts = project.stagingCounts ?? { passed: 0, failed: 0, blocked: 0, total: 0 };
    const betaCounts = project.betaCounts ?? { passed: 0, failed: 0, blocked: 0, total: 0 };
    const critical = bugs.filter(
      (bug) => this.severity(bug.severity) === 'Critical' && this.isOpenStatus(bug.status),
    ).length;
    const stagingBugs =
      project.bugSummary?.staging ??
      bugs.filter((bug) => bug.environment?.toUpperCase() === 'STAGING').length;
    const betaBugs =
      project.bugSummary?.beta ??
      bugs.filter((bug) => bug.environment?.toUpperCase() === 'BETA').length;
    const stagingStart = this.dateOnly(project.stagingStartAt);
    const stagingEnd = this.dateOnly(project.stagingEndAt);
    const betaStart = this.dateOnly(project.betaStartAt);
    const betaEnd = this.dateOnly(project.betaEndAt);
    const stagingPercent = this.executionPercent(
      stagingCounts.passed,
      stagingCounts.failed,
      stagingCounts.total,
    );
    const betaPercent = this.executionPercent(
      betaCounts.passed,
      betaCounts.failed,
      betaCounts.total,
    );
    const stagingDaysLeft = this.daysUntil(project.stagingEndAt);
    const betaDaysLeft = this.daysUntil(project.betaEndAt);
    const velocity = this.velocityFor(stagingPercent, stagingStart);
    const betaVelocity = this.velocityFor(betaPercent, betaStart);
    return {
      id: project.id,
      key: project.jiraInitKey,
      name: project.name,
      qa: project.qaOwner || '—',
      size: project.projectSize || '—',
      stagingMtttMinutes: project.stagingMtttMinutes ?? null,
      betaMtttMinutes: project.betaMtttMinutes ?? null,
      stagingStart,
      stagingEnd,
      betaStart,
      betaEnd,
      status: this.status(project.health),
      passed: project.counts?.passed ?? 0,
      failed: project.counts?.failed ?? 0,
      blocked: project.counts?.blocked ?? 0,
      total: project.countsAvailable ? project.counts.total : 0,
      fresh: 0,
      indexed: 0,
      bugs: project.bugSummary?.total ?? bugs.length,
      critical,
      code: project.qaseProjectCode,
      domain: this.domainFor(stagingStart, stagingEnd, betaStart, betaEnd),
      version: `${project.runs?.length ?? 0} active run(s)`,
      staging: stagingPercent,
      beta: betaPercent,
      velocity,
      requiredVelocity: this.requiredVelocityFor(stagingPercent, stagingDaysLeft),
      stagingEta: this.etaFor(stagingPercent, velocity, stagingEnd),
      stagingDaysLeft,
      betaVelocity,
      betaRequiredVelocity: this.requiredVelocityFor(betaPercent, betaDaysLeft),
      betaEta: this.etaFor(betaPercent, betaVelocity, betaEnd),
      betaDaysLeft,
      stagingBugs,
      betaBugs,
      canceledBugs:
        project.bugSummary?.canceled ??
        bugs.filter((bug) => bug.status.toLowerCase().includes('cancel')).length,
      betaBugThresholdExceeded:
        project.bugSummary?.betaOverThirtyPercentOfStaging ?? betaBugs > stagingBugs * 0.3,
      // A defect found in BETA escaped the preceding STAGING validation.
      escapedBugs: betaBugs,
      docsReady: 0,
      testCaseAuthors: (project.testerProgress ?? []).map((tester) => ({
        name: tester.name,
        count: tester.total,
      })),
      testRuns,
      dailyExecutions: (() => {
        const rows = project.dailyExecutions ?? [];
        return rows
          .filter((day) => day.tester)
          .map((day) => ({
            date: day.date,
            dateLabel: this.dateLabel(day.date),
            tester: day.tester,
            environment: day.environment as Environment,
            executed: day.executed,
            passed: day.passed,
            failed: day.failed,
            blocked: day.blocked,
            skipped: day.skipped,
            retest: day.retest,
            inProgress: day.inProgress,
            invalid: day.invalid,
            cancelled: day.cancelled,
          }));
      })(),
      stagingCounts,
      betaCounts,
      assigneeProgress: (project.assigneeProgress ?? []).flatMap((progress) => {
        const environment = progress.environment.toUpperCase();
        return environment === 'STAGING' || environment === 'BETA'
          ? [{ ...progress, environment: environment as Environment }]
          : [];
      }),
    };
  }
  useProjectDetail(project: ApiProject) {
    const mapped = this.mapProject(project, []);
    this.projects.update((projects) =>
      projects.map((item) => (item.id === mapped.id ? mapped : item)),
    );
    this.selected.set(mapped);
  }
  private dateOnly(value: string) {
    return value ? value.slice(0, 10) : '';
  }
  dateLabel(value: string) {
    if (!value) return '—';
    const parts = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: 'short',
      timeZone: 'UTC',
    }).formatToParts(new Date(`${value.slice(0, 10)}T00:00:00Z`));
    return `${parts.find((part) => part.type === 'day')?.value} ${parts.find((part) => part.type === 'month')?.value}`;
  }
  private daysUntil(value: string) {
    if (!value) return 0;
    return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
  }
  // Average pace since the environment started: percent complete / days
  // elapsed. Needs a start date and > 0% progress — otherwise there's
  // nothing to project a pace from.
  private velocityFor(percent: number, startDate: string): number {
    if (!startDate || percent <= 0) return 0;
    const elapsedDays = Math.max(
      1,
      Math.floor((Date.now() - new Date(startDate).getTime()) / 86_400_000),
    );
    return percent / elapsedDays;
  }
  // Pace still needed to reach 100% by the environment's end date.
  private requiredVelocityFor(percent: number, daysLeft: number): number {
    if (daysLeft <= 0) return 0;
    return Math.max(0, 100 - percent) / daysLeft;
  }
  // Projects a completion date from the current pace; falls back to the
  // environment's own end date when there's no pace yet to project from.
  private etaFor(percent: number, velocity: number, endDate: string): string {
    if (percent >= 100) return 'Done';
    if (velocity <= 0) return endDate ? this.dateLabel(endDate) : '—';
    const daysNeeded = Math.ceil((100 - percent) / velocity);
    return this.dateLabel(new Date(Date.now() + daysNeeded * 86_400_000).toISOString());
  }
  // ISO yyyy-mm-dd strings compare lexicographically same as chronologically.
  private domainFor(stagingStart: string, stagingEnd: string, betaStart: string, betaEnd: string) {
    const today = new Date().toISOString().slice(0, 10);
    if (stagingStart && stagingEnd && today >= stagingStart && today <= stagingEnd)
      return 'Staging';
    if (betaStart && betaEnd && today >= betaStart && today <= betaEnd) return 'Beta';
    return '—';
  }
  priorityTone(value: string) {
    const v = (value ?? '').toLowerCase();
    if (v.includes('critical') || v.includes('blocker')) return 'critical';
    return ['highest', 'high', 'medium'].includes(v) ? v : 'none';
  }
  statusTone(value: string) {
    const v = (value ?? '').toLowerCase().trim();
    if (v === 'open' || v === 'to do') return 'open';
    if (v === 'reopened') return 'reopened';
    if (v === 'confirm') return 'confirm';
    if (v === 'in progress') return 'progress';
    if (v === 'ready for qa') return 'qa';
    if (v === 'resolved' || v === 'done' || v === 'closed') return 'done';
    if (['invalid', 'cancel', 'cancelled', 'canceled'].includes(v)) return 'invalid';
    return 'other';
  }
  severity(value: string) {
    const severity = value.toLowerCase();
    if (severity.includes('critical') || severity.includes('blocker') || severity === 'highest')
      return 'Critical';
    if (severity.includes('major') || severity === 'high') return 'Major';
    if (severity.includes('minor') || severity === 'low' || severity === 'lowest') return 'Minor';
    return '—';
  }
  private status(health: string) {
    const value = health.toLowerCase().replaceAll('_', ' ');
    if (value.includes('behind') || value.includes('off track')) return 'Off track';
    if (value.includes('risk')) return 'At risk';
    // Any other backend value (including its "unknown" default) is treated
    // as on-track — "Draft"/"No Target Set" is decided from the project's
    // own staging/beta dates in projectHealth(), not from this string.
    return 'On track';
  }
  private resetViewState() {
    this.query.set('');
    this.owner.set('All QA members');
    this.projectStatus.set('All');
    this.workloadEnvironment.set('All environments');
    this.bugQuery.set('');
    this.bugProject.set('All projects');
    this.bugReporter.set('All reporters');
    this.bugSeverity.set('All severities');
    this.bugStatus.set('All statuses');
    this.bugPageEnvironment.set('All environments');
    this.selected.set(null);
    this.selectedMember.set(null);
  }
  pageDescription() {
    const descriptions: Record<string, string> = {
      Overview: 'Current delivery health, execution progress, and issues requiring attention.',
      Projects: 'Execution trend, release progress, and QA ownership by initiative.',
      Workflow:
        "Execution and pass-rate trend across each project's full testing run, not just today.",
      Workload:
        'Qase execution volume, queue pressure, and planned-capacity utilization by QA across the testing period, not just today.',
      Testing: 'Latest execution results and active Qase runs across projects.',
      Bugs: 'Defect health by project, severity, reporter, and assignee.',
      'QA Members': 'Roster of QA members used to populate the QA owner field.',
      'Knowledge & RAG': 'Indexed QA knowledge, freshness, and source coverage.',
      Documentation: 'Release-document readiness by project and document type.',
      Notifications: 'Prepared follow-ups and simulated delivery history.',
    };
    return descriptions[this.page()];
  }
  percent(part: number, total: number) {
    return total ? Math.round((part / total) * 100) : 0;
  }
  executionPercent(passed: number, failed: number, total: number) {
    return total ? Math.min(100, this.percent(passed + failed, total)) : 0;
  }
  formatNumber(value: number) {
    return value.toLocaleString('en-US');
  }
  projectRuns(project: Project, environment: TestRun['environment']) {
    return project.testRuns.filter((run) => run.environment === environment);
  }
  // The Jira "health" field alone, with no pace math — the shared base that
  // both the per-project and per-environment health below build on.
  private jiraHealth(project: Project): ProjectHealth {
    if (!project.stagingStart && !project.betaStart) return 'No Target Set';
    if (project.status === 'Off track') return 'Behind';
    return project.status === 'At risk' ? 'At Risk' : 'On Track';
  }
  // Rolls up both environments' pace so the project-card/list badge (Projects,
  // Workflow pages) can't stay "On Track" while Staging or Beta is behind pace.
  projectHealth(project: Project): ProjectHealth {
    const base = this.jiraHealth(project);
    if (base === 'Behind' || base === 'No Target Set') return base;
    const envHealth = [
      this.environmentHealth(project, 'STAGING'),
      this.environmentHealth(project, 'BETA'),
    ];
    if (envHealth.includes('Behind')) return 'Behind';
    if (envHealth.includes('At Risk')) return 'At Risk';
    return base;
  }
  environmentHealth(project: Project, environment: Environment): ProjectHealth {
    const progress = environment === 'STAGING' ? project.staging : project.beta;
    const target = environment === 'STAGING' ? project.stagingEnd : project.betaEnd;
    if (!target) return 'No Target Set';
    if (!progress) return 'Stalled';
    const daysLeft = environment === 'STAGING' ? project.stagingDaysLeft : project.betaDaysLeft;
    if (daysLeft <= 0 && progress < 100) return 'Behind';
    const base = this.jiraHealth(project);
    if (base === 'Behind') return base;
    const velocity = environment === 'STAGING' ? project.velocity : project.betaVelocity;
    const requiredVelocity =
      environment === 'STAGING' ? project.requiredVelocity : project.betaRequiredVelocity;
    // Jira's own health field can lag reality — flag it ourselves once the
    // current pace can no longer reach 100% by the deadline.
    if (velocity < requiredVelocity) return 'At Risk';
    return base;
  }
  projectStatusCount(status: ProjectHealth) {
    return this.filtered().filter((project) => this.projectHealth(project) === status).length;
  }
  environmentStats(project: Project, environment: Environment) {
    const counts = environment === 'STAGING' ? project.stagingCounts : project.betaCounts;
    return {
      passed: counts.passed,
      failed: counts.failed,
      blocked: counts.blocked,
      total: counts.total,
      notRun: Math.max(0, counts.total - counts.passed - counts.failed - counts.blocked),
    };
  }
  environmentDistribution(project: Project, environment: Environment) {
    const counts = this.environmentStats(project, environment);
    const passed = this.percent(counts.passed, counts.total);
    const failed = Math.min(100, passed + this.percent(counts.failed, counts.total));
    const blocked = Math.min(100, failed + this.percent(counts.blocked, counts.total));
    return `conic-gradient(#087a5b 0 ${passed}%, #c9222d ${passed}% ${failed}%, #d98a00 ${failed}% ${blocked}%, #e5e8ee ${blocked}% 100%)`;
  }
  betaBugThreshold(project: Project) {
    return project.betaBugThresholdExceeded;
  }
  environmentMttt(project: Project, environment: Environment) {
    const minutes =
      environment === 'STAGING' ? project.stagingMtttMinutes : project.betaMtttMinutes;
    if (minutes === null) return '—';
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return hours ? `${hours}h${remainder ? ` ${remainder}m` : ''}` : `${remainder}m`;
  }
  environmentRunCount(project: Project, environment: Environment) {
    return project.testRuns.filter((run) => run.environment === environment).length;
  }
  assigneeProgress(project: Project, environment: Environment) {
    return project.assigneeProgress.filter((progress) => progress.environment === environment);
  }
  memberRuns(name: string, project?: Project, environment?: Environment) {
    const runs = project
      ? project.testRuns.map((run) => ({ ...run, key: project.key, projectName: project.name }))
      : this.testRuns();
    const tester = this.members.find((member) => member.name === name)?.qaseName ?? name;
    return runs.filter(
      (run) => run.testers.includes(tester) && (!environment || run.environment === environment),
    );
  }
  /** Registered-project Qase runs for a QA inside the workload window (what the QA detail lists). */
  memberWindowRuns(name: string) {
    const days = new Set(this.workloadDates);
    return this.memberRuns(name).filter((run) => days.has(this.dateLabel(run.date)));
  }
  memberRunPageCount(name: string) {
    return this.tablePageCount(this.memberWindowRuns(name).length);
  }
  pagedMemberRuns(name: string) {
    return this.tablePage(this.memberWindowRuns(name), this.memberRunPage());
  }
  /** Card project chips: active Jira portfolio + Qase-registered projects, merged by INIT key. */
  memberActiveProjects(name: string) {
    const member = this.members.find((m) => m.name === name);
    if (!member) return [];
    const merged = new Map<string, { id: string; key: string; name: string; status?: string }>();
    for (const project of [...member.portfolio, ...member.qaseProjects]) {
      const known = merged.get(project.key);
      // Same INIT in both sources: keep one chip, preferring the Jira status.
      merged.set(project.key, known ? { ...project, ...known, status: known.status ?? project.status } : project);
    }
    return [...merged.values()];
  }
  memberExecution(name: string, project?: Project, environment?: Environment) {
    const runs = this.memberRuns(name, project, environment);
    const passed = runs.reduce((sum, run) => sum + run.passed, 0);
    const failed = runs.reduce((sum, run) => sum + run.failed, 0);
    const blocked = runs.reduce((sum, run) => sum + run.blocked, 0);
    const total = runs.reduce((sum, run) => sum + run.total, 0);
    return {
      runs: runs.length,
      passed,
      failed,
      blocked,
      executed: passed + failed,
      notRun: Math.max(0, total - passed - failed - blocked),
      total,
      projects: new Set(runs.map((run) => run.key)).size,
    };
  }
  memberWorkloadExecution(name: string) {
    const days = Object.values(this.workloadSeries()[name] ?? {});
    const passed = days.reduce((sum, day) => sum + day.passed, 0);
    const failed = days.reduce((sum, day) => sum + day.failed, 0);
    const blocked = days.reduce((sum, day) => sum + day.blocked, 0);
    return {
      runs: this.memberWindowRuns(name).length,
      passed,
      failed,
      blocked,
      executed: passed + failed,
      notRun: 0,
      total: passed + failed + blocked,
      projects: this.members.find((m) => m.name === name)?.qaseProjects.length ?? 0,
    };
  }
  memberChartValue(name: string) {
    const activity = this.memberWorkloadExecution(name);
    if (this.workloadMetric() === 'Remaining') return activity.notRun + activity.blocked;
    if (this.workloadMetric() === 'Blocked') return activity.blocked;
    return activity.executed;
  }
  sortedExecutionHistory(project: Project) {
    return [...project.dailyExecutions].sort((a, b) => b.date.localeCompare(a.date));
  }
  executionHistoryPageCount(project: Project) {
    return this.tablePageCount(this.sortedExecutionHistory(project).length);
  }
  pagedExecutionHistory(project: Project) {
    return this.tablePage(this.sortedExecutionHistory(project), this.executionHistoryPage());
  }
  projectRunHistoryPageCount(project: Project) {
    return this.tablePageCount(project.testRuns.length);
  }
  pagedProjectRunHistory(project: Project) {
    return this.tablePage(project.testRuns, this.projectRunHistoryPage());
  }
  private tablePageCount(total: number) {
    return Math.max(1, Math.ceil(total / this.tablePageSize));
  }
  private tablePage<T>(rows: T[], requestedPage: number) {
    const page = Math.min(requestedPage, this.tablePageCount(rows.length));
    return rows.slice((page - 1) * this.tablePageSize, page * this.tablePageSize);
  }
  executionHistoryTesterColor(project: Project, tester: string) {
    const names = [...new Set(project.dailyExecutions.map((day) => day.tester))].sort();
    const index = names.indexOf(tester);
    return this.seriesColors[Math.max(0, index) % this.seriesColors.length];
  }
  projectChartDates(project: Project) {
    return [...new Set(project.dailyExecutions.map((day) => day.date))];
  }
  projectChartValue(project: Project, member: string, dayIndex: number) {
    const date = this.projectChartDates(project)[dayIndex];
    return project.dailyExecutions
      .filter((day) => day.date === date && day.tester === member)
      .reduce((sum, day) => sum + day.executed, 0);
  }
  projectChartMax(project: Project) {
    return Math.max(
      1,
      ...this.projectAssignees(project).flatMap((member) =>
        this.projectChartDates(project).map((_, dayIndex) =>
          this.projectChartValue(project, member, dayIndex),
        ),
      ),
    );
  }
  /**
   * Every QA's recorded activity on one chart day, for the day-breakdown popup:
   * only QAs with activity that day, most executed first, each with their share
   * of the day's executed total. Follows the same environment rule as the bars.
   */
  workloadDayBreakdown(dayIndex: number) {
    const label = this.workloadDates[dayIndex] ?? '';
    const members = this.workloadMembers();
    const series = this.workloadSeries();
    const visible = this.workloadEnvironment() === 'All environments';
    const rows = members
      .map((member, index) => {
        const day = visible ? series[member.name]?.[label] : undefined;
        return {
          name: member.name,
          initials: member.initials,
          color: this.seriesColors[index % this.seriesColors.length],
          executed: day?.executed ?? 0,
          passed: day?.passed ?? 0,
          failed: day?.failed ?? 0,
          blocked: day?.blocked ?? 0,
        };
      })
      .filter((row) => row.executed + row.passed + row.failed + row.blocked > 0)
      .sort((a, b) => b.executed - a.executed || a.name.localeCompare(b.name));
    const sum = (key: 'executed' | 'passed' | 'failed' | 'blocked') =>
      rows.reduce((total, row) => total + row[key], 0);
    const totals = {
      executed: sum('executed'),
      passed: sum('passed'),
      failed: sum('failed'),
      blocked: sum('blocked'),
    };
    return {
      date: label,
      totals,
      quiet: members.length - rows.length,
      rows: rows.map((row) => ({
        ...row,
        share: this.percent(row.executed, totals.executed),
        // Result mix as % of this QA's own recorded results (passed + failed + blocked).
        mixPassed: this.percent(row.passed, row.passed + row.failed + row.blocked),
        mixFailed: this.percent(row.failed, row.passed + row.failed + row.blocked),
        mixBlocked: this.percent(row.blocked, row.passed + row.failed + row.blocked),
      })),
    };
  }
  workloadTrendValue(name: string, dayIndex: number) {
    if (this.workloadEnvironment() !== 'All environments') return 0;
    const day = this.workloadSeries()[name]?.[this.workloadDates[dayIndex]];
    if (!day) return 0;
    if (this.workloadTrendMetric() === 'Failed') return day.failed;
    if (this.workloadTrendMetric() === 'Blocked') return day.blocked;
    return day.executed;
  }
  workloadTrendMax() {
    return Math.max(
      1,
      ...this.workloadMembers().flatMap((member) =>
        this.workloadDates.map((_, dayIndex) => this.workloadTrendValue(member.name, dayIndex)),
      ),
    );
  }
  workloadTrendTotal() {
    return this.workloadMembers().reduce(
      (sum, member) =>
        sum +
        this.workloadDates.reduce(
          (dayTotal, _, dayIndex) => dayTotal + this.workloadTrendValue(member.name, dayIndex),
          0,
        ),
      0,
    );
  }
  averageWorkload() {
    return this.workloadDates.length
      ? Math.round((this.workloadTrendTotal() / this.workloadDates.length) * 10) / 10
      : 0;
  }
  workloadPressure(name: string) {
    return { label: 'Unavailable', level: 'watch', note: 'Daily target unavailable' };
  }
  // Planned hours/capacity aren't wired to a real data source yet (always 0),
  // so this reads the QA's actual recorded Qase execution instead.
  memberDailyExecuted(name: string, dayIndex: number) {
    return this.workloadSeries()[name]?.[this.workloadDates[dayIndex]]?.executed ?? 0;
  }
  memberExecutedTotal(name: string) {
    return this.workloadDates.reduce((sum, _, i) => sum + this.memberDailyExecuted(name, i), 0);
  }
  memberActiveDays(name: string) {
    return this.workloadDates.filter((_, i) => this.memberDailyExecuted(name, i) > 0).length;
  }
  memberExecutionShare(name: string) {
    const grandTotal = this.workloadMembers().reduce(
      (sum, m) => sum + this.memberExecutedTotal(m.name),
      0,
    );
    return this.percent(this.memberExecutedTotal(name), grandTotal);
  }
  executionSharePressure(name: string) {
    const memberCount = this.workloadMembers().length;
    const evenShare = memberCount ? 100 / memberCount : 0;
    const share = this.memberExecutionShare(name);
    if (share >= evenShare * 1.5) return { level: 'high', label: 'High share' };
    if (share <= evenShare * 0.5) return { level: 'watch', label: 'Low share' };
    return { level: 'steady', label: 'Balanced' };
  }
  executionShareSummary() {
    const members = this.workloadMembers();
    const activeDays = members.map((m) => this.memberActiveDays(m.name));
    const average = activeDays.length
      ? Math.round((activeDays.reduce((sum, v) => sum + v, 0) / activeDays.length) * 10) / 10
      : 0;
    const fullyActive = activeDays.filter((d) => d === this.workloadDates.length).length;
    return { average, fullyActive };
  }
  executionSharePoints(name: string) {
    if (!this.workloadDates.length) return '';
    const max = Math.max(1, ...this.workloadDates.map((_, i) => this.memberDailyExecuted(name, i)));
    const stepX = this.workloadDates.length === 1 ? 0 : 100 / (this.workloadDates.length - 1);
    const points = this.workloadDates.map((_, i) => {
      const value = this.memberDailyExecuted(name, i);
      return `${Math.round(i * stepX)},${Math.round(32 - (value / max) * 32)}`;
    });
    return points.length === 1 ? `${points[0]} 100,${points[0].split(',')[1]}` : points.join(' ');
  }
  projectAssignees(project: Project, environment?: Environment) {
    return [
      ...new Set(
        project.testRuns
          .filter((run) => !environment || run.environment === environment)
          .flatMap((run) => run.testers),
      ),
    ];
  }
  initials(name: string) {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
  projectDefects(projectKey: string, environment = this.bugEnvironment()) {
    return this.defects
      .filter(
        (defect) =>
          defect.init === projectKey &&
          (environment === 'All environments' || defect.environment === environment),
      )
      .sort((a, b) => this.defectPriorityRank(a) - this.defectPriorityRank(b));
  }
  isOpenStatus(status: string) {
    return !['closed', 'resolved', 'done', 'cancelled', 'canceled', 'invalid', 'rejected'].some(
      (value) => status.toLowerCase().includes(value),
    );
  }
  // Open bugs surface first; within each status tier, highest priority
  // (severity bucket) surfaces first. Jira/Qase's existing updated order is
  // retained inside each tier because modern Array#sort is stable.
  private defectPriorityRank(bug: DashboardDefect) {
    const statusTier = this.isOpenStatus(bug.status) ? 0 : 1;
    const severityTier =
      bug.severity === 'Critical'
        ? 0
        : bug.severity === 'Major'
          ? 1
          : bug.severity === 'Minor'
            ? 2
            : 3;
    return statusTier * 10 + severityTier;
  }
  defectReporters(projectKey: string, environment = this.bugEnvironment()) {
    return [...new Set(this.projectDefects(projectKey, environment).map((bug) => bug.reporter))];
  }
  reporterDefects(projectKey: string, reporter: string, environment = this.bugEnvironment()) {
    return this.projectDefects(projectKey, environment).filter(
      (defect) => defect.reporter === reporter,
    );
  }
  reporterStatusCounts(projectKey: string, reporter: string, environment = this.bugEnvironment()) {
    const counts = new Map<string, number>();
    for (const bug of this.reporterDefects(projectKey, reporter, environment)) {
      counts.set(bug.status, (counts.get(bug.status) ?? 0) + 1);
    }
    return [...counts.entries()].map(([status, count]) => ({ status, count }));
  }
  timeRemaining(days: number) {
    return days < 0 ? `${-days}d overdue` : `${days}d left`;
  }
  testDistribution(project: Project) {
    const passed = this.percent(project.passed, project.total);
    const failed = passed + this.percent(project.failed, project.total);
    const blocked = failed + this.percent(project.blocked, project.total);
    return `conic-gradient(#087a5b 0 ${passed}%, #c9222d ${passed}% ${failed}%, #d98a00 ${failed}% ${blocked}%, #e5e8ee ${blocked}% 100%)`;
  }
  projectTrend(project: Project) {
    return this.workflowSeries()[project.key] ?? [];
  }
  trendPoints(trend: { exec: number; pass: number }[], key: 'exec' | 'pass') {
    if (!trend.length) return '';
    const stepX = trend.length === 1 ? 0 : 100 / (trend.length - 1);
    const points = trend.map(
      (d, i) => `${Math.round(i * stepX)},${Math.round(32 - (d[key] / 100) * 32)}`,
    );
    return points.length === 1 ? `${points[0]} 100,${points[0].split(',')[1]}` : points.join(' ');
  }
  isVisible(key: string) {
    return this.filtered().some((project) => project.key === key);
  }
  memberProjects(name: string) {
    return this.projects().filter((project) => project.qa === name);
  }
  memberBugs(name: string) {
    return this.memberProjects(name).reduce((total, project) => total + project.bugs, 0);
  }
  memberCritical(name: string) {
    return this.memberProjects(name).reduce((total, project) => total + project.critical, 0);
  }
  severityCount(severity: string) {
    return this.filteredDefects().filter((bug) => bug.severity === severity).length;
  }
  bugProjectCount(projectKey: string) {
    return this.filteredDefects().filter((bug) => bug.init === projectKey).length;
  }
  bugChartMax() {
    return Math.max(1, ...this.projects().map((project) => this.bugProjectCount(project.key)));
  }
  defectDistribution() {
    const total = this.filteredDefects().length || 1;
    const critical = this.percent(this.severityCount('Critical'), total);
    const major = critical + this.percent(this.severityCount('Major'), total);
    return `conic-gradient(#c9222d 0 ${critical}%, #d98a00 ${critical}% ${major}%, #2563a8 ${major}% 100%)`;
  }
  clearBugFilters() {
    this.bugQuery.set('');
    this.bugProject.set('All projects');
    this.bugReporter.set('All reporters');
    this.bugSeverity.set('All severities');
    this.bugStatus.set('All statuses');
    this.bugPageEnvironment.set('All environments');
    this.bugPage.set(1);
  }
  timelineForecast(project: Project) {
    if (!project.total || !project.requiredVelocity) return 0;
    const pace = Math.min(project.velocity / project.requiredVelocity, 1.2) * 65;
    const executionHealth = (1 - project.blocked / project.total) * 25;
    const statusAdjustment =
      project.status === 'On track' ? 10 : project.status === 'At risk' ? 0 : -10;
    return Math.round(Math.max(5, Math.min(95, pace + executionHealth + statusAdjustment)));
  }
  memberForecast(name: string) {
    const projects = this.memberProjects(name);
    return projects.length
      ? Math.round(
          projects.reduce((total, project) => total + this.timelineForecast(project), 0) /
            projects.length,
        )
      : 0;
  }
  memberNeedsAttention(name: string) {
    return this.memberProjects(name).some(
      (project) =>
        project.stagingDaysLeft <= 7 || project.betaDaysLeft <= 7 || project.critical > 0,
    );
  }
  openMember(member: (typeof this.members)[number]) {
    this.selectedMember.set(member);
    this.memberRunPage.set(1);
  }
  openProject(p: Project) {
    this.selected.set(p);
    this.detailTab.set('Testing');
    this.bugEnvironment.set('All environments');
    this.executionHistoryPage.set(1);
    this.projectRunHistoryPage.set(1);
  }
}
