import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardApiService } from './dashboard-api.service';

describe('DashboardApiService', () => {
  let service: DashboardApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
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

  it('requests all three sources unscoped for a full sync', () => {
    service.sync('secret-key', ['jira', 'qase', 'qase-detail']).subscribe();
    const req = http.expectOne('/api/v1/sync-jobs');
    expect(req.request.body.sources).toEqual(['jira', 'qase', 'qase-detail']);
    expect(req.request.body.scope).toEqual({ projectId: null });
    req.flush({ data: { jobId: 'job-1', status: 'QUEUED' } });
  });

  it('lists qa members', () => {
    service.qaMembers().subscribe();
    const req = http.expectOne('/api/v1/qa-members');
    expect(req.request.method).toBe('GET');
    req.flush({ asOf: null, sources: {}, data: [] });
  });

  it('requests a page of production bugs', () => {
    service.productionBugs(2, 10).subscribe();
    const req = http.expectOne('/api/v1/production-bugs?page=2&pageSize=10');
    expect(req.request.method).toBe('GET');
    req.flush({ asOf: null, sources: {}, data: { items: [], page: 2, pageSize: 10, total: 0 } });
  });

  it('creates a qa member', () => {
    service
      .createQaMember(
        { name: 'Nadia Putri', jiraEmail: '', qaseDisplayName: '', weeklyCapacityHours: 40 },
        'secret-key',
      )
      .subscribe();
    const req = http.expectOne('/api/v1/qa-members');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('X-Manager-Key')).toBe('secret-key');
    req.flush({
      id: 'm1',
      name: 'Nadia Putri',
      jiraEmail: '',
      qaseDisplayName: '',
      weeklyCapacityHours: 40,
      active: true,
    });
  });

  it('updates a qa member', () => {
    service.updateQaMember('m1', { active: false }, 'secret-key').subscribe();
    const req = http.expectOne('/api/v1/qa-members/m1');
    expect(req.request.method).toBe('PATCH');
    req.flush({
      id: 'm1',
      name: 'Nadia Putri',
      jiraEmail: '',
      qaseDisplayName: '',
      weeklyCapacityHours: 40,
      active: false,
    });
  });

  it('fetches knowledge projects as plain JSON', () => {
    let out: unknown;
    TestBed.inject(DashboardApiService).knowledgeProjects().subscribe((r) => (out = r));
    const body = { totals: { collections: 0, docs: 0, projects: 0, emptyCollections: 0 }, collections: [] };
    TestBed.inject(HttpTestingController).expectOne('/api/v1/knowledge/projects').flush(body);
    expect(out).toEqual(body);
  });

  it('calls knowledge endpoints with params and manager key', () => {
    TestBed.inject(DashboardApiService)
      .knowledgeDocuments({ collection: 'jira_tickets', q: 'refund', page: 2, pageSize: 10 })
      .subscribe();
    const get = TestBed.inject(HttpTestingController).expectOne((r) => r.url === '/api/v1/knowledge/documents');
    expect(get.request.params.get('collection')).toBe('jira_tickets');
    expect(get.request.params.get('page')).toBe('2');
    get.flush({ items: [], total: 0, page: 2, pageSize: 10 });

    TestBed.inject(DashboardApiService).knowledgeAction('a b', 'reindex', 'k').subscribe();
    const post = TestBed.inject(HttpTestingController).expectOne('/api/v1/knowledge/collections/a%20b/reindex');
    expect(post.request.method).toBe('POST');
    expect(post.request.headers.get('X-Manager-Key')).toBe('k');
    post.flush({}, { status: 202, statusText: 'Accepted' });
  });
});
