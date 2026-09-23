import { Injectable, computed, signal } from '@angular/core';
import type { Environment, Project, ProjectHealth, TestRun } from './dashboard.models';
import type { ApiBug, ApiProject, WorkflowDay, WorkloadData } from './dashboard-api.service';

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
  color: string;
};
type DashboardDefect = {
  key: string;
  init: string;
  title: string;
  domain: string;
  severity: string;
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
  readonly nav = ['Projects', 'Workflow', 'Workload', 'Bugs', 'QA Members'];
  readonly iconIds = ['projects', 'testing', 'workload', 'bugs', 'qa-members'];
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
  readonly bugEnvironment = signal<Environment>('STAGING');
  readonly bugQuery = signal('');
  readonly bugProject = signal('All projects');
  readonly bugReporter = signal('All reporters');
  readonly bugSeverity = signal('All severities');
  readonly bugStatus = signal('All statuses');
  readonly bugPageEnvironment = signal<'All environments' | Environment>('All environments');
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
        (this.owner() === 'All QA members' || run.owner === this.owner()),
    );
  });
  readonly workloadMembers = computed(() =>
    this.owner() === 'All QA members'
      ? this.members
      : this.members.filter((member) => member.name === this.owner()),
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
  readonly bugReporters = computed(() => [...new Set(this.defects.map((bug) => bug.reporter))]);
  readonly bugStatuses = computed(() => [...new Set(this.defects.map((bug) => bug.status))]);
  readonly bugSummary = computed(() => ({
    open: this.filteredDefects().filter((bug) => bug.status !== 'Ready').length,
    critical: this.filteredDefects().filter((bug) => bug.severity === 'Critical').length,
    reopened: this.filteredDefects().filter((bug) => ['Reopened', 'Blocked'].includes(bug.status))
      .length,
    projects: new Set(this.filteredDefects().map((bug) => bug.init)).size,
  }));
  readonly workloadChartMax = computed(() =>
    Math.max(1, ...this.workloadMembers().map((member) => this.memberChartValue(member.name))),
  );
  private hasLoadedLiveData = false;
  useLiveData(snapshot: LiveSnapshot) {
    if (!this.hasLoadedLiveData) {
      this.hasLoadedLiveData = true;
      this.resetViewState();
    }
    const memberNames = new Map(
      (snapshot.workload?.members ?? []).map((member) => [member.id, member.name]),
    );
    const bugsByProject = new Map<string, ApiBug[]>();
    for (const bug of snapshot.bugs) {
      bugsByProject.set(bug.projectId, [...(bugsByProject.get(bug.projectId) ?? []), bug]);
    }
    const projectKeys = new Map(
      snapshot.projects.map((project) => [project.id, project.jiraInitKey]),
    );
    const projects = snapshot.projects.map((project) =>
      this.mapProject(project, bugsByProject.get(project.id) ?? [], memberNames),
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

    const members = snapshot.workload?.members ?? [];
    const workloadSeries: Record<
      string,
      Record<string, { executed: number; passed: number; failed: number; blocked: number }>
    > = {};
    this.memberData.set(
      members.map((member, index) => {
        workloadSeries[member.name] = Object.fromEntries(
          member.dailyExecutions.map((day) => [this.dateLabel(day.date), day]),
        );
        const owned = projects.filter((project) => project.qa === member.name);
        return {
          name: member.name,
          initials: this.initials(member.name),
          role: 'QA Engineer',
          hours: member.plannedHours,
          capacity: member.capacityHours,
          scenarios: 0,
          execution: member.qaseExecutions,
          docs: 0,
          project: owned[0] ? `${owned[0].key} · ${owned[0].name}` : '—',
          dailyTarget: 0,
          cumulative: 0,
          dailyRuns: member.dailyExecutions.length,
          blocker: '',
          jiraProjects: { active: owned.length, total: owned.length },
          qaseExecution: { yearToDate: 0, activeProjects: member.qaseExecutions },
          color: ['green-avatar', 'blue', 'orange'][index % 3],
        };
      }),
    );
    this.workloadSeries.set(workloadSeries);
    this.workloadDateData.set([
      ...new Set(
        members
          .flatMap((member) => member.dailyExecutions.map((day) => day.date))
          .sort()
          .map((date) => this.dateLabel(date)),
      ),
    ]);

    this.defectData.set(
      snapshot.bugs.map((bug) => ({
        key: bug.key,
        init: projectKeys.get(bug.projectId) ?? '—',
        title: bug.summary,
        domain: '—',
        severity: this.severity(bug.severity),
        cause: '—',
        age: '—',
        status: bug.status,
        environment: '—',
        reporter: bug.reporter || bug.creator || '—',
        owner: bug.assignee || '—',
      })),
    );
  }
  private mapProject(
    project: ApiProject,
    bugs: ApiBug[],
    memberNames: Map<string, string>,
  ): Project {
    const testRuns = (project.runs ?? []).flatMap((run) => {
      const environment = run.environment.toUpperCase();
      if (environment !== 'STAGING' && environment !== 'BETA') return [];
      return [
        {
          id: `RUN-${run.runId}`,
          date: (run.finishedAt ?? run.startedAt ?? '').slice(0, 10),
          environment: environment as Environment,
          scope: run.scope || run.platform || run.title || '—',
          owner: (memberNames.get(run.ownerId) ?? project.qaOwner) || '—',
          passed: run.passed,
          failed: run.failed,
          blocked: run.blocked,
          total: run.total,
          elapsed: run.elapsedSeconds ? `${Math.round(run.elapsedSeconds / 60)}m` : '—',
        },
      ];
    });
    const stats = (environment: Environment) =>
      testRuns
        .filter((run) => run.environment === environment)
        .reduce(
          (sum, run) => ({
            executed: sum.executed + run.passed + run.failed,
            total: sum.total + run.total,
          }),
          { executed: 0, total: 0 },
        );
    const staging = stats('STAGING');
    const beta = stats('BETA');
    const critical = bugs.filter((bug) => this.severity(bug.severity) === 'Critical').length;
    return {
      key: project.jiraInitKey,
      name: project.name,
      qa: project.qaOwner || '—',
      stagingStart: this.dateOnly(project.stagingStartAt),
      stagingEnd: this.dateOnly(project.stagingEndAt),
      betaStart: this.dateOnly(project.betaStartAt),
      betaEnd: this.dateOnly(project.betaEndAt),
      status: this.status(project.health),
      passed: project.counts?.passed ?? 0,
      failed: project.counts?.failed ?? 0,
      blocked: project.counts?.blocked ?? 0,
      total: project.countsAvailable ? project.counts.total : 0,
      fresh: 0,
      indexed: 0,
      bugs: bugs.length,
      critical,
      code: project.qaseProjectCode,
      domain: '—',
      sprint: '—',
      size: '—',
      version: `Qase run #${project.qaseTestRunId}`,
      staging: this.percent(staging.executed, staging.total),
      beta: this.percent(beta.executed, beta.total),
      velocity: 0,
      requiredVelocity: 0,
      stagingEta: '',
      stagingDaysLeft: this.daysUntil(project.stagingEndAt),
      betaEta: '',
      betaDaysLeft: this.daysUntil(project.betaEndAt),
      stagingBugs: 0,
      betaBugs: 0,
      canceledBugs: bugs.filter((bug) => bug.status.toLowerCase().includes('cancel')).length,
      escapedBugs: 0,
      docsReady: 0,
      testCaseAuthors: [],
      testRuns,
    };
  }
  private dateOnly(value: string) {
    return value ? value.slice(0, 10) : '';
  }
  private dateLabel(value: string) {
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
  private severity(value: string) {
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
    if (value.includes('track') || value === 'healthy') return 'On track';
    return 'Draft';
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
      'Knowledge RAG': 'Indexed QA knowledge, freshness, and source coverage.',
      Documentation: 'Release-document readiness by project and document type.',
      Notifications: 'Prepared follow-ups and simulated delivery history.',
    };
    return descriptions[this.page()];
  }
  percent(part: number, total: number) {
    return total ? Math.round((part / total) * 100) : 0;
  }
  formatNumber(value: number) {
    return value.toLocaleString('en-US');
  }
  projectRuns(project: Project, environment: TestRun['environment']) {
    return project.testRuns.filter((run) => run.environment === environment);
  }
  projectHealth(project: Project): ProjectHealth {
    if (project.status === 'Draft') return 'No Target Set';
    if (project.status === 'Off track') return 'Behind';
    return project.status === 'At risk' ? 'At Risk' : 'On Track';
  }
  environmentHealth(project: Project, environment: Environment): ProjectHealth {
    const progress = environment === 'STAGING' ? project.staging : project.beta;
    const target = environment === 'STAGING' ? project.stagingEnd : project.betaEnd;
    if (!target) return 'No Target Set';
    if (!progress) return 'Stalled';
    return this.projectHealth(project);
  }
  projectStatusCount(status: ProjectHealth) {
    return this.filtered().filter((project) => this.projectHealth(project) === status).length;
  }
  environmentStats(project: Project, environment: Environment) {
    const runs = this.projectRuns(project, environment);
    const passed = runs.reduce((total, run) => total + run.passed, 0);
    const failed = runs.reduce((total, run) => total + run.failed, 0);
    const blocked = runs.reduce((total, run) => total + run.blocked, 0);
    return {
      passed,
      failed,
      blocked,
      notRun: Math.max(0, project.total - passed - failed - blocked),
    };
  }
  environmentMttt(project: Project, environment: Environment) {
    return this.projectRuns(project, environment)[0]?.elapsed ?? '—';
  }
  memberRuns(name: string, project?: Project) {
    const runs = project
      ? project.testRuns.map((run) => ({ ...run, key: project.key, projectName: project.name }))
      : this.testRuns();
    return runs.filter((run) => run.owner === name);
  }
  memberActiveProjects(name: string) {
    return [
      ...new Map(
        this.workloadRuns()
          .filter((run) => run.owner === name)
          .map((run) => [run.key, run.projectName]),
      ).entries(),
    ];
  }
  memberExecution(name: string, project?: Project) {
    const runs = this.memberRuns(name, project);
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
      runs: days.length,
      passed,
      failed,
      blocked,
      executed: passed + failed,
      notRun: 0,
      total: passed + failed + blocked,
      projects: new Set(
        this.workloadRuns()
          .filter((run) => run.owner === name)
          .map((run) => run.key),
      ).size,
    };
  }
  memberChartValue(name: string) {
    const activity = this.memberWorkloadExecution(name);
    if (this.workloadMetric() === 'Remaining') return activity.notRun + activity.blocked;
    if (this.workloadMetric() === 'Blocked') return activity.blocked;
    return activity.executed;
  }
  projectChartValue(project: Project, member: string, dayIndex: number) {
    return 0;
  }
  projectChartMax(project: Project) {
    return Math.max(
      1,
      ...this.projectAssignees(project).flatMap((member) =>
        this.chartDates.map((_, dayIndex) => this.projectChartValue(project, member, dayIndex)),
      ),
    );
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
  readonly capacityFactors = [0.62, 0.74, 0.8, 0.88, 0.7, 0.95, 0.85, 1.05, 0.92, 1];
  memberCapacity(name: string) {
    const member = this.members.find((item) => item.name === name);
    if (!member) return { allocated: 0, capacity: 0, utilization: 0, status: 'Unknown' as const };
    const utilization = this.percent(member.hours, member.capacity);
    const status =
      member.capacity === 0
        ? member.hours > 0
          ? ('Capacity Unavailable' as const)
          : ('Unknown' as const)
        : utilization > 100
          ? ('Overloaded' as const)
          : ('Within Capacity' as const);
    return { allocated: member.hours, capacity: member.capacity, utilization, status };
  }
  capacityTrendValue(name: string, dayIndex: number) {
    return 0;
  }
  teamUtilizationSummary() {
    const members = this.workloadMembers();
    const utilizations = members.map((m) => this.memberCapacity(m.name).utilization);
    const average = utilizations.length
      ? Math.round(utilizations.reduce((sum, v) => sum + v, 0) / utilizations.length)
      : 0;
    const overloaded = members.filter(
      (m) => this.memberCapacity(m.name).status === 'Overloaded',
    ).length;
    return { average, overloaded };
  }
  capacityTrendPoints(name: string) {
    const max = 150;
    if (!this.workloadDates.length) return '';
    const stepX = this.workloadDates.length === 1 ? 0 : 100 / (this.workloadDates.length - 1);
    const points = this.workloadDates.map((_, i) => {
      const value = Math.min(max, this.capacityTrendValue(name, i));
      return `${Math.round(i * stepX)},${Math.round(32 - (value / max) * 32)}`;
    });
    return points.length === 1 ? `${points[0]} 100,${points[0].split(',')[1]}` : points.join(' ');
  }
  projectAssignees(project: Project) {
    return [...new Set(project.testRuns.map((run) => run.owner))];
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
    return this.defects.filter(
      (defect) => defect.init === projectKey && defect.environment === environment,
    );
  }
  defectReporters(projectKey: string, environment = this.bugEnvironment()) {
    return [...new Set(this.projectDefects(projectKey, environment).map((bug) => bug.reporter))];
  }
  reporterDefects(projectKey: string, reporter: string, environment = this.bugEnvironment()) {
    return this.projectDefects(projectKey, environment).filter(
      (defect) => defect.reporter === reporter,
    );
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
  }
  openProject(p: Project) {
    this.selected.set(p);
    this.detailTab.set('Testing');
    this.bugEnvironment.set('STAGING');
  }
}
