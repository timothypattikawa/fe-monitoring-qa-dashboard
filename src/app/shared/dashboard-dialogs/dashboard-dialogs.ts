import { Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { DashboardState } from '../../core/dashboard-state';

@Component({
  selector: 'app-dashboard-dialogs',
  imports: [],
  templateUrl: './dashboard-dialogs.html',
})
export class DashboardDialogsComponent {
  readonly state = inject(DashboardState);
  private readonly qaDetail = viewChild<ElementRef<HTMLDialogElement>>('qaDetail');
  private readonly detail = viewChild<ElementRef<HTMLDialogElement>>('detail');

  constructor() {
    effect(() => this.toggle(this.qaDetail()?.nativeElement, !!this.state.selectedMember()));
    effect(() => this.toggle(this.detail()?.nativeElement, !!this.state.selected()));
  }

  private toggle(dialog: HTMLDialogElement | undefined, open: boolean) {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }
}
