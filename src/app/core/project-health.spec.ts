import { TestBed } from '@angular/core/testing';
import type { ApiProject } from './dashboard-api.service';
import { DashboardState } from './dashboard-state';

type Counts = { passed: number; failed: number; blocked: number; total: number };

const dateOffset = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
};

const projectSnapshot = (
  counts: Counts,
  stagingCounts: Counts = counts,
  betaCounts: Counts = { passed: 0, failed: 0, blocked: 0, total: 0 },
): ApiProject => ({
  id: 'project-1',
  jiraInitKey: 'INIT-101',
  name: 'Revamp Homepage',
  status: 'active',
  health: 'off_track',
  qaOwner: 'QA',
  qaseProjectCode: 'INIT',
  stagingStartAt: dateOffset(-20),
  stagingEndAt: dateOffset(-3),
  betaStartAt: dateOffset(-20),
  betaEndAt: dateOffset(-2),
  countsAvailable: true,
  counts,
  stagingCounts,
  betaCounts,
  testerProgress: [],
});

function loadProject(snapshot: ApiProject) {
  const state = TestBed.inject(DashboardState);
  state.useLiveData({ projects: [snapshot], workflowDays: [], workload: null, bugs: [] });
  return state;
}

describe('DashboardState project completion health', () => {
  it('marks a fully passed overdue project and its completed environment green', () => {
    const counts = { passed: 1083, failed: 0, blocked: 0, total: 1083 };
    const state = loadProject(projectSnapshot(counts));
    const project = state.projects()[0];

    expect(project.stagingDaysLeft).toBeLessThan(0);
    expect(state.projectHealth(project)).toBe('Completed');
    expect(state.environmentHealth(project, 'STAGING')).toBe('Completed');
    expect(state.executionPercent(counts.passed, counts.failed, counts.total)).toBe(100);
  });

  it('keeps failed or blocked overdue projects at risk instead of completed or behind', () => {
    const counts = { passed: 1000, failed: 10, blocked: 73, total: 1083 };
    const state = loadProject(projectSnapshot(counts));
    const project = state.projects()[0];

    expect(state.projectHealth(project)).toBe('At Risk');
    expect(state.environmentHealth(project, 'STAGING')).toBe('At Risk');
  });

  it('keeps an overdue project behind when an unclassified test remains unpassed', () => {
    const counts = { passed: 1082, failed: 0, blocked: 0, total: 1083 };
    const state = loadProject(projectSnapshot(counts));
    const project = state.projects()[0];

    expect(state.executionPercent(counts.passed, counts.failed, counts.total)).toBe(100);
    expect(state.projectHealth(project)).toBe('Behind');
    expect(state.environmentHealth(project, 'STAGING')).toBe('Behind');
  });
});
