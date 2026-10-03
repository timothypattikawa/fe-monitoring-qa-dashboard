# Bug Dashboard Implementation Plan

## 1. Tujuan

Dokumen ini menjadi rencana implementasi perubahan QA Monitoring Dashboard berdasarkan permintaan product dalam `BUG DASHBOARD (2).docx`.

Target implementasi:

- Menambahkan metadata manual pada project.
- Memperbaiki atribusi PIC dan statistik eksekusi dari Qase.
- Mengambil data bug secara lengkap dari Jira.
- Menghitung portfolio dan aktivitas QA dari Jira dan Qase.
- Menambahkan QA Documentation Tracking.
- Menjaga Angular hanya membaca data melalui Go API dan PostgreSQL.

Knowledge and RAG Monitoring serta integrasi Solr tidak termasuk scope implementasi saat ini.

## 2. Kondisi Implementasi Saat Ini

Sebagian kebutuhan product sudah tersedia dalam working tree, tetapi belum seluruhnya menggunakan sumber data atau aturan yang benar.

| Area | Kondisi Saat Ini | Gap |
| --- | --- | --- |
| Project size | Belum tersedia | Perlu input dan penyimpanan baru |
| MTTT | Diambil dari durasi Qase run pertama | Harus diinput manual saat project dibuat |
| Tester Qase | QA Tester, Android, iOS, dan Beta Tester sudah tersimpan | Aturan pemilihan field belum konsisten |
| Daily execution | Sudah tersedia untuk lima hari terakhir | Belum menampilkan `Unassigned` dan rentang waktunya terlalu kaku |
| Statistik STAGING dan BETA | Total dasar sudah tersedia | Belum lengkap per PIC dan active run |
| Bug project | Bersumber dari Qase defect yang diperkaya Jira | Bug Jira yang tidak terhubung ke Qase tidak muncul |
| Direct Jira link | Sudah tersedia | Dipertahankan |
| Threshold Beta | Sudah dihitung | Perlu verifikasi edge case dan indikator UI |
| Reporter grouping | Data reporter sudah tersedia | Belum ditampilkan sebagai grouping dengan subtotal |
| QA portfolio | Menggunakan project owner dan fallback Qase | Harus menggunakan field Jira QAs |
| Documentation Tracking | Belum tersedia | Perlu database, API, form, dan tabel baru |

## 3. Prinsip Arsitektur

Alur data tetap menggunakan pola berikut:

```text
Jira dan Qase
      |
      v
Go background worker
      |
      v
PostgreSQL read model
      |
      v
Go REST API
      |
      v
Angular dashboard
```

Ketentuan:

1. Angular tidak memanggil Jira atau Qase secara langsung.
2. Credential upstream hanya tersedia di backend.
3. Sinkronisasi dilakukan oleh worker dan disimpan ke PostgreSQL.
4. Endpoint dashboard hanya membaca data PostgreSQL.
5. Data lama yang masih valid tidak dihapus ketika satu proses sinkronisasi gagal.
6. Timestamp disimpan dalam UTC dan ditampilkan sesuai zona waktu aplikasi.

## 4. Scope Implementasi

### 4.1 Termasuk Scope

- Project size dan MTTT manual.
- Project card dan project detail.
- Atribusi PIC Qase untuk STAGING dan BETA.
- Daily execution trend dan detailed execution history.
- Statistik environment dan progress per PIC.
- Sinkronisasi bug Jira menggunakan JQL product.
- Threshold bug Beta terhadap Staging.
- Direct Jira link dan grouping reporter.
- QA portfolio dan current activity.
- QA Documentation Tracking.
- Database migration, backfill, testing, dan deployment.

### 4.2 Tidak Termasuk Scope

- Solr.
- Knowledge and RAG Monitoring.
- Sync atau reindex collection RAG.
- Perubahan authentication menjadi SSO atau RBAC penuh.
- Notification melalui email, Slack, atau Telegram.

## 5. Phase 0 Database Migration dan Baseline

### 5.1 Persiapan

1. Simpan atau commit perubahan lokal FE dan BE sebelum implementasi dimulai.
2. Ambil backup PostgreSQL.
3. Catat jumlah project, Qase run, result, bug, dan QA member sebelum migrasi.
4. Tambahkan SQL migration yang dapat direview DBA.
5. Jalankan migration lebih dahulu, kemudian deploy backend, lalu frontend.

