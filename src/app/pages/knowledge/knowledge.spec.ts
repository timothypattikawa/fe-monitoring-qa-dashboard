import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { KnowledgePage, relativeTime, STATUS_VIEW } from './knowledge';

describe('knowledge helpers', () => {
  it('maps status to pill tone and action', () => {
    expect(STATUS_VIEW.HEALTHY).toMatchObject({ tone: 'ok', actionLabel: 'Sync', action: 'sync' });
    expect(STATUS_VIEW.OUTDATED_SYNC).toMatchObject({ tone: 'warn', actionLabel: 'Reindex', action: 'reindex' });
    expect(STATUS_VIEW.NEEDS_REINDEX).toMatchObject({ tone: 'bad', actionLabel: 'Run Force', action: 'reindex' });
  });

  it('formats relative time', () => {
    const now = Date.parse('2026-10-03T12:00:00Z');
    expect(relativeTime('2026-10-03T11:52:00Z', now)).toBe('8 mins ago');
    expect(relativeTime('2026-10-03T11:59:30Z', now)).toBe('just now');
    expect(relativeTime('2026-10-03T10:00:00Z', now)).toBe('2 hours ago');
    expect(relativeTime('2026-10-02T12:00:00Z', now)).toBe('1 day ago');
    expect(relativeTime(null, now)).toBe('-');
  });
});

describe('KnowledgePage', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  function render() {
    const fixture = TestBed.createComponent(KnowledgePage);
    fixture.detectChanges();
    http.expectOne('/api/v1/knowledge/overview').flush({
      ram: { usedGb: 18.4, totalGb: 32, pct: 57 }, lastFullSync: null,
      embedding: { model: 'text-embedding-3-large', dimension: 1536 }, collectionsActive: 2, autoSyncEvery: '15 min',
    });
    http.expectOne('/api/v1/knowledge/collections').flush([
      { name: 'jira_tickets', docCount: 10, target: 20, coveragePct: 50, status: 'OUTDATED_SYNC', lastSyncedAt: null, outdatedDocs: 1, sizeBytes: 1 },
      { name: 'qase_cases', docCount: 5, target: null, coveragePct: null, status: 'HEALTHY', lastSyncedAt: null, outdatedDocs: 0, sizeBytes: 1 },
    ]);
    http.expectOne((r) => r.url === '/api/v1/knowledge/documents').flush({
      items: [{ id: '1', title: 'Refund plan', key: 'QA-1', sourceUrl: 'https://x/y', collection: 'jira_tickets', chunks: 1, dims: 1536, lastSyncedAt: null, syncStatus: 'SYNCED' }],
      total: 1, page: 1, pageSize: 10,
    });
    fixture.detectChanges();
    return fixture;
  }

  it('renders collections and documents', () => {
    const el: HTMLElement = render().nativeElement;
    expect(el.textContent).toContain('Vector Dimension: 1,536d (text-embedding-3-large)');
    expect(el.querySelectorAll('.kn-card').length).toBe(2);
    expect(el.textContent).toContain('OUTDATED SYNC');
    expect(el.textContent).toContain('Reindex');
    expect(el.textContent).toContain('Refund plan');
    expect(el.querySelector('a[target=_blank]')?.getAttribute('rel')).toBe('noopener');
  });

  it('shows a message on 501 SYNC_NOT_CONFIGURED', () => {
    const fixture = render();
    fixture.componentInstance.run(fixture.componentInstance.collections()[0]);
    http.expectOne('/api/v1/knowledge/collections/jira_tickets/reindex')
      .flush({ code: 'SYNC_NOT_CONFIGURED' }, { status: 501, statusText: 'Not Implemented' });
    expect(fixture.componentInstance.notice()).toBe('Sync pipeline belum dikonfigurasi');
  });

  it('shows retry banner when documents fail', () => {
    const fixture = render();
    fixture.componentInstance.loadDocs();
    http.expectOne((r) => r.url === '/api/v1/knowledge/documents').flush({}, { status: 502, statusText: 'Bad Gateway' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]')?.textContent).toContain('Retry');
  });
});
