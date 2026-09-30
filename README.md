# Gajihub Integration Layer

> **Platform Sentralisasi dan Integrasi Pengelolaan Belanja Pegawai**  
> *Kementerian Ketenagakerjaan Republik Indonesia*  
> 🌐 **Portal Resmi:** [https://gajihub.kemnaker.go.id/](https://gajihub.kemnaker.go.id/)

Gajihub Integration Layer adalah platform integrasi terpadu untuk pengelolaan, kalkulasi, rekonsiliasi, dan digitalisasi alur persetujuan belanja pegawai (Tunjangan Kinerja, Uang Makan, Uang Lembur, dan Gaji Induk) di lingkungan Kementerian Ketenagakerjaan RI.

Sistem ini dapat diakses secara resmi melalui [https://gajihub.kemnaker.go.id/](https://gajihub.kemnaker.go.id/) dan menerapkan prinsip **"Integrate, Don't Replace"** — menghubungkan sistem-sistem *source of truth* yang sudah ada tanpa menduplikasi basis data secara tidak perlu.

---

## 📑 Daftar Isi

- [Arsitektur & Integrasi Sistem](#-arsitektur--integrasi-sistem)
- [Fitur Utama](#-fitur-utama)
- [Matriks Peran & Hak Akses (RBAC)](#-matriks-peran--hak-akses-rbac)
- [Teknologi yang Digunakan](#-teknologi-yang-digunakan)
- [Struktur Direktori](#-struktur-direktori)
- [Panduan Instalasi & Setup](#-panduan-instalasi--setup)
- [Konfigurasi Environment (.env)](#-konfigurasi-environment-env)
- [Sinkronisasi Data & Background Jobs](#-sinkronisasi-data--background-jobs)
- [Pengujian & Verifikasi Kualitas](#-pengujian--verifikasi-kualitas)
- [Keamanan & Kepatuhan](#-keamanan--kepatuhan)

---

## 🏛 Arsitektur & Integrasi Sistem

Gajihub bertindak sebagai lapisan orkestrasi dan validasi bisnis yang membaca data secara **Read-Only** dari sistem-sistem sumber:

```
                  +----------------------------------------------+
                  |               SUMBER DATA ASLI               |
                  +----------------------------------------------+
                  |  - SIAP (MS SQL Server)    : Data Pegawai    |
                  |  - e-Presensi (PostgreSQL) : Presensi & Cuti |
                  |  - e-Kinerja BKN           : Predikat        |
                  |  - GPP / SAKTI Kemenkeu    : Gaji Induk      |
                  +----------------------------------------------+
                                         │ (Read-Only)
                                         ▼
+─────────────────────────────────────────────────────────────────────────────────+
|                           GAJIHUB INTEGRATION LAYER                             |
|                                                                                 |
|  [ Business Logic Engine ]     [ Validation Gate ]     [ Digital Approval Log ] |
|  - Permenaker 15/2024          - Deteksi Anomali       - Kasubag TU (Unit)      |
|  - Kepsekjen 82/2025           - Threshold Potongan    - OSDMA (Biro OSDMA)     |
|  - SBM 2026 (UM & Lembur)      - Kunci Periode         - PPABP (Biro Keuangan)  |
|                                                                                 |
|  [ Database Gajihub (PostgreSQL) ]                                              |
|  - Kalkulasi Tukin, UM, Lembur, Rekonsiliasi, ADK, SK KGB/Hukdis, Audit Trail   |
+─────────────────────────────────────────────────────────────────────────────────+
                                         │
                                         ▼
+─────────────────────────────────────────────────────────────────────────────────+
|                                OUTPUT SISTEM                                    |
|  - Dashboard Interaktif per Role (Pegawai, Kasubag TU, OSDMA, PPABP, Pimpinan)  |
|  - Berkas ADK (Arsip Data Komputer) & Rekap Excel Siap Upload ke SAKTI/GPP      |
|  - Slip Gaji Digital Pegawai & Rekonsiliasi Lintas Unit                         |
+─────────────────────────────────────────────────────────────────────────────────+
```

---

## ✨ Fitur Utama

### 1. Kalkulasi Payroll Otomatis Berbasis Regulasi
* **Tunjangan Kinerja (Tukin):**
  * Komponen Kinerja (bobot 70%) berdasarkan integrasi Predikat e-Kinerja BKN (*Kepsekjen No. 82 Tahun 2025*).
  * Komponen Kehadiran (bobot 30%) dikurangi potongan menit keterlambatan, pulang cepat, meninggalkan kantor, upacara bendera, dan jenis cuti (*Permenaker No. 15 Tahun 2024* Pasal 9, 10, 13, 14).
* **Uang Makan Pegawai:**
  * Perhitungan otomatis berdasarkan hari kerja hadir/dibayar (*Standar Biaya Masukan / SBM 2026*).
* **Uang Lembur & Uang Makan Lembur:**
  * Perhitungan jam lembur hari kerja vs hari libur dan uang makan lembur (lembur $\ge$ 2 jam).
* **Basis Data Gaji Induk:**
  * Rekonsiliasi data pembayaran gaji pokok, tunjangan keluarga, dan potongan pajak.

### 2. Digital Approval Workflow Berjenjang
* Menggantikan nota dinas fisik dengan jejak digital berjenjang (*DRAFT* $\rightarrow$ *Verifikasi Kasubag TU* $\rightarrow$ *Approval OSDMA/Pimpinan* $\rightarrow$ *Validasi PPABP*).
* Dilengkapi *Validation Gate* untuk mendeteksi anomali perhitungan sebelum berkas disetujui.

### 3. Ekspor ADK (Arsip Data Komputer) & Laporan
* Pembuatan berkas ADK resmi untuk Tukin, Uang Makan, dan Uang Lembur format SAKTI / GPP.
* Ekspor laporan rekapitulasi unit kerja format Excel lengkap dengan rekapitulasi pajak.

### 4. Pengelolaan Layanan & Sanggahan Kepegawaian
* **Kendala e-Presensi (Pasal 10 ayat 2):** Penandaan tanggal kendala server absensi untuk membatalkan potongan massal yang tidak sah.
* **Verifikasi Sanggahan / Banding Presensi:** Alur pengajuan bukti dukung oleh pegawai dan verifikasi unit.
* **Pengelolaan SK KGB & SK Hukuman Disiplin:** Pencatatan perubahan masa kerja, kenaikan gaji berkala, serta penyesuaian kelas jabatan akibat hukuman disiplin.
* **Daftar Perubahan Data Pegawai:** Deteksi mutasi unit, pergeseran kelas jabatan (*grade*), dan perubahan status kepegawaian.

---

## 👥 Matriks Peran & Hak Akses (RBAC)

Aplikasi menerapkan sistem hak akses berbasis peran (*Role-Based Access Control*):

| Role | Cakupan Wilayah | Fitur & Tanggung Jawab Utama |
|---|---|---|
| `PEGAWAI` | Mandiri (Self-Service) | Melihat data pribadi, rincian slip gaji, presensi harian, dan mengajukan sanggahan/banding presensi. |
| `KASUBAG_TU` | Unit Kerja Sendiri | Dashboard unit, kalkulasi massal unit, verifikasi banding presensi, pengajuan SK KGB & SK Hukdis unit. |
| `OSDMA` | Biro OSDMA (Lintas Unit) | Approval final banding presensi, persetujuan SK KGB/Hukdis, monitoring data kepegawaian kementerian. |
| `PPABP` | Biro Keuangan (Lintas Unit) | Validasi payroll lintas unit, rekonsiliasi data, ekspor ADK SAKTI/GPP, monitoring pagu & realisasi anggaran. |
| `PIMPINAN` | Eksekutif Kementerian | Dashboard eksekutif lintas unit kerja (*Read-Only*) untuk monitoring capaian dan realisasi belanja pegawai. |
| `ADMIN` | Sistem & Teknis | Pengelolaan *role assignment*, pemantauan audit trail, sinkronisasi data SIAP, dan konfigurasi adapter sistem. |

---

## 🛠 Teknologi yang Digunakan

* **Framework:** [Next.js 16 (App Router)](https://nextjs.org/) dengan [React 19](https://react.dev/)
* **Bahasa Pemrograman:** [TypeScript 5](https://www.typescriptlang.org/) (Strict Mode)
* **Styling:** [Tailwind CSS 4](https://tailwindcss.com/) dengan Google Font *Plus Jakarta Sans* & *JetBrains Mono*
* **Database Utama:** [PostgreSQL 16](https://www.postgresql.org/) dengan [Prisma ORM 5](https://www.prisma.io/)
* **Integrasi Database Sumber:**
  * `mssql` (TDS Protocol) untuk koneksi ke SIAP (Microsoft SQL Server)
  * `pg` untuk koneksi ke e-Presensi (PostgreSQL)
* **Pengolahan Berkas:** `exceljs`, `xlsx`, `unpdf`
* **Keamanan:** Autentikasi sesi terenkripsi, Naco SSO (OAuth 2.0 PKCE/Auth Code), HTTP Security Headers, CSRF protection.
* **Pengujian:** [Vitest](https://vitest.dev/) (1.000+ unit & integration test cases)

---

## 📁 Struktur Direktori

```
gajihub/
├── prisma/
│   └── schema.prisma           # Skema basis data inti Gajihub (PostgreSQL)
├── public/
│   ├── .well-known/            # security.txt dan metadata publik
│   └── ...                     # Aset statis & logo
├── scripts/
│   └── sync-harian.sh          # Shell script otomatisasi cronjob sinkronisasi
├── src/
│   ├── adapters/               # Adapter koneksi ke SIAP, e-Presensi, e-Kinerja, Web Gaji
│   ├── app/                    # Next.js App Router (Halaman & Server Actions per role)
│   │   ├── admin/              # Dashboard Admin, Role Assignment, Sistem
│   │   ├── api/                # Route Handlers & REST API internal
│   │   ├── kasubag/            # Dashboard Unit & Layanan Kasubag TU
│   │   ├── login/              # Form Login NIP & Integrasi Naco SSO
│   │   ├── osdma/              # Dashboard Biro OSDMA & Verifikasi SK
│   │   ├── pegawai/            # Master Data Pegawai & Status Kepegawaian
│   │   ├── pimpinan/           # Dashboard Eksekutif Pimpinan
│   │   ├── ppabp/              # Dashboard PPABP, Rekonsiliasi, ADK, Anggaran
│   │   ├── saya/               # Portal Layanan Mandiri Pegawai (Self-Service)
│   │   └── tukin/              # Dashboard Tukin, Presensi, Predikat Kinerja
│   ├── approval/               # Engine evaluasi approval berjenjang digital
│   ├── auth/                   # Autentikasi sesi, RBAC permissions, dan Naco SSO
│   ├── business-logic/         # Pure functions kalkulasi Tukin, UM, Lembur, SBM
│   ├── db/                     # Helper koneksi database & audit logging
│   ├── jobs/                   # Scheduler & job runner sinkronisasi data
│   ├── lib/                    # Prisma client singleton & utilities
│   ├── types/                  # Definisi TypeScript domain types
│   ├── validation/             # Validation gate anomali data sebelum approval
│   └── middleware.ts           # Route protection & session guard
├── next.config.mjs             # Konfigurasi Next.js & HTTP Security Headers
├── package.json                # Dependencies & scripts npm
└── tsconfig.json               # Konfigurasi TypeScript compiler
```

---

## 🚀 Panduan Instalasi & Setup

### 1. Prasyarat Sistem
* **Node.js:** Versi `>= 20.x`
* **npm:** Versi `>= 10.x`
* **PostgreSQL:** Versi `>= 15.x` (sebagai database utama Gajihub)
* Akses jaringan ke server SIAP (SQL Server) dan e-Presensi (PostgreSQL)

### 2. Instalasi Dependencies
Clone repositori dan pasang dependensi:

```bash
git clone <url-repositori-gajihub>
cd gajihub
npm install
```

### 3. Konfigurasi Environment
Salin berkas template environment dan sesuaikan konfigurasinya:

```bash
cp .env.example .env
```

*(Lihat bagian [Konfigurasi Environment](#-konfigurasi-environment-env) untuk rincian variabel).*

### 4. Setup Basis Data
Jalankan migrasi database Prisma untuk membuat tabel-tabel sistem:

```bash
# Menjalankan migrasi database
npm run prisma:migrate

# Generate Prisma Client
npm run prisma:generate
```

### 5. Menjalankan Aplikasi
* **Mode Pengembangan (Development):**
  ```bash
  npm run dev
  ```
  Buka [http://localhost:3000](http://localhost:3000) di browser.

* **Mode Produksi (Production):**
  ```bash
  npm run build
  npm run start
  ```
  Di server produksi, aplikasi berjalan di balik reverse proxy / WAF dan diakses melalui [https://gajihub.kemnaker.go.id/](https://gajihub.kemnaker.go.id/).

---

## ⚙️ Konfigurasi Environment (.env)

Berikut adalah daftar variabel konfigurasi yang digunakan aplikasi:

| Variabel | Deskripsi | Contoh / Catatan |
|---|---|---|
| `DATABASE_URL` | Koneksi basis data PostgreSQL milik Gajihub | `postgresql://user:pass@localhost:5432/gajihub?schema=public` |
| `SESSION_SECRET` | Kunci enkripsi sesi (32 byte hex) | Generate dengan: `openssl rand -hex 32` |
| `COOKIE_SECURE` | Flag keamanan cookie HTTPS | Set `"true"` di server production HTTPS, `"false"` di lokal HTTP |
| `SIAP_HOST` | Host server SIAP Kemnaker (SQL Server) | IP Server SIAP (Koneksi **Read-Only**) |
| `SIAP_INSTANCE` | Instance name SQL Server SIAP | `MSSQLDEV` |
| `SIAP_DB` | Nama database SIAP Kemnaker | `simpeg_kemnaker_...` |
| `SIAP_USER` | Username database SIAP | Akun read-only SIAP |
| `SIAP_PASSWORD` | Password database SIAP | Gunakan tanda kutip jika memuat karakter khusus |
| `SIAP_ENCRYPT` | Enkripsi koneksi TDS SIAP | `"false"` jika server SIAP menggunakan TLS legacy |
| `EPRESENSI_HOST` | Host server e-Presensi Kemnaker | IP Server e-Presensi (Koneksi **Read-Only**) |
| `EPRESENSI_PORT` | Port server e-Presensi | `4020` |
| `EPRESENSI_DB` | Nama database e-Presensi | `presensi_kemnaker` |
| `EPRESENSI_USER` | Username database e-Presensi | Akun read-only e-Presensi |
| `EPRESENSI_PASSWORD`| Password database e-Presensi | Password akun e-Presensi |
| `NACO_BASE_URL` | Base URL server Naco SSO | `https://account.kemnaker.go.id` |
| `NACO_CLIENT_ID` | OAuth2 Client ID Naco SSO | ID aplikasi dari Pusdatik |
| `NACO_CLIENT_SECRET`| OAuth2 Client Secret Naco SSO | Secret aplikasi dari Pusdatik |
| `NACO_REDIRECT_URI` | Callback URL OAuth2 Naco SSO | `https://gajihub.kemnaker.go.id/login/sso/callback` |

---

## 🔄 Sinkronisasi Data & Background Jobs

Sinkronisasi data kepegawaian dan kehadiran dapat dijalankan melalui CLI ataupun terjadwal via cronjob:

### 1. Sinkronisasi Data Pegawai dari SIAP
Menarik seluruh perubahan data kepegawaian (status aktif/pensiun, mutasi satker, jabatan, dan kelas jabatan):

```bash
# Preview perubahan tanpa menyimpan (Dry Run)
npm run sync:pegawai -- --dry-run

# Eksekusi sinkronisasi data pegawai
npm run sync:pegawai
```

### 2. Sinkronisasi Data Presensi dari e-Presensi
Menarik data absensi harian dan rekap cuti untuk periode tertentu:

```bash
# Sinkronisasi presensi bulan berjalan
npm run sync:presensi -- --bulan=7 --tahun=2026 --oleh=SYSTEM
```

### 3. Otomatisasi via Cronjob (Server Production)
Gunakan skrip [`scripts/sync-harian.sh`](file:///d:/Sakeh/Project/gajihub/scripts/sync-harian.sh) untuk menjalankan sinkronisasi harian secara otomatis.

Contoh konfigurasi `crontab` server (dijalankan setiap pukul 02.00 dini hari):

```bash
0 2 * * * GAJIHUB_SYNC_NIP=198703232015031002 /path/to/gajihub/scripts/sync-harian.sh >> /path/to/gajihub/log-sync/cron.log 2>&1
```

---

## 🧪 Pengujian & Verifikasi Kualitas

Seluruh modul kalkulasi regulasi, approval digital, validation gate, dan sesi dilindungi oleh rangkaian pengujian unit otomatis (*1.000+ test cases*):

```bash
# Menjalankan seluruh test suite dengan Vitest
npm test

# Menjalankan pengujian dalam mode watch
npm run test:watch

# Memeriksa kepatuhan tipe TypeScript
npm run typecheck
```

---

## 🛡 Keamanan & Kepatuhan

1. **Prinsip Read-Only pada Sistem Eksternal:** Aplikasi tidak memiliki hak tulis (*Write*) ke database SIAP maupun e-Presensi. Seluruh manipulasi data hanya dilakukan pada database internal Gajihub.
2. **Audit Trail Komprehensif:** Setiap aksi perubahan data, approval, eksekusi role, dan pengunggahan berkas dicatat ke tabel `audit_trail` lengkap dengan identitas aktor dan timestamp.
3. **Proteksi Header & Sesi:**
   * Konfigurasi HTTP Security Headers (`HSTS`, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`).
   * Validasi header `Origin` bawaan Server Actions untuk proteksi CSRF.
   * Header `X-Powered-By` dinonaktifkan untuk mencegah *information disclosure*.
   * Berkas pelaporan kerentanan standar tersedia pada [`public/.well-known/security.txt`](file:///d:/Sakeh/Project/gajihub/public/.well-known/security.txt).

---

## 📄 Lisensi & Hak Cipta

Hak Cipta &copy; 2026 **Kementerian Ketenagakerjaan Republik Indonesia**.  
Dikelola oleh Biro Keuangan dan Barang Milik Negara bekerja sama dengan Pusat Data dan Teknologi Informasi Ketenagakerjaan (Pusdatik).
