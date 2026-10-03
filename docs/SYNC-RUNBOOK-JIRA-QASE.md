# Runbook integrasi Jira dan Qase

**Status:** Go worker dan API sudah dibuat; belum ada koneksi nyata ke tenant Jira/Qase karena URL Jira dan mapping INIT↔Qase/bug belum diberikan. Token tidak disimpan di repo. Dokumen induk: [BACKEND-MVP-GO.md](./BACKEND-MVP-GO.md). Rincian konfigurasi yang benar-benar tersedia ada di [README BE](../../ms-monitoring-qa-be/README.md).

## 1. Kapan API eksternal dipanggil

| Pemicu                  | Waktu                                                  | Yang dilakukan                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proyek baru didaftarkan | Setelah `POST /api/v1/projects` berhasil               | Validasi INIT Jira dan kode/scope Qase, kemudian jadwalkan backfill proyek itu. UI menerima status `pending_validation`; request browser tidak menunggu impor. |
| Backfill awal           | Sekali per proyek/scope, berjalan di worker            | Ambil semua data historis dalam jendela yang disepakati, halaman demi halaman. Terbitkan snapshot awal setelah rekonsiliasi.                                   |
| Sync terjadwal          | 08:00 dan 17:00 `Asia/Jakarta`                    | Worker membuat job dan melakukan scan sumber penuh secara idempoten selama incremental belum diverifikasi.                                                    |
| Tombol **Sync data**    | Kapan pun manajer meminta                          | Enqueue job yang memakai worker dan aturan yang sama. `202 Accepted` berarti antre, bukan data sudah segar.                                                    |
| Recovery                | Setelah job gagal atau worker mati                     | Ulangi dari checkpoint aman; upsert idempoten membuat halaman yang sudah ditulis tidak menjadi duplikat.                                                       |

FE hanya memanggil Go API. Dashboard GET membaca PostgreSQL dan menampilkan `asOf` serta freshness; tidak memanggil Jira/Qase saat halaman dibuka. Jadwal di atas keputusan produk, bukan batasan API vendor.

## 2. Akses yang dibutuhkan

### Qase

