import { Component, computed, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DashboardState } from '../../core/dashboard-state';
import { LiveDashboardStore } from '../../core/live-dashboard.store';

@Component({
  selector: 'app-workload',
  imports: [FormsModule],
  templateUrl: './workload.html',
})
export class WorkloadPage implements OnInit {
  readonly state = inject(DashboardState);
  readonly live = inject(LiveDashboardStore);

  private readonly dayDialog = viewChild<ElementRef<HTMLDialogElement>>('dayDialog');
  /** Index into state.workloadDates of the day shown in the breakdown popup. */
  readonly selectedDay = signal<number | null>(null);
  readonly dayBreakdown = computed(() => {
    const day = this.selectedDay();
    return day === null ? null : this.state.workloadDayBreakdown(day);
  });

  openDay(dayIndex: number) {
    this.selectedDay.set(dayIndex);
    const dialog = this.dayDialog()?.nativeElement;
    if (dialog && !dialog.open) dialog.showModal();
  }

  shiftDay(delta: number) {
    const day = this.selectedDay();
    if (day === null) return;
    const next = day + delta;
    if (next >= 0 && next < this.state.workloadDates.length) this.selectedDay.set(next);
  }

  ngOnInit() {
    if (this.live.workloadStale()) {
      this.live.workloadStale.set(false);
      this.live.refresh();
    }
  }

  readonly memberPage = signal(1);
  readonly memberPageSize = 6;
  readonly memberPageCount = computed(() =>
    Math.max(1, Math.ceil(this.state.portfolioMembers().length / this.memberPageSize)),
  );
  readonly currentMemberPage = computed(() => Math.min(this.memberPage(), this.memberPageCount()));
  readonly pagedMembers = computed(() => {
    const page = this.currentMemberPage();
    return this.state
      .portfolioMembers()
      .slice((page - 1) * this.memberPageSize, page * this.memberPageSize);
  });
  readonly distPage = signal(1);
  readonly distPageCount = computed(() =>
    Math.max(1, Math.ceil(this.state.workloadMembers().length / this.memberPageSize)),
  );
  readonly currentDistPage = computed(() => Math.min(this.distPage(), this.distPageCount()));
  readonly pagedDistribution = computed(() => {
    const page = this.currentDistPage();
    return this.state
      .workloadMembers()
      .slice((page - 1) * this.memberPageSize, page * this.memberPageSize);
  });
  readonly runPage = signal(1);
  readonly pageSize = 10;
  readonly runPageCount = computed(() =>
    Math.max(1, Math.ceil(this.state.workloadRuns().length / this.pageSize)),
  );
  readonly currentRunPage = computed(() => Math.min(this.runPage(), this.runPageCount()));
  readonly pagedRuns = computed(() => {
    const page = this.currentRunPage();
    return this.state.workloadRuns().slice((page - 1) * this.pageSize, page * this.pageSize);
  });
}
