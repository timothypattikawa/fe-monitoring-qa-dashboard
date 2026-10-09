import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DashboardState } from '../../core/dashboard-state';
import { LiveDashboardStore } from '../../core/live-dashboard.store';
import { DashboardApiService } from '../../core/dashboard-api.service';
import { Project } from '../../core/dashboard.models';
import { buildRiskEmailDraft, isEmail, RISK_HEALTHS, splitEmails } from '../../core/risk-email';

type ProjectQaAlert = { projectId: string; key: string; name: string; body: string };
type AlertDefect = {
  init: string;
  key: string;
  owner: string;
  priority: string;
  status: string;
  title: string;
};

const ALERT_PRIORITY_RANK: Record<string, number> = { BLOCKER: 0, HIGHEST: 1, HIGH: 2 };

@Component({
  selector: 'app-projects',
  imports: [FormsModule],
  templateUrl: './projects.html',
})
export class ProjectsPage implements OnInit {
  readonly state = inject(DashboardState);
  readonly live = inject(LiveDashboardStore);
  private readonly api = inject(DashboardApiService);
  readonly riskProject = signal<Project | null>(null);
  readonly emailTo = signal('');
  readonly emailCc = signal('');
  readonly emailSubject = signal('');
  readonly emailBody = signal('');
  readonly emailSending = signal(false);
  readonly emailNotice = signal('');
  private readonly riskDialog = viewChild<ElementRef<HTMLDialogElement>>('riskDialog');

  constructor() {
    effect(() => {
      const dialog = this.riskDialog()?.nativeElement;
      const open = !!this.riskProject();
      if (!dialog) return;
      if (open && !dialog.open) dialog.showModal();
      if (!open && dialog.open) dialog.close();
    });
  }
  readonly cardPage = signal(1);
  readonly cardPageSize = 2;
  readonly cardPageCount = computed(() =>
    Math.max(1, Math.ceil(this.state.projectCards().length / this.cardPageSize)),
  );
  readonly currentCardPage = computed(() => Math.min(this.cardPage(), this.cardPageCount()));
  readonly pagedCards = computed(() => {
    const page = this.currentCardPage();
    return this.state.projectCards().slice((page - 1) * this.cardPageSize, page * this.cardPageSize);
  });
  readonly defectPage = signal(1);
  readonly pageSize = 10;
  readonly defectPageCount = computed(() =>
    Math.max(1, Math.ceil(this.state.highPriorityDefects().length / this.pageSize)),
  );
  readonly currentDefectPage = computed(() =>
    Math.min(this.defectPage(), this.defectPageCount()),
  );
  readonly pagedHighPriorityDefects = computed(() => {
    const page = this.currentDefectPage();
    return this.state
      .highPriorityDefects()
      .slice((page - 1) * this.pageSize, page * this.pageSize);
  });
  readonly alertOpen = signal(false);
  readonly emailConfigured = signal(false);
  readonly emailProviderMessage = signal('Memeriksa konfigurasi email…');
  readonly sendingProjectId = signal('');
  readonly recipientsByProject = signal<Record<string, string>>({});
  readonly emailFeedbackByProject = signal<Record<string, string>>({});
  readonly alerts = computed<ProjectQaAlert[]>(() =>
    this.state.projects().flatMap((project) => {
      const projectHealth = this.state.projectHealth(project);
      const projectIsAlert = projectHealth === 'Behind' || projectHealth === 'At Risk';
      const defects = this.state.defects
        .filter(
          (bug) =>
            bug.init === project.key &&
            ['BLOCKER', 'HIGHEST', 'HIGH'].includes(bug.priority.trim().toUpperCase()) &&
            ['open', 'ready for qa', 'reopened'].includes(bug.status.trim().toLowerCase()),
        )
        .sort(
          (a, b) =>
            ALERT_PRIORITY_RANK[a.priority.trim().toUpperCase()] -
            ALERT_PRIORITY_RANK[b.priority.trim().toUpperCase()],
        );
      const environments = (['STAGING', 'BETA'] as const).map((environment) => ({
        environment,
        health: this.state.environmentHealth(project, environment),
        target: environment === 'STAGING' ? project.stagingEnd : project.betaEnd,
      }));
      const flaggedEnvironments = environments.filter(
        ({ health, target }) => target && (health === 'Behind' || health === 'At Risk'),
      );
      const selectedEnvironments = flaggedEnvironments.length
        ? flaggedEnvironments
        : projectIsAlert
          ? environments.filter(({ target }) => target).slice(0, 1)
          : [];
      const body = selectedEnvironments
        .map(({ environment, health }) => {
          const environmentIsAlert = health === 'Behind' || health === 'At Risk';
          const stats = this.state.environmentStats(project, environment);
          const progress =
            stats.total > 0
              ? this.state.executionPercent(stats.passed, stats.failed, stats.total)
              : null;
          const daysLeft = environment === 'STAGING' ? project.stagingDaysLeft : project.betaDaysLeft;
          const statusDetail = environmentIsAlert
            ? `${environment} ${health}`
            : `${environment} project ${projectHealth}`;
          return this.formatAlert(
            project,
            environment,
            statusDetail,
            progress,
            Math.max(0, -daysLeft),
            defects,
          );
        })
        .join('\n\n');
      return body
        ? [{ projectId: project.id, key: project.key, name: project.name, body }]
        : [];
    }),
  );
  readonly alertText = computed(() => this.alerts().map((alert) => alert.body).join('\n\n'));
  readonly alertFreshness = computed(() => {
    const sources = this.live.sources();
    if (!sources) return 'Freshness Jira/Qase belum tersedia.';
    const snapshot = this.live.asOf() ? ` Snapshot: ${this.live.asOf()}.` : '';
    return `Freshness sumber — Jira: ${sources.jira.status}; Qase: ${sources.qase.status}.${snapshot}`;
  });

