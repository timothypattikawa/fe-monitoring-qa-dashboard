import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DashboardState } from '../../core/dashboard-state';
import { LiveDashboardStore } from '../../core/live-dashboard.store';
import { Project } from '../../core/dashboard.models';

@Component({
  selector: 'app-bugs',
  templateUrl: './bugs.html',
})
export class BugsPage implements OnInit {
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

  ngOnInit() {
    this.live.loadProductionBugs();
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
}
