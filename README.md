# Gajihub Integration Layer

Prototipe integrasi Gajihub - pipeline lengkap (kalkulasi -> validasi -> job
scheduler -> approval digital -> dashboard) buat Tukin, Uang Makan, dan Uang
Lembur, plus login sementara khusus approver. Masih pakai data mock, belum
terhubung ke SIAP/e-Presensi/e-Kinerja/SAKTI asli.

## Setup awal

```bash
npm install
```

## Database (PostgreSQL via Prisma)

1. Siapkan PostgreSQL (lokal, VPS dev Pusdatik, atau lewat Homebrew:
   `brew install postgresql@16 && brew services start postgresql@16`).
2. Copy `.env.example` ke `.env`, isi `DATABASE_URL` dan `SESSION_SECRET`
   (generate `SESSION_SECRET` acak dengan `openssl rand -hex 32` - JANGAN
   pakai nilai contoh di `.env.example` untuk apapun selain localhost).
3. Jalanin migrasi:

```bash
npm run prisma:migrate
```

4. (Opsional) buka Prisma Studio buat lihat data secara visual:

```bash
npm run prisma:studio
```

## Isi data contoh (mock) supaya dashboard ada isinya

Job scheduler biasanya jalan otomatis via cron/scheduler di production, tapi
untuk development jalanin manual dengan `tsx`:

```bash
npx tsx src/jobs/runTukinJobDemo.ts
npx tsx src/jobs/runUangMakanJobDemo.ts
npx tsx src/jobs/runUangLemburJobDemo.ts
```

Ini narik data dari mock adapter (`src/adapters/`), hitung tukin/uang
makan/uang lembur, lalu simpan ke database dengan status `DRAFT`.

Lalu bikin akun `User` contoh (buat login ke dashboard, satu akun per role):

```bash
npx tsx src/auth/seedUsers.ts
```

**Login pakai NIP sebagai username SEKALIGUS password** (sengaja sama persis -
solusi sementara sampai SSO Kemnaker tersambung, lihat `TODO(legal-confirm)`
di `src/auth/session.ts` soal risikonya). NIP akun contoh:

| Role | NIP (= password) |
|---|---|
| PEGAWAI | `000000000000000001` |
| KASUBAG_TU | `000000000000000102` |
| PPABP | `000000000000000103` |
| BIRO_OSDMA | `000000000000000104` |
| ADMIN_SISTEM | `000000000000000105` |
| ITJEN | `000000000000000106` |
| PIMPINAN | `000000000000000107` |

Lihat `src/auth/seedUsers.ts` buat detail/ubah. Model `AkunApprover` (login
lama, NIP `111`/`222`) sudah **tidak dipakai** oleh `/login` lagi - lihat
catatan deprecated di schema-nya.

## Import data pegawai asli (opsional)

Kalau ada file basis data pegawai (format sama seperti sheet "Master
Lengkap" - kolom NIP, Nama, Unit Kerja, GRADE, Gol, Jabatan mulai baris
ke-7):

```bash
npx tsx src/jobs/importPegawaiXlsx.ts "<path ke file xlsx>"
```

Ini cuma import identitas pokok pegawai (bukan data pribadi seperti alamat/
No HP/NPWP) ke tabel `Pegawai`, JALANKAN ULANG tiap kali ada file yang lebih
baru. Ini BUKAN pengganti job scheduler - job scheduler (Tukin/Uang Makan/
Uang Lembur) tetap butuh data kehadiran & capaian kinerja dari adapter
terpisah sebelum bisa menghitung tukin buat pegawai-pegawai ini.

## Jalanin dashboard

```bash
npm run dev
```

Buka `http://localhost:3000` - otomatis diarahkan ke halaman login, lalu ke
`/tukin`, `/uang-makan`, atau `/uang-lembur` setelah login.

## Jalanin unit test

```bash
npm test
```

Semua modul (business logic, validation gate, job scheduler, approval
digital, session login) punya unit test - harusnya semuanya lulus sebelum
lanjut nambah fitur.

```bash
npm run typecheck
```

## Struktur folder

```
prisma/schema.prisma        - skema database inti
src/types/                  - domain types (dipakai bareng semua modul)
src/business-logic/         - kalkulasi tukin, uang makan, uang lembur (pure functions)
src/adapters/                - interface + mock implementation SIAP/e-Presensi/e-Kinerja
src/validation/               - validation gate (cek anomali sebelum APPROVED)
src/jobs/                     - job scheduler (adapter -> business logic -> validation -> Prisma)
src/approval/                 - approval digital berjenjang
src/auth/                     - login sementara khusus approver (session, seed akun)
src/lib/                      - Prisma client singleton
src/app/                      - dashboard Next.js (Tukin, Uang Makan, Uang Lembur)
src/middleware.ts             - proteksi login untuk seluruh dashboard
CLAUDE.md                     - konteks proyek buat Claude Code, WAJIB dibaca duluan
```

## Status pipeline

| Bagian | Tukin | Uang Makan | Uang Lembur |
|---|---|---|---|
| Kalkulasi | selesai | selesai | selesai |
| Validation gate | selesai | selesai | selesai |
| Job scheduler | selesai | selesai | selesai |
| Approval digital | selesai | selesai | selesai |
| Dashboard | selesai | selesai | selesai |

Job scheduler & dashboard-nya masih diverifikasi pakai 2 pegawai contoh
(NIP `000000000000000001`/`000000000000000003` - sengaja pakai NIP yang
mustahil bentrok dengan NIP asli). Tarif tukin pokok per kelas jabatan dan
konversi predikat kinerja SUDAH pakai angka resmi (lihat
`src/business-logic/tarifTukinPokok.ts` dan `konversiPredikat.ts`). Tarif
uang makan/lembur MASIH angka contoh (BUKAN tarif resmi SBM) - lihat
komentar `TODO(confirm)` / `TODO(legal-confirm)` yang tersebar di kode
buat daftar lengkap hal yang masih perlu dikonfirmasi ke pihak terkait
sebelum dipakai ke data production.

5.067 data pegawai asli (basis data Januari 2026, lihat "Import data
pegawai asli" di atas) sudah ada di tabel `Pegawai`, tapi job scheduler
belum pernah dijalankan untuk mereka - butuh data kehadiran & capaian
kinerja asli yang belum tersedia (masih mock adapter).

## Lanjutin dengan Claude Code

1. Buka folder ini di Claude Code.
2. Claude Code otomatis baca `CLAUDE.md` di root - itu berisi arsitektur,
   status open items, dan urutan pengembangan yang disarankan.
3. Jangan lupa cek bagian "open items" di CLAUDE.md sebelum minta Claude Code
   nambahin fitur baru - beberapa keputusan regulasi/kebijakan masih perlu
   dikonfirmasi ke pihak terkait (OSDMA, Biro Hukum, DJA) sebelum di-hardcode.
