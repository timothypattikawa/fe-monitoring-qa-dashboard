import { buildRiskEmailDraft, isEmail, splitEmails } from './risk-email';
import { Project } from './dashboard.models';

const s = { passed: 119, failed: 21, blocked: 0, notRun: 7, total: 147 };

describe('risk email', () => {
  it('drafts summary, bugs, results and next actions', () => {
    const p = { key: 'INIT-700', name: 'Bidding', qa: 'Aulia', bugs: 4, stagingBugs: 3, betaBugs: 1, critical: 1, velocity: 4, requiredVelocity: 6, stagingEnd: '2026-10-05', stagingDaysLeft: -2, betaEnd: '2026-10-21', betaDaysLeft: 14 } as Project;
    const d = buildRiskEmailDraft(p, 'Behind', s, s, { staging: 'Behind', beta: 'Stalled' });
    expect(d.subject).toContain('[BEHIND] INIT-700');
    for (const t of ['terlambat 2 hari', 'Failed 21', 'Total 4 bug', 'NEXT ACTION', '6.00%/hari'])
      expect(d.body).toContain(t);
  });
  it('validates and splits emails', () => {
    expect(splitEmails('a@x.com, b@x.com; c@x.com')).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
    expect(isEmail('a@x.com')).toBe(true);
    expect(isEmail('nope')).toBe(false);
  });
});