### 5.2 Strategi Migration

Perubahan database dibuat secara additive agar rollback aplikasi tidak memerlukan penghapusan kolom atau tabel.

Production tidak boleh hanya bergantung pada GORM `AutoMigrate`. SQL migration menjadi sumber perubahan schema yang direview, sedangkan `AutoMigrate` dapat tetap dipakai untuk local development dan test.

## 6. Phase 1 Project Metadata

### 6.1 Database

Tambahkan kolom pada tabel `projects`:

```text
project_size             varchar(8) nullable
staging_mttt_minutes     integer nullable
beta_mttt_minutes        integer nullable
```

Constraint:

```text
project_size IN ('S', 'M', 'L', 'XL', '2XL', '3XL', '4L', '5L')
staging_mttt_minutes >= 0
beta_mttt_minutes >= 0
```

MTTT disimpan dalam menit agar mudah divalidasi, dihitung, dan diformat oleh FE.

### 6.2 Backend

Perbarui request `POST /api/v1/projects`:

```json
{
  "jiraInitKey": "INIT-683",
  "name": "Live Tracking",
  "qaseProjectCode": "QASE",
  "qaOwner": "Kiki Melati Manurung",
  "projectSize": "XL",
  "stagingMtttMinutes": 90,
  "betaMtttMinutes": 120,
  "stagingStartAt": "2026-09-01T00:00:00Z",
  "stagingEndAt": "2026-09-30T00:00:00Z",
  "betaStartAt": "2026-10-01T00:00:00Z",
  "betaEndAt": "2026-10-11T00:00:00Z"
}
```

Validasi backend:

- Project size harus berasal dari daftar yang diizinkan.
- MTTT boleh kosong.
- MTTT tidak boleh negatif.
- Validasi INIT, Qase project, owner, dan tanggal yang sudah ada tetap dipertahankan.

### 6.3 Frontend

Form Add Project ditambah dengan:

- Project Size.
- MTTT STAGING dalam menit.
- MTTT BETA dalam menit.

Project card menampilkan:

- Size pada header project.
- MTTT manual pada environment STAGING.
- MTTT manual pada environment BETA.

Perhitungan MTTT dari elapsed Qase run dihapus dari tampilan project.

## 7. Phase 2 Atribusi PIC Qase

### 7.1 Aturan Sumber Data

Hanya run dengan prefix STG atau BETA yang masuk ke perhitungan dashboard.

```text
STG + IOS              -> QA Tester iOS
STG + ANDROID atau AOS -> QA Tester Android
STG lainnya            -> QA Tester
BETA semua platform    -> Beta Tester
Field tester kosong    -> Unassigned
Prefix lainnya         -> tidak dihitung
```

Pencocokan prefix dilakukan setelah trim dan bersifat case-insensitive.

### 7.2 Single Source of Truth

Backend menyediakan satu fungsi atribusi yang digunakan oleh seluruh query dan proses sinkronisasi:

```text
resolveAssignedTester(run, testCase) -> tester name atau Unassigned
```

Fungsi tersebut digunakan untuk:

- Snapshot PIC pada `qase_results`.
- Daftar tester dalam satu run.
- Progress per assignee.
- Daily execution.
- Workload.
- Detailed execution history.

Frontend tidak menentukan ulang tester berdasarkan nama run.

### 7.3 Historical Snapshot

`qase_results.tester_name` menjadi snapshot PIC ketika result pertama kali disinkronkan.

Ketentuan:

- Snapshot yang sudah terisi tidak diubah ketika assignment Qase berubah.
- Result lama dengan tester kosong boleh dibackfill satu kali.
- Detail sync harus mengisi result kosong pada sync yang sama, bukan menunggu sync berikutnya.
- `Unassigned` ikut dihitung dan ditampilkan sebagai PIC tersendiri.

### 7.4 Statistik Environment

Project detail mengembalikan statistik berikut untuk STAGING dan BETA:

```json
{
  "environment": "STAGING",
  "activeRuns": 4,
  "total": 1000,
  "executed": 800,
  "passed": 760,
  "failed": 30,
  "blocked": 10,
  "notRun": 200,
  "progress": 80
}
```

