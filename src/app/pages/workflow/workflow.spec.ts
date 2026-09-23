import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WorkflowPage } from './workflow';

describe('WorkflowPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends only qase as the sync source', () => {
    const fixture = TestBed.createComponent(WorkflowPage);
    fixture.detectChanges();
    fixture.componentInstance.sync();

    const req = http.expectOne('/api/v1/sync-jobs');
    expect(req.request.body.sources).toEqual(['qase']);
    req.flush({
      id: 'job-1',
      trigger: 'manual',
      status: 'queued',
      requestedAt: '',
      startedAt: null,
      finishedAt: null,
      steps: [],
    });

    const jobReq = http.expectOne('/api/v1/sync-jobs/job-1');
    jobReq.flush({ asOf: null, sources: {}, data: { id: 'job-1', status: 'done', steps: [] } });

    expect(fixture.componentInstance.syncing()).toBe(false);
    expect(fixture.componentInstance.syncError()).toBe('');

    // live.refresh() fires after the job completes; drain those unrelated requests.
    http.match(() => true).forEach((r) => r.flush({ asOf: null, sources: {}, data: [] }));
  });
});
