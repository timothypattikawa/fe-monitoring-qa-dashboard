import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DashboardState } from '../../core/dashboard-state';
import { DashboardApiService } from '../../core/dashboard-api.service';
import { LiveDashboardStore } from '../../core/live-dashboard.store';
import { createSyncRunner } from '../../core/sync-runner';

@Component({
  selector: 'app-bugs',
  imports: [FormsModule],
  templateUrl: './bugs.html',
})
export class BugsPage {
  readonly state = inject(DashboardState);
  private readonly api = inject(DashboardApiService);
  private readonly live = inject(LiveDashboardStore);

  readonly syncing = signal(false);
  readonly syncError = signal('');

  private readonly syncRunner = createSyncRunner(
    this.api,
    this.live,
    inject(DestroyRef),
    this.syncing,
    this.syncError,
  );

  sync() {
    this.syncRunner.sync(['jira']);
  }
}