Token Anda cukup untuk **mencoba koneksi baca** jika role pemilik token dapat membaca proyek target. Backend memerlukan token lewat secret manager/env runtime `QASE_API_TOKEN`, kode proyek Qase (misalnya `PAY`), dan keputusan scope: semua run proyek atau hanya run/suite yang dipetakan ke INIT. Qase mensyaratkan HTTPS dan header `Token: API_TOKEN`; token mewarisi hak akses role dan kuota berlaku per workspace. Jangan tempel token di Angular, dokumen, log, atau Git. Untuk integrasi jangka panjang, pertimbangkan token khusus integrasi dengan hak baca minimum jika tersedia di workspace. [Qase API introduction](https://developers.qase.io/v2.0/reference/introduction-to-the-qase-api), [token guidance](https://developers.qase.io/docs/prerequisites).

Contoh uji koneksi dari lingkungan backend (nilai dalam tanda `<...>` adalah placeholder):

```http
GET https://api.qase.io/v1/project/PAY
Accept: application/json
Token: <QASE_API_TOKEN>
```

Pastikan respons `200` dan kode proyek benar sebelum mengaktifkan backfill. Jika tenant memakai host Enterprise khusus, konfirmasi host API dengan admin Qase sebelum menetapkan base URL. [Get project by code](https://developers.qase.io/reference/get-project).

### Jira Cloud

Implementasi sekarang memakai Jira Cloud **Basic auth** dengan `JIRA_EMAIL` dan `JIRA_API_TOKEN` pada `JIRA_BASE_URL` tenant. Akun tersebut harus mempunyai izin Browse Projects dan issue security yang sesuai. Konfigurasikan `JIRA_ACTIVE_JQL` dari file yang diberikan pengguna sebagai cakupan sementara; query itu membatasi satu akun QA. `JIRA_BUG_JQL` dan aturan kaitan bug ke INIT masih harus diverifikasi. Untuk produksi, service account dengan izin baca minimum lebih tepat dibanding token akun pribadi. [Jira issue search permissions](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/).

Contoh uji koneksi dari backend:

```http
GET https://<JIRA_SITE>.atlassian.net/rest/api/3/myself
Accept: application/json
Authorization: Basic base64(<JIRA_EMAIL>:<JIRA_API_TOKEN>)
```

Setelah itu uji satu INIT yang boleh dibaca. `200` pada `/myself` saja tidak membuktikan izin issue; `401/403/404` pada issue bisa berasal dari scope, role proyek, atau issue security. [Jira myself](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-myself/), [Atlassian service-account troubleshooting](https://support.atlassian.com/user-management/docs/manage-api-tokens-for-service-accounts/).

Jika organisasi memilih OAuth 2.0 atau service token, adapter autentikasi dan URL Jira perlu disesuaikan. Jangan meminta pengguna memasukkan token Jira/Qase ke browser dashboard.

## 3. Endpoint vendor yang dibaca

| Sumber | Request                                                                              | Pemakaian                                                                                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jira   | `GET /rest/api/3/field` atau `/field/search`                                         | Temukan ID custom field sekali saat konfigurasi, jangan tebak `customfield_...`. [Fields](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-fields/).                                                           |
| Jira   | `GET /rest/api/3/issue/{key}?fields=summary,status,issuetype,updated,issuelinks,...` | Validasi INIT dan relasi issue yang benar-benar ada. [Issue links](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-links/).                                                                                   |
| Jira   | `POST /rest/api/3/search/jql`                                                        | Query issue dengan JQL yang disetujui, `fields` minimum, `maxResults`, dan `nextPageToken` sampai `isLast`. [Issue search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/).                          |
| Qase   | `GET /v1/project/{code}`                                                             | Validasi mapping proyek. [Project](https://developers.qase.io/reference/get-project).                                                                                                                                                     |
| Qase   | `GET /v1/case/{code}?limit=100&offset=N`                                             | Katalog case aktif/draft/deprecated sesuai scope. [Cases](https://developers.qase.io/reference/get-cases).                                                                                                                                |
| Qase   | `GET /v1/run/{code}?limit=100&offset=N&include=cases`                                | Daftar run dan, bila respons tenant memuatnya, ID case dalam run. Filter `from_start_time`/`to_start_time` tersedia untuk backfill berjangka. [Runs](https://developers.qase.io/reference/get-runs).                                      |
| Qase   | `GET /v1/run/{code}/{runId}?include=cases`                                           | Ambil detail/membership run jika daftar tidak memuat cukup informasi. [Run detail](https://developers.qase.io/reference/get-run).                                                                                                         |
| Qase   | `GET /v1/result/{code}?limit=100&offset=N`                                           | Hasil eksekusi seluruh proyek untuk backfill; filter `run={runId}` dipakai untuk scope sempit/perbaikan. `from_end_time` tersedia untuk incremental yang sudah diverifikasi. [Results](https://developers.qase.io/reference/get-results). |

Jira Cloud `search/jql` mengembalikan `nextPageToken`/`isLast`; jangan memakai offset lama untuk endpoint itu. Qase list di atas memakai `limit` 1–100 dan `offset` 0–100000; jangan menganggap satu request memuat semua data. Rute Qase v1 di sini khusus **read/import**, bukan API untuk menulis hasil test.

Contoh bentuk request Jira (field custom dan JQL harus diganti hasil verifikasi):

```http
POST https://<JIRA_SITE>.atlassian.net/rest/api/3/search/jql
Authorization: Basic base64(<JIRA_EMAIL>:<JIRA_API_TOKEN>)
Content-Type: application/json

{"jql":"<APPROVED_JQL>","fields":["summary","status","issuetype","updated","creator","reporter","assignee","issuelinks","<SEVERITY_FIELD_ID>"],"maxResults":100}
```

Untuk halaman berikutnya kirim JQL dan `nextPageToken` dari respons sebelumnya; berhenti pada `isLast`. Simpan Jira **issue ID** sebagai identitas permanen, issue key sebagai nilai yang dapat berubah. Hubungan bug–INIT harus datang dari issue link atau custom field yang sudah diverifikasi, bukan kecocokan nama. Simpan `creator.accountId`, reporter, dan assignee sebagai konsep terpisah; severity `Unknown` bila field resmi belum tersedia.

## 4. Backfill awal: 500 run atau 500 case

Misal kode Qase `PAY` memiliki 500 run. Daftar run membutuhkan **sekurangnya lima halaman** pada `limit=100`: offset `0`, `100`, `200`, `300`, `400`. Jika yang dimaksud 500 case dalam satu run, katalog case juga perlu lima halaman, sedangkan daftar result perlu lima halaman **hanya bila jumlah result memang 500**. Satu case dapat mempunyai banyak result sepanjang retry dan run berbeda, sehingga jumlah result bisa jauh lebih besar. Mengambil 500 run bukan berarti cukup lima request total: membership/detail run dan result tetap harus diambil sesuai scope. [Qase runs](https://developers.qase.io/reference/get-runs), [cases](https://developers.qase.io/reference/get-cases), [results](https://developers.qase.io/reference/get-results).

Urutan rancangan lengkap untuk satu Qase project/scope (langkah publikasi snapshot dan incremental watermark belum tersedia):

1. Catat job `BACKFILL`, `scope`, jendela waktu awal–akhir, dan cutoff saat mulai. Validasi `GET /v1/project/{code}`.
2. Tarik katalog case per halaman (`limit=100`), upsert dengan kunci `(project_code, case_id)`. Ambil hanya field yang diperlukan dashboard. Jangan simpan attachment, step body, atau komentar bila tidak dipakai.
3. Tarik daftar run per halaman. Jika hasil `include=cases` tidak cukup untuk mengetahui membership, panggil detail run satu per satu untuk run yang dipantau. Upsert `(project_code, run_id)` dan keanggotaan `(project_code, run_id, case_id)`.
4. Jika scope mencakup semua run proyek, tarik **seluruh result proyek sekali** dengan paginasi lalu kelompokkan berdasarkan `run_id`; ini menghindari 500 request result terpisah untuk 500 run. Jika scope hanya beberapa run atau perlu memperbaiki satu run, pakai filter `run={id}`. Upsert setiap result memakai hash/ID stabil dari respons Qase; simpan `run_id`, `case_id`, owner/member ID, status, timestamp, dan konfigurasi/parameter yang relevan. Jangan menyimpulkan `Not Run` dari tidak adanya result sebelum membership run diketahui.
5. Setelah semua halaman dalam jendela selesai, cek duplikat, mapping, jumlah run/case/result yang terbaca, dan waktu sumber terbaru. Tandai baris di luar snapshot rekonsiliasi sebagai inactive hanya jika jendelanya lengkap; jangan menghapus histori.
6. Hitung tabel current result dan agregat harian dari data tersimpan. Terbitkan snapshot baru secara atomik, baru tandai step sukses dan majukan watermark. Jika ada halaman gagal, step gagal/partial, watermark lama tetap, snapshot lama tetap terlihat.

Contoh loop konseptual (bukan kode Go final):

```text
for offset = 0; ; offset += 100 {
    page = GET /v1/run/PAY?limit=100&offset=offset
    validate(page)
    upsertPageInPostgres(page)     // ON CONFLICT; boleh dipanggil ulang
    recordProgress(job, offset, len(page))
    if len(page) < 100 { break }
}
```

Bila halaman terakhir berisi tepat 100 data, lakukan satu request berikutnya untuk memastikan sudah habis, atau gunakan `total` dari respons bila tersedia dan tervalidasi. Jika data berubah saat offset paging, run ulang rentang waktu dengan overlap dan upsert; untuk backfill besar, bagi berdasarkan waktu mulai run/selesai result. Endpoint Qase membatasi offset sampai 100000, jadi jendela waktu wajib dipakai sebelum mencapai batas itu. Validasi semantik waktu dan zona pada respons tenant sebelum memakai `from_end_time` sebagai cursor; dokumentasi menyebut format `Y-m-d H:i:s`, bukan zona waktunya. [Qase results parameters](https://developers.qase.io/reference/get-results).

**Current result** untuk satu `(project_code, run_id, case_id, configuration_key)` adalah result terbaru berdasarkan waktu sumber, dengan ID/hash sebagai tie-breaker deterministik. **Riwayat result tidak ditimpa.** Jika satu run memiliki 500 case namun baru 320 case memiliki result, denominator eksekusi tetap 500 instance yang masuk run; 180 sisanya `Not Run` (selama membership berhasil diimpor). Case yang sama dalam dua run dihitung sebagai dua instance run, tetapi katalog case proyek tetap satu case. Aturan konfigurasi/parameter harus dikonfirmasi dari respons Qase nyata sebelum finalisasi unique key.

## 5. Rancangan incremental sync sesudah backfill

Bagian ini adalah rancangan tahap berikutnya. Worker saat ini mengulang scan penuh yang idempoten pada tiap job. Jangan mengaktifkan filter waktu Qase sampai timezone dan semantik timestamp dari respons tenant diverifikasi; offset Qase yang melampaui 100.000 akan gagal secara eksplisit.

### Qase

- Setiap sync: baca run baru/berubah dalam scope, plus refresh semua run yang masih `in_progress`; ambil result baru dengan `from_end_time` dan overlap aman (rancangan awal 5 menit), lalu upsert berdasarkan identitas hasil. Jangan mengandalkan timestamp saja untuk menghapus run/case yang hilang.
- Run aktif bisa menerima result baru atau koreksi; refresh hasil dan membership run aktif meskipun cursor result tidak memberi perubahan yang diharapkan. Setelah run selesai, refresh sekali lagi untuk menangkap hasil akhir.
- Sync sore: rekonsiliasi katalog case dan daftar run dalam scope; bandingkan hitungan. Penandaan inactive hanya setelah scan lengkap. Backfill tambahan diperlukan jika scope proyek diperluas ke run historis baru.
- Watermark Qase per `(project_code, resource, scope)` maju setelah semua halaman dan write scope selesai; retry mengulang overlap sehingga tidak kehilangan data.

### Jira

- Setiap sync: jalankan JQL perubahan `updated` dari watermark dengan overlap; minta hanya field yang diperlukan; page dengan `nextPageToken`; upsert berdasarkan Jira issue ID.
- Karena search dapat mengalami jeda indeks, sync sore juga baca ulang semua INIT yang dipantau dan bug terkait berdasarkan relasi yang disetujui. Perubahan issue key tidak membuat issue baru.
- Jangan memakai nama QA atau teks ringkasan sebagai penghubung Jira–Qase. Relasi INIT ↔ Qase ditetapkan di `qa_projects`; bug ↔ INIT memakai relasi Jira yang diverifikasi.

Jira dan Qase masing-masing punya step. Jira sukses + Qase gagal menghasilkan job `partial`; respons dashboard menampilkan freshness tiap sumber. Rancangan selanjutnya memberi masing-masing sumber watermark yang aman; sync manual saat ini memakai scan penuh yang sama dengan sync terjadwal.

## 6. PostgreSQL, checkpoint, dan log

Kunci unik minimum:

```sql
UNIQUE (jira_site_id, jira_issue_id)             -- jira_issues
UNIQUE (qase_project_code, case_id)              -- qase_cases
UNIQUE (qase_project_code, run_id)               -- qase_runs
UNIQUE (qase_project_code, run_id, case_id)      -- qase_run_cases
UNIQUE (qase_project_code, result_hash)          -- qase_results, setelah hash diverifikasi
UNIQUE (source, scope_key, resource)             -- sync_cursors
UNIQUE (request_key)                             -- sync_jobs
```

Tambahkan indeks untuk `(project_code, run_id)`, `(project_code, ended_at)`, `(jira_site_id, updated_at)`, dan `(job_id, occurred_at)`. Simpan `source_updated_at`, `fetched_at`, dan `last_seen_job_id` terpisah. Setiap halaman di-upsert dalam transaksi pendek; checkpoint halaman dapat dicatat untuk observabilitas, tetapi **watermark resmi tidak maju** sampai seluruh scope berhasil. Retry boleh mulai dari awal jendela dengan idempotensi, sehingga offset yang bergeser tidak menghilangkan data. Simpan waktu dalam UTC di DB.

`sync_jobs`: trigger, scope, request key, status, actor, waktu mulai/akhir, attempts. `sync_steps`: resource, cursor awal/akhir, pages, fetched/inserted/updated/skipped, status/error code. `sync_events`: timeline append-only, misalnya `QASE_RUN_PAGE_DONE`, `JIRA_RETRY_429`, `SNAPSHOT_PUBLISHED`; pesan singkat disanitasi. `GET /api/v1/sync-jobs` menampilkan riwayat; `GET /api/v1/sync-jobs/{id}` menampilkan detail. Jangan simpan token, Authorization header, deskripsi issue, atau komentar result dalam log sinkronisasi.

## 7. Rate limit, kegagalan, dan verifikasi

Qase memiliki kuota per workspace serta burst window; semua token dalam workspace berbagi kuota. Baca header `RateLimit`/`X-RateLimit-*`; pada `429`, tunggu `Retry-After`. Mulai dengan worker concurrency rendah (misalnya satu Qase project pada satu waktu), lalu naikkan berdasarkan pengukuran. Jira juga mengembalikan `429`/`Retry-After`; hormati header dan retry transient `5xx` dengan batas percobaan serta jitter. `401/403` menghentikan step dan meminta perbaikan kredensial/izin. [Qase limits](https://developers.qase.io/v2.0/reference/introduction-to-the-qase-api), [Jira limits](https://developer.atlassian.com/cloud/jira/platform/rate-limiting/).

Sebelum dashboard live, jalankan satu backfill pada proyek percobaan dan cocokkan: jumlah run, jumlah case di scope, jumlah result per run, latest status per test instance, jumlah bug, dan timestamp terakhir terhadap UI Qase/Jira dengan izin akun yang sama. Simulasikan kegagalan pada halaman keempat dan pastikan retry tidak menggandakan baris, watermark tidak maju, log menjelaskan kegagalan, dan snapshot lama masih bisa dibaca. Uji juga Qase 429, Jira 403, dan restart Redis/worker.

## 8. Data yang masih perlu dikonfirmasi bersama pemilik sumber

- Jira Cloud ID, service account dan izin proyek/issue, token scoped, approved JQL/filter, custom field severity, serta bukti relasi bug ke INIT. Jika dashboard Jira `10105`/gadget `10142` menjadi acuan, minta underlying saved filter/JQL; angka gadget saja tidak cukup.
- Qase project code mana saja, apakah semua run atau subset yang dihitung per INIT, apakah satu run bisa masuk beberapa INIT, dan contoh respons nyata untuk run dengan parameter/configuration serta retry result.
- Batas histori awal (misalnya 6 atau 12 bulan), jam sync yang disetujui, batas stale, dan cara pemetaan identitas QA Jira account ID ↔ Qase member ID ↔ pengguna internal.

Kredensial dan contoh respons dapat diberikan kepada pengembang melalui kanal rahasia organisasi; tidak perlu dimasukkan ke repo atau percakapan ini.
