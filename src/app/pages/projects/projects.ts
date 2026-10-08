import { Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DashboardState } from '../../core/dashboard-state';
import { LiveDashboardStore } from '../../core/live-dashboard.store';
import { DashboardApiService } from '../../core/dashboard-api.service';
import { Project } from '../../core/dashboard.models';
import { buildRiskEmailDraft, isEmail, RISK_HEALTHS, splitEmails } from '../../core/risk-email';

@Component({
  selector: 'app-projects',
  imports: [FormsModule],
  templateUrl: './projects.html',
})
export class ProjectsPage {
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
