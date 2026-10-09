import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type SourceStatus = { status: 'fresh' | 'stale' | 'never_synced'; syncedAt: string | null };
export type ApiResponse<T> = {
  asOf: string | null;
  sources: Record<'jira' | 'qase', SourceStatus>;
  data: T;
};
export type ApiProjectRun = {
  runId: number;
  title: string;
  environment: string;
  platform: string;
  scope: string;
  testers: string[];
  passed: number;
  failed: number;
  blocked: number;
  skipped?: number;
  retest?: number;
  invalid?: number;
  inProgress?: number;
  cancelled?: number;
  total: number;
  startedAt: string | null;
  finishedAt: string | null;
  elapsedSeconds: number;
};
export type ApiProject = {
  id: string;
  jiraInitId?: string;
  jiraInitKey: string;
  name: string;
  status: string;
  health: string;
  qaOwner: string;
  qaseProjectCode: string;
  stagingStartAt: string;
  stagingEndAt: string;
  betaStartAt: string;
  betaEndAt: string;
  projectSize?: string | null;
  timelinePlanDays?: number | null;
  stagingMtttMinutes?: number | null;
  betaMtttMinutes?: number | null;
  runs?: ApiProjectRun[];
  countsAvailable: boolean;
  counts: {
    passed: number;
    failed: number;
    blocked: number;
    skipped?: number;
    retest?: number;
    invalid?: number;
    inProgress?: number;
    cancelled?: number;
    total: number;
  };
  stagingCounts?: {
    passed: number;
    failed: number;
    blocked: number;
    skipped?: number;
    retest?: number;
    invalid?: number;
    inProgress?: number;
    cancelled?: number;
    total: number;
  };
  betaCounts?: {
    passed: number;
    failed: number;
    blocked: number;
    skipped?: number;
    retest?: number;
    invalid?: number;
    inProgress?: number;
    cancelled?: number;
    total: number;
  };
  bugSummary?: {
    staging: number;
    beta: number;
    betaOverThirtyPercentOfStaging: boolean;
    total: number;
    canceled: number;
  };
  testerProgress: { name: string; passed: number; failed: number; total: number }[];
  assigneeProgress?: {
    environment: string;
    name: string;
    activeRuns: number;
    total: number;
    executed: number;
    passed: number;
    failed: number;
    blocked: number;
    notRun: number;
    progress: number;
  }[];
  dailyExecutions?: {
    date: string;
    tester: string;
    environment: string;
    executed: number;
    passed: number;
    failed: number;
    blocked: number;
    skipped: number;
    retest: number;
    inProgress: number;
    invalid: number;
    cancelled: number;
  }[];
};
export type CreateProjectInput = Pick<
  ApiProject,
  | 'jiraInitKey'
  | 'name'
  | 'qaseProjectCode'
  | 'qaOwner'
  | 'projectSize'
  | 'stagingMtttMinutes'
  | 'betaMtttMinutes'
  | 'stagingStartAt'
  | 'stagingEndAt'
  | 'betaStartAt'
  | 'betaEndAt'
