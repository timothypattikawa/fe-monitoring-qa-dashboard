import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DashboardState } from '../../core/dashboard-state';
import { DashboardApiService } from '../../core/dashboard-api.service';
import { LiveDashboardStore } from '../../core/live-dashboard.store';

@Component({
  selector: 'app-projects',
  imports: [FormsModule],
  templateUrl: './projects.html',
})
export class ProjectsPage {
  readonly state = inject(DashboardState);
  private readonly api = inject(DashboardApiService);
  private readonly live = inject(LiveDashboardStore);

  readonly syncing = signal(false);
  readonly syncError = signal('');

  sync() {
    this.syncing.set(true);
    this.syncError.set('');
    this.api.sync(this.live.managerKey(), ['jira', 'qase']).subscribe({
      next: (job) => this.pollUntilDone(job.id),
      error: () => {
        this.syncing.set(false);
        this.syncError.set('Could not queue sync.');
      },
    });
  }

  private pollUntilDone(jobId: string) {
    const poll = () => this.api.job(jobId).subscribe(({ data }) => {
      if (data.status === 'queued' || data.status === 'running') {
        setTimeout(poll, 2000);
        return;
      }
      this.syncing.set(false);
      const failedStep = data.steps?.find((s) => s.status === 'failed');
      this.syncError.set(failedStep ? `Sync failed: ${failedStep.errorCode}` : '');
      this.live.refresh();
    });
    poll();
  }
}
