import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';
import { DashboardApiService, QaTimelineRow } from '../../core/dashboard-api.service';
import { DashboardState } from '../../core/dashboard-state';
import { LiveDashboardStore } from '../../core/live-dashboard.store';
import { Project } from '../../core/dashboard.models';

// ngModel on <input type="number"> emits number|null (never a string) —
// keep the draft in that shape so savePlanning doesn't have to re-parse.
type TimelineDraft = { plan: number | null; size: string };

@Component({
  selector: 'app-bugs',
  imports: [FormsModule],
  templateUrl: './bugs.html',
})
export class BugsPage implements OnInit {
  private readonly api = inject(DashboardApiService);
  readonly state = inject(DashboardState);
  readonly live = inject(LiveDashboardStore);
  readonly summaryPage = signal(1);
  readonly pageSize = 10;
  readonly summaryPageCount = computed(() =>
    Math.max(1, Math.ceil(this.state.filtered().length / this.pageSize)),
  );
  readonly currentSummaryPage = computed(() =>
    Math.min(this.summaryPage(), this.summaryPageCount()),
  );
  readonly pagedSummaryProjects = computed(() => {
    const page = this.currentSummaryPage();
    return this.state.filtered().slice((page - 1) * this.pageSize, page * this.pageSize);
  });
  readonly sizes = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4L', '5L'];
  readonly timelinePage = signal(1);
  readonly timelinePageSize = 10;
  readonly timelineDrafts = signal<Record<string, TimelineDraft>>({});
  readonly timelineSaving = signal<string | null>(null);
  readonly timelineError = signal('');
  // Follows the global filterbar: only rows for filtered projects show.
  readonly filteredTimeline = computed(() => {
    const ids = new Set(this.state.filtered().map((p) => p.id));
    return this.live.qaTimeline().filter((row) => ids.has(row.projectId));
  });
  readonly timelinePageCount = computed(() =>
    Math.max(1, Math.ceil(this.filteredTimeline().length / this.timelinePageSize)),
  );
  readonly currentTimelinePage = computed(() =>
    Math.min(this.timelinePage(), this.timelinePageCount()),
  );
  readonly pagedTimeline = computed(() => {
    const page = this.currentTimelinePage();
    return this.filteredTimeline().slice(
      (page - 1) * this.timelinePageSize,
      page * this.timelinePageSize,
    );
  });

  ngOnInit() {
    this.live.loadProductionBugs();
    this.live.loadQaTimeline();
  }

  private pct1(part: number, total: number) {
    return total ? ((part / total) * 100).toFixed(1) : '0.0';
  }

  stagingShare(project: Project) {
    return this.pct1(project.stagingBugs, project.bugs);
  }

  betaShare(project: Project) {
    return this.pct1(project.betaBugs, project.bugs);
  }

  betaOverStaging(project: Project) {
    return this.pct1(project.betaBugs, project.stagingBugs);
  }

  betaOverStagingDelta(project: Project) {
    const delta = Number(this.betaOverStaging(project)) - 30;
    return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`;
  }

  prodBugs(project: Project) {
    return Math.max(0, project.bugs - project.stagingBugs - project.betaBugs);
  }

  noisePercent(project: Project) {
    return this.pct1(project.canceledBugs, project.bugs + project.canceledBugs);
  }

  productionPageCount() {
    const result = this.live.productionBugs();
    return Math.max(1, Math.ceil(result.total / result.pageSize));
  }

  draftFor(row: QaTimelineRow): TimelineDraft {
    return (
      this.timelineDrafts()[row.projectId] ?? {
        plan: row.timelinePlanDays,
        size: row.projectSize ?? '',
      }
    );
  }

  setPlanDraft(row: QaTimelineRow, plan: number | null) {
    this.timelineDrafts.update((drafts) => ({
      ...drafts,
      [row.projectId]: { ...this.draftFor(row), plan },
    }));
  }

  setSizeDraft(row: QaTimelineRow, size: string) {
    this.timelineDrafts.update((drafts) => ({
      ...drafts,
      [row.projectId]: { ...this.draftFor(row), size },
    }));
    this.savePlanning(row);
  }

  planDelta(row: QaTimelineRow): number | null {
    if (row.timelinePlanDays === null || !row.qaStartAt) return null;
    return row.workingDays - row.timelinePlanDays;
  }

  planDeltaLabel(row: QaTimelineRow): string {
    const delta = this.planDelta(row);
    if (delta === null) return '—';
    if (delta > 0) return `Over ${delta}d`;
    if (delta < 0) return `${-delta}d left`;
    return 'On plan';
  }

  holidayTooltip(row: QaTimelineRow): string {
    if (!row.holidays.length) return 'Tidak ada tanggal merah di rentang ini';
    return row.holidays.map((h) => `${this.state.dateLabel(h.date)} — ${h.name}`).join('\n');
  }

  savePlanning(row: QaTimelineRow) {
    if (this.timelineSaving() === row.projectId) return;
    const draft = this.draftFor(row);
    const plan = draft.plan;
    const size = draft.size || null;
    if (plan !== null && (!Number.isFinite(plan) || plan < 0)) {
      this.timelineError.set('Plan (man days) harus angka 0 atau lebih.');
      return;
    }
    if (plan === row.timelinePlanDays && size === (row.projectSize ?? null)) return;
    this.timelineSaving.set(row.projectId);
    this.timelineError.set('');
    this.api
      .updateProject(
        row.projectId,
        { timelinePlanDays: plan, projectSize: size },
        this.live.managerKey(),
      )
      .pipe(finalize(() => this.timelineSaving.set(null)))
      .subscribe({
        next: (project) => {
          const savedSize = project.projectSize ?? null;
          const savedPlan = project.timelinePlanDays ?? null;
          this.live.qaTimeline.update((rows) =>
            rows.map((item) =>
              item.projectId === row.projectId
                ? { ...item, projectSize: savedSize, timelinePlanDays: savedPlan }
                : item,
            ),
          );
          const draft = this.timelineDrafts()[row.projectId];
          if (!draft || (draft.plan === savedPlan && (draft.size || null) === savedSize)) {
            this.timelineDrafts.update((drafts) => {
              const next = { ...drafts };
              delete next[row.projectId];
              return next;
            });
          } else {
            // User edited again while this save was in-flight — flush the
            // newer draft once the in-flight flag clears (after finalize).
            setTimeout(() =>
              this.savePlanning({
                ...row,
                projectSize: savedSize,
                timelinePlanDays: savedPlan,
              }),
            );
          }
          this.live.notice.set(`${project.jiraInitKey} timeline plan saved.`);
        },
        error: (error: HttpErrorResponse) =>
          this.timelineError.set(error.error?.message || 'Could not save timeline planning.'),
      });
  }
}
