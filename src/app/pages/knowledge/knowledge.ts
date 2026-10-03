import { DatePipe } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import {
  DashboardApiService,
  KnowledgeCollection,
  KnowledgeDocument,
  KnowledgeOverview,
  KnowledgeStatus,
} from '../../core/dashboard-api.service';
import { LiveDashboardStore } from '../../core/live-dashboard.store';

export const STATUS_VIEW: Record<
  KnowledgeStatus,
  { label: string; tone: 'ok' | 'warn' | 'bad'; action: 'sync' | 'reindex'; actionLabel: string }
> = {
  HEALTHY: { label: 'HEALTHY', tone: 'ok', action: 'sync', actionLabel: 'Sync' },
  OUTDATED_SYNC: { label: 'OUTDATED SYNC', tone: 'warn', action: 'reindex', actionLabel: 'Reindex' },
  NEEDS_REINDEX: { label: 'NEEDS REINDEX', tone: 'bad', action: 'reindex', actionLabel: 'Run Force' },
};

/** "8 mins ago" style label; '-' when missing/invalid. */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return '-';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const units: [number, string][] = [[86400, 'day'], [3600, 'hour'], [60, 'min']];
  for (const [size, name] of units) {
    if (s >= size) {
      const n = Math.floor(s / size);
      return `${n} ${name}${n === 1 ? '' : 's'} ago`;
    }
  }
  return '';
}

@Component({
  selector: 'app-knowledge',
  imports: [FormsModule, DatePipe],
  templateUrl: './knowledge.html',
})
export class KnowledgePage implements OnInit, OnDestroy {
  private readonly api = inject(DashboardApiService);
  private readonly live = inject(LiveDashboardStore);
  readonly view = STATUS_VIEW;
  readonly relative = relativeTime;
  readonly overview = signal<KnowledgeOverview | null>(null);
  readonly collections = signal<KnowledgeCollection[]>([]);
  readonly docs = signal({ items: [] as KnowledgeDocument[], total: 0, page: 1, pageSize: 10 });
  readonly loading = signal(false);
  readonly docsLoading = signal(false);
  readonly error = signal('');
  readonly docsError = signal('');
  readonly notice = signal('');
  readonly busy = signal<Record<string, boolean>>({});
  search = '';
  collection = '';
  page = 1;
  private timer?: ReturnType<typeof setTimeout>;

  ngOnInit() { this.load(); }
  ngOnDestroy() { clearTimeout(this.timer); }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.api.knowledgeOverview().subscribe({
      next: (o) => this.overview.set(o),
      error: () => this.error.set('Unable to load knowledge overview. Solr may be unreachable.'),
    });
    this.api.knowledgeCollections().pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (c) => this.collections.set(c),
      error: () => this.error.set('Unable to load collections. Solr may be unreachable.'),
    });
    this.loadDocs();
  }

  loadDocs() {
    this.docsLoading.set(true);
    this.docsError.set('');
    this.api
      .knowledgeDocuments({ collection: this.collection, q: this.search.trim(), page: this.page, pageSize: 10 })
      .pipe(finalize(() => this.docsLoading.set(false)))
      .subscribe({
        next: (r) => this.docs.set(r),
        error: () => this.docsError.set('Unable to load documents. Solr may be unreachable.'),
      });
  }

  onSearch() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.filter(), 300);
  }
  filter() { this.page = 1; this.loadDocs(); }
  reset() { this.search = ''; this.collection = ''; this.filter(); }
  go(delta: number) { this.page += delta; this.loadDocs(); }
  lastPage() { const d = this.docs(); return Math.max(1, Math.ceil(d.total / d.pageSize)); }

  run(c: KnowledgeCollection) { this.act(c.name, STATUS_VIEW[c.status].action); }
  syncAll() { for (const c of this.collections()) this.act(c.name, 'sync'); }

  private act(name: string, action: 'sync' | 'reindex') {
    this.busy.update((b) => ({ ...b, [name]: true }));
    this.notice.set('');
    this.api
      .knowledgeAction(name, action, this.live.managerKey())
      .pipe(finalize(() => this.busy.update((b) => ({ ...b, [name]: false }))))
      .subscribe({
        next: () => this.notice.set(`${name}: ${action} started.`),
        error: (e) =>
          this.notice.set(
            e?.status === 501 || e?.error?.code === 'SYNC_NOT_CONFIGURED'
              ? 'Sync pipeline belum dikonfigurasi'
              : `${name}: ${action} failed.`,
          ),
      });
  }
}