  ngOnInit() {
    this.api.qaAlertEmailStatus().subscribe({
      next: ({ configured }) => {
        this.emailConfigured.set(configured);
        this.emailProviderMessage.set(
          configured
            ? 'Email siap dikirim.'
            : 'Pengiriman nonaktif sampai provider email dan manager authorization dikonfigurasi oleh IT.',
        );
      },
      error: () => {
        this.emailProviderMessage.set('Status email belum tersedia; pengiriman dinonaktifkan.');
      },
    });
  }
  recipientInput(projectId: string) {
    return this.recipientsByProject()[projectId] ?? '';
  }
  setRecipients(projectId: string, value: string) {
    this.recipientsByProject.update((current) => ({ ...current, [projectId]: value }));
  }
  emailFeedback(projectId: string) {
    return this.emailFeedbackByProject()[projectId] ?? '';
  }
  openAlert() {
    this.alertOpen.set(true);
  }
  closeAlert() {
    this.alertOpen.set(false);
  }
  async copyAlert(alert: ProjectQaAlert) {
    try {
      await navigator.clipboard.writeText(alert.body);
      this.setEmailFeedback(alert.projectId, 'Alert berhasil disalin.');
    } catch {
      this.setEmailFeedback(alert.projectId, 'Clipboard tidak tersedia; pilih teks alert lalu salin manual.');
    }
  }
  sendAlert(alert: ProjectQaAlert) {
    if (!this.emailConfigured()) return;
    const input = this.recipientInput(alert.projectId);
    const parsed = input.split(/[,;\s]+/).filter(Boolean);
    const recipients = [...new Map(parsed.map((address) => [address.toLowerCase(), address])).values()];
    if (!recipients.length || recipients.length > 20 || recipients.some((address) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))) {
      this.setEmailFeedback(alert.projectId, 'Masukkan 1–20 alamat email valid, dipisahkan koma, titik koma, atau baris baru.');
      return;
    }
    if (!window.confirm(`Kirim alert ${alert.key} ke ${recipients.join(', ')}?`)) return;
    this.sendingProjectId.set(alert.projectId);
    this.api
      .sendProjectQaAlertEmail(alert.projectId, recipients, alert.body, this.live.managerKey())
      .subscribe({
        next: () => {
          this.sendingProjectId.set('');
          this.recipientsByProject.update((current) => {
            const next = { ...current };
            delete next[alert.projectId];
            return next;
          });
          this.setEmailFeedback(alert.projectId, `Alert terkirim ke ${recipients.join(', ')}.`);
        },
        error: (error) => {
          this.sendingProjectId.set('');
          const message = error?.error?.message ?? 'Gagal mengirim alert email.';
          this.setEmailFeedback(alert.projectId, message);
        },
      });
  }
  private setEmailFeedback(projectId: string, message: string) {
    this.emailFeedbackByProject.update((current) => ({ ...current, [projectId]: message }));
  }
  private formatAlert(
    project: Project,
    environment: 'STAGING' | 'BETA',
    health: string,
    progress: number | null,
    overdueDays: number,
    defects: AlertDefect[],
  ) {
    const qa = project.qa && project.qa !== '—' ? `@${project.qa}` : 'Belum ditentukan';
    const percentage = progress === null ? 'N/A%' : `${progress}%`;
    const defectLines = defects.length
      ? defects.map(
          (bug) =>
            `• \`[${bug.priority}]\` ${bug.key} - ${bug.title.replace(/[\r\n]+/g, ' ')} (Assigned: ${bug.owner || 'Unassigned'})`,
        )
      : ['• Tidak ada defect BLOCKER/HIGHEST/HIGH dengan status open, ready for QA, atau reopened.'];
    const owners = [...new Set(defects.map((bug) => bug.owner).filter((owner) => owner && owner !== '—'))];
    const action = defects.length
      ? `Dev (${owners.map((owner) => `@${owner}`).join(', ') || 'owner belum ditentukan'}): tindak lanjuti ${defects.map((bug) => bug.key).join(', ')}; QA (${qa}): retest defect berstatus Ready for QA dan verifikasi ${environment}.`
      : progress === null
        ? `QA (${qa}): pastikan data eksekusi ${environment} tersinkron agar progress dapat diukur; Dev: identifikasi blocker teknis dan sampaikan ETA pemulihan.`
        : `QA (${qa}): tingkatkan eksekusi ${environment} dari ${percentage} menuju 100%; Dev: identifikasi blocker teknis dan sampaikan ETA pemulihan.`;
    return [
      '🚨 *QA ALERT: Project Behind Schedule*',
      `*Project:* [${project.key} · ${project.name}](https://gli.atlassian.net/browse/${project.key})`,
      `*Status Environment:* ⚠️ ${percentage} (${health} — *${overdueDays} overdue*)`,
      `*QA Primary:* ${qa}`,
      '',
      '🔴 *Blocking/High Bugs:*',
      ...defectLines,
      '',
      `📌 *Action Required:* ${action}`,
    ].join('\n');
  }

  openProject(project: Project) {
    const to = new Date();
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - 29);
    this.live.showProject({ id: project.id }, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
    this.state.openProject(project);
  }

  isRisk(project: Project) {
    return RISK_HEALTHS.includes(this.state.projectHealth(project));
  }

  openRiskEmail(project: Project) {
    const draft = buildRiskEmailDraft(
      project,
      this.state.projectHealth(project),
      this.state.environmentStats(project, 'STAGING'),
      this.state.environmentStats(project, 'BETA'),
      {
        staging: this.state.environmentHealth(project, 'STAGING'),
        beta: this.state.environmentHealth(project, 'BETA'),
      },
    );
    this.emailSubject.set(draft.subject);
    this.emailBody.set(draft.body);
    this.emailNotice.set('');
    this.riskProject.set(project);
  }

  closeRiskEmail() {
    this.riskProject.set(null);
  }

  sendRiskEmail() {
    const project = this.riskProject();
    const to = this.emailTo().trim();
    const cc = splitEmails(this.emailCc());
    if (!project) return;
    if (!isEmail(to) || cc.some((c) => !isEmail(c))) {
      this.emailNotice.set('Alamat email To / CC tidak valid.');
      return;
    }
    if (cc.length > 10) {
      this.emailNotice.set('Maksimal 10 email CC.');
      return;
    }
    this.emailSending.set(true);
    this.emailNotice.set('');
    this.api
      .sendRiskEmail(
        project.id,
        { to, cc, subject: this.emailSubject(), body: this.emailBody() },
        this.live.managerKey(),
      )
      .subscribe({
        next: () => {
          this.emailSending.set(false);
          this.closeRiskEmail();
        },
        error: (e) => {
          this.emailSending.set(false);
          this.emailNotice.set(
            e?.error?.code === 'MAILER_CONFIG_MISSING'
              ? 'Email belum dikonfigurasi di server.'
              : e?.status === 403
                ? 'Manager key diperlukan / salah.'
                : 'Gagal mengirim email.',
          );
        },
      });
  }
}
