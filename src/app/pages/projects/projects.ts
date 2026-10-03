import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DashboardState } from '../../core/dashboard-state';
import { LiveDashboardStore } from '../../core/live-dashboard.store';
import { Project } from '../../core/dashboard.models';

@Component({
  selector: 'app-projects',
  imports: [FormsModule],
  templateUrl: './projects.html',
})
export class ProjectsPage {
  readonly state = inject(DashboardState);
  readonly live = inject(LiveDashboardStore);
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
}
