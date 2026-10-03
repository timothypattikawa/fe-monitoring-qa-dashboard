import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { DashboardApiService, QaMember, QaMemberInput } from '../../core/dashboard-api.service';
import { LiveDashboardStore } from '../../core/live-dashboard.store';
type QaMemberWarnings = { qaseDisplayName?: string; jiraEmail?: string };

@Component({
  selector: 'app-qa-members',
  imports: [FormsModule],
  templateUrl: './qa-members.html',
})
export class QaMembersPage {
  private readonly api = inject(DashboardApiService);
  readonly live = inject(LiveDashboardStore);

  readonly members = signal<QaMember[]>([]);
  readonly memberPage = signal(1);
  readonly pageSize = 10;
  readonly memberPageCount = computed(() =>
    Math.max(1, Math.ceil(this.members().length / this.pageSize)),
  );
  readonly currentMemberPage = computed(() => Math.min(this.memberPage(), this.memberPageCount()));
  readonly pagedMembers = computed(() => {
    const page = this.currentMemberPage();
    return this.members().slice((page - 1) * this.pageSize, page * this.pageSize);
  });
  readonly draft = signal<QaMemberInput>({
    name: '',
    jiraEmail: '',
    qaseDisplayName: '',
    weeklyCapacityHours: 40,
  });
  readonly editingId = signal<string | null>(null);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly warnings = signal<QaMemberWarnings | null>(null);

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
      jiraEmail: member.jiraEmail,
      qaseDisplayName: member.qaseDisplayName,
      weeklyCapacityHours: member.weeklyCapacityHours,
    });
  }

  cancelEdit() {
    this.editingId.set(null);
    this.warnings.set(null);
    this.resetDraft();
  }

  save() {
    if (this.saving()) return;
    const id = this.editingId();
    const body = this.draft();
    const managerKey = this.live.managerKey();
    this.saving.set(true);
    this.warnings.set(null);
    const request = id
      ? this.api.updateQaMember(id, body, managerKey)
      : this.api.createQaMember(body, managerKey);
    request.subscribe({
      next: (member) => {
        this.saving.set(false);
        this.editingId.set(null);
        this.resetDraft();
        this.error.set('');
        this.warnings.set(member.warnings ?? null);
        this.load();
        this.live.workloadStale.set(true);
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(error.error?.message || 'Could not save QA member.');
      },
    });
  }

  deactivate(member: QaMember) {
    this.setActive(member, false, 'Could not deactivate QA member.');
  }

  reactivate(member: QaMember) {
    this.setActive(member, true, 'Could not reactivate QA member.');
  }

  private setActive(member: QaMember, active: boolean, errorMessage: string) {
    if (this.saving()) return;
    this.saving.set(true);
    this.api.updateQaMember(member.id, { active }, this.live.managerKey()).subscribe({
      next: () => {
        this.saving.set(false);
        this.load();
        this.live.workloadStale.set(true);
      },
      error: () => {
        this.saving.set(false);
        this.error.set(errorMessage);
      },
    });
  }

  private resetDraft() {
    this.draft.set({ name: '', jiraEmail: '', qaseDisplayName: '', weeklyCapacityHours: 40 });
  }
}
