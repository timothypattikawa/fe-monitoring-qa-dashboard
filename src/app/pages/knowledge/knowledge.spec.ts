import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { KnowledgePage, niceMax, relativeTime } from './knowledge';

describe('knowledge helpers', () => {
  it('formats relative time', () => {
    const now = Date.parse('2026-10-03T12:00:00Z');
    expect(relativeTime('2026-10-03T11:52:00Z', now)).toBe('8 mins ago');
    expect(relativeTime('2026-10-03T11:59:30Z', now)).toBe('just now');
    expect(relativeTime('2026-10-03T10:00:00Z', now)).toBe('2 hours ago');
    expect(relativeTime('2026-10-02T12:00:00Z', now)).toBe('1 day ago');
    expect(relativeTime(null, now)).toBe('-');
  });

  it('rounds chart max to a nice number', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(37942)).toBe(50000);
    expect(niceMax(2430)).toBe(5000);
    expect(niceMax(100)).toBe(100);
  });
});

const PROJECTS = {
  totals: { collections: 3, docs: 40372, projects: 3, emptyCollections: 1 },
  collections: [
    { name: 'testcase_vectors', label: 'Default / Utama', docCount: 37942, projectCount: 2, projects: [
      { code: 'IKB', name: 'Ikb Core', docs: 900 }, { code: 'XYZ', name: '', docs: 5 }] },
    { name: 'tc_promo', label: 'Promo', docCount: 2430, projectCount: 1, projects: [{ code: 'INIT434', name: 'INIT-434 Promo 522', docs: 870 }] },
    { name: 'tc_empty', label: 'Kosong', docCount: 0, projectCount: 0, projects: [] },
  ],
};

describe('KnowledgePage', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  function render(projects: unknown = PROJECTS) {
    const fixture = TestBed.createComponent(KnowledgePage);
    fixture.detectChanges();
    http.expectOne('/api/v1/knowledge/overview').flush({
      ram: { usedGb: 18.4, totalGb: 32, pct: 57 }, lastFullSync: null,
      embedding: { model: 'text-embedding-3-large', dimension: 1536 }, collectionsActive: 2, autoSyncEvery: '15 min',
    });
    const req = http.expectOne('/api/v1/knowledge/projects');
    if (projects) req.flush(projects); else req.flush({}, { status: 502, statusText: 'Bad Gateway' });
    fixture.detectChanges();
    return fixture;
  }

  it('renders header chips, summary cards, chart and first section expanded', () => {
    const el: HTMLElement = render().nativeElement;
    expect(el.textContent).toContain('Vector Dimension: 1,536d (text-embedding-3-large)');
    expect(el.querySelectorAll('.kn-stat').length).toBe(4);
    expect(el.textContent).toContain('40,372');
    expect(el.querySelectorAll('.kn-col').length).toBe(3);
    expect(el.querySelector('.kn-chart')?.getAttribute('aria-label')).toContain('Promo: 2,430 docs');
    expect(el.querySelectorAll('.kn-sec').length).toBe(3);
    expect(el.querySelectorAll('.kn-sec table').length).toBe(1);
    expect(el.textContent).toContain('37,942 docs · 2 project(s)');
    expect(el.textContent).toContain('IKB');
    expect(el.textContent).toContain('-');
  });

  it('toggles sections and shows empty row', () => {
    const fixture = render();
    const el: HTMLElement = fixture.nativeElement;
    const toggles = el.querySelectorAll<HTMLButtonElement>('.kn-toggle');
    toggles[2].click();
    fixture.detectChanges();
    expect(toggles[2].getAttribute('aria-expanded')).toBe('true');
    expect(el.textContent).toContain('Belum ada dokumen');
    toggles[0].click();
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Ikb Core');
  });

  it('filters by code or name case-insensitively and auto-expands matches', () => {
    vi.useFakeTimers();
    const fixture = render();
    const c = fixture.componentInstance;
    c.search = 'promo 522';
    c.onSearch();
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.kn-sec').length).toBe(1);
    expect(el.textContent).toContain('INIT434');
    c.search = 'ikb';
    c.onSearch();
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    expect(el.querySelectorAll('.kn-sec tbody tr').length).toBe(1);
    expect(el.textContent).not.toContain('XYZ');
    vi.useRealTimers();
  });

  it('shows a message on 501 SYNC_NOT_CONFIGURED', () => {
    const fixture = render();
    fixture.componentInstance.run(fixture.componentInstance.collections()[1]);
    http.expectOne('/api/v1/knowledge/collections/tc_promo/sync')
      .flush({ code: 'SYNC_NOT_CONFIGURED' }, { status: 501, statusText: 'Not Implemented' });
    expect(fixture.componentInstance.notice()).toBe('Sync pipeline belum dikonfigurasi');
  });

  it('shows retry banner when projects fail', () => {
    const fixture = render(null);
    const alert = fixture.nativeElement.querySelector('[role=alert]');
    expect(alert?.textContent).toContain('Solr may be unreachable');
    expect(alert?.textContent).toContain('Retry');
  });
});
