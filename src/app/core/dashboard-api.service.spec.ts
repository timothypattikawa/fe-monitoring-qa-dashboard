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
