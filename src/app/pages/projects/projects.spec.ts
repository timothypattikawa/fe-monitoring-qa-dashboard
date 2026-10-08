import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { DashboardState } from '../../core/dashboard-state';
import { ProjectsPage } from './projects';

describe('ProjectsPage daily QA alert', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [ProjectsPage],
      providers: [provideHttpClient()],
    }),
  );

  it('generates alerts for overdue environments and only includes eligible high-priority defects', () => {
    const state = TestBed.inject(DashboardState);
    const date = (offset: number) => {
      const value = new Date();
      value.setUTCDate(value.getUTCDate() + offset);
      return value.toISOString();
    };
    state.useLiveData({
      projects: [
        {
          id: 'project-1',
          jiraInitKey: 'INIT-358',
          name: 'Refund',
          status: 'active',
          health: 'on_track',
          qaOwner: 'Sheyla',
          qaseProjectCode: 'INIT',
          stagingStartAt: date(-10),
          stagingEndAt: date(-2),
          betaStartAt: date(1),
          betaEndAt: date(30),
          countsAvailable: true,
          counts: { passed: 5, failed: 0, blocked: 0, total: 8 },
          stagingCounts: { passed: 3, failed: 0, blocked: 0, total: 8 },
          betaCounts: { passed: 8, failed: 0, blocked: 0, total: 8 },
          testerProgress: [],
        },
      ],
      workflowDays: [],
      workload: null,
      bugs: [
        {
          id: '1', key: 'BUG-1', projectId: 'project-1', summary: 'Blocker issue', severity: 'Blocker',
          status: 'Reopened', creator: '', reporter: '', assignee: 'Dev A', updatedAt: null,
          environment: 'STAGING', createdAt: null,
        },
        {
          id: '2', key: 'BUG-2', projectId: 'project-1', summary: 'High issue', severity: 'Highest',
          status: 'Ready for QA', creator: '', reporter: '', assignee: 'Dev B', updatedAt: null,
          environment: 'STAGING', createdAt: null,
        },
        {
          id: '3', key: 'BUG-3', projectId: 'project-1', summary: 'Open issue', severity: 'High',
          status: 'Open', creator: '', reporter: '', assignee: 'Dev C', updatedAt: null,
          environment: 'STAGING', createdAt: null,
        },
        {
          id: '4', key: 'BUG-4', projectId: 'project-1', summary: 'Closed issue', severity: 'Blocker',
          status: 'Closed', creator: '', reporter: '', assignee: 'Dev D', updatedAt: null,
          environment: 'STAGING', createdAt: null,
        },
        {
          id: '5', key: 'BUG-5', projectId: 'project-1', summary: 'Low issue', severity: 'Low',
          status: 'Open', creator: '', reporter: '', assignee: 'Dev E', updatedAt: null,
          environment: 'STAGING', createdAt: null,
        },
      ],
    });
    const fixture = TestBed.createComponent(ProjectsPage);
    const text = fixture.componentInstance.alertText();

    expect(fixture.componentInstance.alerts()).toHaveLength(1);
    expect(text).toContain('[INIT-358 · Refund](https://gli.atlassian.net/browse/INIT-358)');
    expect(text).toMatch(/STAGING Behind — \*\d+ overdue\*/);
    expect(text.indexOf('BUG-1')).toBeLessThan(text.indexOf('BUG-2'));
    expect(text).toContain('BUG-3');
    expect(text).not.toContain('BUG-4');
    expect(text).not.toContain('BUG-5');
    expect(text).toContain('Assigned: Dev A');
    expect(text).toContain('QA (@Sheyla)');
    fixture.destroy();
  });

  it('generates alerts for an at-risk environment before it becomes overdue', () => {
    const state = TestBed.inject(DashboardState);
    const date = (offset: number) => {
      const value = new Date();
      value.setUTCDate(value.getUTCDate() + offset);
      return value.toISOString();
    };
    state.useLiveData({
      projects: [
        {
          id: 'project-2',
          jiraInitKey: 'INIT-359',
          name: 'Checkout',
          status: 'active',
          health: 'on_track',
          qaOwner: 'Rina',
          qaseProjectCode: 'CHECKOUT',
          stagingStartAt: date(-2),
          stagingEndAt: date(1),
          betaStartAt: date(1),
          betaEndAt: date(30),
          countsAvailable: true,
          counts: { passed: 11, failed: 0, blocked: 0, total: 20 },
          stagingCounts: { passed: 1, failed: 0, blocked: 0, total: 10 },
          betaCounts: { passed: 10, failed: 0, blocked: 0, total: 10 },
          testerProgress: [],
        },
      ],
      workflowDays: [],
      workload: null,
      bugs: [],
    });
    const fixture = TestBed.createComponent(ProjectsPage);
    const text = fixture.componentInstance.alertText();

    expect(fixture.componentInstance.alerts()).toHaveLength(1);
    expect(text).toContain('10% (STAGING At Risk — *0 overdue*)');
    expect(text).toContain('QA (@Rina)');
    fixture.destroy();
  });

  it('returns no alerts when the snapshot has no projects', () => {
    const state = TestBed.inject(DashboardState);
    state.useLiveData({ projects: [], workflowDays: [], workload: null, bugs: [] });
    const fixture = TestBed.createComponent(ProjectsPage);

    expect(fixture.componentInstance.alerts()).toEqual([]);
    expect(fixture.componentInstance.alertText()).toBe('');
    fixture.destroy();
  });
});
