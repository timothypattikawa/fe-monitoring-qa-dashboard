import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { DashboardApiService, QaMember, QaMemberInput } from '../../core/dashboard-api.service';
import { LiveDashboardStore } from '../../core/live-dashboard.store';

@Component({
  selector: 'app-qa-members',
  imports: [FormsModule],
  templateUrl: './qa-members.html',
})
export class QaMembersPage {
  private readonly api = inject(DashboardApiService);
  readonly live = inject(LiveDashboardStore);

  readonly members = signal<QaMember[]>([]);
  readonly draft = signal<QaMemberInput>({
    name: '',
    jiraAccountId: '',
    qaseMemberId: '',
    weeklyCapacityHours: 40,
  });
  readonly editingId = signal<string | null>(null);
  readonly error = signal('');

  constructor() {
    this.load();
  }

  load() {
    this.api.qaMembers(true).subscribe({
      next: ({ data }) => this.members.set(data ?? []),
      error: () => this.error.set('Could not load QA members.'),
    });
  }

  edit(member: QaMember) {
    this.editingId.set(member.id);
    this.draft.set({
      name: member.name,
      jiraAccountId: member.jiraAccountId,
      qaseMemberId: member.qaseMemberId,
      weeklyCapacityHours: member.weeklyCapacityHours,
    });
  }

  cancelEdit() {
    this.editingId.set(null);
    this.resetDraft();
  }

  save() {
    const id = this.editingId();
    const body = this.draft();
    const managerKey = this.live.managerKey();
    const request = id
      ? this.api.updateQaMember(id, body, managerKey)
      : this.api.createQaMember(body, managerKey);
    request.subscribe({
      next: () => {
        this.editingId.set(null);
        this.resetDraft();
        this.error.set('');
        this.load();
      },
      error: (error: HttpErrorResponse) =>
        this.error.set(error.error?.message || 'Could not save QA member.'),
    });
  }

  deactivate(member: QaMember) {
    this.api.updateQaMember(member.id, { active: false }, this.live.managerKey()).subscribe({
      next: () => this.load(),
      error: () => this.error.set('Could not deactivate QA member.'),
    });
  }

  private resetDraft() {
    this.draft.set({ name: '', jiraAccountId: '', qaseMemberId: '', weeklyCapacityHours: 40 });
  }
}