Aturan perhitungan:

- `total` adalah jumlah distinct case dalam environment.
- `executed` adalah case yang sudah memiliki result final atau status eksekusi.
- Case yang muncul pada beberapa platform tidak boleh menggandakan denominator environment.
- Latest result digunakan untuk current progress.
- Semua result attempt digunakan untuk daily execution dan retry history.

### 7.5 Progress per PIC

Response detail menyediakan:

```json
{
  "environment": "BETA",
  "name": "Hani",
  "activeRuns": 2,
  "total": 220,
  "executed": 180,
  "passed": 170,
  "failed": 8,
  "blocked": 2,
  "notRun": 40,
  "progress": 82
}
```

Total per PIC berasal dari field tester sesuai environment, bukan field QA PIC pembuat test case.

## 8. Phase 3 Daily Execution dan Project Detail

### 8.1 API

Gunakan project detail yang dapat menerima filter:

```text
GET /api/v1/projects/:id?from=2026-09-01&to=2026-09-30
```

Default periode adalah 30 hari terakhir.

Project list hanya membawa data summary. Run history, daily execution, assignee progress, dan bug detail dimuat ketika Project Detail dibuka.

### 8.2 Daily Execution

Setiap row berisi:

```text
date
tester
environment
executed
passed
failed
blocked
skipped
retest
in_progress
invalid
cancelled
```

Daily chart menggunakan seluruh result attempt sehingga retry pada hari yang sama tetap terlihat.

### 8.3 Frontend

Project Detail menampilkan:

1. Daily Execution Trend.
2. Detailed Execution History.
3. Execution Progress by Assignee untuk STAGING.
4. Execution Progress by Assignee untuk BETA.
5. Environment summary.
6. Pagination tabel.
7. Empty state yang jelas jika belum ada sync.

## 9. Phase 4 Sinkronisasi Bug Jira

### 9.1 Root Cause

Jumlah bug saat ini dapat lebih kecil daripada Jira karena dashboard membaca Qase defect. Jira issue yang tidak memiliki linkage Qase tidak pernah masuk dashboard.

Jira menjadi sumber utama data bug dashboard.

### 9.2 JQL

Gunakan satu query ekuivalen per registered project:

```text
project = QASE
AND parent = <JIRA_INIT_KEY>
AND (
  (
    status IN (Confirm, "In Progress", Open, "Ready for QA", Resolved, Reopened)
    AND "testing environment[dropdown]" IN (Staging, Beta)
  )
  OR
  (
    status = Invalid
    AND "testing environment[dropdown]" = Staging
  )
)
ORDER BY created DESC
```

Satu query dipilih agar hasil sama dengan tiga query product tanpa melakukan tiga pagination terpisah.

### 9.3 Database

Extend `jira_issues` dengan:

```text
parent_key       varchar
environment      varchar
created_at       timestamptz
active           boolean not null default true
sync_scope       varchar
```

Field yang disimpan:

- Immutable Jira issue ID.
- Jira key.
- Parent INIT key.
- Dashboard project ID.
- Summary.
- Status.
- Priority.
- Testing environment.
- Creator.
- Reporter.
- Assignee.
- Created dan updated timestamp.

Setelah pagination lengkap, issue lama yang tidak lagi masuk JQL ditandai `active=false`.

### 9.4 Jira Custom Field

Testing Environment field dijadikan runtime configuration:

```text
JIRA_TESTING_ENV_FIELD_ID=customfield_10185
```

Connector harus meminta field yang sama dengan field yang di-unmarshal. Hard-coded mismatch antara field request dan response model harus dihapus.

### 9.5 API

```text
GET /api/v1/bugs
  ?projectId=<id>
  &environment=STAGING|BETA
  &reporter=<name>
  &status=<status>
  &priority=<priority>
  &q=<search>
  &page=1
  &pageSize=20
```

Pagination dilakukan di database, bukan setelah seluruh data dikirim ke FE.

### 9.6 Threshold

```text
thresholdExceeded = betaBugCount > stagingBugCount * 0.30
```

Edge case:

