import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QaMembersPage } from './qa-members';

describe('QaMembersPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('loads members on init', () => {
    const fixture = TestBed.createComponent(QaMembersPage);
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url === '/api/v1/qa-members');
    req.flush({
      asOf: null,
      sources: {},
      data: [
        {
          id: 'm1',
          name: 'Nadia Putri',
          jiraAccountId: '',
          qaseMemberId: '',
          weeklyCapacityHours: 40,
          active: true,
        },
      ],
    });
    expect(fixture.componentInstance.members().length).toBe(1);
  });

  it('creates a member and reloads the list', () => {
    const fixture = TestBed.createComponent(QaMembersPage);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === '/api/v1/qa-members')
      .flush({ asOf: null, sources: {}, data: [] });

    fixture.componentInstance.draft.set({
      name: 'Nadia Putri',
      jiraAccountId: '',
      qaseMemberId: '',
      weeklyCapacityHours: 40,
    });
    fixture.componentInstance.save();
    const createReq = http.expectOne((r) => r.url === '/api/v1/qa-members' && r.method === 'POST');
    createReq.flush({
      id: 'm1',
      name: 'Nadia Putri',
      jiraAccountId: '',
      qaseMemberId: '',
      weeklyCapacityHours: 40,
      active: true,
    });
    http
      .expectOne((r) => r.url === '/api/v1/qa-members')
      .flush({
        asOf: null,
        sources: {},
        data: [
          {
            id: 'm1',
            name: 'Nadia Putri',
            jiraAccountId: '',
            qaseMemberId: '',
            weeklyCapacityHours: 40,
            active: true,
          },
        ],
      });
    expect(fixture.componentInstance.members().length).toBe(1);
  });

  it('loads an existing member into the draft for editing', () => {
    const fixture = TestBed.createComponent(QaMembersPage);
    fixture.detectChanges();
    const member = {
      id: 'm1',
      name: 'Nadia Putri',
      jiraAccountId: 'acc-1',
      qaseMemberId: 'qm-1',
      weeklyCapacityHours: 40,
      active: true,
    };
    http.expectOne((r) => r.url === '/api/v1/qa-members').flush({ asOf: null, sources: {}, data: [member] });

    fixture.componentInstance.edit(member);

    expect(fixture.componentInstance.editingId()).toBe('m1');
    expect(fixture.componentInstance.draft()).toEqual({
      name: 'Nadia Putri',
      jiraAccountId: 'acc-1',
      qaseMemberId: 'qm-1',
      weeklyCapacityHours: 40,
    });
  });

  it('deactivates a member and reloads the list', () => {
    const fixture = TestBed.createComponent(QaMembersPage);
    fixture.detectChanges();
    const active = {
      id: 'm1',
      name: 'Nadia Putri',
      jiraAccountId: '',
      qaseMemberId: '',
      weeklyCapacityHours: 40,
      active: true,
    };
    http.expectOne((r) => r.url === '/api/v1/qa-members').flush({ asOf: null, sources: {}, data: [active] });

    fixture.componentInstance.deactivate(active);
    const patchReq = http.expectOne((r) => r.url === '/api/v1/qa-members/m1' && r.method === 'PATCH');
    expect(patchReq.request.body).toEqual({ active: false });
    patchReq.flush({ ...active, active: false });
    http
      .expectOne((r) => r.url === '/api/v1/qa-members')
      .flush({ asOf: null, sources: {}, data: [{ ...active, active: false }] });

    expect(fixture.componentInstance.members()[0].active).toBe(false);
  });

  it('reactivates a member and reloads the list', () => {
    const fixture = TestBed.createComponent(QaMembersPage);
    fixture.detectChanges();
    const inactive = {
      id: 'm1',
      name: 'Nadia Putri',
      jiraAccountId: '',
      qaseMemberId: '',
      weeklyCapacityHours: 40,
      active: false,
    };
    http.expectOne((r) => r.url === '/api/v1/qa-members').flush({ asOf: null, sources: {}, data: [inactive] });

    fixture.componentInstance.reactivate(inactive);
    const patchReq = http.expectOne((r) => r.url === '/api/v1/qa-members/m1' && r.method === 'PATCH');
    expect(patchReq.request.body).toEqual({ active: true });
    patchReq.flush({ ...inactive, active: true });
    http
      .expectOne((r) => r.url === '/api/v1/qa-members')
      .flush({ asOf: null, sources: {}, data: [{ ...inactive, active: true }] });

    expect(fixture.componentInstance.members()[0].active).toBe(true);
  });
});
