import { Component, effect, ElementRef, inject, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LiveDashboardStore } from '../../core/live-dashboard.store';

@Component({
  selector: 'app-live-dashboard',
  imports: [DatePipe, FormsModule],
  templateUrl: './live-dashboard.html',
  styleUrl: './live-dashboard.css',
})
export class LiveDashboardComponent {
  readonly live = inject(LiveDashboardStore);
  private readonly jobDialog = viewChild<ElementRef<HTMLDialogElement>>('jobDialog');
  private readonly projectFormDialog = viewChild<ElementRef<HTMLDialogElement>>('projectFormDialog');

  constructor() {
    effect(() => this.toggle(this.jobDialog()?.nativeElement, !!this.live.selectedJob()));
    effect(() => this.toggle(this.projectFormDialog()?.nativeElement, this.live.projectFormOpen()));
  }

  private toggle(dialog: HTMLDialogElement | undefined, open: boolean) {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }
}