- STAGING `0`, BETA `0` -> false.
- STAGING `0`, BETA lebih dari `0` -> true.
- Tepat `30%` -> false karena product meminta melebihi 30%.

### 9.7 Frontend

- Filter All, Staging, dan Beta.
- Group by reporter.
- Tampilkan subtotal setiap reporter.
- Tampilkan reporter dan owner sebagai kolom terpisah.
- Direct link menggunakan `https://gli.atlassian.net/browse/{key}`.
- Link dibuka dengan `target="_blank"` dan `rel="noopener"`.
- Invalid ditampilkan sebagai canceled/invalid, bukan active defect.

## 10. Phase 5 QA Portfolio dan Current Activity

### 10.1 Jira Source

Ambil seluruh active INIT dalam satu query:

```text
project = INIT
AND status NOT IN (Cancel, Done, Postponed, Backlog)
AND "QAs[User Picker (multiple users)]" IS NOT EMPTY
ORDER BY created DESC
```

Jira QAs custom field dijadikan runtime configuration:

```text
JIRA_QAS_FIELD_ID=customfield_xxxxx
```

### 10.2 Database

Tambahkan tabel:

```text
project_qa_assignments
- project_id uuid
- jira_account_id varchar
- member_id uuid nullable
- active boolean
- synced_at timestamptz
- primary key (project_id, jira_account_id)
```

`jira_account_id` dicocokkan dengan `members.jira_account_id`.

Assignment yang tidak memiliki member mapping tetap disimpan agar tidak hilang. FE dapat menampilkan Jira display name dan memberi indikator belum terdaftar.

### 10.3 Definisi Portfolio

- Active Projects: project Jira assigned dengan status tidak termasuk daftar excluded.
- Total Projects: seluruh project Jira yang pernah tersinkron untuk PIC.
- Project List: daftar active project assigned.
- Next Project: project assigned dengan `staging_start_at` terdekat dan belum lewat.
- Qase Current Activity: execution dari snapshot tester Qase untuk periode filter.

### 10.4 API Response

```json
{
  "id": "member-id",
  "name": "Amalia",
  "activeProjects": 3,
  "totalProjects": 5,
  "nextProject": {
    "id": "project-id",
    "key": "INIT-700",
    "name": "Payment Revamp",
    "stagingStartAt": "2026-10-01T00:00:00Z"
  },
  "projects": [],
  "qaseExecutions": 432,
  "dailyExecutions": []
}
```

Frontend tidak lagi menghitung portfolio dari `qaOwner` atau daftar tester run.

## 11. Phase 6 QA Documentation Tracking

### 11.1 Database

Tambahkan tabel:

```text
qa_documents
- id uuid primary key
- project_id uuid references projects(id)
- document_type varchar
- title varchar
- direct_url text
- owner_member_id uuid references members(id)
- status varchar
- created_at timestamptz
- updated_at timestamptz
```

Status yang diperbolehkan:

```text
Draft
In Review
Approved
Stalled
```

Document type awal:

```text
Test Strategy
Test Plan
Test Cases
SOP
Release Notes
Other
```

### 11.2 API

```text
GET    /api/v1/documents
POST   /api/v1/documents
PATCH  /api/v1/documents/:id
DELETE /api/v1/documents/:id
```

Filter GET:

```text
projectId
documentType
ownerId
status
q
page
pageSize
```

Validasi:

- Project wajib valid.
- Title wajib diisi.
- Owner wajib berasal dari QA member aktif.
- Direct URL hanya menerima `http` atau `https`.
- Mutation menggunakan manager authorization.

### 11.3 Frontend

Tambahkan:

- Route `/documentation`.
- Menu `QA Documentation Tracking`.
- Tombol Add New Document.
- Form create dan edit.
- Filter project, document type, owner, dan status.
- Tabel dengan direct URL yang dapat diklik.
- Pagination dan empty state.
- Konfirmasi sebelum delete.

## 12. API Contract Summary

