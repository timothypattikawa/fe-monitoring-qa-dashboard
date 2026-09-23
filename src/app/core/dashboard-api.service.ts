import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type SourceStatus = { status: 'fresh' | 'stale' | 'never_synced'; syncedAt: string | null };
export type ApiResponse<T> = { asOf: string | null; sources: Record<'jira' | 'qase', SourceStatus>; data: T };
export type ApiProjectRun = {
  runId: number; title: string; environment: string; platform: string; scope: string; ownerId: string;
  passed: number; failed: number; blocked: number; total: number;
  startedAt: string | null; finishedAt: string | null; elapsedSeconds: number;
};
export type ApiProject = {
  id: string; jiraInitId?: string; jiraInitKey: string; name: string; status: string;
  health: string; qaOwner: string; qaseProjectCode: string; qaseTestRunId: number;
  stagingStartAt: string; stagingEndAt: string; betaStartAt: string; betaEndAt: string;
  runs?: ApiProjectRun[];
  countsAvailable: boolean;
  counts: { passed: number; failed: number; blocked: number; total: number };
};
export type CreateProjectInput = Pick<ApiProject,
  'jiraInitKey' | 'name' | 'qaseProjectCode' | 'qaseTestRunId' | 'qaOwner' |
  'stagingStartAt' | 'stagingEndAt' | 'betaStartAt' | 'betaEndAt'>;
export type WorkflowDay = { date: string; projectId: string; passed: number; failed: number; blocked: number; total: number };
export type WorkflowData = { days: WorkflowDay[] };
export type WorkloadMember = {
  id: string; name: string; plannedHours: number; capacityHours: number; qaseExecutions: number;
  dailyExecutions: { date: string; executed: number; passed: number; failed: number; blocked: number }[];
};
export type WorkloadData = { period: { from: string; to: string }; members: WorkloadMember[] };
export type ApiBug = {
  id: string; key: string; projectId: string; summary: string; severity: string;
  status: string; creator: string; reporter: string; assignee: string; updatedAt: string | null;
};
export type SyncStep = {
  id: string; source: string; status: string; fetched: number; inserted: number;
  updated: number; skipped: number; errorCode?: string; startedAt: string | null; finishedAt: string | null;
};
export type SyncEvent = { id: string; occurredAt: string; level: string; code: string; message: string };
export type SyncJob = {
  id: string; trigger: string; status: string; projectId?: string;
  requestedAt: string; startedAt: string | null; finishedAt: string | null;
  steps: SyncStep[]; events?: SyncEvent[];
};
export interface QaMember {
  id: string; name: string; jiraAccountId: string; qaseMemberId: string;
  weeklyCapacityHours: number; active: boolean;
}
export interface QaMemberInput {
  name: string; jiraAccountId: string; qaseMemberId: string; weeklyCapacityHours: number;
}

@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1';

  projects(q = ''): Observable<ApiResponse<ApiProject[]>> {
    return this.http.get<ApiResponse<ApiProject[]>>(`${this.base}/projects`, { params: q ? { q } : {} });
  }
  project(id: string): Observable<ApiResponse<ApiProject>> {
    return this.http.get<ApiResponse<ApiProject>>(`${this.base}/projects/${encodeURIComponent(id)}`);
  }
  workflow(from?: string, to?: string): Observable<ApiResponse<WorkflowData>> {
    return this.http.get<ApiResponse<WorkflowData>>(`${this.base}/workflow`, { params: this.dates(from, to) });
  }
  workload(from?: string, to?: string): Observable<ApiResponse<WorkloadData>> {
    return this.http.get<ApiResponse<WorkloadData>>(`${this.base}/workload`, { params: this.dates(from, to) });
  }
  bugs(q = ''): Observable<ApiResponse<ApiBug[]>> {
    return this.http.get<ApiResponse<ApiBug[]>>(`${this.base}/bugs`, { params: q ? { q } : {} });
  }
  jobs(): Observable<ApiResponse<SyncJob[]>> {
    return this.http.get<ApiResponse<SyncJob[]>>(`${this.base}/sync-jobs`);
  }
  job(id: string): Observable<ApiResponse<SyncJob>> {
    return this.http.get<ApiResponse<SyncJob>>(`${this.base}/sync-jobs/${encodeURIComponent(id)}`);
  }
  sync(managerKey: string, sources: ('jira' | 'qase')[], projectId?: string): Observable<SyncJob> {
    return this.http.post<SyncJob>(`${this.base}/sync-jobs`,
      { scope: { projectId: projectId ?? null }, sources },
      { headers: new HttpHeaders({ 'X-Manager-Key': managerKey, 'Idempotency-Key': crypto.randomUUID() }) });
  }
  addProject(input: CreateProjectInput, managerKey: string): Observable<ApiProject> {
    return this.http.post<ApiProject>(`${this.base}/projects`, input,
      { headers: new HttpHeaders({ 'X-Manager-Key': managerKey }) });
  }
  qaMembers(includeInactive = false): Observable<ApiResponse<QaMember[]>> {
    return this.http.get<ApiResponse<QaMember[]>>(`${this.base}/qa-members`,
      { params: includeInactive ? { includeInactive: 'true' } : {} });
  }
  createQaMember(input: QaMemberInput, managerKey: string): Observable<QaMember> {
    return this.http.post<QaMember>(`${this.base}/qa-members`, input,
      { headers: new HttpHeaders({ 'X-Manager-Key': managerKey }) });
  }
  updateQaMember(id: string, changes: Partial<QaMemberInput & { active: boolean }>, managerKey: string): Observable<QaMember> {
    return this.http.patch<QaMember>(`${this.base}/qa-members/${encodeURIComponent(id)}`, changes,
      { headers: new HttpHeaders({ 'X-Manager-Key': managerKey }) });
  }
  private dates(from?: string, to?: string): HttpParams {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return params;
  }
}