>;
export type WorkflowDay = {
  date: string;
  projectId: string;
  passed: number;
  failed: number;
  blocked: number;
  total: number;
};
export type WorkflowData = { days: WorkflowDay[] };
export type WorkloadMember = {
  id: string;
  name: string;
  plannedHours: number;
  capacityHours: number;
  qaseExecutions: number;
  activeProjects?: number;
  totalProjects?: number;
  nextProject?: { id: string; key: string; name: string; stagingStartAt: string } | null;
  qaseMapped?: boolean;
  qaseName?: string;
  qaseProjects?: { id: string; key: string; name: string }[];
  projects?: {
    id: string;
    key: string;
    name: string;
    status?: string;
    stagingStartAt?: string;
  }[];
  dailyExecutions: {
    date: string;
    executed: number;
    passed: number;
    failed: number;
    blocked: number;
  }[];
};
export type WorkloadData = { period: { from: string; to: string }; members: WorkloadMember[] };
export type ApiBug = {
  id: string;
  key: string;
  projectId: string;
  summary: string;
  severity: string;
  priority?: string;
  status: string;
  creator: string;
  reporter: string;
  assignee: string;
  updatedAt: string | null;
  environment: string;
  createdAt: string | null;
};
export type PaginatedBugs = {
  items: ApiBug[];
  page: number;
  pageSize: number;
  total: number;
};
export type BugFilters = {
  projectId?: string;
  environment?: string;
  reporter?: string;
  status?: string;
  priority?: string;
  q?: string;
  page?: number;
  pageSize?: number;
};
export type QaTimelineHoliday = { date: string; name: string };
export type QaTimelineRow = {
  projectId: string;
  jiraInitKey: string;
  name: string;
  projectSize: string | null;
  timelinePlanDays: number | null;
  qaStartAt: string | null;
  qaEndAt: string | null;
  calendarDays: number;
  weekendDays: number;
  holidayDays: number;
  workingDays: number;
  holidays: QaTimelineHoliday[];
  totalScenarios: number;
};
export type ProjectPlanningUpdate = {
  projectSize?: string | null;
  timelinePlanDays?: number | null;
};
export type QaDocument = {
  id: string;
  projectId: string;
  projectName?: string;
  documentType: string;
  title: string;
  directUrl: string;
  ownerId: string;
  ownerName?: string;
  status: string;
  updatedAt?: string;
};
export type QaDocumentInput = Pick<
  QaDocument,
  'projectId' | 'documentType' | 'title' | 'directUrl' | 'ownerId' | 'status'
>;
export type PaginatedDocuments = {
  items: QaDocument[];
  page: number;
  pageSize: number;
  total: number;
};
export type KnowledgeStatus = 'HEALTHY' | 'OUTDATED_SYNC' | 'NEEDS_REINDEX';
export type KnowledgeOverview = {
  ram: { usedGb: number; totalGb: number; pct: number };
  lastFullSync: string | null;
  embedding: { model: string; dimension: number };
  collectionsActive: number;
  autoSyncEvery: string;
};
export type KnowledgeCollection = {
  name: string;
  docCount: number;
  target: number | null;
  coveragePct: number | null;
  status: KnowledgeStatus;
  lastSyncedAt: string | null;
  outdatedDocs: number;
  sizeBytes: number;
};
export type KnowledgeDocument = {
  id: string;
  title: string;
  key: string;
  sourceUrl: string;
  collection: string;
  chunks: number;
  dims: number;
  lastSyncedAt: string | null;
  syncStatus: 'SYNCED' | 'QUEUED' | 'FAILED' | 'SYNCING';
};
export type PaginatedKnowledgeDocuments = {
  items: KnowledgeDocument[];
  total: number;
  page: number;
  pageSize: number;
};
export type KnowledgeProject = { code: string; name: string; docs: number };
export type KnowledgeProjectCollection = {
  name: string;
  label: string;
  docCount: number;
  projectCount: number;
  projects: KnowledgeProject[];
};
export type KnowledgeProjects = {
  totals: { collections: number; docs: number; projects: number; emptyCollections: number };
  collections: KnowledgeProjectCollection[];
};
export type SyncStep = {
  id: string;
  source: string;
  status: string;
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  errorCode?: string;
  startedAt: string | null;
  finishedAt: string | null;
};
export type SyncEvent = {
  id: string;
  occurredAt: string;
  level: string;
  code: string;
  message: string;
};
export type SyncJob = {
  id: string;
  trigger: string;
  status: string;
  projectId?: string;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  steps: SyncStep[];
  events?: SyncEvent[];
};
export interface QaMember {
  id: string;
  name: string;
  jiraEmail: string;
  qaseDisplayName: string;
  weeklyCapacityHours: number;
  active: boolean;
}
export interface QaMemberInput {
  name: string;
  jiraEmail: string;
  qaseDisplayName: string;
  weeklyCapacityHours: number;
}
export type QaMemberSaveResult = QaMember & {
  warnings?: { qaseDisplayName?: string; jiraEmail?: string };
};
export type QaAlertEmailStatus = { configured: boolean };
export type QaAlertEmailResult = { status: 'sent'; recipients: string[] };