| Method | Endpoint | Perubahan |
| --- | --- | --- |
| `GET` | `/api/v1/projects` | Summary project dan metadata size/MTTT |
| `GET` | `/api/v1/projects/:id` | Detail environment, PIC, run, dan history |
| `POST` | `/api/v1/projects` | Tambah size dan MTTT |
| `GET` | `/api/v1/workload` | Portfolio Jira dan execution Qase |
| `GET` | `/api/v1/bugs` | Bug Jira lengkap dengan server pagination |
| `GET` | `/api/v1/documents` | Daftar dokumentasi |
| `POST` | `/api/v1/documents` | Tambah dokumentasi |
| `PATCH` | `/api/v1/documents/:id` | Edit dokumentasi |
| `DELETE` | `/api/v1/documents/:id` | Hapus dokumentasi |
| `POST` | `/api/v1/sync-jobs` | Sync Jira dan Qase |

## 13. Perubahan File Backend

| File atau Area | Perubahan |
| --- | --- |
| `internal/repository/monitoring.go` | Project metadata, atribusi tester, environment stats, bug query, workload query |
| `internal/monitoring/worker.go` | Qase attribution, result backfill, Jira bug sync, QA assignment sync |
| `internal/monitoring/connector.go` | Jira fields, JQL pagination, configurable custom fields |
| `internal/monitoring/http.go` | Project, bugs, workload contract |
| `internal/repository/documentation.go` | Model dan query dokumentasi baru |
| `internal/monitoring/documentation_http.go` | Handler dokumentasi baru |
| `cmd/main.go` | Registration dependency dan migration configuration |
| `migrations/` | SQL migration additive dan index |

Fitur baru Documentation ditempatkan pada file baru. Logic monitoring yang sudah ada tidak dipindahkan hanya untuk refactor.

## 14. Perubahan File Frontend

| File atau Area | Perubahan |
| --- | --- |
| `src/app/core/dashboard-api.service.ts` | DTO dan endpoint baru |
| `src/app/core/dashboard.models.ts` | Project metadata, assignee stats, dan portfolio model |
| `src/app/core/live-dashboard.store.ts` | Project detail lazy load dan document state |
| `src/app/core/dashboard-state.ts` | Adapter response dan UI selector |
| `src/app/shared/live-dashboard/live-dashboard.html` | Form project size dan MTTT |
| `src/app/pages/projects/projects.html` | Project metadata dan environment statistics |
| `src/app/shared/dashboard-dialogs/dashboard-dialogs.html` | Daily execution, assignee progress, bug grouping |
| `src/app/pages/workload/` | Jira portfolio dan Qase current activity |
| `src/app/pages/bugs/` | Server-side filter dan pagination |
| `src/app/pages/documentation/` | Halaman Documentation Tracking baru |
| `src/app/app.routes.ts` | Route documentation |
| `src/app/app.html` | Navigation documentation |

## 15. Index Database

Tambahkan index minimal berikut:

```text
qase_results(project_code, run_id, ended_at)
qase_results(project_code, tester_name, ended_at)
qase_run_cases(project_code, run_id, case_id)
qase_cases(project_code, case_id)
jira_issues(project_id, active, environment, created_at)
jira_issues(parent_key, active)
project_qa_assignments(member_id, active)
qa_documents(project_id, status, updated_at)
qa_documents(owner_member_id, status)
```

Index baru dikonfirmasi menggunakan `EXPLAIN ANALYZE` terhadap data staging sebelum production rollout.

## 16. Testing Plan

### 16.1 Backend Unit Test

Table-driven test wajib mencakup:

1. STG iOS memakai QA Tester iOS.
2. STG Android dan AOS memakai QA Tester Android.
3. STG general memakai QA Tester.
4. BETA semua platform memakai Beta Tester.
5. Tester kosong menjadi Unassigned.
6. Run tanpa prefix STG/BETA diabaikan.
7. Historical tester tidak berubah setelah Qase assignment berubah.
8. Shared case lintas platform tidak menggandakan denominator.
9. Threshold tepat 30% tidak merah.
10. Threshold lebih dari 30% merah.
11. Jira pagination tidak kehilangan issue.
12. Full reconciliation menonaktifkan issue yang sudah keluar dari JQL.
13. Invalid hanya masuk canceled/invalid count.
14. Documentation URL menolak scheme selain HTTP/HTTPS.

### 16.2 Backend Integration Test

- Jalankan query agregasi terhadap PostgreSQL, bukan hanya SQLite.
- Verifikasi unique constraint dan foreign key.
- Verifikasi rollback transaction ketika pagination atau persistence gagal.
- Verifikasi query plan untuk project dengan result besar.

