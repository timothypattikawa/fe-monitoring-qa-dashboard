import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QaMembersPage } from './qa-members';

describe('QaMembersPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  it('loads members on init', () => {
    const fixture = TestBed.createComponent(QaMembersPage);
    fixture.detectChanges();
    const req = http.expectOne(r => r.url === '/api/v1/qa-members');
    req.flush({ asOf: null, sources: {}, data: [{ id: 'm1', name: 'Nadia Putri', jiraAccountId: '', qaseMemberId: '', weeklyCapacityHours: 40, active: true }] });
    expect(fixture.componentInstance.members().length).toBe(1);
  });

  it('creates a member and reloads the list', () => {
    const fixture = TestBed.createComponent(QaMembersPage);
    fixture.detectChanges();
    http.expectOne(r => r.url === '/api/v1/qa-members').flush({ asOf: null, sources: {}, data: [] });

    fixture.componentInstance.draft.set({ name: 'Nadia Putri', jiraAccountId: '', qaseMemberId: '', weeklyCapacityHours: 40 });
    fixture.componentInstance.save();
    const createReq = http.expectOne(r => r.url === '/api/v1/qa-members' && r.method === 'POST');
    createReq.flush({ id: 'm1', name: 'Nadia Putri', jiraAccountId: '', qaseMemberId: '', weeklyCapacityHours: 40, active: true });
    http.expectOne(r => r.url === '/api/v1/qa-members').flush({ asOf: null, sources: {}, data: [{ id: 'm1', name: 'Nadia Putri', jiraAccountId: '', qaseMemberId: '', weeklyCapacityHours: 40, active: true }] });
    expect(fixture.componentInstance.members().length).toBe(1);
  });
});