@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1';

  projects(q = ''): Observable<ApiResponse<ApiProject[]>> {
    return this.http.get<ApiResponse<ApiProject[]>>(`${this.base}/projects`, {
      params: q ? { q } : {},
    });
  }
  project(id: string, from?: string, to?: string): Observable<ApiResponse<ApiProject>> {
    return this.http.get<ApiResponse<ApiProject>>(
      `${this.base}/projects/${encodeURIComponent(id)}`,
      { params: this.dates(from, to) },
    );
  }
  workflow(from?: string, to?: string): Observable<ApiResponse<WorkflowData>> {
    return this.http.get<ApiResponse<WorkflowData>>(`${this.base}/workflow`, {
      params: this.dates(from, to),
    });
  }
  workload(from?: string, to?: string): Observable<ApiResponse<WorkloadData>> {
    return this.http.get<ApiResponse<WorkloadData>>(`${this.base}/workload`, {
      params: this.dates(from, to),
    });
  }
  bugs(filters: BugFilters = {}): Observable<ApiResponse<PaginatedBugs>> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params = params.set(key, value);
    });
    return this.http.get<ApiResponse<PaginatedBugs>>(`${this.base}/bugs`, { params });
  }
  productionBugs(page = 1, pageSize = 10): Observable<ApiResponse<PaginatedBugs>> {
    return this.http.get<ApiResponse<PaginatedBugs>>(`${this.base}/production-bugs`, {
      params: { page, pageSize },
    });
  }
  jobs(limit?: number): Observable<ApiResponse<SyncJob[]>> {
    return this.http.get<ApiResponse<SyncJob[]>>(`${this.base}/sync-jobs`, {
      params: limit ? { limit } : {},
    });
  }
  job(id: string): Observable<ApiResponse<SyncJob>> {
    return this.http.get<ApiResponse<SyncJob>>(`${this.base}/sync-jobs/${encodeURIComponent(id)}`);
  }
  sync(
    managerKey: string,
    sources: ('jira' | 'qase' | 'qase-detail' | 'production-bugs' | 'qa-portfolio')[],
    projectId?: string,
  ): Observable<SyncJob> {
    return this.http.post<SyncJob>(
      `${this.base}/sync-jobs`,
      { scope: { projectId: projectId ?? null }, sources },
      {
        headers: new HttpHeaders({
          'X-Manager-Key': managerKey,
          'Idempotency-Key': crypto.randomUUID(),
        }),
      },
    );
  }
  addProject(input: CreateProjectInput, managerKey: string): Observable<ApiProject> {
    return this.http.post<ApiProject>(`${this.base}/projects`, input, {
      headers: new HttpHeaders({ 'X-Manager-Key': managerKey }),
    });
  }
  updateProject(
    id: string,
    changes: ProjectPlanningUpdate,
    managerKey: string,
  ): Observable<ApiProject> {
    return this.http.patch<ApiProject>(
      `${this.base}/projects/${encodeURIComponent(id)}`,
      changes,
      { headers: this.managerHeaders(managerKey) },
    );
  }
  qaTimeline(): Observable<ApiResponse<QaTimelineRow[]>> {
    return this.http.get<ApiResponse<QaTimelineRow[]>>(`${this.base}/qa-timeline`);
  }
  qaAlertEmailStatus(): Observable<QaAlertEmailStatus> {
    return this.http.get<QaAlertEmailStatus>(`${this.base}/qa-alert-email/status`);
  }
  sendProjectQaAlertEmail(
    projectId: string,
    recipients: string[],
    body: string,
    managerKey: string,
  ): Observable<QaAlertEmailResult> {
    return this.http.post<QaAlertEmailResult>(
      `${this.base}/projects/${encodeURIComponent(projectId)}/qa-alert-email`,
      { recipients, body },
      {
        headers: new HttpHeaders({
          'X-Manager-Key': managerKey,
          'Idempotency-Key': crypto.randomUUID(),
        }),
      },
    );
  }
  qaMembers(includeInactive = false): Observable<ApiResponse<QaMember[]>> {
    return this.http.get<ApiResponse<QaMember[]>>(`${this.base}/qa-members`, {
      params: includeInactive ? { includeInactive: 'true' } : {},
    });
  }
  createQaMember(input: QaMemberInput, managerKey: string): Observable<QaMemberSaveResult> {
    return this.http.post<QaMemberSaveResult>(`${this.base}/qa-members`, input, {
      headers: new HttpHeaders({ 'X-Manager-Key': managerKey }),
    });
  }
  updateQaMember(
    id: string,
    changes: Partial<QaMemberInput & { active: boolean }>,
    managerKey: string,
  ): Observable<QaMemberSaveResult> {
    return this.http.patch<QaMemberSaveResult>(
      `${this.base}/qa-members/${encodeURIComponent(id)}`,
      changes,
      {
        headers: new HttpHeaders({ 'X-Manager-Key': managerKey }),
      },
    );
  }
  documents(
    filters: Record<string, string | number> = {},
  ): Observable<ApiResponse<PaginatedDocuments>> {
    return this.http.get<ApiResponse<PaginatedDocuments>>(`${this.base}/documents`, {
      params: filters,
    });
  }
  createDocument(input: QaDocumentInput, managerKey: string): Observable<QaDocument> {
    return this.http.post<QaDocument>(`${this.base}/documents`, input, {
      headers: this.managerHeaders(managerKey),
    });
  }
  updateDocument(
    id: string,
    input: Partial<QaDocumentInput>,
    managerKey: string,
  ): Observable<QaDocument> {
    return this.http.patch<QaDocument>(`${this.base}/documents/${encodeURIComponent(id)}`, input, {
      headers: this.managerHeaders(managerKey),
    });
  }
  deleteDocument(id: string, managerKey: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/documents/${encodeURIComponent(id)}`, {
      headers: this.managerHeaders(managerKey),
    });
  }
  // Knowledge endpoints return plain JSON (no ApiResponse envelope).
  knowledgeOverview(): Observable<KnowledgeOverview> {
    return this.http.get<KnowledgeOverview>(`${this.base}/knowledge/overview`);
  }
  knowledgeProjects(): Observable<KnowledgeProjects> {
    return this.http.get<KnowledgeProjects>(`${this.base}/knowledge/projects`);
  }
  knowledgeCollections(): Observable<KnowledgeCollection[]> {
    return this.http.get<KnowledgeCollection[]>(`${this.base}/knowledge/collections`);
  }
  knowledgeDocuments(
    filters: { collection?: string; q?: string; page?: number; pageSize?: number } = {},
  ): Observable<PaginatedKnowledgeDocuments> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params = params.set(key, value);
    });
    return this.http.get<PaginatedKnowledgeDocuments>(`${this.base}/knowledge/documents`, {
      params,
    });
  }
  knowledgeAction(
    name: string,
    action: 'sync' | 'reindex',
    managerKey: string,
  ): Observable<unknown> {
    return this.http.post(
      `${this.base}/knowledge/collections/${encodeURIComponent(name)}/${action}`,
      {},
      { headers: this.managerHeaders(managerKey) },
    );
  }
  sendRiskEmail(
    projectId: string,
    input: { to: string; cc: string[]; subject: string; body: string },
    managerKey: string,
  ): Observable<unknown> {
    return this.http.post(`${this.base}/projects/${encodeURIComponent(projectId)}/risk-email`, input, {
      headers: this.managerHeaders(managerKey),
    });
  }
  private managerHeaders(managerKey: string) {
    return new HttpHeaders({ 'X-Manager-Key': managerKey });
  }
  private dates(from?: string, to?: string): HttpParams {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return params;
  }
}