### 16.3 Frontend Test

- Project form mengirim size dan MTTT.
- Card memformat MTTT dengan benar.
- BETA menampilkan Beta Tester.
- Unassigned muncul di chart dan tabel.
- Bug filter mengirim query parameter yang tepat.
- Jira link memiliki keamanan tab eksternal.
- Reporter grouping dan subtotal benar.
- Documentation create, edit, filter, dan delete.
- Loading, error, empty, dan stale state.

### 16.4 Product Reconciliation

Untuk satu project pilot:

1. Bandingkan jumlah run Qase dengan database.
2. Bandingkan total STAGING dan BETA per PIC.
3. Bandingkan daily execution per tanggal.
4. Bandingkan `Unassigned` dengan case tanpa tester.
5. Jalankan JQL product langsung di Jira.
6. Pastikan total dashboard sama dengan hasil Jira.
7. Verifikasi reporter grouping dan direct link.
8. Verifikasi QA portfolio terhadap field Jira QAs.

## 17. Deployment Plan

### Release A Dashboard Correctness

1. Apply additive database migration.
2. Deploy backend yang kompatibel dengan FE lama.
3. Jalankan full Jira dan Qase resync.
4. Jalankan reconciliation pada satu project pilot.
5. Deploy frontend project, bug, dan workload.
6. Lakukan UAT.

### Release B Documentation Tracking

1. Apply tabel `qa_documents`.
2. Deploy backend documentation API.
3. Deploy frontend Documentation Tracking.
4. Lakukan CRUD dan permission UAT.

### Rollback

- Rollback aplikasi ke versi sebelumnya.
- Kolom dan tabel additive tidak langsung dihapus.
- Snapshot Jira/Qase lama dipertahankan.
- Destructive schema rollback hanya dilakukan setelah data diverifikasi tidak diperlukan.

## 18. Acceptance Criteria

- Project size dan MTTT tersimpan dan tetap ada setelah refresh.
- MTTT tidak lagi dihitung dari run duration.
- Hanya run STG dan BETA yang masuk dashboard.
- STG memilih tester sesuai platform.
- BETA selalu menggunakan Beta Tester.
- Tester kosong muncul sebagai Unassigned.
- Project environment progress tidak melebihi 100% karena duplicate case.
- Daily execution menampilkan retries dan status lengkap.
- Jumlah bug dashboard sama dengan hasil JQL Jira.
- Threshold merah hanya jika Beta lebih dari 30% Staging.
- Bug dapat difilter dan digroup berdasarkan reporter.
- Direct Jira link membuka issue yang benar.
- QA portfolio berasal dari Jira QAs field.
- Documentation Tracking mendukung create, read, update, delete, filter, dan direct URL.
- FE tidak memanggil Jira atau Qase secara langsung.
- Sync failure tidak menghapus snapshot valid sebelumnya.

## 19. Keputusan yang Harus Dikunci

Sebelum implementasi dimulai, product dan engineering perlu mengunci:

1. Apakah label `4L` dan `5L` benar atau seharusnya `4XL` dan `5XL`.
2. Apakah MTTT memang terpisah untuk STAGING dan BETA.
3. Jira custom field ID untuk Testing Environment.
4. Jira custom field ID untuk QAs.
5. Apakah satu dashboard project selalu menggunakan satu parent INIT Jira.
6. Default periode Daily Execution, dengan rekomendasi 30 hari.
7. Apakah delete dokumentasi berupa hard delete atau soft delete. Rekomendasi: soft delete untuk audit.

## 20. Estimasi

| Pekerjaan | Estimasi |
| --- | --- |
| Database migration dan metadata project | 1–2 hari |
| Qase attribution dan environment statistics | 2–3 hari |
| Jira bug synchronization | 2 hari |
| QA portfolio | 1–2 hari |
| Frontend project, bug, dan workload | 2–3 hari |
| Documentation Tracking | 1–2 hari |
| Reconciliation, UAT, dan production rollout | 1–2 hari |

Total estimasi: 10–16 hari kerja engineering, tidak termasuk waktu tunggu credential, konfirmasi custom field Jira, dan product UAT.
