import { Project, ProjectHealth } from './dashboard.models';

type EnvStats = { passed: number; failed: number; blocked: number; notRun: number; total: number };

export const RISK_HEALTHS: ProjectHealth[] = ['Behind', 'At Risk'];

const pct = (s: EnvStats) => (s.total ? Math.round(((s.passed + s.failed) / s.total) * 100) : 0);

function envBlock(name: string, s: EnvStats, health: string, target: string, daysLeft: number) {
  const late = daysLeft < 0 ? `terlambat ${-daysLeft} hari` : `sisa ${daysLeft} hari`;
  return [
    `${name} (${health}) - ${pct(s)}% executed (${s.passed + s.failed}/${s.total}), target ${target || '-'}, ${late}`,
    `  Passed ${s.passed} | Failed ${s.failed} | Blocked ${s.blocked} | Not run ${s.notRun}`,
  ].join('\n');
}

/** Editable first draft; the lead reviews and rewrites it in the dialog before sending. */
export function buildRiskEmailDraft(
  p: Project,
  health: ProjectHealth,
  staging: EnvStats,
  beta: EnvStats,
  health2: { staging: string; beta: string },
): { subject: string; body: string } {
  const actions: string[] = [];
  if (p.requiredVelocity > p.velocity)
    actions.push(
      `Naikkan kecepatan eksekusi dari ${p.velocity.toFixed(2)}%/hari menjadi minimal ${p.requiredVelocity.toFixed(2)}%/hari agar sesuai target.`,
    );
  if (staging.failed + beta.failed > 0)
    actions.push('Developer memprioritaskan perbaikan test case yang Failed, lalu QA retest.');
  if (staging.blocked + beta.blocked > 0) actions.push('Selesaikan kendala pada test case yang Blocked.');
  if (p.bugs > 0) actions.push('Prioritaskan penyelesaian bug yang masih open, terutama yang Critical.');
  actions.push('Konfirmasi apakah jadwal target perlu disesuaikan atau resource QA ditambah.');

  const body = [
    'Halo,',
    '',
    `Project ${p.key} - ${p.name} saat ini berstatus ${health.toUpperCase()} dan berpotensi tidak mengejar target jadwal testing.`,
    '',
    'RINCIAN HASIL TESTING',
    envBlock('Staging', staging, health2.staging, p.stagingEnd, p.stagingDaysLeft),
    envBlock('Beta', beta, health2.beta, p.betaEnd, p.betaDaysLeft),
    '',
    'BUG YANG MASIH OPEN',
    `Total ${p.bugs} bug (Staging ${p.stagingBugs}, Beta ${p.betaBugs}), Critical open: ${p.critical}.`,
    '',
    'NEXT ACTION',
    ...actions.map((a, i) => `${i + 1}. ${a}`),
    '',
    `Primary QA: ${p.qa}`,
    '',
    'Terima kasih.',
  ].join('\n');
  return { subject: `[${health.toUpperCase()}] ${p.key} ${p.name} - Ringkasan Testing & Tindak Lanjut`, body };
}

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
export const isEmail = (s: string) => EMAIL.test(s.trim());

/** Splits "a@x.com, b@x.com; c@x.com" into trimmed non-empty tokens. */
export const splitEmails = (s: string) =>
  s.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
