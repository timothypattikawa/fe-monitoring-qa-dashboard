import { DestroyRef, WritableSignal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DashboardApiService } from './dashboard-api.service';
import { LiveDashboardStore } from './live-dashboard.store';

/**
 * Shared sync/poll logic for the per-page sync button (projects/workflow/workload/bugs).
 * takeUntilDestroyed() cancels the in-flight `job()` HTTP call on destroy, but a pending
 * `setTimeout` isn't an Observable so it isn't cancelled by that alone — the `destroyRef.onDestroy`
 * flag stops the *next* poll from being scheduled once the component is gone.
 */
export function createSyncRunner(
  api: DashboardApiService,
  live: LiveDashboardStore,
  destroyRef: DestroyRef,
  syncing: WritableSignal<boolean>,
  syncError: WritableSignal<string>,
) {
  let destroyed = false;
  destroyRef.onDestroy(() => (destroyed = true));

  function sync(sources: ('jira' | 'qase')[]) {
    syncing.set(true);
    syncError.set('');
    api.sync(live.managerKey(), sources).subscribe({
      next: (job) => pollUntilDone(job.id),
      error: () => {
        syncing.set(false);
        syncError.set('Could not queue sync.');
      },
    });
  }

  function pollUntilDone(jobId: string) {
    api
      .job(jobId)
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(({ data }) => {
        if (data.status === 'queued' || data.status === 'running') {
          if (destroyed) return;
          setTimeout(() => pollUntilDone(jobId), 2000);
          return;
        }
        syncing.set(false);
        const failedStep = data.steps?.find((s) => s.status === 'failed');
        syncError.set(
          failedStep
            ? `Sync failed (${failedStep.errorCode}) — contact engineering if this persists.`
            : '',
        );
        live.refresh();
      });
  }

  return { sync };
}
