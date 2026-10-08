import { TestBed } from '@angular/core/testing';
import { DashboardState } from './dashboard-state';
import type { Project } from './dashboard.models';

describe('DashboardState project execution', () => {
  it('keeps environment execution at 100% or less and not-run non-negative', () => {
    const state = TestBed.inject(DashboardState);
    const project = {
      stagingCounts: { passed: 90, failed: 20, blocked: 15, total: 100 },
      betaCounts: { passed: 20, failed: 5, blocked: 2, total: 100 },
    } as Project;

    expect(state.executionPercent(90, 20, 100)).toBe(100);
    expect(state.environmentStats(project, 'STAGING')).toEqual({
      passed: 90,
      failed: 20,
      blocked: 15,
      skipped: 0,
      cancelled: 0,
      retest: 0,
      invalid: 0,
      inProgress: 0,
      total: 100,
      notRun: 0,
    });
    expect(state.environmentStats(project, 'BETA').notRun).toBe(73);
  });

  it('uses complete backend bug summaries and limits project triage to high priorities', () => {
    const state = TestBed.inject(DashboardState);
    state.useLiveData({
      projects: [
        {
          id: 'project-1',
          jiraInitKey: 'INIT-1',
          name: 'Checkout',
          status: 'active',
          health: 'on_track',
          qaOwner: 'QA',
          qaseProjectCode: 'CHECKOUT',
          stagingStartAt: '',
          stagingEndAt: '',
          betaStartAt: '',
          betaEndAt: '',
          countsAvailable: true,
          counts: { passed: 0, failed: 0, blocked: 0, total: 0 },
          testerProgress: [],
          bugSummary: {
            staging: 40,
            beta: 13,
            betaOverThirtyPercentOfStaging: true,
            total: 53,
            canceled: 4,
          },
        },
      ],
      workflowDays: [],
      workload: null,
      bugs: [
        {
          id: '1',
          key: 'BUG-1',
          projectId: 'project-1',
          summary: 'High issue',
          severity: 'High',
          status: 'Open',
          creator: 'Reporter',
          reporter: 'Reporter',
          assignee: 'Owner',
          updatedAt: null,
          environment: 'STAGING',
          createdAt: null,
        },
        {
          id: '2',
          key: 'BUG-2',
          projectId: 'project-1',
          summary: 'Medium issue',
          severity: 'Medium',
          status: 'Open',
          creator: 'Reporter',
          reporter: 'Reporter',
          assignee: 'Owner',
          updatedAt: null,
          environment: 'STAGING',
          createdAt: null,
        },
      ],
    });

    expect(state.projects()[0].bugs).toBe(53);
    expect(state.projects()[0].canceledBugs).toBe(4);
    expect(state.projects()[0].escapedBugs).toBe(13);
    expect(state.betaBugThreshold(state.projects()[0])).toBe(true);
    expect(state.highPriorityDefects().map((bug) => bug.key)).toEqual(['BUG-1']);
  });

  it('shows every project defect by default and sorts open statuses first', () => {
    const state = TestBed.inject(DashboardState);
    state.useLiveData({
      projects: [
        {
          id: 'project-1',
          jiraInitKey: 'INIT-683',
          name: 'Search',
          status: 'active',
          health: 'on_track',
          qaOwner: 'QA',
          qaseProjectCode: 'SEARCH',
          stagingStartAt: '',
          stagingEndAt: '',
          betaStartAt: '',
          betaEndAt: '',
          countsAvailable: true,
          counts: { passed: 0, failed: 0, blocked: 0, total: 0 },
          testerProgress: [],
        },
      ],
      workflowDays: [],
      workload: null,
      bugs: [
        {
          id: '1',
          key: 'BUG-1',
          projectId: 'project-1',
          summary: 'Closed first from API',
          severity: 'Low',
          status: 'Closed',
          creator: '',
          reporter: '',
          assignee: '',
          updatedAt: null,
          environment: '',
          createdAt: null,
        },
        {
          id: '2',
          key: 'BUG-2',
          projectId: 'project-1',
          summary: 'Open later from API',
          severity: 'High',
          status: 'Open',
          creator: '',
          reporter: '',
          assignee: '',
          updatedAt: null,
          environment: 'BETA',
          createdAt: null,
        },
      ],
    });

    expect(state.bugEnvironment()).toBe('All environments');
    expect(state.projectDefects('INIT-683').map((bug) => bug.key)).toEqual(['BUG-2', 'BUG-1']);
    expect(state.projectDefects('INIT-683', 'BETA').map((bug) => bug.key)).toEqual(['BUG-2']);
  });
});

describe('DashboardState day breakdown', () => {
  it('lists every QA active on the day, most executed first, with share of the day', () => {
    const state = TestBed.inject(DashboardState);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const member = (name: string, day?: [number, number, number, number]) => ({
      id: name,
      name,
      plannedHours: 0,
      capacityHours: 0,
      qaseExecutions: 0,
      qaseMapped: true,
      dailyExecutions: day
        ? [{ date: today, executed: day[0], passed: day[1], failed: day[2], blocked: day[3] }]
        : [],
    });
    state.useLiveData({
      projects: [],
      workflowDays: [],
      bugs: [],
      workload: {
        period: { from: today, to: today },
        members: [member('Ana', [10, 8, 1, 1]), member('Budi', [30, 25, 5, 0]), member('Citra')],
      },
    });

    const lastDay = state.workloadDates.length - 1;
    const breakdown = state.workloadDayBreakdown(lastDay);

    expect(breakdown.rows.map((row) => row.name)).toEqual(['Budi', 'Ana']);
    expect(breakdown.rows.map((row) => row.share)).toEqual([75, 25]);
    expect(breakdown.totals).toEqual({ executed: 40, passed: 33, failed: 6, blocked: 1 });
    expect(breakdown.quiet).toBe(1);
    // Earlier days in the window have no recorded results.
    expect(state.workloadDayBreakdown(0).rows).toEqual([]);
  });
});
