import { Component, computed, effect, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { DashboardApiService, QaDocument, QaDocumentInput } from '../../core/dashboard-api.service';
import { LiveDashboardStore } from '../../core/live-dashboard.store';

@Component({
  selector: 'app-documentation',
  imports: [FormsModule],
  templateUrl: './documentation.html',
})
export class DocumentationPage implements OnInit {
  private readonly api = inject(DashboardApiService);
  readonly live = inject(LiveDashboardStore);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly result = signal({ items: [] as QaDocument[], page: 1, pageSize: 10, total: 0 });
  readonly editingId = signal<string | null>(null);
  readonly formOpen = signal(false);
  search = '';
  readonly draft: QaDocumentInput = {
    projectId: '', documentType: 'Shift Left Testing', title: '', directUrl: '', ownerId: '', status: 'Draft',
  };
  readonly documentTypes = ['Shift Left Testing', 'Test Plan', 'Test Cases', 'Documentation', 'User Guideline', 'Other'];
  readonly statuses = ['Draft', 'In Review', 'Approved', 'Stalled'];
  readonly matrixProjects = () => {
    const q = this.search.trim().toLowerCase();
    return this.live.projects().filter((p) => !q || `${p.jiraInitKey} ${p.name}`.toLowerCase().includes(q));
  };
  /** Latest document per project × type (the matrix cell). */
  readonly docIndex = computed(() => {
    const map = new Map<string, QaDocument>();
    for (const d of [...this.result().items].sort((a, b) => (a.updatedAt ?? '').localeCompare(b.updatedAt ?? ''))) {
      map.set(`${d.projectId}|${d.documentType}`, d);
    }
    return map;
  });
  docFor(projectId: string, type: string) { return this.docIndex().get(`${projectId}|${type}`); }

  private readonly docDialog = viewChild<ElementRef<HTMLDialogElement>>('docDialog');
  constructor() {
    effect(() => {
      const dialog = this.docDialog()?.nativeElement;
      if (!dialog) return;
      if (this.formOpen() && !dialog.open) dialog.showModal();
      if (!this.formOpen() && dialog.open) dialog.close();
    });
  }

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.error.set('');
    // ponytail: one page of 100 (backend max) covers projects × 6 types; paginate if it ever overflows
    this.api.documents({ page: 1, pageSize: 100 }).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (response) => this.result.set(response.data),
      error: () => this.error.set('Unable to load documentation records.'),
    });
  }

  newDocument(projectId = '', documentType = 'Shift Left Testing') {
    this.editingId.set(null);
    Object.assign(this.draft, { projectId, documentType, title: '', directUrl: '', ownerId: '', status: 'Draft' });
    this.formOpen.set(true);
  }

  edit(document: QaDocument) {
    this.editingId.set(document.id);
    Object.assign(this.draft, document);
    this.formOpen.set(true);
  }

  save() {
    if (!this.draft.projectId || !this.draft.title.trim() || !this.draft.ownerId) {
      this.error.set('Project, title, and owner are required.');
      return;
    }
    this.saving.set(true);
    const request = this.editingId()
      ? this.api.updateDocument(this.editingId()!, this.draft, this.live.managerKey())
      : this.api.createDocument(this.draft, this.live.managerKey());
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => { this.formOpen.set(false); this.load(); },
      error: (e) => this.error.set(e?.error?.message ?? 'Unable to save the document.'),
    });
  }

  remove() {
    const id = this.editingId();
    if (!id || !confirm(`Delete “${this.draft.title}”?`)) return;
    this.api.deleteDocument(id, this.live.managerKey()).subscribe({
      next: () => { this.formOpen.set(false); this.load(); },
      error: () => this.error.set('Unable to delete the document.'),
    });
  }
}
