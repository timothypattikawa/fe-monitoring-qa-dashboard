import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import {
  DashboardApiService,
  KnowledgeOverview,
  KnowledgeProjectCollection,
  KnowledgeProjects,
} from '../../core/dashboard-api.service';
import { LiveDashboardStore } from '../../core/live-dashboard.store';

export const KN_PALETTE = ['#4fc3f7', '#ff6b6b', '#ffd93d', '#6bcf7f', '#a78bfa', '#f472b6', '#fb923c', '#38bdf8', '#34d399', '#c084fc', '#22d3ee', '#f87171'];

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

/** Round max up to 1/2/5 x 10^k so gridlines land on clean numbers. */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  return ([1, 2, 5, 10].find((m) => m * p >= max) as number) * p;
}

@Component({
  selector: 'app-knowledge',
  imports: [FormsModule],
  templateUrl: './knowledge.html',
})
export class KnowledgePage implements OnInit, OnDestroy {
  private readonly api = inject(DashboardApiService);
  private readonly live = inject(LiveDashboardStore);
  readonly relative = relativeTime;
  readonly palette = KN_PALETTE;
  readonly overview = signal<KnowledgeOverview | null>(null);
  readonly data = signal<KnowledgeProjects | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly projectsError = signal('');
  readonly notice = signal('');
  readonly busy = signal<Record<string, boolean>>({});
  readonly query = signal('');
  readonly toggled = signal<Record<string, boolean>>({});
  search = '';
  private timer?: ReturnType<typeof setTimeout>;

  readonly collections = computed(() => this.data()?.collections ?? []);
  readonly chart = computed(() => {
    const cols = this.collections();
    const max = niceMax(Math.max(0, ...cols.map((c) => c.docCount)));
    const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => Math.round(max * f));
    return {
      max,
      ticks,
      alt: cols.map((c) => `${c.label}: ${c.docCount.toLocaleString('en-US')} docs`).join('; '),
    };
  });
  /** Collections (with original index/color) whose projects match the query; all when no query. */
  readonly sections = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.collections()
      .map((c, i) => ({
        c,
        i,
        color: KN_PALETTE[i % KN_PALETTE.length],
        rows: q ? c.projects.filter((p) => `${p.code} ${p.name}`.toLowerCase().includes(q)) : c.projects,
      }))
      .filter((s) => !q || s.rows.length);
  });

  ngOnInit() { this.load(); }
  ngOnDestroy() { clearTimeout(this.timer); }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.projectsError.set('');
    this.api.knowledgeOverview().subscribe({
      next: (o) => this.overview.set(o),
      error: () => this.error.set('Unable to load knowledge overview. Solr may be unreachable.'),
    });
    this.api.knowledgeProjects().pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (d) => this.data.set(d),
      error: () => this.projectsError.set('Unable to load Solr projects. Solr may be unreachable.'),
    });
  }

  onSearch() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.query.set(this.search), 250);
  }

  isOpen(i: number, name: string) {
    return this.query().trim() ? true : (this.toggled()[name] ?? i === 0);
  }
  toggle(i: number, name: string) {
    this.toggled.update((t) => ({ ...t, [name]: !this.isOpen(i, name) }));
  }

  run(c: KnowledgeProjectCollection) { this.act(c.name, 'sync'); }
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
