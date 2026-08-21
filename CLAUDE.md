# Gajihub - Integration Layer Sentralisasi Belanja Pegawai

## Baca ini dulu: PROGRESS.md

`PROGRESS.md` di root repo adalah catatan status ringkas buat orientasi cepat
di awal chat: posisi terakhir (commit/test/deploy), daftar **keputusan yang
masih menunggu user**, dokumen/akses yang ditunggu dari pihak luar, alur data
siapa-upload-apa, akun demo, dan jebakan teknis yang sudah pernah menggigit.

CLAUDE.md (file ini) tetap sumber utama soal keputusan desain & detail per
fitur - PROGRESS.md cuma pintu masuknya. **Perbarui PROGRESS.md tiap selesai
satu batch pekerjaan, sebelum ganti chat.**

## Konteks proyek

Sistem ini dibangun untuk Kementerian Ketenagakerjaan RI, sebagai bagian dari
Rancangan Aksi Perubahan PKP (Pelatihan Kepemimpinan Pengawas) Angkatan XXXVII.
Tujuannya: mengintegrasikan 5 aplikasi eksisting (SIAP, e-Presensi, e-Kinerja
BKN, Web Gaji Kemenkeu, SAKTI) TANPA membangun aplikasi baru yang
menggantikannya - prinsip "don't replace, integrate".

- Target pilot: Satker Sekretariat Jenderal, September 2026
- Target go-live penuh: 1 Januari 2027
- Cakupan: ±5.000 pegawai di seluruh Eselon I

## Arsitektur inti

```
SIAP ──┐
e-Presensi ──┼──> Data Aggregator ──> Business Logic Engine ──> Validation Gate
e-Kinerja BKN ┘                                                        │
                                                                        v
                                              Web Gaji Connector <── Approval Digital
                                                    │
                                                    v
                                              SAKTI (SPP/SP2D)
```

Semua komponen di atas WAJIB pakai adapter pattern (lihat `src/adapters/`)
supaya bisa jalan pakai mock data sekarang, lalu di-swap ke API asli begitu
akses resmi tersedia - tanpa refactor besar.

## Yang SUDAH ada di starter ini

- `prisma/schema.prisma` - skema database inti (pegawai, presensi, predikat
  kinerja, tukin, uang makan/lembur, approval log, audit trail, rekonsiliasi,
  akun approver, user/role, banding, bukti dukung, SK KGB, SK hukuman
  disiplin, anggaran realisasi, bukti potong pajak, usulan perubahan role,
  gaji induk - lihat "Simulasi role matrix lengkap" dan "Riwayat gaji
  pegawai (gaji induk) & slip gaji format asli" di bawah untuk konteks
  penambahan model-model terakhir)
- `src/business-logic/tukin.ts` - kalkulasi tukin 30/70 sesuai Pasal 5, 11-15
  Permenaker 15/2024 (bukan asumsi generik - sudah dicek ke pasal aslinya)
- `src/business-logic/tarifTukinPokok.ts` - tabel RESMI tukin pokok per kelas
  jabatan (1-17), sumber Lampiran Permenaker 15/2024 (halaman -12-)
- `src/business-logic/konversiPredikat.ts` - konversi predikat kinerja ke
  persen, sumber Lampiran Kepsekjen 82 Tahun 2025 (lihat item 1 di bawah,
  SUDAH RESOLVED)
- `src/business-logic/uangMakan.ts`, `uangLembur.ts` - kalkulasi lebih simpel,
  tarif diterima sebagai parameter (BUKAN hardcoded, karena tarif SBM berubah
  tiap tahun anggaran - masih open item, lihat item 8)
- `src/adapters/` - interface + mock implementation untuk SIAP, e-Presensi,
  e-Kinerja, PLUS `EpresensiAdapter.ts` yang sudah membaca database
  e-Presensi ASLI (lihat "Sambungan langsung ke SIAP & e-Presensi")
- `src/jobs/importPegawaiSiap.ts` - import pegawai LANGSUNG dari database
  SIAP (SQL Server), menggantikan `importPegawaiXlsx.ts` sebagai jalur utama
- `src/jobs/importPresensiEpresensi.ts` + `simpanRekapPresensi.ts` - tarikan
  presensi massal dari database e-Presensi (dipakai bareng tombol
  sinkronisasi di `/tukin/presensi`)
- `src/validation/` - validation gate (Tukin, Uang Makan, Uang Lembur)
- `src/jobs/` - job scheduler (Tukin, Uang Makan, Uang Lembur), sudah
  ditest jalan terhadap Postgres asli
- `src/approval/` - approval digital berjenjang (Tukin, Uang Makan, Uang
  Lembur), jumlah jenjang masih default sementara (lihat item 8)
- `src/app/` - dashboard Next.js (Tukin, Uang Makan, Uang Lembur) + filter
  periode/satuan kerja
- `src/auth/` - login SEMENTARA khusus approver (lihat model `AkunApprover`
  di schema untuk catatan kenapa ini bukan solusi final)
- `src/business-logic/gajiInduk.ts` - pemetaan file ADK gaji GPP/Web Gaji ke
  komponen slip gaji (PURE, tidak baca file sendiri) - lihat "Riwayat gaji
  pegawai (gaji induk) & slip gaji format asli" di bawah
- `src/business-logic/rekapPredikatKinerja.ts` - pemetaan file "Rekap
  Penilaian" e-Kinerja BKN ke `PredikatKinerja` (bobot 70% Tukin), PURE -
  lihat "Upload rekap predikat kinerja e-Kinerja BKN" di bawah
- `src/business-logic/presensiPdf.ts` + `presensiPdfKeRekap.ts` - pembacaan
  PDF "Laporan Detail Presensi Harian" e-Presensi jadi rekap presensi bulanan
  (bobot 30% Tukin + uang makan + uang lembur), keduanya PURE; lapisan I/O
  PDF-nya terpisah di `src/lib/pdfTeks.ts` - lihat "Upload PDF presensi
  e-Presensi" di bawah
- Unit test lengkap untuk semua kalkulasi, job scheduler, approval, dan
  session login di atas (`npm test` - 256 test)
- Fitur "user & role" versi AWAL (skema `User`/`Role`/`Banding`/
  `BuktiDukung` - dulu namanya `Sanggahan`/`BuktiPendukungUpload`,
  authorization layer `src/auth/permissions.ts`, guard di semua dashboard +
  approval action, dan dashboard self-service PEGAWAI di `src/app/saya/`) -
  ketiga langkahnya SUDAH SELESAI untuk cakupan Tukin/Uang Makan/Uang
  Lembur + Banding dasar.
- **SIMULASI ROLE MATRIX LENGKAP (in progress)** - perluasan besar dari
  fitur user & role di atas, buat kebutuhan demo ke stakeholder (6 role
  detail, SK KGB, SK Hukuman Disiplin, Anggaran Realisasi, Bukti Potong
  Pajak, usulan perubahan role). Lihat bagian "Simulasi role matrix
  lengkap" di bawah untuk detail role, progress per langkah, dan semua
  asumsi yang masih TODO(confirm).

## Role matrix versi awal (SELESAI - Tukin/Uang Makan/Uang Lembur + Banding dasar)

Role matrix ORIGINAL (7 role) yang dipakai buat langkah 1-3 fitur "user &
role" pertama SUDAH DIGANTI oleh "Simulasi role matrix lengkap" di bawah -
enum `Role` sudah di-migrasi (BIRO_OSDMA→OSDMA, ADMIN_SISTEM→ADMIN, ITJEN
DIHAPUS dari cakupan simulasi ini, lihat TODO(confirm) di enum `Role`
schema.prisma). Detail lengkap 6 role yang aktif sekarang ada di bagian
"Simulasi role matrix lengkap" - JANGAN pakai nama role lama di kode baru.

Sisa yang masih relevan dari langkah awal:
- **User vs AkunApprover** - dua model akun berjalan paralel sekarang
  (`AkunApprover` buat login approver Tukin yang sudah ada, `User` buat
  role/otorisasi). BELUM diputuskan cara menyatukannya. Jangan kembangkan
  keduanya sebagai sistem independen permanen.
- **Auto-mapping jabatan→role** - BELUM diputuskan apakah role di-assign
  otomatis dari jabatan/eselon di SIAP atau manual oleh Admin. Sekarang
  manual/seed dulu (lihat `TODO(legal-confirm)` di model `User`).
- **SLA batas waktu banding** - field `Banding.batasWaktuVerifikasi` dan
  `ReconciliationStatus.windowVerifikasiBerakhir` sudah ada, durasinya belum
  diisi dari konstanta resmi manapun.
- Banding ↔ ReconciliationStatus **SUDAH TERSAMBUNG** -
  `ajukanBandingAction` (`src/app/saya/actions.ts`) upsert
  `ReconciliationStatus.status` jadi `"SANGGAH"` untuk pegawai+periode yang
  sama, dalam satu `$transaction` bareng pembuatan baris `Banding`-nya.
  Durasi `windowVerifikasiBerakhir` dan aturan hold-pembayaran-vs-koreksi-
  siklus TETAP belum diisi - itu masih TODO(confirm) kebijakan terpisah.
- **Mekanisme penyimpanan file bukti dukung** - `BuktiDukung.fileUrl` cuma
  referensi string generik (placeholder `https://placeholder.local/...` di
  seed), belum ada implementasi storage (local disk vs object storage)
  ataupun kebijakan retensi dokumen.
- **PPABP per satker - TERJAWAB (2026-08-13)**: keterangan user, *"PPABP itu
  tim keuangan di Biro Keuangan dan BMN"*. Jadi **unit ASAL** mereka memang
  Biro Keuangan dan BMN, TAPI pekerjaannya memproses pembayaran SELURUH
  satuan kerja - approval jenjang final, export ADK, rekonsiliasi lintas
  unit. **Unit asal BUKAN batas kewenangan**, dan perilaku yang sekarang
  (`cekPpabp()` sengaja mengabaikan `satuanKerja`) memang yang benar.
  Sejalan dengan Pasal 20 ayat (5)-(6) yang memisahkan unit penyusun dari
  unit keuangan sebagai pembayar.
  - Ini juga menjawab keterangan susulan *"PPABP di bawah Kasubag TU,
    Kasubag TU di bawah Pimpinan"*: itu hierarki **di dalam Biro Keuangan
    dan BMN**, BUKAN berarti PPABP tunduk pada Kasubag TU tiap unit. Jadi
    alur Kasubag TU jenjang 1 -> PPABP jenjang final tidak terbalik -
    Kasubag TU memverifikasi data unitnya sendiri, PPABP memeriksanya
    sebagai sisi keuangan.
  - Terlihat di data: akun PPABP Irwan Syafril punya `User.satuanKerja`
    **NULL** (lintas satker) sementara `Pegawai.satuanKerja`-nya **Biro
    Keuangan dan Barang Milik Negara** - dua kolom itu memang menjawab
    pertanyaan berbeda, dan di sinilah bedanya paling kelihatan.
  - **CATATAN PENTING** yang tetap berlaku: rencana numpang kolom
    `satuanKerja` buat men-scope PPABP sudah DICABUT karena bentrok dengan
    multi-role (lihat "Bug akun multi-role kehilangan jangkauan PPABP" di
    bawah). Kalau suatu saat tiap satker benar-benar punya PPABP sendiri,
    itu BUTUH kolom sendiri + migrasi - jangan pakai `User.satuanKerja`.

## Simulasi role matrix lengkap (in progress - demo stakeholder)

Perluasan besar dari fitur "user & role" di atas, diminta khusus buat
SIMULASI/DEMO ke stakeholder (bukan spesifikasi final produksi tanpa
konfirmasi lebih lanjut - lihat TODO(confirm) di tiap poin). Boleh pakai
mock data lebih kaya dari sebelumnya, TAPI tetap ikuti pola adapter yang
sudah ada (`src/adapters/`) - jangan hardcode data ke komponen UI.

**Progress**: (1) skema Prisma - SELESAI, (2) seed data - SELESAI, (3)
authorization layer - SELESAI (`src/auth/permissions.ts`, ~40 pure
function, 39 unit test baru termasuk kasus DITOLAK & bypass ADMIN), (4a) UI
Pegawai - SELESAI, (4b) UI Kasubag TU - SELESAI, (4c) UI OSDMA - SELESAI,
(4d) UI PPABP - SELESAI, (4e) UI Admin - SELESAI, (4f) UI Pimpinan -
SELESAI (lihat detail masing-masing di bawah). **SEMUA 6 ROLE SUDAH PUNYA
UI** - urutan pengerjaan yang diminta (Pegawai → Kasubag TU → OSDMA →
PPABP → Admin → Pimpinan) SELESAI DIKERJAKAN SEMUA. Sisa pekerjaan
selanjutnya (kalau ada) adalah review/refinement lintas role, BUKAN
membangun role baru - lihat "Yang BELUM ada / open items" dan TODO(confirm)
di CLAUDE.md buat gap yang masih terbuka.

**Detail UI Pegawai (langkah 4a)** - semua di `src/app/saya/`, guard tetap
`canViewDataSendiri` (berlaku semua role, bukan cuma PEGAWAI):
- `page.tsx` dirombak jadi 7 bagian: Profil (nama/NIP/jabatan/golongan/
  satuan kerja/status kepegawaian), Ringkasan pendapatan (stat tile Tukin/
  Uang Makan/Uang Lembur/Total buat periode TERBARU yang ada datanya, +
  link ke slip gaji), Presensi & Predikat kinerja (sudah ada sebelumnya),
  daftar kalkulasi per periode (Tukin/UM/Lembur, sudah ada), **Slip gaji**
  (baru - daftar periode + link `/saya/slip-gaji/[bulan]/[tahun]`),
  **Bukti potong pajak** (baru - daftar dari `prisma.buktiPotongPajak`,
  link `<a href={fileUrl}>` - CUMA link, TIDAK ADA upload form, sesuai role
  matrix "pegawai cuma bisa lihat/download"), Banding saya (sudah ada,
  SEKARANG pakai `BandingStepper` - badge 3 tahap DIAJUKAN → Verifikasi
  Kasubag TU → Approval final OSDMA, atau chip merah kalau DITOLAK,
  daripada nampilin raw enum string).
- `slip-gaji/[bulan]/[tahun]/page.tsx` (BARU) - slip gaji PLACEHOLDER
  (badge kuning eksplisit bilang "belum format final", sesuai instruksi
  user). Gabungan Tukin (breakdown komponen kinerja/kehadiran/potongan PPh)
  + Uang Makan + Uang Lembur + Total, tombol Cetak (`PrintButton.tsx`,
  `window.print()`, BUKAN generate PDF - belum ada library PDF, dan
  formatnya memang belum final jadi sengaja tidak invest ke situ dulu).
  `src/app/AppShell.tsx` ditambah class `print:hidden` di sidebar/topbar
  mobile supaya halaman ini bisa dicetak bersih tanpa chrome nav.
- **TIDAK ADA** perubahan skema/model baru di langkah ini - murni UI di
  atas data yang sudah diseed. Upload bukti dukung banding TETAP belum ada
  (masih TODO(confirm) storage, sama seperti sebelumnya).
- Diverifikasi manual: PEGAWAI (John Pieter, skenario banding) dan PPABP
  (Irwan Syafril, buka `/saya` miliknya sendiri lewat privilege universal)
  - profil, ringkasan pendapatan, slip gaji per periode, bukti potong
  pajak (Irwan Syafril), dan stepper banding semua tampil benar.

**Detail UI Kasubag TU (langkah 4b)** - semua di `src/app/kasubag/`, guard
per halaman pakai fungsi scope-unit dari `permissions.ts`
(`canViewRekapUnitKerja`/`canViewDashboardUnit`/
`canAjukanKalkulasiTukinMassalUnit`/`canAjukanSkKgb`/
`canInputSkHukumanDisiplin`), satuan kerja efektif SELALU lewat
`ambilAksesUnit()` (`src/app/kasubag/access.ts`, wrapper tipis di atas
`resolveSatkerEfektif` yang sudah ada) - KASUBAG_TU dipaksa ke unitnya
sendiri, ADMIN/role lintas-satker pilih unit lewat `SatkerPicker.tsx`
(varian `FilterBar` tanpa filter periode, buat halaman yang tidak
butuh filter bulan/tahun):
- `page.tsx` (Dashboard Unit) - 5 stat tile (total pegawai, total nominal
  periode dengan notasi ringkas, status siklus turunan, tertolak, belum
  diajukan) + 3 card ringkasan per domain. Tally approved/tertolak/proses/
  belum-diajukan dihitung dari `ApprovalLog` + `evaluasiApproval` yang
  SAMA dipakai dashboard approver (`tallyApproval()` lokal di halaman ini)
  - SENGAJA TIDAK menebak dari `catatanAnomali` (field itu juga dipakai
    validation gate buat anomali kalkulasi, bukan cuma alasan penolakan,
    jadi tidak reliabel buat tally).
- `pegawai/page.tsx` - roster unit + pencarian nama/NIP (`?q=`, GET biasa).
- `kalkulasi/page.tsx` + `kalkulasi/actions.ts` - **Kalkulasi Tukin + Uang
  Makan massal** dihitung LANGSUNG dari `PresensiHarian` + `PredikatKinerja`
  yang sudah ada di database (BUKAN lewat job scheduler
  `src/jobs/hitungTukinPeriodeJob.ts`, karena job itu iterate
  `siap.getPegawaiAktif()` yang cuma mengembalikan 2 pegawai mock, tidak
  mencakup ±5.069 baris data Pegawai asli - masalah yang sama persis
  dengan `src/db/seedSimulasi.ts`). Reuse pure function `hitungTukin`/
  `hitungUangMakan` + `validasiTukin`/`validasiUangMakan` apa adanya,
  cuma orchestration-nya beda. Pegawai tanpa presensi/predikat periode itu
  DILEWATI dengan alasan eksplisit ditampilkan di UI (bukan gagal diam-
  diam) - dari 81 pegawai Pusdatik cuma 3 (karakter simulasi yang
  benar-benar diseed datanya) yang berhasil dihitung, 78 sisanya (pegawai
  asli tanpa data simulasi) dilewati dengan pesan jelas - sudah
  diverifikasi manual.
  - **Konsekuensi PENTING yang perlu diketahui**: sama seperti
    `hitungTukinPeriodeJob.ts`, recalculation SELALU reset
    `status`→"DRAFT" + `approvedAt`/`approvedBy`→null + refresh
    `calculatedAt` (siklus approval lama otomatis dianggap basi, harus
    approval ulang) - INI KONSISTEN dengan konvensi yang sudah ada
    (`src/approval/approvalTukinService.ts`), TAPI berarti Kasubag TU
    TIDAK BOLEH asal klik "Hitung sekarang" untuk pegawai yang datanya
    sudah APPROVED kalau tidak ada perubahan data presensi/kinerja -
    tombol ini akan mem-buka-lagi siklus approval yang sudah selesai.
    Belum ada pengaman/konfirmasi UI untuk ini (misal dialog "X pegawai
    sudah approved, tetap hitung ulang?") - TODO(confirm) buat langkah
    UI berikutnya kalau dirasa perlu.
  - Uang Lembur SENGAJA TIDAK ikut kalkulasi massal - tidak ada sumber
    data jam lembur harian yang tersimpan di skema manapun (lihat
    TODO(confirm) di `RekapKehadiranPeriode`, `src/types/index.ts`).
    Sebagai gantinya, tabel di halaman yang sama punya kolom "Koreksi jam
    lembur" per pegawai (`koreksiUangLemburAction`) - input manual +
    hitung ulang `hitungUangLembur` dengan tarif yang sudah ada di baris
    itu (atau tarif default kalau belum ada baris sama sekali). Ini
    mewakili "telaah/koreksi ajuan Uang Lembur unit" di role matrix -
    BUKAN "tarik ulang" otomatis seperti presensi, karena memang belum
    ada adapter/sumber datanya.
  - Tarif Uang Makan/Uang Lembur di file ini adalah angka contoh lokal
    (35.000 / 25.000), SAMA dengan `src/db/seedSimulasi.ts` tapi
    SENGAJA TIDAK di-import dari situ - `seedSimulasi.ts` punya
    `main()` di top-level TANPA guard `require.main`, jadi meng-import
    apapun darinya dari kode aplikasi (bukan cuma menjalankannya lewat
    `npx tsx`) akan me-re-run SELURUH seed script setiap kali action ini
    dipanggil. Ketemu & dihindari sebelum sempat masuk kode - kalau nanti
    tarif ini mau disatukan, pindahkan ke modul konstanta terpisah yang
    tidak punya efek samping saat di-import, JANGAN import dari
    `seedSimulasi.ts` langsung.
- `banding/page.tsx` + `banding/actions.ts` - daftar Banding unit (semua
  status, bukan cuma yang pending) dengan `StatusBadge` per tahap, form
  verifikasi (`VerifikasiBandingForm.tsx`) cuma muncul buat status
  "DIAJUKAN". Guard LIST pakai `canViewRekapUnitKerja` (bukan
  `canVerifikasiBandingJenjang1` yang butuh target banding spesifik) -
  izin verifikasi PER-BARIS dicek ULANG di action
  (`verifikasiBandingJenjang1Action`, fetch ulang `User` dari database,
  pola sama dengan approval Tukin/UM/Lembur). SETUJU → status
  "MENUNGGU_APPROVAL_FINAL" (lanjut ke OSDMA), TOLAK → "DITOLAK" (selesai).
  Sudah diverifikasi manual end-to-end (banding John Pieter, lewat ADMIN +
  `SatkerPicker` karena Biro Keuangan dan BMN belum punya akun KASUBAG_TU
  di seed data - status berubah dari "Menunggu verifikasi" ke "Diteruskan
  ke OSDMA" dengan benar).
- `sk-kgb/page.tsx` + `sk-kgb/actions.ts` - form ajukan SK KGB (pilih
  pegawai dari roster unit, nomor SK, tanggal SK, TMT, golongan lama/baru)
  + daftar SK KGB unit dengan `StatusBadge`. Approval final OSDMA belum
  ada UI-nya (langkah 4c) - status selalu "DIAJUKAN" dari sini.
- `sk-hukuman-disiplin/page.tsx` + `sk-hukuman-disiplin/actions.ts` -
  SAMA polanya dengan SK KGB, TAPI dengan banner kuning eksplisit di
  puncak halaman: "TODO(confirm) - alur approval OSDMA untuk SK Hukuman
  Disiplin di halaman ini ASUMSI dari spesifikasi simulasi, BELUM ada
  konfirmasi resmi dari OSDMA/Biro Hukum..." - sesuai instruksi eksplisit
  user supaya asumsi ini tidak "hilang" jadi keputusan diam-diam.
  `jenisHukuman` input bebas teks (bukan dropdown/enum), konsisten dengan
  schema.
- `src/app/AppShell.tsx` - `MENU_KASUBAG` baru (Dashboard Unit, Pegawai
  Unit, Kalkulasi, 3 dashboard approver Tukin/UM/Lembur yang sudah ada,
  Verifikasi Banding, SK KGB, SK Hukuman Disiplin, Data Saya). Link "Data
  Saya" SEKARANG ditambahkan buat KASUBAG_TU (item yang sengaja ditunda
  dari langkah 3) - menyusul privilege universal `canViewDataSendiri`.
  Role lain (OSDMA/PPABP/PIMPINAN/ADMIN) MASIH pakai `MENU_APPROVER` lama
  (belum ada menu khusus mereka) - akan diganti pas langkah 4c-4f masing-
  masing role dikerjakan.
- Diverifikasi manual (KASUBAG_TU Ayu Puspita Sari, unit Pusdatik):
  Dashboard Unit, Pegawai Unit, Kalkulasi (massal + koreksi lembur), SK
  KGB, SK Hukuman Disiplin (termasuk banner TODO(confirm)) semua tampil &
  berfungsi benar dengan scope unit yang dipaksa ke Pusdatik. Verifikasi
  Banding diuji lewat ADMIN (lihat di atas) karena tidak ada banding
  pending di Pusdatik pada seed data saat ini.

**Detail UI OSDMA (langkah 4c)** - semua di `src/app/osdma/`, guard per
halaman pakai fungsi role-check tanpa scope satker dari `permissions.ts`
(`canApproveBandingFinal`/`canApproveSkKgb`/`canApproveSkHukumanDisiplin`/
`canUpdateSkPegawaiStrukturalFungsional`) - OSDMA adalah biro pusat, jadi
SEMUA fitur di sini LINTAS satuan kerja (BEDA dengan Kasubag TU yang
di-scope unit) - TIDAK ada `SatkerPicker`/filter satker sama sekali di
halaman-halaman ini:
- `page.tsx` (Dashboard OSDMA) - 3 stat tile (banding menunggu final, SK
  KGB menunggu, SK Hukuman Disiplin menunggu) + link ke Update SK. Guard
  pakai `canReviewPerubahanDataMaster` (fungsi paling umum) sebagai gate
  landing page, guard per-fitur yang lebih spesifik tetap dicek ulang di
  masing-masing halaman fitur.
- `banding/page.tsx` + `banding/actions.ts` - approval jenjang FINAL (2)
  Banding. List CUMA nampilin banding berstatus `MENUNGGU_APPROVAL_FINAL`
  (baru lolos jenjang 1 Kasubag TU) + histori `DISETUJUI`/`DITOLAK` - status
  `DIAJUKAN` (masih di jenjang 1) SENGAJA tidak ditampilkan, itu urusan
  Kasubag TU. `approveBandingFinalAction` fetch ulang `User` dari database
  (pola sama dengan verifikasi jenjang 1), tulis `ApprovalLog` jenjang=2 +
  update `Banding.status`.
- `sk-kgb/page.tsx` + `sk-kgb/actions.ts` - approval SK KGB (jenjang
  tunggal). **SETUJU langsung meng-update `Pegawai.golongan` ke
  `golonganBaru`** + isi `appliedAt`/`appliedBy` + catat `AuditTrail`
  (entitas "pegawai") - ini MELENGKAPI bagian yang sebelumnya cuma schema
  (lihat TODO(confirm) SK KGB di atas: "service layer yang benar-benar
  meng-update Pegawai.golongan... belum diimplementasikan" - SEKARANG
  SUDAH, karena OSDMA-lah yang mengeksekusinya sesuai role matrix). TOLAK
  cuma ubah status, tidak sentuh data Pegawai.
- `sk-hukuman-disiplin/page.tsx` + `sk-hukuman-disiplin/actions.ts` -
  approval SK Hukuman Disiplin (jenjang tunggal), CUMA ubah status
  (approval TIDAK memberi efek potongan Tukin otomatis - Pasal 15 belum
  diimplementasikan). Banner kuning TODO(confirm) yang sama dengan sisi
  Kasubag TU ditampilkan lagi di sini, karena OSDMA adalah pihak approve
  di alur yang sama-sama masih asumsi itu.
- `update-sk/page.tsx` + `update-sk/actions.ts` - **BEDA POLA** dari 3
  fitur approval di atas: ini update LANGSUNG (satu langkah, OSDMA
  eksekusi sendiri), BUKAN ajukan-lalu-approve, sesuai kalimat role matrix
  "update SK pegawai baru dilantik/naik pangkat". Tidak ada model skema
  baru buat ini (langsung `prisma.pegawai.update` pada `jabatan`/
  `golongan`/`kelasJabatan`/`tmtSkTerakhir`) + `AuditTrail` entry. Pencarian
  pegawai GET-based (`?q=`, mirip `kasubag/pegawai`) karena populasi
  pegawai lintas satker (~5.069 baris) terlalu besar buat `<select>` biasa
  - alur "cari -> pilih dari hasil -> form muncul" (`?pegawaiId=`), BUKAN
  dropdown penuh seperti form SK KGB Kasubag TU yang scope-nya cuma ~80
  pegawai per unit.
- `SetujuTolakForm.tsx` - komponen generik baru (dipakai bareng ketiga
  fitur approval OSDMA), SENGAJA cuma 2 tombol (Setuju/Tolak) - BEDA dari
  `ApprovalForm.tsx` (Tukin/UM/Lembur) yang punya tombol "Minta revisi"
  juga, karena Banding/SK KGB/SK Hukdis model-nya cuma
  `DISETUJUI`/`DITOLAK`, tidak ada siklus revisi terpisah.
- `src/app/AppShell.tsx` - `MENU_OSDMA` baru (Dashboard OSDMA, Approval
  Final Banding, SK KGB, SK Hukuman Disiplin, Update SK Pegawai, Data
  Saya). TIDAK ikut 3 dashboard approver Tukin/UM/Lembur (`MENU_APPROVER`)
  - itu domain Kasubag TU (jenjang 1) + PPABP (jenjang final), bukan OSDMA.
- Diverifikasi manual (OSDMA Dian Kreshnadjati): Dashboard OSDMA (3 stat
  tile benar), approval SK KGB (Setuju -> golongan Firmansyah berubah
  IV/a→IV/b + AuditTrail tercatat, diverifikasi lewat query DB langsung),
  approval final Banding (Setuju -> banding Irvan Ganeva jadi DISETUJUI),
  approval SK Hukuman Disiplin (Tolak -> banding Herry Susanto jadi
  DITOLAK, banner TODO(confirm) tampil benar), Update SK (cari "Kharina" ->
  pilih -> update jabatan/golongan -> redirect dengan banner sukses,
  diverifikasi lewat DB jabatan/golongan Kharina berubah + AuditTrail
  tercatat). **PENTING**: keempat aksi verifikasi ini SEMPAT benar-benar
  mengubah data seed simulasi (approval yang tereksekusi = perubahan
  state permanen, bukan cuma preview) - SUDAH DI-REVERT SETELAHNYA supaya
  seed data kembali ke skenario "pending" semula (Firmansyah SK KGB
  DIAJUKAN, Irvan Ganeva banding MENUNGGU_APPROVAL_FINAL, Herry Susanto SK
  Hukdis DIAJUKAN, Kharina Olivia jabatan/golongan semula) - supaya demo
  ke stakeholder masih punya item pending buat ditunjukkan di UI OSDMA
  ini. Kalau mau re-verifikasi lagi, ingat aksinya PERMANEN kecuali
  di-revert manual lagi (belum ada mekanisme "undo" otomatis).
- Fungsi `canMonitorKepatuhanData` (monitor log akses/audit) SENGAJA BELUM
  ada UI-nya - tidak disebut eksplisit di baris tabel role matrix OSDMA,
  beda dengan 4 fungsi lain di atas yang jelas dipakai. Tunggu kebutuhan
  eksplisit sebelum bikin halaman audit-log generik.

**Detail UI PPABP (langkah 4d)** - semua di `src/app/ppabp/`, guard per
halaman pakai fungsi PPABP dari `permissions.ts`
(`canViewDashboardLintasUnit`/`canViewRekonsiliasiLintasSatker`/
`canMonitorUbahStatusLintasUnit`/`canGenerateAdk`/`canUploadAnggaranRealisasi`/
`canUsulkanPerubahanRole`) - SEMUA lintas satuan kerja (PPABP scope pilot =
tim pusat, `User.satuanKerja` NULL, lihat TODO(confirm) "PPABP per satker"
di CLAUDE.md), pakai `resolveSatkerEfektif`/`resolveSatuanKerjaListUntukFilter`
yang sudah ada (PPABP lolos tanpa dipaksa ke satu unit, beda dari
KASUBAG_TU) buat halaman yang punya filter satker opsional:
- `page.tsx` (Dashboard Lintas Unit) - SAMA strukturnya dengan Dashboard
  Unit Kasubag TU (stat tile + 3 card ringkasan per domain + FilterBar),
  BEDA-nya: (1) tidak di-scope ke satu unit (`satkerEfektif` boleh kosong =
  semua satker), (2) tambahan tile "Rekonsiliasi perlu ditangani" (COUNT
  `ReconciliationStatus` berstatus SELISIH/SANGGAH, link ke
  `/ppabp/rekonsiliasi`), (3) card "Anggaran vs Realisasi" (total pagu vs
  realisasi periode ini, link ke `/ppabp/anggaran`). Logic tally di-extract
  jadi `src/app/tallyApproval.ts` (REFACTOR, bukan fitur baru) supaya
  dipakai bareng `kasubag/page.tsx` DAN halaman ini - tidak ada duplikasi
  logic evaluasi approval.
- `rekonsiliasi/page.tsx` + `rekonsiliasi/actions.ts` - monitoring
  `ReconciliationStatus` LINTAS unit (mencakup `canHandleSelisih` +
  `canMonitorUbahStatusLintasUnit` + `canViewRekonsiliasiLintasSatker`
  sekaligus, karena ketiganya jelas dipakai bareng buat satu alur yang
  sama: lihat kasus SELISIH/SANGGAH lalu putuskan tindak lanjutnya).
  **Catatan model penting**: `ReconciliationStatus.pegawaiId` BUKAN
  foreign key relasi Prisma (cuma string + unique constraint, lihat
  schema.prisma) - join ke `Pegawai` dilakukan manual di halaman ini
  (`Map` dari query terpisah), bukan lewat `include`. Aksi
  `putuskanRekonsiliasiAction` set `keputusanAkhir`
  (`HOLD_PEMBAYARAN`/`KOREKSI_SIKLUS_BERIKUTNYA`) + status jadi
  "DIPUTUSKAN" - field `windowVerifikasiBerakhir` TETAP belum dipakai
  (durasinya masih TODO(confirm) kebijakan terpisah, lihat item 7 di
  "Yang BELUM ada").
- `adk/page.tsx` + 3 **Route Handler** (`adk/tukin/route.ts`,
  `adk/uang-makan/route.ts`, `adk/uang-lembur/route.ts`) - export CSV
  baris kalkulasi berstatus APPROVED per periode, 3 jenis terpisah sesuai
  role matrix. SENGAJA pakai Route Handler (`GET`, bukan Server Action) -
  supaya bisa jadi `<a href>` biasa yang trigger download langsung tanpa
  JavaScript, konsisten dengan filosofi "no-JS-required" yang sudah
  dipegang project ini di form-form filter GET lainnya. Guard otorisasi
  dicek di dalam Route Handler-nya sendiri (`getSessionAccount` + `canGenerateAdk`).
- `anggaran/page.tsx` + `anggaran/actions.ts` - form upload Anggaran &
  Realisasi (satker + periode + pagu + realisasi, upsert - unique
  constraint `satuanKerja+periode` sudah ada di skema) + tabel semua baris
  yang sudah ada, dengan kolom persentase realisasi.
- `usulan-role/page.tsx` + `usulan-role/actions.ts` - form usulkan
  perubahan role (pilih dari `User` yang aktif - CUMA 13 akun demo, BUKAN
  dari ±5.069 baris `Pegawai`, karena `UsulanPerubahanRole.userId`
  memang mengacu ke `User`/akun otorisasi, bukan data kepegawaian mentah)
  + daftar semua usulan dengan status. Action CUMA membuat baris status
  "MENUNGGU" - TIDAK PERNAH mengubah `User.role` sama sekali, eksekusi
  final (mengubah role beneran) ditunda ke langkah 4e (UI Admin,
  `canEksekusiPerubahanRole`).
- `SetujuTolakForm.tsx`/`ApprovalForm.tsx` TIDAK dipakai di sini - "telaah
  & validasi pengajuan Tukin/Uang Makan/Uang Lembur SEMUA unit" dan
  "approval jenjang final" (role matrix) SUDAH tercakup oleh 3 dashboard
  approver yang sudah ada (`/tukin`, `/uang-makan`, `/uang-lembur`) -
  PPABP sudah otomatis lintas satker di situ (`dashboardScope.ts` tidak
  memaksa PPABP ke satu unit), jadi TIDAK dibikin halaman "telaah" duplikat
  di `src/app/ppabp/`.
- `canTarikAtauUploadPresensiFallback` **SENGAJA BELUM ada UI-nya** - sama
  seperti Kasubag TU, tidak ada mekanisme upload/tarik presensi manual yang
  benar-benar dibangun (Kalkulasi massal Kasubag TU langsung baca
  `PresensiHarian` yang sudah ada di database, bukan lewat form input) -
  ini KONSISTEN dengan keputusan yang sama di langkah 4b, BUKAN celah baru
  yang kelewatan khusus di PPABP.
- **Seed data baru buat demo**: ditambahkan 1 `ReconciliationStatus` baru
  berstatus SELISIH (Kharina Olivia, periode 7/2026, `detailSelisih` contoh
  selisih 1 hari jumlahHariHadir Gajihub-vs-eAbsensi) di
  `src/db/seedSimulasi.ts` (upsert, aman di-run ulang) - SEBELUM ini cuma
  ada 2 baris `ReconciliationStatus`, keduanya status SANGGAH dari Banding,
  jadi tidak ada contoh kasus SELISIH murni buat mendemokan fitur
  "handle selisih" PPABP. Diterapkan juga ke database yang sedang berjalan
  (bukan cuma di file seed) supaya langsung kepakai tanpa perlu re-seed.
- Diverifikasi manual (PPABP Irwan Syafril): Dashboard Lintas Unit (5.069
  total pegawai lintas satker, tally 3 domain benar, tile rekonsiliasi
  benar - termasuk 1 baris SANGGAH lawas dari mock demo "Contoh Pegawai
  Satu" yang masih ada di database sejak fitur user & role versi awal),
  Rekonsiliasi (putuskan "Koreksi siklus berikutnya" untuk kasus SELISIH
  Kharina Olivia - pindah ke histori dengan benar), Export ADK (download
  CSV Tukin lewat `fetch()` langsung ke Route Handler, isi & header
  Content-Disposition benar), Anggaran & Realisasi (tambah baris baru,
  muncul di tabel dengan persentase benar), Usulan Perubahan Role (usulkan
  Farid Arif → Kasubag TU, muncul status MENUNGGU). **PENTING**: sama
  seperti verifikasi OSDMA - keputusan rekonsiliasi, baris Anggaran test,
  dan usulan role test SEMPAT benar-benar tersimpan (bukan preview) -
  SUDAH DI-REVERT (baris Anggaran & usulan role test dihapus, rekonsiliasi
  Kharina dikembalikan ke SELISIH/pending) supaya seed data tetap di
  skenario "pending" buat demo berikutnya.

**Detail UI Admin (langkah 4e)** - semua di `src/app/admin/`, guard pakai
`canKelolaAssignmentRole`/`canEksekusiPerubahanRole`/`canMonitorKesehatanSistem`
+ `canKonfigurasiAdapter` (ADMIN-only, TIDAK ada bypass role lain - lihat
komentar di permissions.ts). Cakupan UI ini SENGAJA cuma 4 fitur admin-only
(role matrix), BUKAN membangun ulang halaman role lain - ADMIN sudah
otomatis bisa akses `/kasubag`, `/osdma`, `/ppabp`, `/tukin` dst lewat
bypass otorisasi (`cekRoleAtauAdmin` dkk) yang sudah ada sejak langkah 3:
- `page.tsx` (Dashboard Admin) - link ke 3 fitur admin-only + banner
  kuning eksplisit "BUKAN DESAIN FINAL production" (reminder yang sama
  dengan TODO(confirm) besar di CLAUDE.md soal kewajiban memecah role ini)
  + panel "Akses lintas role lainnya" (link cepat ke dashboard PPABP/
  Kasubag TU/OSDMA/Data Saya, BUKAN menu sidebar - biar sidebar ADMIN
  tetap ringkas 4 item + Data Saya, bukan gabungan menu 5 role sekaligus).
- `role-assignment/page.tsx` + `role-assignment/actions.ts` - **Kelola
  Assignment Role** (`canKelolaAssignmentRole`): tabel SEMUA 13 akun
  `User`, tiap baris punya form ubah role/satuanKerja (field satuanKerja
  cuma muncul kalau role dipilih KASUBAG_TU)/status aktif LANGSUNG - BEDA
  dari alur usulan (poin di bawah): TIDAK membuat baris
  `UsulanPerubahanRole` sama sekali, cuma dicatat `AuditTrail` (entitas
  "app_user"). Ini jalur administratif cepat (nonaktifkan akun, koreksi
  kesalahan input), BUKAN pengganti alur usul-lalu-eksekusi formal.
- `usulan-role/page.tsx` + `usulan-role/actions.ts` - **Eksekusi Usulan
  Perubahan Role** (`canEksekusiPerubahanRole` - SENGAJA TIDAK ikut bypass
  PPABP, lihat komentar di permissions.ts): daftar SEMUA
  `UsulanPerubahanRole`, tombol Eksekusi/Tolak CUMA muncul buat status
  MENUNGGU. Eksekusi benar-benar mengubah `User.role` (+ `AuditTrail`) dan
  set `diputuskanOlehId`/`diputuskanPada`; Tolak cuma ubah status usulan,
  `User.role` tidak disentuh. **GAP YANG KETEMU saat verifikasi** (belum
  diperbaiki, cuma dicatat): `UsulanPerubahanRole` TIDAK punya kolom
  `satuanKerja` - jadi kalau usulan mempromosikan seseorang ke
  `KASUBAG_TU`, eksekusi di sini mengubah role-nya TAPI `User.satuanKerja`
  tetap NULL (butuh langkah manual terpisah lewat "Kelola Assignment
  Role" buat mengisi unitnya) - akun itu jadi KASUBAG_TU "buta unit" kalau
  cuma dieksekusi dari sini tanpa langkah susulan itu. TODO(confirm):
  perlu diputuskan apakah `UsulanPerubahanRole` perlu kolom `satuanKerja`
  tambahan (migrasi baru) atau cukup didokumentasikan sebagai langkah
  manual dua tahap - BELUM diputuskan, jangan anggap alur promosi ke
  KASUBAG_TU lewat usulan ini "selesai otomatis".
- `sistem/page.tsx` - **Konfigurasi & Kesehatan Sistem**
  (`canMonitorKesehatanSistem` + `canKonfigurasiAdapter`, digabung satu
  halaman karena keduanya sama-sama informational/monitoring, tidak ada
  state actionable terpisah buat masing-masing). Stat tile dasar (total
  pegawai, total akun User, total baris AuditTrail, periode kalkulasi
  terbaru) dari data yang SUDAH ada (BUKAN metrik infra asli - sistem ini
  prototype, tidak ada uptime/APM beneran buat dimonitor) + tabel
  "Konfigurasi Adapter" (daftar STATIS SIAP/e-Presensi/e-Kinerja BKN/Web
  Gaji/SAKTI, semua Mock/belum ada, hardcoded di komponen - BUKAN dibaca
  dari database, karena binding adapter memang masih hardcode di
  composition root/job scheduler, tidak ada tabel config buat di-switch)
  + tabel 10 `AuditTrail` terbaru. **TIDAK ADA toggle/switch adapter
  beneran** - halaman ini CUMA visibilitas status, bukan kontrol panel
  fungsional, karena tidak ada adapter alternatif (non-Mock) buat
  di-switch ke situ sampai akses API resmi tersedia (lihat CLAUDE.md item
  open #5).
- `src/app/AppShell.tsx` - `MENU_ADMIN` baru (Dashboard Admin, Kelola
  Assignment Role, Eksekusi Usulan Role, Konfigurasi & Kesehatan Sistem,
  Data Saya) - SENGAJA TIDAK mencantumkan link ke `/kasubag`/`/osdma`/
  `/ppabp`/dashboard approver di sidebar (biar tidak jadi gabungan 5 menu
  role sekaligus) - akses ke situ lewat panel "Akses lintas role lainnya"
  di `/admin` sendiri, bukan sidebar permanen.
- Diverifikasi manual (ADMIN Alpha Sandro Adithyaswara): Dashboard Admin
  (banner + 3 card + panel akses lintas role tampil benar), Konfigurasi &
  Kesehatan Sistem (stat tile benar - 5.069 pegawai/13 akun/33 audit
  trail/periode 7/2026, tabel adapter & aktivitas terbaru tampil benar),
  Kelola Assignment Role (ubah role Prasetyo Muhammad Sidqi ke PIMPINAN,
  tersimpan & terverifikasi lewat query DB), Eksekusi Usulan Role
  (eksekusi usulan Kharina Olivia → KASUBAG_TU, `User.role` berubah
  terverifikasi lewat DB - inilah yang mengungkap gap `satuanKerja` di
  atas). **PENTING**: sama seperti OSDMA/PPABP - kedua perubahan role
  verifikasi ini SEMPAT benar-benar tersimpan, SUDAH DI-REVERT (Prasetyo
  kembali PEGAWAI, Kharina kembali PEGAWAI + usulannya kembali MENUNGGU,
  AuditTrail test dihapus) supaya seed data tetap di skenario "pending"
  buat demo berikutnya.

**Detail UI Pimpinan (langkah 4f) - LANGKAH TERAKHIR, semua 6 role selesai**:
guard `canViewDashboardLintasUnit` (SATU-SATUNYA fungsi otorisasi yang
dipunyai PIMPINAN di `permissions.ts` - TIDAK ADA fungsi
canApprove/canUbah apapun buat role ini, SENGAJA, sesuai role matrix
"read-only, tanpa approval/ubah data apapun"):
- **Refactor besar sebelum nulis halaman baru**: konten dashboard
  `/ppabp/page.tsx` (langkah 4d) di-extract jadi komponen shared
  `src/app/DashboardLintasUnit.tsx` (`DashboardLintasUnit({searchParams,
  authUser, readOnly})`) - SATU-SATUNYA cara menghindari duplikasi logic
  query+tally yang sama persis, karena role matrix eksplisit bilang
  dashboard Pimpinan "SAMA seperti PPABP". `/ppabp/page.tsx` SEKARANG
  tinggal guard + panggil komponen ini dengan `readOnly={false}` (perilaku
  tidak berubah, murni refactor - sudah di-tsc+test ulang buat pastikan).
- `pimpinan/page.tsx` (BARU) - guard sendiri + panggil
  `DashboardLintasUnit` dengan `readOnly={true}`. Bedanya di komponen
  shared: tile "Rekonsiliasi perlu ditangani" jadi ANGKA SAJA (bukan
  `<Link>` ke `/ppabp/rekonsiliasi`) dan link "Kelola Anggaran &
  Realisasi" disembunyikan - keduanya menuju halaman yang PIMPINAN
  memang tidak berwenang akses (`canViewRekonsiliasiLintasSatker`/
  `canUploadAnggaranRealisasi` cuma PPABP/ADMIN, TIDAK ADA PIMPINAN) -
  daripada nautkan ke halaman yang bakal mentok "Akses ditolak".
- **Perbaikan kecil di 3 dashboard approver yang sudah ada** (`tukin/
  page.tsx`, `uang-makan/page.tsx`, `uang-lembur/page.tsx`): ditemukan
  saat mengerjakan langkah ini - `canViewApproverDashboard` (dipakai
  ketiga halaman itu) SUDAH mengizinkan PIMPINAN membuka halamannya
  (`role !== "PEGAWAI"`, PIMPINAN lolos), TAPI form `<ApprovalForm>`
  (Setuju/Minta revisi/Tolak) SEBELUMNYA tetap dirender ke SEMUA role
  yang bisa lihat halaman, termasuk PIMPINAN - padahal
  `ajukanApprovalTukin`/`UangMakan`/`UangLembur` (lewat
  `cekOtorisasiApprovalJenjang`) MEMANG SUDAH menolak PIMPINAN di
  server-side (jadi bukan celah keamanan), tapi tombolnya jadi
  "dead-end" (nongol tapi selalu gagal kalau diklik) - bertentangan
  dengan pengalaman "read-only" yang diminta role matrix buat Pimpinan.
  Ditambahkan `authUser.role !== "PIMPINAN"` ke kondisi render
  `<ApprovalForm>` di ketiga halaman - PIMPINAN sekarang lihat data +
  histori approval SAMA seperti sebelumnya, TAPI TIDAK LAGI lihat tombol
  aksi apapun. INI FIX UNTUK UX/KONSISTENSI ROLE MATRIX, BUKAN celah
  keamanan yang baru ditemukan (guard server-side sudah benar dari awal).
- `src/app/AppShell.tsx` - `MENU_PIMPINAN` baru, CUMA 2 item (Dashboard
  Lintas Unit, Data Saya) - paling ringkas dari semua role, sesuai
  cakupan fitur Pimpinan yang memang paling sempit.
- Diverifikasi manual (PIMPINAN Cris Kuntadi): Dashboard Lintas Unit
  tampil data SAMA dengan yang PPABP lihat (5.069 pegawai, tally 3
  domain, tile rekonsiliasi 4) TAPI tile rekonsiliasi bukan link dan tidak
  ada link "Kelola Anggaran & Realisasi" (dicek: nol `<a>` tag di konten
  utama halaman) - dashboard Tukin dicek terpisah, cuma tombol "Terapkan
  filter" yang muncul, TIDAK ADA tombol Setuju/Revisi/Tolak sama sekali.
  Verifikasi ini PURE READ-ONLY (tidak submit form apapun), jadi TIDAK
  ADA mutasi data yang perlu di-revert kali ini - beda dengan verifikasi
  OSDMA/PPABP/Admin sebelumnya.

**Detail authorization layer (langkah 3)**:
- Fungsi baru per role sesuai tabel di bawah: KASUBAG_TU (9 fungsi scope
  unit - presensi/kinerja/kalkulasi massal/telaah UM & lembur/dashboard
  unit/SK KGB/SK Hukuman Disiplin), OSDMA (`canUpdateSkPegawaiStruktural
  Fungsional`, `canApproveSkKgb`, `canApproveSkHukumanDisiplin`), PPABP
  (`canTelaahValidasiPengajuanLintasUnit`, `canUploadAnggaranRealisasi`,
  `canMonitorUbahStatusLintasUnit`, `canUsulkanPerubahanRole`,
  `canViewDashboardLintasUnit` - dipakai bareng PPABP/PIMPINAN/ADMIN),
  ADMIN (`canEksekusiPerubahanRole` - SENGAJA TIDAK dipakai PPABP, supaya
  cuma satu pihak yang eksekusi, sesuai role matrix poin 4 & 6).
- **Perubahan penting**: `canViewDataSendiri`/`canAjukanBanding`/
  `canCetakSlipGajiSendiri`/`canDownloadBuktiPotongPajakSendiri`/dst
  SEKARANG cuma cek kecocokan NIP + akun aktif, TIDAK LAGI mengecek
  `role === "PEGAWAI"` - soalnya role matrix eksplisit bilang "semua role
  di bawah otomatis punya privilege PEGAWAI juga". Efek sampingnya:
  halaman `/saya` yang sudah dibangun di fitur user & role versi awal
  SEKARANG otomatis bisa diakses SEMUA role (bukan cuma role PEGAWAI) buat
  lihat data diri sendiri - sudah diverifikasi manual (KASUBAG_TU Ayu
  Puspita Sari bisa buka `/saya` lewat URL langsung, data miliknya
  sendiri tampil benar). Link nav ke `/saya` buat role selain PEGAWAI
  BELUM ditambahkan (`src/app/AppShell.tsx` masih nampilin menu approver
  vs "Data Saya" secara eksklusif) - itu keputusan UI, sengaja ditunda ke
  langkah 4.
- **ADMIN "privilege semua role"** diimplementasikan lewat helper eksplisit
  `cekRoleAtauAdmin`/`cekScopeSatkerAtauAdmin`/`cekPpabpAtauAdmin` di
  `permissions.ts` (BUKAN `user.role === "ADMIN"` tersebar ad-hoc) - biar
  gampang di-grep & dicabut kalau role ini dipecah lagi sebelum production
  (lihat TODO(confirm) besar di kepala file & enum `Role`). Fungsi
  admin-only sendiri (`canKelolaAssignmentRole`, `canEksekusiPerubahanRole`,
  `canMonitorKesehatanSistem`, `canKonfigurasiAdapter`) dan
  `canEditPresensiKinerjaLangsung` (invariant "tidak ada yang boleh edit
  langsung") SENGAJA TIDAK ikut bypass ini.
- Fungsi yang BELUM ditambahkan sama sekali (masih nunggu langkah UI buat
  tau kebutuhan detailnya): apapun terkait tampilan slip gaji (formatnya
  masih placeholder, lihat TODO(confirm) di atas).

### 6 role & cakupan fitur

| Role | Cakupan fitur |
|---|---|
| `PEGAWAI` (semua role lain otomatis punya privilege ini juga) | Lihat total pendapatan per komponen (Tukin/Uang Makan/Uang Lembur) periode berjalan & sebelumnya. Profil: status kepegawaian, presensi, kinerja terkini. Ajukan banding + upload bukti dukung. Lihat status banding sendiri (diajukan → verifikasi Kasubag TU → approval final OSDMA). Cetak/download slip gaji (placeholder, BELUM final - lihat item di bawah). Download bukti potong pajak (hasil UPLOAD MANUAL Kasubag TU/PPABP, pegawai cuma lihat/download, TIDAK BISA upload sendiri). |
| `KASUBAG_TU` | Privilege Pegawai + scope unit kerjanya: lihat semua pegawai unit, approval tahap 1 banding, tarik/upload manual data presensi (dasar bobot 30% Tukin), upload/koreksi predikat kinerja (bobot 70% Tukin - lewat `/predikat-kinerja`, upload file Rekap Penilaian e-Kinerja BKN, di-scope ke unitnya), tombol "tarik ulang data" presensi (BUKAN auto-sync - koreksi sebenarnya terjadi di e-Presensi eksternal), "ajukan semua pegawai unit" buat kalkulasi Tukin massal + preview nominal, telaah & ajukan Uang Makan unit, telaah/koreksi/ajukan Uang Lembur unit, dashboard unit (total pegawai, total nominal, status siklus, jumlah tertolak/belum diajukan - filter periode), ajukan SK KGB (approval OSDMA), input SK Hukuman Disiplin (approval OSDMA - TODO(confirm) besar, lihat di bawah). |
| `OSDMA` | Privilege Pegawai + approval final banding & SK KGB, update SK pegawai baru dilantik/naik pangkat. |
| `PPABP` (Tim PPABP Rokeu) | Privilege Pegawai + tarik/upload manual presensi (fallback kalau Kasubag TU tidak bisa), upload rekap predikat kinerja e-Kinerja BKN lintas unit (`/predikat-kinerja`, fallback yang sama pola dengan presensi), telaah & validasi pengajuan Tukin/Uang Makan/Uang Lembur SEMUA unit, export ADK (3 jenis terpisah), upload Anggaran & Realisasi Belanja Pegawai, monitoring lintas unit + ubah status pengajuan, LIHAT & USULKAN perubahan role (eksekusi final di Admin), dashboard lintas unit (+ total Anggaran vs Realisasi), upload riwayat gaji induk dari ADK GPP + input honorarium (bahan slip gaji pegawai - lihat "Riwayat gaji pegawai (gaji induk) & slip gaji format asli"). |
| `PIMPINAN` | Privilege Pegawai + dashboard lintas unit SAMA seperti PPABP, read-only (tanpa approval/ubah data apapun). |
| `ADMIN` | Privilege Pegawai + dashboard lintas unit (sama PPABP/Pimpinan) + konfigurasi sistem + **privilege SEMUA role di atas** + eksekusi final perubahan role. **BUKAN DESAIN FINAL production** - lihat TODO(confirm) besar di bawah. |

### TODO(confirm) / asumsi yang WAJIB dikonfirmasi sebelum production

- **ADMIN privilege penuh** (enum `Role` di schema.prisma, `canViewDataPayroll`
  di `src/auth/permissions.ts`) - SENGAJA diberi akses ke SEMUA fitur +
  seluruh data payroll, BERTENTANGAN dengan prinsip pemisahan kewenangan
  teknis vs bisnis yang sudah didokumentasikan sebelumnya (`ADMIN_SISTEM`
  lama SENGAJA tidak boleh lihat data payroll). Ini KHUSUS buat kebutuhan
  simulasi (satu akun nunjukin semua fitur ke stakeholder). **SEBELUM
  production, role ini WAJIB dipecah lagi** jadi System Admin (akses
  teknis saja: config, monitoring, eksekusi role assignment) + role bisnis
  terpisah - jangan biarkan pemisahan ini "lupa" karena kepraktisan demo.
- **ITJEN dihapus dari enum `Role`** - bukan keputusan permanen, cuma di
  luar cakupan simulasi/demo ini. Kalau auditor read-only dibutuhkan lagi,
  tinggal ditambahkan lagi ke enum + `src/auth/permissions.ts`.
- **Alur Banding 2 jenjang (Kasubag TU → OSDMA final)** - SEKARANG SUDAH
  DITETAPKAN di model `Banding` (schema.prisma) untuk kebutuhan simulasi
  ini, pakai pola `jenjang` yang sama dengan approval Tukin/Uang Makan/Uang
  Lembur (reuse `ApprovalLog` + `evaluasiApproval`). Ini MENJAWAB open item
  lama ("alur verifikasi sanggahan berapa tahap") TAPI belum konfirmasi
  resmi dari Biro OSDMA/Hukum - jangan anggap final buat production.
- **SK Hukuman Disiplin - alur approval OSDMA ASUMSI, BUKAN keputusan
  final** (lihat komentar panjang di model `SkHukumanDisiplin`,
  schema.prisma). Dikasih alur approval OSDMA (jenjang tunggal, pola sama
  dengan SK KGB) karena (1) Pasal 15 soal potongan disiplin belum
  diimplementasi di `business-logic/tukin.ts` (item 2 di "Yang BELUM ada"),
  (2) data ini sensitif. WAJIB dikonfirmasi ke OSDMA/Biro Hukum sebelum
  dipakai production. `jenisHukuman` sengaja free-text (bukan enum kaku)
  karena kategorisasi resmi (PP 94/2021) belum dipetakan ke sistem ini.
- **SK KGB disederhanakan jadi golongan saja** (model `SkKgb`) - sistem ini
  TIDAK punya tabel skala gaji pokok PNS/masa-kerja-golongan (di luar
  cakupan "don't replace, integrate", itu domain Web Gaji/BKN).
  `appliedAt`/`appliedBy` disiapkan tapi service layer yang benar-benar
  meng-update `Pegawai.golongan` SETELAH disetujui OSDMA **belum
  diimplementasikan** - baru schema.
- ~~**Slip gaji** - formatnya "placeholder dulu, jangan didesain sebagai
  final", tunggu format detail dari user.~~ **RESOLVED** - user memberi
  contoh slip ASLI cetakan PPABP Setjen, dan formatnya sekarang diikuti
  persis. Slip TETAP tidak punya model tersimpan sendiri (dihitung
  on-the-fly), TAPI sekarang ada model `GajiInduk` buat komponen gaji
  pokok/tunjangan yang memang datang dari luar - lihat bagian "Riwayat gaji
  pegawai (gaji induk) & slip gaji format asli" di bawah. PDF generation
  masih BELUM ada (tetap `window.print()`).
- **AnggaranRealisasi belum dipecah per jenis belanja** (Tukin/Uang
  Makan/Uang Lembur) - satu baris = total pagu/realisasi per satuan
  kerja+periode, karena kebutuhan dashboard saat ini cuma minta total.
  Kalau nanti butuh breakdown, itu perlu migrasi tambahan.
- **Usulan Perubahan Role** (model `UsulanPerubahanRole`, BUKAN nama yang
  diminta eksplisit user - dibuat buat mewadahi "PPABP usul, Admin
  eksekusi") - action/UI SUDAH ADA (langkah 4d PPABP mengusulkan, langkah
  4e Admin eksekusi/tolak). Bukan approval berjenjang seperti
  `ApprovalLog` - cuma usul (PPABP) lalu keputusan tunggal (Admin):
  eksekusi atau tolak. ~~**Gap yang ketemu**: model ini TIDAK punya kolom
  `satuanKerja`, jadi promosi ke `KASUBAG_TU` lewat alur ini menghasilkan
  akun "buta unit".~~ **RESOLVED** - unit kerja sekarang diminta di form
  EKSEKUSI (Admin), bukan di model usulannya, jadi tidak perlu migrasi.
  Lihat bagian "Bug akun ber-role Kasubag TU tapi tidak bisa lihat
  apa-apa (FIXED)" di bawah.
- **Kalkulasi massal Kasubag TU tidak punya pengaman "sudah APPROVED"** -
  tombol "Hitung sekarang" (`src/app/kasubag/kalkulasi/`) akan mem-buka-
  lagi siklus approval pegawai yang datanya sudah disetujui penuh (reset
  ke DRAFT, sesuai konvensi recalculation yang sudah ada), tanpa
  konfirmasi/peringatan UI dulu. Perlu diputuskan apakah ini perilaku yang
  diinginkan (recalculation memang harus selalu buka ulang siklus) atau
  butuh guard tambahan (skip pegawai yang sudah APPROVED kecuali dipaksa)
  sebelum dipakai ke luar simulasi.

### Seed data simulasi

Dijalankan BERURUTAN (urutannya penting - lihat catatan di tiap file):

```bash
npx tsx src/auth/seedUsers.ts        # 13 akun demo dgn role khusus
npx tsx src/db/seedSimulasi.ts       # presensi/kalkulasi/approval/banding/dst
npx tsx src/auth/seedAkunPegawai.ts  # akun PEGAWAI massal buat SISA pegawai
```

**`seedAkunPegawai.ts` HARUS terakhir** (atau minimal setelah
`seedUsers.ts`): skrip itu cuma membuat akun buat NIP yang BELUM punya
`User` sama sekali, jadi kalau dijalankan duluan, 13 akun demo bakal
terlanjur dibuat sebagai PEGAWAI dan `seedUsers.ts` yang jalan belakangan
tetap membenarkan role-nya (upsert) - tapi urutan di atas lebih aman &
tidak bikin bingung. Ketiganya idempoten kecuali bagian `banding`/SK/usulan
role di `seedSimulasi.ts` (lihat catatan di bawah).

**PENTING**: NIP di seed ini adalah NIP ASLI dari data pegawai yang sudah
diimpor (`prisma.pegawai`, ±5.069 baris via `src/jobs/importPegawaiXlsx.ts`)
- BUKAN pegawai fiktif baru, supaya karakter simulasi punya data kepegawaian
konsisten dengan basis data yang sudah ada. Login pakai NIP sebagai
username SEKALIGUS password (sama seperti pola login lain di project ini).

13 akun lintas 6 role & 3 satuan kerja (+ 2 pimpinan lintas unit):

| NIP | Nama | Satuan kerja | Role | Skenario periode berjalan (7/2026) |
|---|---|---|---|---|
| 198703232015031002 | Alpha Sandro Adithyaswara | Biro Keuangan dan BMN (`User.satuanKerja` = Pusdatik, lihat catatan multi-role) | `ADMIN` + SEMUA role lain sebagai role tambahan | lancar |
| 197303072005011001 | Irwan Syafril | Biro Keuangan dan BMN | `PPABP` | lancar |
| 198312302009121004 | John Pieter | Biro Keuangan dan BMN | `PEGAWAI` | banding (baru DIAJUKAN) |
| 199611272018121001 | Prasetyo Muhammad Sidqi | Biro Keuangan dan BMN | `PEGAWAI` | uang lembur tidak biasa (52 jam, kena cap 40 jam + anomali) |
| 198810012011012009 | Kharina Olivia | Biro Keuangan dan BMN | `PEGAWAI` | lancar |
| 199006212015032005 | Ayu Puspita Sari | Pusdatik | `KASUBAG_TU` | lancar |
| 198308052009121004 | Firmansyah | Pusdatik | `PEGAWAI` | Tukin DITOLAK jenjang 1 |
| 197611232006041015 | Farid Arif | Pusdatik | `PEGAWAI` | belum diajukan approval sama sekali |
| 197904302011011012 | Luthfi Firdaus | Biro Umum | `KASUBAG_TU` | lancar |
| 198604302011011011 | Irvan Ganeva | Biro Umum | `PEGAWAI` | banding (jenjang 1 SETUJU, menunggu final OSDMA) |
| 197508061999031001 | Herry Susanto | Biro Umum | `PEGAWAI` | lancar |
| 197410061999032002 | Dian Kreshnadjati | Biro OSDMA | `OSDMA` | lancar |
| 196906241990031004 | Cris Kuntadi | Sekretariat Jenderal | `PIMPINAN` | lancar |

Periode 6/2026 (periode lalu) SEMUA 13 karakter berstatus lancar/APPROVED
penuh (histori pembayaran). Detail tambahan yang ikut diseed:
SK KGB (Firmansyah, diajukan Ayu, `DIAJUKAN`), SK Hukuman Disiplin (Herry
Susanto, diajukan Luthfi, `DIAJUKAN`), Anggaran Realisasi (3 satuan kerja,
periode 7/2026), Bukti Potong Pajak 2025 (Alpha & Irwan), Usulan Perubahan
Role (Irwan mengusulkan Kharina Olivia jadi `KASUBAG_TU`, status
`MENUNGGU`), ReconciliationStatus SELISIH (Kharina Olivia, periode
7/2026, ditambahkan belakangan di langkah 4d khusus buat demo "handle
selisih" PPABP - lihat detail di situ).

Re-jalankan `seedSimulasi.ts` aman (idempotent - pakai upsert untuk
kalkulasi/presensi/kinerja/anggaran/bukti potong pajak; `banding`/SK/usulan
role pakai create biasa, jadi kalau di-run ulang akan bikin baris duplikat
untuk bagian itu - belum ditambah guard idempotency di situ, jangan run
dua kali tanpa sadar).

### Akun PEGAWAI massal (`src/auth/seedAkunPegawai.ts`)

SEMUA pegawai (±5.069) sekarang otomatis punya akun `User` role `PEGAWAI` -
bukan cuma 13 karakter simulasi. Tujuannya: siapapun bisa dites/login, dan
pengelolaan role tinggal MENGUBAH role akun yang sudah ada (Pegawai ->
Kasubag TU/OSDMA/dst) lewat halaman Admin, BUKAN bikin akun dari nol.

- **Idempoten & tidak merusak**: cuma membuat akun buat NIP yang belum
  punya `User`. Akun yang sudah ada (termasuk 6 akun ber-role khusus dari
  `seedUsers.ts`) TIDAK di-reset - aman di-run ulang, termasuk setelah ada
  penambahan data Pegawai baru dari `importPegawaiXlsx.ts`.
- `satuanKerja` diisi NULL (bukan disalin dari `Pegawai.satuanKerja`) -
  konsisten dengan konvensi skema: scoping PEGAWAI ke data sendiri lewat
  relasi NIP ke Pegawai, field `User.satuanKerja` cuma dipakai KASUBAG_TU
  (lihat komentar model `User` di schema.prisma).
- **Konsekuensi keamanan yang perlu diketahui**: password = NIP (konvensi
  login sementara yang sudah ada), jadi SEKARANG setiap pegawai di basis
  data otomatis bisa login pakai NIP-nya sendiri. Disengaja buat testing
  internal (akses cuma lewat jaringan kantor/VPN, HTTP), TAPI ini
  memperluas permukaan dibanding sebelumnya yang cuma 13 akun - WAJIB
  diganti begitu SSO Kemnaker tersambung, jangan dibiarkan begini kalau
  sistem dibuka ke jaringan publik. Lihat TODO(legal-confirm) di
  `src/auth/session.ts`.

**Dampak ke UI "Kelola Assignment Role"** (`src/app/admin/role-assignment/`):
tabel akun di bawah SEKARANG cuma menampilkan akun ber-role SELAIN
`PEGAWAI` (kalau semua ditampilkan jadi 5.000+ baris dan tidak berguna
buat cari "siapa yang punya kewenangan khusus"). Buat mengubah role
pegawai biasa, pakai pencarian nama/NIP di atasnya - hasil pencarian
nampilin role akun yang berlaku sekarang sebagai chip, lalu tombol "Ubah
role" (kalau akunnya sudah ada) atau "Buat akun" (fallback buat pegawai
yang belum punya akun sama sekali, mis. data Pegawai yang diimpor SETELAH
`seedAkunPegawai.ts` terakhir dijalankan).

### Multi-role per akun & menu akun (buat kemudahan TESTING)

Satu akun bisa dikasih beberapa role, lalu pemiliknya ganti "sudut pandang"
sendiri lewat menu di tombol akun (sidebar kiri bawah) - TANPA logout-login
pakai NIP orang lain. Dipakai buat testing alur lintas role (mis. ajukan SK
KGB sebagai Kasubag TU, lalu approve sebagai OSDMA).

**Model mentalnya - INI YANG PALING PENTING**: ini BUKAN "role gabungan".
Pada satu waktu akun tetap berperan sebagai SATU **role aktif** saja
(disimpan di cookie sesi). Otorisasi tetap dievaluasi terhadap satu role itu
lewat `src/auth/permissions.ts` - TIDAK ADA fungsi izin yang meng-OR-kan
beberapa role sekaligus, dan tidak ada satupun fungsi di `permissions.ts`
yang diubah oleh fitur ini. Konsekuensi praktisnya: ADMIN yang sedang
memakai role Kasubag TU BENAR-BENAR kehilangan akses `/admin` sampai dia
ganti balik (sudah diverifikasi manual - lihat di bawah).

- **Skema**: `User.rolesTambahan Role[]` (migrasi
  `20260728000000_tambah_roles_tambahan_multi_role`, satu `ALTER TABLE`,
  aman di database kosong maupun yang sudah ada isi - baris lama otomatis
  `{}` = single-role, perilaku persis seperti sebelumnya). `User.role` tetap
  role UTAMA/default yang dipakai waktu login.
- **`src/auth/roleAktif.ts`** (BARU, pure): `daftarRoleTersedia()` (role
  utama selalu paling depan, duplikat dibuang), `punyaMultiRole()`,
  `resolveRoleAktif()` (kandidat dari cookie kalau memang dimiliki, kalau
  tidak JATUH BALIK ke role utama), dan `LANDING_ROLE` (halaman tujuan per
  role). 12 unit test baru.
- **`getSessionAccount()` SEKARANG SELALU query database** (`src/auth/
  getSessionAccount.ts`) - dulu cuma mendekode cookie. Ini yang membuat role
  aktif tidak bisa jadi basi: (1) role aktif dicocokkan ulang dengan role
  yang benar-benar dimiliki akun, (2) akun yang dinonaktifkan langsung
  dianggap tidak login, (3) `satuanKerja` dibaca dari database. Return
  type-nya bertambah `rolesTersedia` (backwards compatible - field lama
  tetap ada). **Konsekuensi performa**: +1 query per halaman/action; belum
  jadi masalah di prototype ini, tapi ingat ini kalau nanti ada halaman yang
  memanggilnya berkali-kali.
- **`ambilUserSesi()`** (di file yang sama) = baris `User` LENGKAP dengan
  `role` sudah diganti role aktif. MENGGANTIKAN pola lama `getSessionAccount()`
  lalu `prisma.user.findUnique({ where: { nip: akun.nip } })` di ~15 Server
  Action - pola itu selalu memakai role UTAMA, jadi kalau dibiarkan, user
  yang sedang ganti role tetap dinilai dengan role lamanya. **Kalau nanti
  nulis action baru, pakai `ambilUserSesi()`, JANGAN `prisma.user.findUnique`
  by nip lagi.**
- **UI**: `src/app/AccountMenu.tsx` (BARU) - tombol akun jadi popover berisi
  daftar "Ganti role" (role aktif ditandai centang & tidak bisa diklik) +
  Logout. Menu "Ganti role" cuma muncul kalau akun punya >1 role. Tombol
  Logout yang dulu berdiri sendiri di kaki sidebar DAN di topbar mobile
  SUDAH DIHAPUS - di mobile, sisi kanan topbar sekarang chip role yang
  sedang aktif, logout-nya lewat drawer.
- **`gantiRoleAction`** (`src/app/login/actions.ts`) cuma menerbitkan ulang
  cookie sesi. TIDAK mengubah data akun sama sekali (`User.role` di database
  tetap role utama) dan TIDAK menulis `AuditTrail` (bukan perubahan data) -
  lihat catatan di bawah soal implikasinya. Role tujuan diverifikasi ULANG
  ke database, bukan dipercaya dari form.
- **Login & middleware sekarang pakai `LANDING_ROLE`** - dulu semua role
  non-PEGAWAI mendarat di `/tukin`, padahal `/tukin` tidak ada di menu
  OSDMA/PIMPINAN/ADMIN. Sekarang tiap role diarahkan ke dashboard menu
  pertamanya (PEGAWAI `/saya`, KASUBAG_TU `/kasubag`, OSDMA `/osdma`, PPABP
  `/ppabp`, PIMPINAN `/pimpinan`, ADMIN `/admin`). Ini perbaikan sampingan
  yang kebawa fitur ini, bukan permintaan terpisah.
- **UI Admin** (`/admin/role-assignment`): tiap baris akun dapat blok
  checkbox "Role tambahan (buat testing)". Field "Satuan kerja" sekarang
  muncul kalau KASUBAG_TU ada di role utama ATAU role tambahan (satu akun
  cuma punya SATU `satuanKerja`) - dan action-nya MENOLAK simpan kalau
  KASUBAG_TU dipilih tapi satuan kerjanya kosong, supaya tidak bikin akun
  "buta unit". Tabel "akun dengan kewenangan khusus" sekarang juga
  memunculkan akun ber-role PEGAWAI yang punya role tambahan.
- **Seed**: akun demo ADMIN (Alpha Sandro, NIP 198703232015031002) dikasih
  SEMUA role lain sebagai role tambahan + `satuanKerja` diisi Pusdatik
  (WAJIB, karena KASUBAG_TU ada di daftarnya). Jadi satu login itu cukup
  buat keliling semua sudut pandang. Akun demo lain tetap single-role.

**TODO(confirm) - BUKAN desain final production**: satu orang memegang
beberapa kewenangan sekaligus bertentangan dengan pemisahan kewenangan
(pengaju SK KGB tidak seharusnya juga jadi approver-nya). Sebelum
production, putuskan: kolom `rolesTambahan` dihapus, atau dibatasi (cuma
lingkungan non-production / kombinasi role tertentu). Catatan penting kalau
tetap dipakai: pergantian role TIDAK dicatat di `AuditTrail`, jadi
`ApprovalLog` cuma menunjukkan NIP approver - TIDAK menunjukkan role apa
yang sedang dipakai waktu aksi itu dilakukan.

**Diverifikasi manual** (dev lokal, akun Alpha Sandro): login mendarat di
`/admin`; menu akun menampilkan 6 role dengan Admin bercentang; ganti ke
Kasubag TU -> sidebar berubah jadi MENU_KASUBAG, redirect ke `/kasubag`
dengan scope Pusdatik (81 pegawai), dan `/admin` jadi "Akses ditolak"
(bukti otorisasi ikut role AKTIF, bukan role utama di database); role
tambahan dihapus lewat SQL saat sesi masih jalan -> halaman berikutnya
otomatis balik ke ADMIN (bukti cookie basi tidak dipercaya); assign role
tambahan lewat UI Admin tersimpan benar di database + tercatat di
`AuditTrail`; login akun single-role (Ayu Puspita Sari) -> menu akun cuma
berisi Logout, tanpa bagian "Ganti role"; logout dari menu baru berfungsi.
Semua mutasi verifikasi (role tambahan Ayu + baris AuditTrail-nya) SUDAH
DI-REVERT.

### Data Pegawai (`/pegawai`) - ADMIN / PPABP / KASUBAG_TU

Halaman perbaikan data pokok pegawai, diminta user karena satuan kerja yang
salah/kosong bikin pegawai "hilang" dari semua rekap. SATU halaman dipakai
bertiga (bukan tiga salinan di `/admin`, `/ppabp`, `/kasubag`) - yang beda
cuma cakupan datanya, dan itu diurus fungsi izin.

- **Izin baru** di `src/auth/permissions.ts` (+13 unit test):
  `canKelolaDataPegawai` (buka halamannya - ADMIN/PPABP/KASUBAG_TU saja,
  OSDMA/PIMPINAN/PEGAWAI ditolak), `canEditDataPegawai(user, satkerTarget)`
  (KASUBAG_TU cuma unitnya sendiri), dan `canPindahSatuanKerjaPegawai` -
  **mutasi keluar unit SENGAJA cuma PPABP & ADMIN**: buat Kasubag TU itu
  operasi satu arah yang tidak bisa dia batalkan sendiri (begitu pegawainya
  pindah, dia langsung di luar jangkauannya).
- Field yang bisa diubah: nama, unit kerja, satuan kerja, jabatan, golongan,
  kelas jabatan (divalidasi 1-17, di luar itu lookup tarif tukin pasti
  gagal), status pegawai, TMT SK. **NIP SENGAJA read-only** - itu kunci
  relasi ke akun `User`, presensi, kalkulasi, banding, dan seluruh seed.
- **BEDA dari `/osdma/update-sk`** (yang sudah ada): halaman OSDMA itu
  KHUSUS perubahan karena SK (jabatan/golongan/kelas/TMT) dan lintas satker
  tanpa batas. Yang ini perbaikan data pokok TERMASUK satuan kerja, dengan
  Kasubag TU di-scope. Keduanya sama-sama menulis `AuditTrail`, jadi
  jejaknya tetap ada lewat jalur manapun. Sengaja tidak digabung - beda
  role, beda cakupan field, beda scoping.
- Halaman ini juga menampilkan **panel "Akun login pegawai ini"** (role +
  unit AKUN). Tujuannya menunjukkan bahwa `User.satuanKerja` (unit AKUN,
  dipakai buat scoping) itu kolom yang BEDA dari `Pegawai.satuanKerja`
  (unit ORANGNYA) - kebingungan antara keduanya yang bikin keluhan "role
  sudah diganti tapi tidak bisa lihat apa-apa".
- Tanpa kata kunci pencarian: KASUBAG_TU langsung dapat roster unitnya
  (~80 baris), ADMIN/PPABP diminta mencari dulu (5.069 baris tidak berguna
  ditampilkan semua).

### Bug "akun ber-role Kasubag TU tapi tidak bisa lihat apa-apa" (FIXED)

Penyebabnya BUKAN data yang hilang, tapi akun ber-role `KASUBAG_TU` dengan
`User.satuanKerja` NULL - lolos guard role, tapi tidak cocok dengan satuan
kerja manapun, jadi setiap halaman unit tampil kosong TANPA penjelasan.
Ini gap yang sudah didokumentasikan sejak langkah 4e (lihat "Detail UI
Admin"), sekarang ditutup dari empat sisi:

1. **`/admin/usulan-role` (sumber utamanya)** - eksekusi usulan dulu cuma
   `update({ role })`, tidak pernah mengisi `satuanKerja`. Sekarang form
   eksekusinya punya field unit kerja (WAJIB kalau role yang diusulkan
   KASUBAG_TU, prefill dari satuan kerja data pegawainya), dan action-nya
   menolak eksekusi tanpa unit. **SENGAJA TIDAK menambah kolom
   `satuanKerja` ke model `UsulanPerubahanRole`** (tidak perlu migrasi):
   unit ditentukan saat EKSEKUSI oleh Admin, bukan saat PPABP mengusulkan -
   PPABP mengusulkan orangnya, Admin yang tahu penempatannya. Ini
   menggantikan TODO(confirm) lama yang menyebut opsi "tambah kolom atau
   dokumentasikan sebagai langkah manual dua tahap".
2. **`/admin/role-assignment`** - banner kuning di atas halaman yang
   mendaftar semua akun Kasubag TU tanpa unit, plus peringatan per-baris.
   Field satuan kerja sekarang prefill dari satuan kerja data pegawainya
   kalau unit akunnya masih kosong.
3. **`/pegawai`** - kalau yang login KASUBAG_TU tanpa unit, halaman ini
   TIDAK menampilkan tabel kosong, tapi menjelaskan penyebab & jalan
   keluarnya.
4. `ubahAssignmentRoleAction` sudah menolak simpan kalau KASUBAG_TU dipilih
   tanpa satuan kerja (ditambahkan bareng fitur multi-role).

### Rekening pegawai & pemisahan ADK per bank

Diminta user: rekening HARUS ada (Web Gaji butuh buat memproses pembayaran),
dan output ADK harus DIPISAH PER BANK karena SAKTI SPP cuma bisa memproses
SPP per bank. User menyebut "untuk tukin dan gaji beda bank".

**TEMUAN yang mengubah desainnya - dibuktikan dulu sebelum ditulis.** Dua
file asli satker 450938 periode 06/2026 dibandingkan per NIP:

| | Bank | Kode Bank SPAN | Contoh rekening |
|---|---|---|---|
| Gaji (file GPP) | BNI | 520009000990 | 0447729376 |
| Tukin (file ADK) | BRI | 520002000990 | 223301002832507 |

Dari **96 NIP yang ada di KEDUA file, TIDAK SATUPUN nomor rekeningnya sama**
(0 sama / 96 beda). Jadi rekening tukin **TIDAK BISA** diturunkan dari file
gaji induk GPP - mengambilnya dari situ berarti mengirim uang ke rekening yang
salah. Masing-masing butuh sumbernya sendiri.

**Model `RekeningPegawai`** (migrasi `20260729160000_rekening_pegawai`, satu
`CREATE TABLE`): unique `(pegawaiId, jenisPembayaran)` - satu pegawai punya
rekening TUKIN dan GAJI yang terpisah. Upload TUKIN tidak menimpa GAJI.

**`src/business-logic/rekeningPegawai.ts`** (pure) - parser yang mengenali DUA
gaya penamaan kolom sekaligus: gaya ADK tukin ("Kode Bank SPAN", "Nomor
Rekening") dan gaya mentah GPP ("kdbankspan", "rekening"). Jadi satu parser
cukup untuk kedua sumber. Plus `kelompokkanPerBank()` yang dipakai UI.
Pengelompokan by KODE bank, bukan nama - nama bank di file asli tidak
konsisten kapitalisasinya ("Bank Rakyat Indonesia" vs "BANK RAKYAT INDONESIA").

**Sumber rekening TUKIN = file ADK tukin yang PPABP sudah punya.** Tidak perlu
file baru: file itu memang sudah memuat NIP + Kode Bank SPAN + Nama Bank +
Nomor Rekening + Nama Rekening. Baris TOTAL di akhir file dilewati otomatis
(tidak punya NIP).

**UI baru `/ppabp/rekening`** (izin `canKelolaGajiInduk` - PPABP + ADMIN):
upload per jenis pembayaran, sebaran bank, tabel rekening, pencarian nama/NIP.
File-nya tidak disimpan.

**Kolom rekening di ADK Tukin SEKARANG TERISI** - dari `RekeningPegawai` jenis
TUKIN, BUKAN dari gaji induk. Pegawai yang rekening tukinnya belum terdaftar
tetap dikosongkan, TIDAK ditebak.

**Pemisahan per bank**: route menerima `?bank=<kode bank SPAN>`. Halaman
`/ppabp/adk` **membaca bank apa saja yang benar-benar ada di data periode itu**
lalu membuat satu baris tombol (Excel + TXT) per bank - BUKAN daftar bank yang
dihardcode. Kalau banknya berubah/nambah, UI ikut sendiri dan tidak ada tombol
mati untuk bank yang tidak dipakai. Tetap ada opsi "semua bank" yang
ditandai eksplisit **untuk pengecekan internal, BUKAN untuk SAKTI**.
Halaman juga memperingatkan berapa pegawai APPROVED yang rekeningnya belum
terdaftar - mereka tidak masuk file per bank manapun.

**CATATAN KEAMANAN yang naik taruhannya.** Keputusan lama "kolom rekening
SENGAJA dibuang saat parsing" DICABUT. Konsekuensinya database ini sekarang
menyimpan rekening bank ribuan pegawai, sementara aplikasinya masih jalan di
**HTTP dengan password = NIP** (lihat TODO(legal-confirm) di
`src/auth/session.ts`). Ini bukan lagi soal nama & NIP - ini data rekening
bank. WAJIB diamankan (HTTPS + SSO/password sungguhan) sebelum dibuka ke
jaringan yang lebih luas. Peringatan ini juga ditampilkan di halaman
`/ppabp/rekening` supaya tidak cuma hidup di komentar kode.

**Diverifikasi** dengan file ADK tukin ASLI sebagai sumber: parser membaca
**96 rekening**, 96/96 NIP cocok dengan tabel Pegawai, semuanya BRI
520002000990. Export periode 6/2026: file "semua bank" 13 baris (3 terisi
rekening), file **filter BRI 3 baris dengan rekening TERISI SEMUA**, total
bruto - potongan = bersih konsisten, dan TXT-nya 22 kolom konsisten di semua
baris. Nama Rekening ikut terbaca terpisah dari nama pegawai (mis. pegawai
"IRVAN GANEVA, M.M. , S.Ds" -> rekening "IRVAN GANEVA, S.DS").

### Basis Data Gaji: nama pegawai untuk ADK datang dari Web Gaji, bukan SIAP

Dipicu berkas user `basis data gaji_Kemnaker.xlsx` (2 sheet: `data_PNS`,
`data_P3K`). Keluhannya: nama di database internal beda dengan yang dipakai
pihak luar - singkatan & gelar.

**Terukur, bukan kesan**: dari 4.701 NIP yang cocok ke tabel `Pegawai`,
**3.628 (77%) namanya berbeda** - `"ADE ALEXANDER"` (SIAP) vs
`"Ade Alexander, SH"` (Web Gaji).

**Model `IdentitasWebGaji`** (migrasi `20260812090000_identitas_web_gaji`, satu
`CREATE TABLE`): nama, jenis pegawai, kode satker, nama satuan kerja.

**KENAPA TABEL SENDIRI, bukan mengoreksi `Pegawai.nama`** - alasan yang sama
persis dengan `kelasJabatanSelamaHukuman`: kolom itu **ditimpa ulang tiap
`npm run sync:pegawai`** (`nama` ikut di blok `update` upsert), jadi koreksi
manual pasti hilang. Ditambah: SIAP sah untuk kepegawaian, Web Gaji sah untuk
pembayaran - dua-duanya benar di ranahnya, tidak boleh saling menimpa.

**Rekening TIDAK dibuatkan tabel baru** walau ada di berkas yang sama - tetap
ke `RekeningPegawai` yang sudah jadi sumber pemisahan ADK per bank. Satu
unggahan mengisi DUA tabel. Dua tabel rekening = dua kebenaran.

**`src/business-logic/basisDataGaji.ts`** (PURE, 15 unit test). Dua kerusakan
NYATA di berkas asli yang ditangani berbeda karena sifatnya beda:

| Temuan | Jumlah | Perlakuan |
|---|---|---|
| Kolom **NIK & NIP tertukar** (Ditjen PHI dan Jamsos, BBPVP Medan) | **286 baris** | **Diperbaiki otomatis** - NIK 16 digit vs NIP 18 digit, tidak mungkin salah kenali |
| **NIP tersimpan sebagai ANGKA** di Excel | **46 baris** | **DITOLAK** |

Yang kedua itu jebakan presisi Excel yang sama dengan yang sudah dijaga di
export: 18 digit melebihi 15 digit signifikan, jadi tiga digit terakhirnya
jadi `000` (mis. `196906202003121000`). **Nol dari 46 cocok ke tabel Pegawai**
- jadi tidak ada risiko salah orang, tapi juga tidak bisa dipulihkan dari mana
pun, dan menebaknya berarti mengarang NIP. Deteksinya butuh `raw: true` saat
membaca sheet: kalau selnya sudah diformat jadi teks, NIP rusak tidak bisa
dibedakan lagi dari yang benar.

**NIK SENGAJA TIDAK diimpor** - konvensi yang sama dengan `importPegawaiSiap.ts`
(data pribadi yang tidak dibutuhkan skema tidak diambil).

**Dua hal yang TIDAK diperbaiki diam-diam, tapi dilaporkan ke layar**:
- **13 NIP ganda** - yang tersimpan baris TERAKHIR; kalau isinya beda, yang
  menang ditentukan urutan baris, bukan keputusan siapa pun.
- **3 kode bank SPAN dipakai dengan >1 nama bank** - mis. 343 baris ber-kode
  `520002000990` (BRI) tapi namanya ditulis "BANK NEGARA INDONESIA".
  Pemisahan ADK memakai KODE, jadi semuanya masuk berkas BRI. Hanya manusia
  yang bisa memutuskan mana yang benar. Ada juga 4 baris yang kolom kode
  banknya berisi nomor rekening (`1600005287947`) - tetap disimpan, ditandai.

**UI `/ppabp/basis-data-gaji`** (izin `canKelolaGajiInduk` - PPABP + ADMIN):
unggah, tabel perbandingan SIAP vs Web Gaji berdampingan, tombol "Hanya yang
beda dari SIAP", dan tile **"Memakai nama SIAP (cadangan)"** yang menghitung
pegawai aktif yang belum tercakup berkas.

**ADK Tukin sekarang memakai `IdentitasWebGaji.nama`**, jatuh ke
`Pegawai.nama` kalau belum ada - berkas pembayaran tidak boleh punya baris
tanpa nama, dan jumlah yang memakai cadangan ditampilkan supaya bisa
diperiksa. **Kode Satker** juga dapat sumber kedua dari sini: `GajiInduk`
periode berjalan didahulukan, kalau periodenya belum diunggah dipakai kode
dari basis data gaji (tidak terikat periode).

**Diverifikasi terhadap berkas ASLI** lewat jalur kode yang sama: 4.993 baris
terbaca (286 tertukar diperbaiki), 47 dilewati, **4.973 tersimpan**, dan
`RekeningPegawai` yang tadinya **KOSONG (0 baris)** terisi **9.944** (4.972
TUKIN + 4.972 GAJI). Export ADK Tukin diuji lewat production build: nama
keluar sebagai `"M. Satrio Pratomo, S.T"` / `"Wardah Sabrina Rambe, S.H."`
(bukan `"M.SATRIO PRATOMO"` / `"WARDAH SABRINA RAMBE"`), Kode Satker `450938`
terisi, kolom bank & rekening terisi, dan **Nama Rekening tetap kolom
tersendiri** (`"M SATRIO PRATOMO"`) - beda dari Nama Pegawai, sesuai maksudnya.
Aritmatika baris total tetap konsisten (13.811.100 − 137.142 = 13.673.958).
Tiga baris yang di-set APPROVED sementara untuk pengujian **SUDAH
dikembalikan ke DRAFT** (nol baris APPROVED tersisa).

### Export ADK dua format: Excel (.xlsx) & TXT

Dipicu 2 file contoh dari user: `export txt adk_tunkin-PNS_ROMUM_JUni__2026.xlsx`
dan versi `.txt`-nya (satker 450938 Biro Umum, periode 06/2026, 96 baris + 1
baris total). Diminta: tiap jenis ADK punya DUA tombol download.

**`src/business-logic/adk.ts`** (BARU, pure, 18 unit test) - header, penyusun
baris, baris total, dan perakit teks tab-separated. **Barisnya disusun SEKALI
di sini**; kedua format cuma beda bungkusnya. Kalau baris datanya disusun dua
kali di dua tempat, cepat atau lambat keduanya berbeda - dan bedanya baru
ketahuan setelah file salah terkirim ke Web Gaji.

**`src/app/ppabp/adk/responseAdk.ts`** (BARU) - membungkus baris jadi response
`.xlsx` (via `xlsx`, sheet "daftar bayar" seperti contoh) atau `.txt`. Dipakai
bareng ketiga route ADK. Perhatikan `xlsx` di-import NAMED di sini (gotcha
bundler Next yang sama dengan gaji-induk).

**Perubahan perilaku**: ketiga route ADK dulu mengeluarkan **CSV** (walau
label tombolnya "Download"). Sekarang `?format=xlsx` (default) menghasilkan
Excel SUNGGUHAN dan `?format=txt` teks tab-separated. Halaman `/ppabp/adk`
punya 6 tombol (2 x 3 jenis ADK).

**Detail format TXT** yang ditiru dari contoh: tab-separated, akhir baris
CRLF, dan **baris TOTAL** di akhir yang hanya mengisi kolom nilai uang.
Angka di baris data ditulis apa adanya, tapi di baris total pakai pemisah
ribuan + spasi pengapit (` 461.029.358 `) - itu memang yang muncul di file
contoh, karena file itu hasil "save as text" dari spreadsheet yang baris
totalnya diberi format angka.

**Kolom "Kode Satker" AKHIRNYA TERISI** - diambil dari `GajiInduk.kodeSatker`
periode yang sama (satu-satunya sumber kode satker resmi di sistem ini, hasil
upload ADK gaji GPP). Kalau periode itu belum diupload gaji induknya, kolomnya
tetap kosong - TIDAK ditebak. Ini menutup salah satu kolom yang sebelumnya
sengaja dikosongkan.

**Nilai uang DIBULATKAN ke rupiah bulat di lapisan export.** Kalkulasi tukin
menghasilkan pecahan (perkalian persentase) - verifikasi sempat memunculkan
total `Rp 95.443.018,725` - sementara SELURUH nilai di file ADK contoh berupa
bilangan bulat. Pembulatan dilakukan PER BARIS lalu baris total menjumlahkan
yang sudah dibulatkan, supaya total di file benar-benar sama dengan hasil
menjumlah kolomnya secara manual. TODO(confirm) PENTING: idealnya pembulatan
terjadi saat KALKULASI supaya angka di database, slip gaji, dan ADK persis
sama - sekarang `TukinCalculation.tukinBersih` masih menyimpan pecahan. Perlu
diputuskan apakah kalkulasinya ikut dibulatkan (berarti mengubah angka yang
sudah di-approve).

**Kolom rekening TETAP kosong** walau file gaji induk GPP sebenarnya memuatnya
- kolom itu sengaja dibuang saat parsing atas keputusan eksplisit user (lihat
model `GajiInduk`). Mengisinya di sini berarti membatalkan keputusan itu.

**ADK Uang Makan & Uang Lembur** ikut dapat dua tombol, TAPI kolomnya BUKAN
format resmi - belum ada contoh file ADK-nya. Uang lembur tetap ringkas (bukan
per-hari JHARI1..31 seperti contoh lembur lawas) karena skema menyimpan total
jam per bulan, bukan rincian per tanggal; sekarang jam hari kerja & hari libur
ditampilkan terpisah supaya angkanya bisa ditelusuri. TODO(confirm): minta
contoh ADK uang makan/lembur asli kalau formatnya sudah baku di Web Gaji.

**Diverifikasi** (production build, PPABP Irwan Syafril): keenam tombol
mengarah ke URL yang benar; unduhan TXT bertipe `text/plain` dengan 22 kolom
dan baris total ` 126.621.498 `; unduhan XLSX bertipe MIME Excel yang benar,
26 KB, magic bytes `PK` (zip sah). Isi kedua format dibandingkan baris-per-
baris lewat script terhadap data DB nyata: **13/13 baris (periode 6/2026) dan
9/9 baris (7/2026) cocok** pada NIP + ketiga kolom uang, baris total sama
dengan hasil penjumlahan ulang, dan aritmatika bruto - potongan = bersih
konsisten. Kode Satker terisi `450938` untuk 7/2026 dan kosong untuk 6/2026
(gaji induknya belum diupload) - persis perilaku yang diinginkan.

### Tombol "Setujui semua" (approval massal)

Ada di ketiga dashboard approver (`/tukin`, `/uang-makan`, `/uang-lembur`),
`src/app/actionsApprovalMassal.ts` + `ApprovalMassalForm.tsx`. Dibuat karena
satu periode bisa berisi ratusan baris x 2 jenjang, dan menyetujui satu per
satu membuat pengujian end-to-end (mis. memastikan export ADK ada isinya)
praktis mustahil.

**Yang membedakannya dari jalan pintas** - ini yang menentukan boleh/tidaknya
fitur seperti ini ada:
- **TIDAK** menulis `status = "APPROVED"` langsung ke tabel kalkulasi. Tiap
  baris tetap lewat `ajukanApprovalTukin`/`UangMakan`/`UangLembur` yang sama
  dengan tombol satuan, jadi urutan jenjang, penolakan siklus basi (log
  sebelum `calculatedAt`), dan pembaruan status tetap dievaluasi engine yang
  sama.
- **TIDAK** melewati otorisasi. Izin dicek **per baris** terhadap satuan kerja
  pegawainya - bukan sekali di awal - memakai `canApproveJenjang1` /
  `canApproveJenjangFinal`. Kasubag TU tetap cuma jenjang 1 di unitnya; baris
  di luar kewenangannya **dilewati dengan alasan yang ditampilkan**, bukan
  diloloskan. `?satker=` dari form tidak dipercaya untuk KASUBAG_TU.
- **TIDAK** memalsukan jejak. Tiap keputusan tetap satu baris `ApprovalLog`
  atas nama akun yang menekan tombol, bercatatan `"Approval massal"` - jadi
  bisa dibedakan dari approval yang benar-benar diperiksa satu per satu.
- Periode **wajib** sudah dipilih; tanpa `?bulan=&tahun=` tombolnya tidak
  muncul sama sekali (tanpa periode, "semua" berarti seluruh riwayat).
  PIMPINAN tidak pernah melihatnya (read-only).
- Konfirmasi dua langkah, bukan `confirm()` bawaan browser - dialog itu tidak
  bisa menampilkan berapa baris & periode mana, padahal justru itu yang perlu
  dibaca.

Satu akun bisa menuntaskan kedua jenjang hanya kalau memang berwenang di
keduanya (mis. ADMIN). Kasubag TU yang menekannya akan memajukan semua baris
ke jenjang 2 lalu berhenti, dan pesannya menyebutkan itu apa adanya.

**TODO(confirm)**: approval massal berarti approver menyetujui tanpa melihat
rincian tiap pegawai. Untuk pengujian wajar; untuk production perlu diputuskan
apakah tombol ini boleh ada, atau dibatasi ke lingkungan non-production.

### Gerbang "sudah disetujui" di tombol Hitung sekarang

Menutup TODO lama *"Kalkulasi massal Kasubag TU tidak punya pengaman sudah
APPROVED"*. Menghitung ulang selalu mengembalikan status ke `DRAFT` dan
memperbarui `calculatedAt`, sehingga seluruh `ApprovalLog` sebelum waktu itu
dianggap basi oleh `evaluasiApproval` - satu klik menghapus hasil approval satu
unit penuh.

**Bukan skenario teoretis.** Periode 7/2026 Biro Keuangan punya **278 baris
ApprovalLog** (139 jenjang 1 + 139 jenjang 2) untuk **47 pegawai** - siklusnya
terulang sekitar **tiga kali**, dan tiap kali export ADK-nya kosong lagi.
Terakhir: approval pukul 10.08.11, kalkulasi ulang pukul 10.08.33 - **22 detik**
kemudian.

Sekarang, kalau periode itu punya baris APPROVED, form menampilkan panel merah
berisi jumlahnya dan dua pilihan:
- **Lewati yang sudah disetujui** (bawaan) - hanya baris non-APPROVED yang
  dihitung, approval yang ada tetap utuh.
- **Hitung ulang semua** - baru muncul kotak konfirmasi yang menyebut jumlah
  approval yang akan dibatalkan. Dua langkah, pola sama dengan "Setujui semua".

**Bawaannya yang aman, bukan yang merusak** - dan hasilnya disebutkan apa
adanya di pesan sukses (`N pegawai yang sudah APPROVED DILEWATI` atau
`PERHATIAN: N approval DIBATALKAN`). Dicek ULANG di server (form bisa dikirim
siapa saja, dan jumlahnya bisa berubah antara halaman dirender dan tombol
ditekan) - pola sama dengan gerbang kelengkapan predikat yang sudah ada.

Diverifikasi lewat production build terhadap data nyata: panel muncul berbunyi
"1 pegawai periode Juli 2026 sudah APPROVED", radio `lewati` ber-`checked`, dan
kotak konfirmasi belum dirender selama pilihannya masih "lewati".

**"Nol dihitung" TIDAK LAGI tampil hijau.** Kalau seluruh baris dilewati karena
sudah APPROVED, pesannya dulu berbunyi *"Tukin terhitung untuk 0 pegawai... 47
pegawai yang sudah APPROVED DILEWATI"* — kalimat benar, warna salah: hijau
terbaca "beres" dan orang berhenti di situ. Terjadi betulan sesudah koreksi jam
Acep: tombolnya ditekan, ke-47 baris Biro Keuangan tetap basi, dan penanda
kuning di tabel dikira kerusakan. Sekarang keadaan itu memakai field terpisah
`peringatan` (panel kuning, BUKAN `success`) yang menyebut penyebabnya dan
langkah berikutnya. Syaratnya sempit — `dihitung === 0` DAN yang dilewati murni
karena APPROVED — supaya kasus "dilewati karena predikat belum ada" tetap
memakai jalur laporan yang sudah ada.

**TODO(confirm) - ADK Tukin TIDAK di-filter per satuan kerja.** Route-nya cuma
menyaring periode + `status: "APPROVED"` + `?bank=`, jadi satu berkas memuat
SEMUA unit yang barisnya sudah disetujui, dikelompokkan per bank saja. Sekarang
tidak kelihatan karena baru satu unit yang punya baris APPROVED. Kalau SAKTI SPP
ternyata butuh per satker DAN per bank, route ini perlu parameter satker
tambahan - perlu ditanyakan sebelum dipakai membayar lintas unit.

Diverifikasi lewat jalur kode yang sama (2 baris Tukin 7/2026): baris yang
sudah punya jenjang 1 dilanjutkan dari jenjang 2, baris kosong dijalankan
1 lalu 2, keduanya berakhir `APPROVED` dengan `ApprovalLog` lengkap.

### Pejabat Pimpinan Tinggi: komponen kehadiran dibayar penuh

Keterangan user: pejabat setingkat **Eselon II** (Kepala Biro, Sekretaris
Ditjen/Itjen/Badan, Direktur, Inspektur, Kepala Pusat) menerima bobot
kehadiran 30% **penuh** sebagai kompensasi jabatan - tanpa potongan Pasal 13.

**`src/business-logic/pejabatPimpinanTinggi.ts`** (PURE, 11 unit test) +
field opsional `TukinInput.dikecualikanPotonganKehadiran`.

**TIDAK ADA KOLOM ESELON, dan tidak perlu ditambah.** `Pegawai` tidak
menyimpannya dan SIAP tidak mengirimkannya dalam bentuk itu, TAPI
`kelasJabatan` sudah cukup - untuk jabatan struktural angkanya datang dari
`SATKER.JOBGRADE`, sumber yang SAMA yang menentukan tarif tukin pokok. Diuji
ke 5.077 pegawai aktif, sebarannya jatuh persis di batas eselon tanpa satu
pun jabatan lain yang nyasar:

| Kelas | Jumlah | Isinya |
|---|---|---|
| 17 | 6 | Sekjen, Irjen, 3 Dirjen, Kepala Badan (JPT Madya) |
| 16 | 4 | Staf Ahli (JPT Madya) |
| **15** | **40** | Kepala Biro, Direktur, Inspektur I-IV, Sekretaris Ditjen/Itjen/Badan, Kepala Pusat, Ka. Sekretariat BNSP (**JPT Pratama = Eselon II**) |

**Cara lain yang diuji dan DITOLAK**: `unitKerja === satuanKerja` (dugaan
"kepala unit Eselon II ber-SATKERID tepat 6 digit"). Kena **3.069 dari
5.077** pegawai - seluruh staf UPT/Balai ikut, karena SATKERID mereka memang
berhenti di nama balainya.

**ESELON I IKUT DIKECUALIKAN** (batas `>= 15`) walau yang disebut user cuma
Eselon II: memisahkannya menghasilkan aturan yang tidak koheren - Kepala Biro
(15) dibayar penuh sementara Sekretaris Jenderal (17) tetap dipotong. Satu
konstanta `KELAS_JABATAN_MINIMUM_JPT`, gampang diubah jadi `=== 15` kalau
ternyata keliru.

**Yang dimatikan HANYA Pasal 13.** Pasal 14 (cuti), pengali tugas belajar,
dan bobot kinerja 70% tetap berlaku - ketiganya mekanisme berbeda, dan tidak
ada keterangan bahwa JPT dikecualikan dari mereka juga. Ada test yang
menguncinya (predikat 60% -> dibayar 30% + 42% = 72%).

**Pelanggarannya TIDAK dihapus.** `rincianPotonganKehadiran` tetap berisi
terlambat/pulang cepatnya dan tetap tampil di layar (dicoret + panel kuning),
cuma tidak menghasilkan potongan rupiah; `potonganKehadiranPersenSebelum
Pengecualian` menyimpan berapa yang seharusnya. Menghapusnya berarti
kehilangan bahan pengawasan atas orang yang justru paling perlu diawasi.
Kalkulasi juga **menyebut nama & nominalnya di layar** - sama seperti
penurunan kelas jabatan, perubahan tarif tidak boleh terjadi diam-diam.

**Diturunkan dari kelas jabatan EFEKTIF, bukan kelas dasar** - pejabat yang
diturunkan jabatannya karena hukuman disiplin memang tidak lagi memegang
jabatan yang dikompensasi itu.

**`src/app/BadgePejabatEselon.tsx`** - ikon ★ kecil di samping nama, diklik
memunculkan keterangan (jenjang, kelas jabatan, apa yang dikecualikan, dan
bahwa dasar hukumnya masih ditunggu). Terpasang di tabel `/kasubag/kalkulasi`
(lewat `NamaPegawai`, jadi ketiga tabelnya sekaligus), dashboard `/tukin`,
tabel `/tukin/presensi`, judul `/tukin/presensi/[nip]`, dan profil `/saya`.
Mengembalikan `null` untuk pegawai biasa - penanda yang muncul di mana-mana
tidak menandai apa pun.
- Pakai **`<details>` bawaan HTML, bukan popover client component**:
  buka-tutupnya ditangani browser, jadi tetap jalan tanpa JavaScript -
  konsisten dengan janji yang dipegang filter GET & form approval.
- Isinya muncul **di dalam sel**, bukan melayang di atasnya. Tabel-tabel itu
  dibungkus `overflow-x: auto`, dan panel melayang akan terpotong di tepi
  kontainer.
- **JANGAN taruh badge ini di dalam `<p>`, heading, atau `<span>`.**
  `<details>` itu *flow content*, sementara elemen-elemen itu cuma boleh
  memuat *phrasing content* - parser HTML menutup paksa induknya, jadi DOM
  hasil parsing beda dari pohon React dan Next melempar **hydration error yang
  menunjuk ke `<summary>` di dalam komponennya**, bukan ke tempat
  pemakaiannya. Sempat terjadi di `/tukin` (di dalam `<p>`) dan
  `/tukin/presensi/[nip]` (di dalam `<h1>`) - keduanya sudah diganti `<div>` /
  dikeluarkan dari heading. Di dalam `<td>` aman.

**Diverifikasi terhadap data & production build** (server sementara di port
3099, akun PPABP): halaman Irma Puspita memuat badge-nya, dan tabel rincian
menampilkan "Terlambat hadir 40 menit -> 0,4% -> Rp 23.136" serta "Pulang
lebih awal 20 menit -> 0,2% -> Rp 11.568" **dicoret**, dengan baris "Total
potongan (dikecualikan) 0% / Rp 0" dan "Komponen kehadiran yang dibayar
**Rp 5.784.000**" sama persis dengan bobot penuhnya - dan angka itu juga
sama persis dengan kolom hasil kali 30% di rincian manual Rokeu. Galih
Febian Azhar (kelas 7) diperiksa sebagai pembanding: **nol** badge, nol
`<details>`.

**TODO(confirm) - DASAR HUKUMNYA BELUM ADA SALINANNYA.** Seluruh teks
Permenaker sudah dibaca: Pasal 7 ayat (2) mengecualikan penyampaian aktivitas
harian HANYA untuk tugas belajar/diklat/cuti, dan Pasal 20 ayat (2) huruf b
justru menempatkan JPT Pratama sebagai **penanggung jawab** rekapitulasi
kehadiran unitnya - bukan pihak yang dikecualikan. Aturan ini membayar penuh
~50 orang tanpa melihat presensi, jadi WAJIB diminta dasarnya (lihat B1b di
`docs/permintaan-data-dan-konfirmasi-osdma.md`). Selama belum ada, tiap
pemakaiannya menghasilkan catatan anomali ber-`TODO(confirm)`.

**Bukti praktik** (rincian manual Rokeu Juli 2026): Irma Puspita, Kepala Biro
Keuangan dan BMN (kelas 15), dibayar Rp 19.280.000 dengan kolom potongan NOL
padahal rekap e-Presensi mencatat terlambat 40 menit (9 Juli) + pulang cepat
20 menit (10 Juli). Toleransi 60 menit Pasal 9 ayat (3) hanya menjelaskan
yang 40 menit. Angka Rp 19.280.000 itu dikunci di test.
**HATI-HATI menyimpulkan dari file itu saja**: dari 48 baris, 21 berpotongan
nol dan **7 di antaranya punya pelanggaran menurut Gajihub** - cuma satu yang
Eselon II. Sisanya (telat 6 menit, pulang cepat 2/14 menit, lupa absen 1)
lebih mungkin efek toleransi 60 menit yang belum diterapkan, bukan status
jabatan.

**GAP YANG BELUM DITUTUP - 50 pejabat itu tidak punya predikat kinerja.**
Query ke database: **0 dari 50** pegawai berkelas >= 15 punya `PredikatKinerja`
untuk 6/2026 maupun 7/2026, padahal Irma punya nilai "Sangat Baik" di sheet
SKP rincian manual. Penilaian mereka datang lewat atasan langsung, bukan
rekap unit e-Kinerja BKN yang di-upload Kasubag TU. Akibatnya mereka
**DILEWATI kalkulasi** dengan alasan "predikat kinerja belum diupload" dan
tidak muncul di ADK sama sekali. Sementara ini ditutup lewat form "tambah
predikat satuan" di `/tukin/predikat-kinerja` (otomatis bertanda
`MANUAL_ENTRY` + chip "bukan dari BKN"). TODO(confirm): apakah ada export
e-Kinerja tersendiri untuk JPT yang bisa di-upload seperti rekap unit.

### Penurunan kelas jabatan karena hukuman disiplin

PP 94/2021 mengenal hukuman disiplin berat berupa **penurunan jabatan setingkat
lebih rendah** selama jangka waktu tertentu. Karena tarif tukin pokok
ditentukan kelas jabatan, itu langsung mengubah yang dibayarkan.

**SIAP TIDAK MENCATATNYA SAMA SEKALI** - dikonfirmasi user lewat kasus nyata:
Galih Febian Azhar turun kelas **7 → 6** selama satu tahun, SIAP tetap menulis
7. Jadi angkanya memang harus diketik manusia, dan itu bukan kekurangan
sementara yang akan hilang begitu integrasinya membaik.

Ketemunya lewat jalan memutar: waktu ADK Gajihub diadu ke rincian manual
Rokeu, kelas jabatan cocok **46 dari 48** - dan dua yang meleset persis
turun satu tingkat (Gadis Sukma Dewa 8→7, Galih Febian Azhar 7→6).

**Kolom baru `SkHukumanDisiplin.kelasJabatanSelamaHukuman`** (migrasi
`20260810120000_penurunan_kelas_jabatan_hukdis`, satu ADD COLUMN nullable).

**KENAPA BUKAN mengoreksi `Pegawai.kelasJabatan`** - tiga alasan, semuanya
menentukan:
1. Kolom itu MIRROR dari SIAP dan **ditimpa ulang tiap `npm run sync:pegawai`**
   - koreksi manual di sana hilang pada tarikan berikutnya.
2. SIAP tidak akan pernah mengirimkannya, jadi tidak ada yang memperbaikinya
   sendiri.
3. Penurunannya **BERJANGKA**. Setelah masa hukuman lewat kelasnya kembali,
   TAPI periode selama hukuman harus tetap dihitung dengan kelas yang turun.
   Satu angka di tabel Pegawai tidak bisa menyimpan dua kebenaran sekaligus.

**Disimpan ABSOLUT** (kelas berapa), bukan "turun berapa tingkat": kalau
relatif, kelas dasar yang keliru di SIAP ikut menggeser hasilnya tanpa
ketahuan. Yang dipakai membayar jadi sama persis dengan yang tertulis di SK.

`src/business-logic/kelasJabatanEfektif.ts` (PURE, 11 unit test):
- **Hanya SK berstatus `DISETUJUI` yang berpengaruh.** Memotong pembayaran atas
  usulan yang belum diputuskan OSDMA jelas keliru - lebih mudah membayar
  kekurangan nanti daripada menarik kembali uang yang sudah dipotong.
- Batas atas periode **inklusif**: "selama 1 tahun" mulai 7/2026 = selesai
  6/2027, dua belas periode (ada test yang menghitungnya).
- Periode selesai kosong = berlaku sampai dicabut. Action **menolak** kalau
  cuma bulan ATAU tahunnya yang diisi - kalau lolos, hukuman setahun diam-diam
  jadi permanen.
- Kalau ada dua SK bertumpang, dipakai kelas TERENDAH, dan `semuaSkPenurunanBerlaku()`
  memunculkan tumpangnya supaya bisa diperiksa manusia.

**Dipakai di dua tempat yang harus sepakat**: kalkulasi massal
(`/kasubag/kalkulasi`) dan export ADK Tukin. Kalau ADK tetap memakai kelas
SIAP, Nilai Bruto-nya lebih besar dari yang dipakai menghitung dan potongannya
kelihatan menggelembung. Kalkulasi juga **melaporkan perubahannya ke layar**
("kelas jabatan 7 → 6 karena hukuman disiplin, SK ...") - perubahan tarif tidak
boleh terjadi diam-diam.

**TIDAK ADA hubungannya dengan Pasal 15** (potongan persentase karena hukuman
disiplin) yang masih belum diimplementasi. Ini mekanisme BERBEDA: bukan
memotong hasil, tapi mengganti tarif dasarnya. TODO(confirm): kalau nanti
Pasal 15 jadi diimplementasi, perlu ditegaskan ke Biro Hukum apakah keduanya
berlaku bersamaan - kalau iya, satu pelanggaran dihukum dua kali.

#### Penanda "SK belum terbit"

Keputusan hukuman diproses pimpinan dan nomor SK-nya terbit **belakangan**,
sementara unit sudah perlu mencatat orangnya supaya tukin periode berjalan
tidak terlanjur dibayar dengan kelas jabatan lama. Kolom
`SkHukumanDisiplin.skBelumTerbit` + `nomorSk` jadi nullable (migrasi
`20260810140000_sk_hukdis_belum_terbit`).

**KENAPA KOLOM SENDIRI, bukan menulis "(belum terbit)" di `nomorSk`:**
- **Bisa di-query.** Pertanyaan yang wajib bisa dijawab sebelum go-live - "SK
  mana saja yang sudah memotong tukin padahal nomornya belum ada?" - tidak bisa
  dijawab dari teks bebas tanpa menebak pola penulisannya.
- Teks bebas ikut tercetak apa adanya ke daftar & laporan; satu baris
  bertuliskan "(belum terbit)" di kolom Nomor SK gampang terbaca sebagai nomor
  yang sebenarnya.
- Penulisannya pasti tidak seragam antar orang ("belum ada", "-", "TBD"), jadi
  tidak bisa dihitung.

**Nomor SK dan penandanya saling meniadakan** - action menolak kalau keduanya
terisi, dan field nomornya dinonaktifkan begitu dicentang. Kalau dua-duanya
boleh diisi, orang akan mengetik "-" lalu mencentang, dan penandanya jadi tidak
berarti apa-apa.

**TIDAK menghalangi perhitungan**: baris bertanda ini tetap berpengaruh ke
tarif setelah disetujui OSDMA, supaya alurnya bisa diuji utuh. Yang dijamin
cuma satu hal - keadaannya kelihatan di **setiap layar tempat manusia bisa
mengambil keputusan**: chip merah di daftar Kasubag TU, chip merah di layar
approval OSDMA (supaya menyetujuinya jadi tindakan sadar), catatan hasil
kalkulasi ("SK BELUM TERBIT" menggantikan nomornya), dan **panel merah khusus**
di halaman Kasubag TU yang mendaftar kombinasi paling berbahaya: sudah
DISETUJUI tapi nomornya belum ada - jadi bisa ditelusuri sekali lihat menjelang
tutup periode.

**TODO(confirm) - GADIS SUKMA DEWA**: selisih kelasnya (SIAP 8, manual 7) juga
turun tepat satu tingkat, tapi belum ada keterangan sebabnya. Perlu dipastikan
apakah itu hukuman disiplin juga (kalau iya, tinggal diinput SK-nya) atau
memang kelas jabatannya yang salah di SIAP.

### BUG: Nilai Bruto & Potongan di ADK Tukin (FIXED)

Ketemu waktu mencari cara memaksimalkan fitur Tukin, dengan membaca sheet
**"Masuk ADK"** di rincian manual Rokeu (`Rincian Tunkin Juli 2026.xlsx`) -
sheet itu cuma punya dua kolom uang:

```
NIP                  nama            pot          tukin
197601091999032001   ARINI SARKOWI   44.235,12    9.851.764,88
```

`tukin` = tarif penuh kelas jabatannya (kelas 12 = 9.896.000) dikurangi `pot`.
Jadi **Nilai Bruto = tarif PENUH, Nilai Potongan = potongan kehadiran**.

Gajihub mengisi ketiganya dari `tukinPokok / potonganPph / tukinBersih`, dan
itu keliru dua kali:
1. `TukinCalculation.tukinPokok` sudah nilai **SETELAH** potongan Pasal 13,
   bukan tarif penuh.
2. `potonganPph` **tidak pernah diisi** - kalkulasi massal Kasubag TU tidak
   mengoper `tarifPphEfektif` sama sekali.

Akibatnya file ADK keluar dengan **Nilai Bruto = Nilai Bersih dan Nilai
Potongan = 0** — seluruh potongan kehadiran yang jadi inti perhitungan tidak
muncul. Terukur: **46 dari 46** baris Juli 2026 akan terkirim dengan potongan
nol.

Perbaikannya di `nilaiUangAdkTukin()` (`src/business-logic/adk.ts`): bruto dari
`TUKIN_POKOK_PER_KELAS_JABATAN`, potongan = bruto − bersih. **Pembulatan pada
bruto & bersih DULU**, potongan diturunkan dari selisih keduanya - supaya
`bruto − potongan = bersih` tepat pada bilangan bulat di dalam file.

**PPh yang selalu nol ternyata SESUAI praktik** - tidak ada satu pun kolom
PPh/pajak di seluruh workbook manual itu. Yang salah cuma pemakaian kolomnya.
Kalau suatu saat PPh benar-benar dipotong, angkanya ikut sendiri: `tukinBersih`
sudah bersih dari PPh, jadi selisih ke bruto membesar dengan sendirinya.

**Diverifikasi ke sheet "Rekap Tukin Juli"** (48 pegawai), dibandingkan ke
kolom "Tunjangan Kinerja" yang memang tarif penuhnya: **tarif cocok 46/48**,
dan dua yang meleset persis kasus penurunan kelas karena hukuman disiplin
(lihat bagian di atas) - bukan salah rumus.

**TODO(confirm) yang tersisa - apa arti "Nilai Potongan" bagi Web Gaji?**
Kolom "Potongan" di rekap manual ternyata **hanya potongan KEHADIRAN**, bukan
total pengurangan. Buat 47 dari 48 pegawai itu tidak berbeda, karena predikat
mereka 100% sehingga tidak ada pengurangan dari sisi kinerja. Bedanya baru
muncul pada Galih Febian Azhar (predikat "Butuh Perbaikan" = 85%):

```
tarif kelas 6      3.510.400
potongan kehadiran   248.852   (23,63% dari bobot kehadiran)
bersih             2.892.956   <- 3.510.400 - 248.852 = 3.261.548, BUKAN ini
```

Selisih 368.592 itu pengurangan predikat, dan di rekap manual memang tidak
masuk kolom Potongan. Gajihub memakai `potongan = bruto - bersih`, jadi untuk
Galih angkanya 617.444, bukan 248.852. Pilihan itu disengaja: file pembayaran
harus memenuhi `bruto - potongan = bersih`, dan versi kehadiran-saja tidak.
Perlu ditanyakan mana yang diharapkan Web Gaji sebelum dipakai membayar
sungguhan.

### Rincian potongan kehadiran ditampilkan ke pegawai

`hitungPotonganKehadiranPersen()` sudah lama menghasilkan rincian per jenis
pelanggaran (jenis, dasar hukum, jumlah, satuan, tarif, total) — tapi grep
`rincianPotonganKehadiran` cuma menemukan engine, test, dan definisi tipe.
**Nol tempat di UI.** Angka itu dihitung tiap kalkulasi lalu dibuang.

`src/app/RincianPotonganKehadiran.tsx` (BARU) menampilkannya sebagai tabel di
dua tempat: `/saya` (pegawai menjawab sendiri "kenapa tukin saya segini") dan
`/tukin/presensi/[nip]` (Kasubag TU/PPABP menelusuri satu orang).

- **Memanggil fungsi yang SAMA dengan yang menghitung pembayaran**, bukan
  menyalin tarifnya. Kalau aturan Pasal 13 berubah, tabel ikut sendiri - tidak
  ada kesempatan tampilan dan perhitungan berbeda.
- **Direkonstruksi dari `RekapPresensiPeriode`, bukan disimpan.** Menyimpannya
  butuh migrasi + tabel baru, sementara bahannya sudah ada dan pasti.
- **Selisih terhadap angka tersimpan ditunjukkan, bukan disembunyikan.** Yang
  ditampilkan adalah rekap presensi SAAT INI; kalau tidak menjumlah ke
  `komponenKehadiran` yang tersimpan (toleransi 1 rupiah untuk pembulatan
  floating point), itu berarti presensinya berubah setelah Tukin terakhir
  dihitung - dan halamannya bilang "perlu hitung ulang".

### ADK Uang Makan & Uang Lembur: format PER HARI, tanpa rupiah

Dipicu 4 file template dari user (`Template-ADK-UM.xlsm` + `-TXT.txt`,
`Template-ADK-Lembur.xlsm` + `-txt.txt`). Keluhannya: "yang sekarang ketika di
export malah berantakan isinya" - dan memang, export lama mengeluarkan tabel
rekap berisi rupiah + baris TOTAL, bentuk yang dikarang sendiri waktu contoh
filenya belum ada.

**Bentuk yang benar sama sekali beda dari ADK Tukin**, dan bedanya bukan gaya:

| | ADK Tukin | ADK Makan & Lembur |
|---|---|---|
| Satu baris = | satu PEGAWAI | satu pegawai **per HARI** |
| Isi | rupiah + rekening + kode bank | **NIP + tanggal** (+ jam, untuk lembur) |
| Baris header | ada | **tidak ada** |
| Baris total | ada | **tidak ada** |
| Dipisah per bank | ya (SAKTI SPP per bank) | **tidak** |

Web Gaji yang menghitung rupiahnya sendiri dari grade pegawai - file ini cuma
menyetorkan FAKTA harian. Karena tidak ada perintah bayar di dalamnya,
pemisahan per bank tidak berlaku di sini.

**Struktur .xlsm operator sudah dibaca sampai tuntas**: 4 sheet - `depan`
(grid entri manual, satu kolom per tanggal), `ref` (nama bulan buat dropdown),
`pegawai` (master NIP/nama/grade), dan `hasil`. **Isi sheet `hasil` SAMA
PERSIS dengan file .txt-nya** (dicek 2.097/2.097 dan 111/111 entri) - jadi
.txt itu "save as text" dari sheet tersebut, dan .xlsm-nya alat entri + makro,
bukan formatnya. Export Gajihub meniru keduanya: .xlsx berisi sheet `depan`
(buat diperiksa manusia) **dan** `hasil` (muatan yang disetor).

**Yang dibuktikan dari isi file, bukan diasumsikan** - semuanya di
`src/business-logic/adkHarian.ts`:
- TAB separated, akhir baris **CRLF**, tanggal ISO `YYYY-MM-DD`.
- Jam lembur **bilangan bulat** (nilai yang muncul 1-6, 8, 9; nol pecahan di
  111 baris). Mesin Gajihub menghasilkan pecahan, jadi dibulatkan di lapisan
  export.
- Uang makan **tidak punya kolom ketiga** - kehadiran itu ya/tidak.
- Dua kolom ringkasan di sheet `depan` lembur = **[jam hari kerja, jam hari
  libur]**, diuji **cocok 35/35**. Persis pemisahan yang sudah dipunya Gajihub.
- File asli diakhiri baris berisi tab kosong (sisa "save as text"). **TIDAK
  ditiru** - baris kosong bukan bagian format.
- NIP di file asli ada 15 baris yang berspasi di belakang. Export Gajihub
  merapikannya, dan menulis NIP sebagai **teks** di .xlsx (18 digit melebihi
  presisi angka Excel - kalau jadi angka, ujungnya berubah nol dan barisnya
  tidak akan ketemu di Web Gaji).

**LIBUR NASIONAL TERNYATA TIDAK PERLU KALENDER.** Ini yang paling melegakan:
tanggal merah otomatis hilang dari daftar uang makan karena di hari itu
e-Presensi memang tidak punya satupun baris WFO/WFH. Dibuktikan dua arah -
1 Juni 2026 (Hari Lahir Pancasila) cuma berisi Upacara 4.517 orang + Lembur 12,
16 Juni 2026 (Tahun Baru Islam) cuma Lembur 7; dan 20 tanggal di file asli =
persis 20 hari kerja Juni setelah kedua tanggal itu keluar.

**Kolom `PresensiHarian.jamLembur` BARU** (migrasi
`20260810000000_tambah_jam_lembur_harian`, satu ADD COLUMN dengan default).
Angkanya sebenarnya **sudah lama dihitung per hari** oleh `rekapDariLaporanPdf()`
- tiap elemen `hari[]` punya `jamLembur` - tapi dibuang setelah dijumlahkan.
Catatan lama di route uang lembur ("format asli per-HARI JHARI1..31 sementara
skema cuma simpan total, jadi tidak dibuat") sekarang **tidak berlaku pada dua
hal**: formatnya bukan JHARI1..31, dan rinciannya sekarang ada.

**Diverifikasi terhadap data & file asli** (Biro Keuangan, Juni 2026): bentuk
file lolos semua (kolom, NIP 18 digit, tanggal ISO, jam bulat, CRLF), dan
**uang makan cocok 415 dari 415** entri yang NIP-nya juga ada di file asli -
nol baris yang berbeda. (507 baris sisanya untuk pegawai yang memang tidak ada
di ADK unit itu.)

#### PERINGATAN: isi ADK Uang Lembur akan jauh lebih sedikit

Ini soal DATA, bukan format, dan tidak bisa diperbaiki dengan menulis kode.

Gajihub menghitung lembur **hanya dari baris berstatus "Lembur"** di
e-Presensi - aturan yang dulu diturunkan dari file PDF uji, di mana 14 dari 14
baris Lembur jatuh di Sabtu/Minggu. Data nyata membantah generalisasinya untuk
hari kerja:

| | Hari kerja | Akhir pekan |
|---|---|---|
| Baris "Lembur" di e-Presensi, Juni 2026, SE-KEMENTERIAN | **21** (12 di antaranya tanggal merah) | 405 |
| File ADK asli, Juni 2026, **satu unit saja** | **109** | 2 |

Sebabnya terlihat jelas di data: John Pieter diklaim lembur 3, 9, 16, 22, 29
Juni; di e-Presensi tanggal 16 (libur nasional) statusnya **Lembur**, tapi
tanggal 3, 9, 22, 29 statusnya **WFO** dengan jam keluar 18:54, 20:31, 19:12,
19:37. Lembur hari kerja dikerjakan sebagai WFO yang pulang malam.

**JANGAN menurunkan lembur dari jam pulang.** Di unit yang sama, 46 dari 48
pegawai punya hari dengan jam keluar lewat 17:00 (367 hari) - sementara yang
benar-benar diajukan cuma 35 orang / 111 hari. Lembur butuh **surat perintah
lembur**; pulang malam bukan lembur. Sumber sahnya tidak ada di database
manapun. TODO(confirm): perlu diputuskan apakah Gajihub menerima upload/entri
SPL, atau ADK lembur tetap diisi manual di luar sistem. Halaman `/ppabp/adk`
menampilkan peringatan ini otomatis selama jumlah lembur hari kerjanya tidak
wajar.

#### TODO(confirm) dari selisih uang makan

Perbandingan ke file asli Juni 2026 menyisakan 13 tanggal berbeda dari 2.097
baris, dan penyebabnya bukan bug:
- **4 hari Dinas Luar DIBAYAR di file asli** (Adipa Rizky Putra 17-19 Juni,
  Yudi Apriyanto 17 Juni), sementara aturan yang user tetapkan sendiri
  mengecualikan Dinas Keluar (konsumsi ditanggung perjalanan dinas). Belum
  diubah - 4 dari 2.097 bisa saja kekeliruan operator, tapi kalau ternyata
  memang praktiknya, `STATUS_BERHAK_UANG_MAKAN` yang perlu diubah.
- **4 hari Cuti dibayar** (Defri Ariandi, Saka Prayitno Putro) - kemungkinan
  cutinya masuk e-Presensi setelah ADK dibuat.
- 2 hari WFH Jumat yang Gajihub hitung tapi file asli tidak.

### Uang makan & uang lembur mengikuti SBM 2026

Dipicu PDF "SBM 2026" + aturan dari user. Menutup sebagian open item #8
(tarif), dan mengubah SIAPA yang dibayar - bukan cuma berapa.

**`src/business-logic/tarifSbm.ts`** (BARU) - tarif resmi SBM 2026 halaman
-13-, dipisah dari engine kalkulasi karena SBM terbit tiap tahun (pola sama
dengan `tarifTukinPokok.ts`; engine tetap menerima tarif sebagai parameter):
- item 22.1 uang makan (OH): Gol I & II Rp 35.000, III Rp 37.000, IV Rp 41.000
- item 23.1 uang lembur (OJ): Gol I Rp 18.000, **II Rp 24.000**, III
  Rp 30.000, IV Rp 36.000
- item 23.2 uang makan lembur (OH): sama dengan item 22.1

**PERHATIKAN pengelompokan golongannya BEDA** dan ini bukan salah ketik:
uang makan menyatukan Gol I & II (3 tingkat), uang lembur per jam
memisahkannya (4 tingkat). Ada test khusus yang menjaga supaya tidak ada
yang "merapikan" jadi seragam.

`golonganRomawi("III/d")` menurunkan golongan dari `Pegawai.golongan`.
Mengembalikan **null kalau tidak terbaca, TIDAK menebak** - pemanggil wajib
melewati pegawainya dengan alasan eksplisit, karena salah golongan = salah
tarif = salah bayar.

**Uang makan - siapa yang BERHAK** (aturan user): WFO dan WFH/WFA berhak;
**Diklat & Dinas Keluar TIDAK** (konsumsinya sudah ditanggung kegiatan/
perjalanan dinas). Jadi dasar bayarnya BUKAN lagi "jumlah hari hadir" -
`UangMakanInput` sekarang minta `jumlahHariWfo` + `jumlahHariWfhWfa`
terpisah, dan hasilnya membawa `jumlahHariDibayar` supaya selisih antara
"hadir" dan "dibayar" bisa dijelaskan, bukan hilang diam-diam. Contoh: hadir
22 hari (15 WFO + 3 WFH + 2 diklat + 2 dinas luar) gol III dibayar 18 hari =
Rp 666.000, bukan 22 hari = Rp 814.000.
TODO(confirm): perlakuan IZIN/SAKIT/CUTI/TUGAS BELAJAR belum ditegaskan -
sekarang semuanya tidak dihitung (bukan WFO/WFH/WFA).

**Uang lembur - DUA komponen, satuan beda**: uang lembur per JAM (item 23.1)
+ uang makan lembur per HARI (item 23.2), syarat lembur hari itu **minimal
2 jam**. Karena satuannya beda, total jam sebulan TIDAK cukup buat
menurunkan uang makan lemburnya - `UangLemburInput` minta
`jumlahHariMakanLembur` terpisah, dan ada helper murni
`hitungHariBerhakMakanLembur(rincianJamPerHari[])` buat pemanggil yang punya
rincian harian. Contoh gol III lembur 1+2+3+4+1,5 jam (5 hari): uang lembur
11,5 x Rp 30.000 = Rp 345.000, uang makan lembur cuma **3 hari** (yang 1 jam
& 1,5 jam tidak memenuhi) x Rp 37.000 = Rp 111.000, total Rp 456.000.
Engine juga menandai anomali kalau jumlah hari makan lembur mustahil dari
total jamnya (n hari x 2 jam > total jam).

**Migrasi `20260729140000_uang_makan_lembur_sbm`** (semua ADD COLUMN dengan
default, non-destruktif):
- `RekapPresensiPeriode` + kolom hari per status (WFO/WFH-WFA/Diklat/Dinas
  Luar) dan dua kolom lembur. Kolom diklat & dinas luar tetap disimpan walau
  tidak dibayar - supaya selisihnya bisa dijelaskan.
- `UangMakan.jumlahHariDibayar`; `UangLembur` + `uangLembur`,
  `uangMakanLembur`, `jumlahHariMakanLembur`, `tarifMakanLemburPerHari`.
- `StatusKehadiran` bertambah WFO/WFH/DIKLAT/DINAS_LUAR (`HADIR` lama tetap
  diperlakukan sebagai WFO supaya data lama tidak berubah artinya).

**Kalkulasi massal Kasubag TU sekarang ikut menghitung Uang Lembur** (dulu
sengaja dilewati karena tidak ada sumber data jam lembur) - datanya sekarang
datang dari rekap presensi yang di-upload. Kalau jam lemburnya nol, barisnya
tidak dibuat supaya tidak ada baris Rp 0 yang ikut antre approval. Tarif
uang makan/lembur tidak lagi satu angka untuk semua orang - diturunkan dari
golongan tiap pegawai.

**Template rekap presensi** (`/tukin/presensi/template`) bertambah 6 kolom:
Hari WFO, Hari WFH/WFA, Hari Diklat, Hari Dinas Luar, Jam Lembur, Hari Makan
Lembur.

**TIDAK ADA jeda sebelum lembur - lembur dihitung sejak jam pulang wajib.**
Keterangan user 2026-08-19 beserta contohnya: *"semisal pegawai absen pulang
jam 16:00 terus dia mau lembur sampai jam 20:00, dari jam 16 ke 17 itu udah
kehitung 1 jam lembur"*. Jadi 16:00-20:00 = **4 jam**.

- **Jeda 1 jam sempat dipasang 2026-08-18 lalu DICABUT 2026-08-19.** Keterangan
  pertama berbunyi *"lembur berlaku 1 jam setelah jam kerja... jam 4-5 nya tidak
  termasuk"*; contoh susulan di atas membantahnya. Dicatat di kode
  (`presensiPdfKeRekap.ts`, blok "TIDAK ADA JEDA SEBELUM LEMBUR") supaya tidak
  dipasang lagi tanpa dasar baru - keduanya datang dari keterangan lisan dan
  gampang tertukar.
- **Syarat 2 jam uang makan lembur (SBM item 23.2) ikut diukur dari jam pulang
  wajib.** Pulang 17:00 = 1 jam, belum berhak; pulang 18:00 = 2 jam, berhak.
  Sewaktu jeda terpasang, batas itu baru tercapai pukul 19:00. Karena
  `adaBlokDuaJam` memakai `durasi` yang sama dengan yang dibayar, tampilan dan
  kas tidak bisa berbeda.
- **Di hari libur tidak ada jam pulang wajib**, jadi patokannya jam masuk -
  lembur dihitung penuh. Ada test yang menguncinya.
- **Nol jam lembur punya sebab tertulis.** Baris Lembur yang jam pulangnya belum
  melewati jam pulang wajib menghasilkan catatan eksplisit ("belum melewati jam
  pulang wajib 16:00") - tanpa itu yang terbaca cuma lembur Rp 0 tanpa
  penjelasan.
- **TODO(confirm) - DASARNYA BELUM ADA SALINANNYA**, sama persis dengan pengali
  2x dan batas 40 jam. Seluruh PMK 32/2025 dicek `pdftotext` + grep:
  **"1 (satu) jam" 0x, "setelah jam kerja" 0x, "di luar jam kerja" 0x,
  "istirahat" 0x**. SBM cuma menetapkan TARIF (Pasal 4-nya melempar tata cara
  ke PMK Pelaksanaan Anggaran). Satu dokumen menjawab semuanya - lihat C1 di
  `docs/permintaan-data-dan-konfirmasi-osdma.md`.

#### Berkas "Jam Absensi.xlsx" - ALAT YANG DIPAKAI PETUGAS SEKARANG

**Ini yang Gajihub gantikan.** Keterangan user: berkas ini rekapan manual
absensi yang **masih dipakai petugas** tiap periode - jadi bukan percobaan
pribadi, dan bukan dokumen sejarah. Setiap perbedaan antara berkas ini dan
Gajihub adalah calon selisih pembayaran, dan harus bisa dijelaskan.

`Excel/Jam Absensi.xlsx`, 2 sheet. **Master Presensi** = **48 pegawai Biro
Keuangan, Juli 2026, 1.133 baris** - unit & periode yang SAMA dengan rincian
tunkin manual, jadi bisa diadu tiga arah. (Sheet **Rekap Hadir** kepalanya
"PERIODE BULAN JUNI TAHUN 2024" - template lama, periode lain, jangan dipakai.)

Formulanya dibongkar dan diuji ke seluruh 1.133 baris:

| Formula | Cocok |
|---|---|
| `Jumlah Menit Kekurangan Harian = Terlambat + Kekurangan` | **1.133/1.133** |
| `Terlambat = checkin − Toleransi Masuk (08:30)` | 1.125/1.133 |
| `Menit Kerja = (checkout − checkin) − istirahat` | 1.124/1.133 |
| `Kekurangan = min(max(harusCheckout, jamPulang), tolPulang) − checkout` | 1.099/1.133 |
| `Jam Harus Checkout = checkin + 7,5 jam + istirahat` | 1.092/1.133 |

**TIGA hal yang MENGUATKAN keputusan yang sudah dipegang Gajihub:**

1. **`Jam Toleransi Pulang` = 17:00 (Jumat 17:30) = jam pulang + 60 menit** -
   sumber kedua yang bebas untuk toleransi 60 menit Pasal 9 ayat (3). **JANGAN
   dibaca sebagai jam mulai lembur**: di berkas itu 17:00 adalah BATAS ATAS
   kewajiban checkout (flexible time). Lembur mulai berjalan di jam pulang
   wajib (16:00 / Jumat 16:30), bukan di sini.
2. **Istirahat Senin-Kamis 60 menit, Jumat 90 menit** - persis Pasal 9 ayat (2),
   dan membuktikan jendela jam dinding Gajihub (07:30-16:00 / 16:30) memang
   sudah memuat istirahat di dalamnya: 510 − 60 = 450 = 7,5 jam; 540 − 90 = 450.
   Jadi nol hasil grep "istirahat" di `src/` itu BENAR, bukan celah.
3. **Toleransi masuk 08:30** - sumber keempat untuk toleransi 60 menit.

**DUA hal yang HARUS DITOLAK dari berkas ini** - keduanya diuji ke rincian
tunkin resmi Juli 2026 (48 pegawai yang sama):

| | Berkas Jam Absensi | Rincian tunkin RESMI |
|---|---|---|
| Model potongan | tabel berjenjang 0,5 / 1 / 1,5 / **2% maksimal per hari** | **0,01% per menit** |
| Cocok ke rincian resmi | **0/48** | **47/48** |

Sisa 1 baris (Naeli Istianah, %Pot 50) ternyata **cuti sakit bulan II 15 hari**
= Pasal 14 huruf d, bukan potongan kehadiran - jadi **48/48 terjelaskan** dan
model per-menit Gajihub benar.

**PENYARINGAN STATUS ITU LANGKAH MANUAL PETUGAS - dan Gajihub sudah
mengotomatiskannya dengan benar.** Kolom `Terlambat` di berkas dihitung pada
SEMUA status, termasuk Dinas Luar & Diklat (Irma Puspita **1.200 menit** di
situ lawan **0** di rincian resmi). Yang sampai ke rincian ternyata versi yang
sudah disaring:

| Kolom "Terlambat (Menit)" rincian resmi, dihitung ulang dari berkas petugas | Cocok |
|---|---|
| tanpa saring status | **3/48** |
| disaring ke WFO + WFH/WFA (persis `KATEGORI_WAJIB_JAM_KERJA` Gajihub) | **46/48** |

Jadi berkas ini memang SUMBER angkanya, dan penyaringan status yang selama ini
dikerjakan petugas dengan tangan sudah persis sama dengan yang dilakukan
Gajihub otomatis. Dua sisa: Irma Puspita (pengecualian JPT, sudah
diimplementasi) dan Dian Pratiwi (6 menit, belum terjelaskan).

#### Adu tiga arah: berkas petugas vs database Gajihub (Juli 2026, 1.133 baris)

| | Cocok |
|---|---|
| **Status kehadiran** | **1.117/1.133 (98,6%)** |
| Jam masuk | 1.057/1.133 (93,3%) |
| Jam keluar | 1.053/1.133 (92,9%) |

**Mesinnya sudah sepakat; sisanya perkara DATA.** Seluruh 16 beda status
terdaftar habis:

| Pola | Jumlah | Akibat |
|---|---|---|
| WFO → WFH | 9 | **tidak ada** - keduanya `KATEGORI_WAJIB_JAM_KERJA` & sama-sama berhak uang makan |
| WFO → DINAS_LUAR | 4 | **ADA** - Gajihub membebaskan Dinas Luar dari keterlambatan. Ini yang membuat Dian Nurlita 2 menit di Gajihub lawan 99 di rincian (14 Juli: berkas "WFO" masuk 10:07, e-Presensi "Dinas Luar") |
| CUTI → ALPHA | 2 | **ADA & MAHAL** - alpha 3%/hari lawan cuti tahunan 0%. Keduanya pada Naeli Istianah |
| WFO → LEMBUR | 1 | kecil |

**15 JULI 2026 AKHIRNYA TERBUKTI GANGGUAN.** Ini menutup TODO(confirm) lama
("belum dipastikan ke pengelola e-Presensi; sebelumnya sempat dikatakan tidak
ada gangguan"). Dari 17 tanggal Juli yang punya jam keluar `23:59` di Gajihub,
**HANYA 15 Juli yang jam pulangnya diperbaiki tangan oleh petugas** (4 dari 6
baris, diisi 16:05-16:09); 16 tanggal lain dibiarkan apa adanya sebagai lupa
absen sungguhan. Petugasnya sendiri memperlakukan tanggal itu berbeda - dan itu
persis alur yang sudah disiapkan Gajihub (tandai kendala + koreksi jam per
hari), cuma **belum diterapkan ke periode 7/2026**.

**Kesimpulan**: berkas ini sah sebagai sumber & pembanding, dan Gajihub sudah
mereproduksi cara kerjanya. Yang JANGAN ditiru cuma kolom persentase
berjenjangnya - itu memang tidak dipakai membayar.

#### Banding potongan e-Presensi di `/tukin/presensi/[nip]?banding=1`

Alat masa TRANSISI. Keterangan user: e-Presensi dibangun **pihak ketiga
yang kini TIDAK BISA DIHUBUNGI**, dan rumus potongannya salah paham terhadap
Permenaker. Karena tidak akan diperbaiki di sumbernya, selisihnya **permanen** -
pegawai melihat satu angka di web e-Presensi dan angka lain di slip, dan itu
pasti ditanyakan. Halaman ini yang dipakai menjawabnya per TANGGAL, dengan
pasalnya, supaya petugas tidak perlu berdebat dari ingatan.

**Tampilan KETIGA di halaman rincian per pegawai** (Presensi / Rincian jam kerja
/ Banding e-Presensi), tautan GET biasa seperti dua yang lain.

- **`src/business-logic/bandingPotonganEpresensi.ts`** (PURE, 11 unit test) -
  membandingkan per tanggal & mengklasifikasi sebabnya. Sisi Gajihub dihitung
  lewat `hitungPotonganKehadiranPersen` - **fungsi yang SAMA yang membayar**.
  Kalau lapisan ini punya rumus sendiri, perbandingannya tidak berarti: beda
  hasil bisa datang dari beda rumus, bukan beda kebijakan.
- **`src/adapters/potonganEpresensi.ts`** - READ-ONLY, dua sistem:
  SIAP (memetakan `NIP -> PEGAWAIID`) lalu e-Presensi (tabel `potongan_tukin`).
  e-Presensi TIDAK menyimpan NIP sama sekali, jadi SIAP wajib dilewati -
  pencocokannya HARUS PERSIS, jangan menambah/membuang nol di depan.
- **SENGAJA tidak menyimpan pemetaan id-nya ke database Gajihub.** Menambah
  kolom berarti migrasi + backfill, sementara yang dibutuhkan cuma satu pegawai
  per kali buka. Kalau nanti perbandingannya dijalankan massal, barulah kolom
  itu layak.
- **Kedua sistem luar hanya dihubungi kalau tampilannya memang dibuka.**
  Terukur: mode Presensi 96 ms, Rincian jam kerja 75 ms, Banding 140 ms.
- **Kegagalan koneksi tidak merobohkan halaman** - SIAP ada di segmen jaringan
  berbeda dan pernah tidak terjangkau. Yang muncul penjelasan, bukan galat
  mentah.

**Empat penyimpangan yang diklasifikasi otomatis**, semuanya sudah terukur:

| Sebab | Isinya |
|---|---|
| `TARIF_LUPA_ABSEN` | e-Presensi 2% flat lawan **1% setiap kali** (ayat 2) |
| `KLASIFIKASI_LUPA_ABSEN` | `menit_kerja < 450` dilabeli lupa presensi walau kedua tap ADA |
| `TARIF_TERLAMBAT` | berjenjang `min(2%, ceil((telat-60)/30) x 0,5%)` lawan **0,01%/menit** (ayat 3) |
| `BATAS_HARIAN_EPRESENSI` | e-Presensi berhenti di 2%/hari; Pasal 13 tidak punya batas |

**Bukti bahwa 2% itu memang anomali, bukan 2 x 1%**: pada 5.106 baris
ber-potongan 2% di Juli 2026, **jam masuknya TIDAK PERNAH kosong (0 dari
5.106)** - jadi yang hilang paling banyak satu ketukan. Ayat (2) sendiri
memisahkan "presensi kehadiran **atau** kepulangan".

**Yang TIDAK sampai ke pembayaran** (penting, supaya tidak panik): rincian tunkin
resmi Juli 2026 sudah memakai **1%** dan **per menit** - petugas menghitung ulang
sendiri. Yang benar-benar diwarisi dari e-Presensi cuma **klasifikasinya**
(ambang `< 450`), dan itu yang jadi pertanyaan B-lupa-absen ke OSDMA.

**Diverifikasi terhadap data nyata** (David Casidi, Juli 2026, production build):
web e-Presensi **12,5%** lawan Gajihub **4,77%**, selisih **Rp 90.811**, 17
tanggal berbeda. 17 Juli terklasifikasi `TARIF_LUPA_ABSEN` (2% lawan 1%), 16
sisanya `TARIF_TERLAMBAT` - dan angkanya saling cocok: keterangan e-Presensi
"Keterlambatan 134 menit" berpasangan dengan 74 menit di Gajihub, yaitu 134
dikurangi toleransi 60 (Pasal 9 ayat 3).

#### Ketukan yang MUSTAHIL sebagai jam masuk ditolak (2026-08-19)

Dipicu pertanyaan user kenapa web e-Presensi menampilkan potongan 2% untuk David
Casidi pada 17 Juli 2026. Penelusurannya membuka dua hal sekaligus.

**Sumber angka di web e-Presensi akhirnya ketemu: tabel `potongan_tukin`**
(670.797 baris), yang selama ini tidak pernah disentuh. Isinya buku besar
keputusan per hari, mis. `"Potongan lupa presensi 2%"` dan
`"Potongan tukin harian 1.5%. Keterlambatan 134 menit."`. Dua temuan dari situ:

- **Ambang `menit_kerja < 450` itu milik e-Presensi, bukan karangan petugas.**
  Catatan lama di bagian di atas yang menyebutnya "ambang petugas" KELIRU dan
  sudah diperbaiki di `docs/permintaan-data-dan-konfirmasi-osdma.md`. Terukur
  Juli 2026 (WFO/WFH/WFA): baris ber-`menit_kerja` 1-449 ditandai "lupa
  presensi" **98,8%**, yang >= 450 **0,0%** (6 dari 94.884). Tarifnya juga **2%**,
  bukan 1% seperti bunyi ayat (2).
- **Model keterlambatannya BERJENJANG** - `ceil((telat - 60) / 30) x 0,5%` -
  tabel yang sama dengan berkas Excel petugas, dan yang sudah diadu ke rincian
  tunkin resmi Juli 2026 dengan hasil **cocok 0/48** (per-menit 0,01% cocok
  47/48). Jadi angka di web e-Presensi memang bukan angka yang dibayarkan.
  Prinsip lama tetap berlaku dan justru menguat: dari e-Presensi diambil FAKTA
  (tanggal, status, jam), TIDAK PERNAH angka potongannya.

**Temuan yang lebih penting ada di sisi Gajihub sendiri.** Baris 17 Juli itu
berbunyi `WFH masuk 23:26 keluar 23:59 menit_kerja 240`, dan Gajihub
membacanya sebagai kedatangan **896 menit terlambat = 8,96%**. Diukur ke seluruh
Juli 2026 se-kementerian:

| | |
|---|---|
| Baris kena potongan keterlambatan | 6.104 |
| Melebihi 100 menit (tarif ayat (2)) | 924 - **74,3% dari SELURUH menit** |
| **Melebihi 300 menit (tarif alpha ayat (1))** | **559** - lebih mahal daripada tidak masuk sama sekali |
| Terparah | 898 menit = **8,98%**, tiga kali tarif alpha |

Dan penyebabnya bukan orang yang benar-benar telat: dari 559 baris itu, **446
jam masuknya sesudah 16:00, 113 antara 12:01-16:00, dan NOL yang sebelum 12:00**.
Semuanya ketukan sampah.

**Aturannya sekarang**: jam masuk yang jatuh **pada atau sesudah jam pulang
wajib** (16:00, Jumat 16:30) tidak dipercaya sebagai kedatangan. Hari itu
ditagih **Pasal 13 ayat (2) - 1%**, bukan keterlambatan per menit.

- **BUKAN mengoreksi Permenaker dan bukan batas potongan** - ini menolak mempercayai
  data yang mustahil. Orang tidak memulai hari kerja pukul 23:26; yang
  sebenarnya terjadi adalah tap masuknya hilang, persis bunyi ayat (2).
- **Aturannya SUDAH ADA, cuma terkunci syarat yang salah pasang.** Tap sore dulu
  baru ditolak kalau barisnya bertanda "lupa presensi" dari kolom Potongan
  e-Presensi - dan penanda itu **tidak pernah menyala** lewat jalur sinkronisasi
  (0 dari 99.065 baris Juli 2026). Syarat `!lupa ||` dicabut; sisanya murni uji
  kemustahilan.
- **Hari itu tidak lolos gratis.** `masukMustahil` sengaja ikut menyalakan
  penghitung ayat (2). Kalau cuma ketukannya ditolak tanpa itu, harinya
  menghasilkan potongan NOL - lebih murah daripada lupa absen biasa, dan itu
  insentif yang justru terbalik.
- **Koreksi petugas selalu menang** - jam yang sudah diverifikasi manusia
  terhadap foto & geotag bukan tebakan atas ketukan yang hilang.
- **Penolakannya dikatakan ke layar**, bukan hilang diam-diam: catatan hasil
  rekap menyebut jam aslinya, jam pulang wajibnya, dan bahwa hari itu dihitung
  1 kejadian ayat (2).
- Baris jam masuk **12:01-16:00 TIDAK disentuh** - masih mungkin kedatangan
  sungguhan, jadi tetap ditagih per menit.

Dampaknya terukur (Juli 2026 se-kementerian): potongan keterlambatan
**Rp 75.397.439 -> Rp 41.671.456**, selisih **Rp 33.725.983** pada **448 baris**.

**Diverifikasi lewat mesin yang sama dengan data e-Presensi ASLI** (David
Casidi, 25 baris Juli 2026): total menit terlambat **1.273 -> 377** (16 hari
lainnya memang benar-benar telat dan tetap ditagih), kejadian tidak presensi
**0 -> 1**, potongan 17 Juli **8,96% -> 1,00%**, sebulan **12,73% -> 4,77%**.
8 unit test baru menguncinya, termasuk batas inklusif (tap tepat 16:00 ditolak),
jadwal Jumat yang berbeda, koreksi petugas yang menang, dan **penjaga bahwa
keterlambatan SUNGGUHAN tidak ikut hilang** (Abie 22 Juli tetap 246 menit).

Satu test lama di `kendalaEpresensi.test.ts` ikut diperbarui - premisnya
("tanpa koreksi hasilnya 662 menit") memang sudah tidak berlaku. Maksud test-nya
dipertahankan, ditambah penegasan bahwa tanpa penanda kendala hari itu tetap
kena 1%.

#### Sisi jam PULANG ikut dijaga (2026-08-19) - aturannya jadi simetris

Pertanyaan user: *"kalau tidak diberi batas kita gak tahu kalau dia lupa absen
atau telat absen kan?"* - dan ternyata batas itu cuma dipasang di **satu sisi**.
Sisi pulang masih bersandar pada penanda "lupa presensi" dari e-Presensi, yang
lewat sinkronisasi database praktis tidak pernah menyala. Jadi ketukan nyasar
di kolom masuk ditolak, ketukan nyasar di kolom pulang dipercaya.

Dua aturan baru, keduanya diukur dulu ke Juli 2026 se-kementerian (hari kerja,
WFO/WFH/WFA, baris yang `menit_kerja`-nya TIDAK nol sehingga lolos aturan lama):

| Aturan | Baris | Yang diperbaiki |
|---|---|---|
| Jam keluar **TEPAT 23:59** | **11** | Isian otomatis e-Presensi saat tap pulang tidak masuk. Sebelumnya harinya lolos **tanpa potongan apa pun** |
| Jam keluar <= jam masuk wajib (07:30) | **1** | Keluar 06:15 - orang tidak pulang sebelum kerjanya dimulai |
| **Satu ketukan tersalin ke dua kolom** (selisih <= 2 menit) | **359**, 16 di antaranya BARU | Lihat di bawah |

**Yang 16 baris itu paling penting**, dan justru tidak tertangkap aturan sisi
masuk: tap tunggalnya jatuh beberapa menit **SEBELUM** jam pulang wajib (15:58,
15:59, dan 16:29 di hari Jumat). Dibaca sebagai kedatangan, satu tap sore itu
menagih `958 - 450 - 60` = **448 menit = 4,48%** sehari - lebih mahal daripada
tidak masuk sama sekali (3%, ayat (1)) - untuk hari yang bukti kehadirannya
justru ADA.

- **Pada ketukan ganda, KEDUA sisi tidak dipercaya.** Sisi mana yang hilang
  memang tidak bisa ditebak - ketukannya bisa pagi maupun sore. Ini bukan
  aturan baru: jalur rekap manual Excel sudah lama memakainya, yang dilakukan
  memindahkannya ke MESIN supaya kedua jalur tidak memperlakukan pola yang
  sama secara berbeda.
- **Tetap MAKSIMAL 1 kejadian**, walau beberapa penanda menyala bersamaan -
  pada ketukan ganda satu tap terbukti ADA, jadi menagih 2% berarti menagih
  ketukan yang sebenarnya dilakukan.
- **Hari itu tidak lolos gratis** (alasan yang sama dengan sisi masuk) dan
  **koreksi petugas tetap menang**. Keduanya dikunci test.
- **Ambangnya 23:59 PERSIS, bukan "jam 23 ke atas"**: 23:50-23:58 masih mungkin
  kepulangan sungguhan dan Juli 2026 ada **54 baris** di sana. Ada test yang
  menjaga 23:58 tetap lolos.

**Konstanta disatukan**: `JAM_TAP_PULANG_HILANG` & `AMBANG_KETUKAN_GANDA_MENIT`
sekarang hidup di `presensiPdfKeRekap.ts` dan di-import `rekapAbsensiManual.ts`
+ `rincianJamKerjaHarian.ts` - sebelumnya ada **tiga salinan** di tiga modul.
Dua ambang untuk satu hal cepat atau lambat berbeda, dan bedanya baru ketahuan
setelah angkanya dipakai membayar.

Satu test lama diperbarui (premisnya "23:59 tidak mengubah jalur PDF" memang
sudah tidak berlaku - PDF-nya berasal dari e-Presensi yang sama). Maksud aslinya
dipertahankan lewat contoh lain: `menitKerja: null` tetap berarti "tidak tahu",
bukan nol. 6 test baru, total **557**.

**Berlaku setelah presensi periode itu DITARIK ULANG**, seperti perubahan mesin
lainnya.

**TODO(confirm) BARU - TIDAK ADA BATAS MAKSIMAL POTONGAN HARIAN.** Sisa **113 baris** (jam masuk
12:01-16:00) masih bisa dipotong di atas tarif alpha 3%. Pertanyaannya ada di
**B-batas-maksimal** `docs/permintaan-data-dan-konfirmasi-osdma.md` - dampaknya ~Rp 1,4
juta/bulan pada 111 baris. Ada test yang mengunci ketiadaan batas ini supaya
tidak ditambahkan diam-diam. Usulan lain (batas 1% / "lewat 100 menit dianggap
lupa absen") DITOLAK: ayat (2) berbunyi "tidak melakukan presensi" sementara
pegawainya jelas melakukan presensi, dan batas 1% menghapus gradien sesudah 100
menit sehingga datang 09:15 sama mahalnya dengan datang 15:00.

**Perubahan ini baru berlaku setelah presensi periode itu DITARIK ULANG**, lalu
Tukin dihitung ulang - rekap yang sudah tersimpan tetap memuat angka lama.

#### AMBANG "LUPA ABSEN": petugas pakai `menit_kerja < 450`, Gajihub `= 0`

Ketemu waktu user menanyakan satu kasus: *"abie di tanggal 22 juli itu dia kena
potongan lupa absen? kena potongan 1%"*. Ditelusuri ke e-Presensi ASLI
(`id_pegawai 00009087`, Juli 2026, 24 baris) - dan jawabannya YA, tapi bukan
karena tapnya hilang:

```
2026-07-22  WFO  masuk 12:36  keluar 20:06  menit_kerja = 240   <- satu-satunya
23 hari lain                                menit_kerja = 450
```

Kedua tapnya ADA. Yang kurang jam kerjanya. Rincian tunkin resmi menulis
`Terlambat 268 menit` + `Lupa Absen 1` -> `% Pot 3,68` = 268 x 0,01% + 1 x 1%.
Gajihub menghitung **268 menit terlambat (COCOK PERSIS)** tapi **lupa absen 0**.
Dan memang satu-satunya hari ber-`menit_kerja` kurang dari 450 adalah 22 Juli -
jumlahnya tepat satu, sama dengan angka di rincian.

**Jadi ambang petugas adalah `menit_kerja < 450` (kurang dari 7,5 jam), bukan
`= 0`.** Ini BUKAN bug yang kelewat - `= 0` dipilih SENGAJA (lihat komentar
panjang di `presensiPdfKeRekap.ts`): hari yang jam kerjanya kurang tapi bukan
nol itu **pulang cepat / terlambat**, Pasal 13 ayat (3), bertarif PER MENIT dan
sudah ditagih dari jamnya. Kasus Abie memperlihatkan akibatnya terang-terangan:
petugas menagih **hari yang sama dua kali** - 246 menit keterlambatan (dari tap
12:36) DAN 1% lupa absen. Secara teks, ayat (2) berbunyi "tidak melakukan
presensi kehadiran atau kepulangan", sementara Abie melakukan keduanya.

Skalanya terukur (Juli 2026, hari WFO/WFH/WFA se-kementerian):

| `menit_kerja` | Baris | Pegawai | Diperlakukan |
|---|---|---|---|
| 450 (penuh) | 94.883 | 5.075 | tidak ada potongan ayat (2) di kedua sisi |
| **0** | 3.590 | 2.138 | **kedua sisi sepakat** lupa absen |
| **1-449** | **592** | **402** | **petugas menagih 1%, Gajihub TIDAK** |

**TODO(confirm) - JANGAN diubah sepihak ke `< 450`.** Selisihnya menyentuh 402
pegawai, dan mengubahnya berarti menagih dua kali untuk satu hari dengan dua
dasar hukum. Yang perlu ditanyakan ke OSDMA/Biro Hukum: apakah "kurang dari 7,5
jam padahal kedua tap ada" termasuk Pasal 13 ayat (2), atau cukup ditagih lewat
ayat (3) seperti yang Gajihub lakukan sekarang.

### Halaman Rekonsiliasi rekap absensi petugas (`/tukin/presensi/rekonsiliasi`)

Alat masa TRANSISI, dibangun setelah terbukti berkas Excel petugas masih jadi
penentu pembayaran. Mematikan berkas itu tanpa membuktikan dulu kedua sumber
sepakat berarti memindahkan dasar pembayaran ribuan orang atas dasar keyakinan.
Halaman ini membuat pembuktiannya bisa dikerjakan **per hari**, bukan ditebak
dari total - dua total yang kebetulan sama bisa menyembunyikan dua kesalahan
yang saling menutup.

**TIDAK ADA TULISAN KE DATABASE di seluruh alur ini** - nol `create`/`update`/
`delete`, dan berkasnya tidak disimpan (dibaca di memori lalu dibuang, pola
yang sama dengan gaji induk & predikat kinerja). Tidak ada migrasi. Perbaikan
tetap lewat jalur yang sudah ada: tandai kendala + koreksi jam, atau betulkan
di e-Presensi lalu tarik ulang.

- **`src/business-logic/rekapAbsensiManual.ts`** (PURE, 21 test) - membaca
  sheet "Master Presensi" jadi `LaporanPresensiPdf`, **tipe yang SAMA dengan
  hasil parsing PDF**, supaya rekapnya dihitung `rekapDariLaporanPdf()` yang
  itu-itu juga. Kalau modul ini punya mesin hitung sendiri, perbandingannya
  tidak berarti - beda hasil bisa datang dari beda mesin, bukan beda data.
  - **Judul kolom status BERGESER SATU** di berkas asli: di baris judul kolom
    sesudah "Hari" kosong dan "Keterangan Cuti" ada di kolom berikutnya, di
    baris data justru sebaliknya. Status dicari lewat POSISI, bukan judul.
  - **Kolom hitungan berkas TIDAK dipakai** (Terlambat, Menit Kerja,
    Kekurangan Jam Kerja, Persentase Potongan Harian). Yang diambil cuma fakta
    mentah: tanggal, status, jam masuk, jam keluar.
  - **"Cuti tahunan" disisipi tanda hubung** jadi "Cuti - Cuti tahunan":
    `kategoriDariStatus()` mengambil jenis cuti SESUDAH tanda hubung, dan tanpa
    ini jenis cutinya hilang - artinya Pasal 14 tidak berjalan.
  - **Jam keluar yang mustahil dikosongkan**, dua bentuk: selisihnya semenit-dua
    dari jam masuk (satu ketukan tersalin ke dua kolom - 31 baris, ketukannya
    bisa pagi maupun sore jadi tidak boleh ditebak), atau **lebih pagi dari jam
    masuk wajib** (orang tidak bisa pulang sebelum jam kerjanya dimulai).
    Ambangnya diturunkan dari `JadwalKerja`, bukan angka baru. TANPA ini, tap
    pulang yang hilang terbaca sebagai pulang cepat ratusan menit - Nurul
    Apriyanah 594, Yusfrida 640 - padahal rincian resmi cuma menagih Nurul 8
    menit sebulan. Penanda "lupa presensi" dititipkan lewat `potonganTeks`
    supaya mesin memakai penanganan yang SUDAH ada, bukan aturan baru.
- **`src/business-logic/bandingRekapPresensi.ts`** (PURE, 17 test) - menyusun
  daftar beda per hari + per angka rekap + perkiraan rupiah (tarif kelas x 30%
  x selisih persen; **null kalau kelas jabatan tidak diketahui**, tidak ditebak).
  - **Beda dipisah "berdampak" vs "tidak"**: WFO lawan WFH/WFA tidak menggeser
    rupiah sepeser pun (sama-sama wajib jam kerja, sama-sama berhak uang makan
    tarif sama), jadi ditandai supaya yang benar-benar penting tidak tenggelam.
  - **23:59 disamakan dengan kolom kosong** sebelum dibanding: dua sumber
    menuliskan "tap pulang hilang" dengan cara berbeda, dan itu KESEPAKATAN,
    bukan selisih.
  - Total rupiah dijumlah **MUTLAK** - dua selisih berlawanan arah tidak boleh
    menghasilkan "nol masalah".
- Otorisasi dicek **PER PEGAWAI** terhadap satuan kerjanya (`canUploadRekapPresensi`),
  bukan sekali per berkas - satu berkas memuat seluruh unit.

**Diverifikasi terhadap berkas & database ASLI** (Biro Keuangan, Juli 2026):
48 pegawai / 1.133 hari terbaca, 0 baris dilewati. **18 pegawai cocok
sepenuhnya**; 14 beda berdampak + 42 tidak berdampak; taruhan rupiah
Rp 414.990. Tiga yang teratas semuanya sudah punya penjelasan: Naeli Istianah
(2 hari CUTI di berkas lawan ALPHA di Gajihub), Hario & John Pieter (ambang
lupa absen `< 450` lawan `= 0` - lihat bagian di atas).

### Tabel "Rincian jam kerja" di `/tukin/presensi/[nip]`

Diminta user: bentuk tabel yang SAMA dengan rekap petugas, sebagai tampilan
kedua di halaman rincian per pegawai. Tombol pemindahnya di kanan atas tabel
(`?rinci=1`) - tautan GET biasa, bukan state klien, jadi tetap jalan tanpa
JavaScript dan tautannya bisa dibagikan.

Dua tabel itu menjawab pertanyaan BERBEDA, dan itu alasan keduanya ada:

| | Menjawab |
|---|---|
| **Presensi** (bawaan) | apa yang dilanggar - telat, pulang cepat, hak uang makan, koreksi |
| **Rincian jam kerja** | jam kerja hari itu terpenuhi atau tidak |

`src/business-logic/rincianJamKerjaHarian.ts` (PURE, 26 unit test) menyusun
kolomnya. **Rumusnya dibongkar dari berkas petugas, bukan dikarang** - lihat
"Berkas Jam Absensi.xlsx" di atas. Istirahat Senin-Kamis 60 menit, Jumat 90
(Pasal 9 ayat (2)); toleransi masuk (08:30) DAN toleransi pulang (17:00 /
17:30) sama-sama diturunkan dari `jadwal.toleransiTerlambatMenit`, bukan dua
konstanta terpisah.

**Diadu ke berkas asli petugas**, 1.019 baris hari kerja yang kedua tapnya ada:

| Kolom | Cocok |
|---|---|
| Jam Masuk, Jam Toleransi Masuk | **1.019/1.019** |
| Terlambat | 1.016/1.019 |
| Menit Kerja | 1.015/1.019 |
| Jam Harus Checkout | 990/1.024 (971 persis + 19 setelah lipatan tengah malam Excel dibuka) |
| Kekurangan Jam Kerja | 994/1.024 |

Bentuk `min(max(harusPulang, jamPulang), tolPulang)` diuji lawan dua kandidat
lain dan menang: bentuk **step** ("telat sedikit langsung wajib sampai 17:00")
cocok 958, `max` tanpa cap cocok 822.

**TIGA CACAT DI BERKAS PETUGAS yang ketemu dari pengadauan ini** - semuanya di
berkas mereka, bukan di rumusnya:
1. **80 baris ketukannya kosong** dan berkas menghitungnya dari **0**, jadi
   keluar angka seperti "Menit Kerja −60" dan "Kekurangan 960". Gajihub
   memakai `null` - sel kosong bukan tengah malam.
2. **5 baris memakai jadwal hari yang salah** (Jumat diberi jam pulang 16:00,
   Senin diberi 16:30) - semuanya pada Galih Febian Azhar.
3. **34 baris "Jam Harus Checkout"-nya merujuk sel yang salah**, terpusat di
   **4 pegawai** (Galih 16, Muh Kholiq 9, Fericky 6, Abie 3). Enam di antaranya
   persis nilai baris tetangganya - formula yang tergeser saat baris
   disisipkan/dihapus. Bukan aturan berbeda: 44 pegawai lain nol cacat.

**Kolom `% Potongan` memakai angka yang DIBAYARKAN**, bukan kolom kekurangan -
tarifnya diambil dari `TARIF_POTONGAN_PASAL_13`, tidak ditulis ulang. Diuji ke
Abie Juli 2026: 2,46% + 0,01% + 0,21% dari tiga hari, dan menit
penyusunnya (246 + 1 + 21) **berjumlah tepat 268** - sama persis dengan kolom
Terlambat di rincian tunkin resmi.

**Cacah kejadian Pasal 13 ayat (2) DIREKONSTRUKSI**, karena `PresensiHarian`
tidak menyimpannya (`kejadianTidakPresensiHari`). Rekonstruksi bisa menyimpang,
jadi halaman **mengadu jumlah sebulannya ke `RekapPresensiPeriode` per
komponen** dan menyalakan panel kuning yang menyebut komponen mana yang beda -
bukan cuma totalnya, karena dua selisih berlawanan arah bisa saling menutup.
Ketelitiannya terukur ke seluruh periode 7/2026 (117.906 baris, 5.089 pegawai):
**cocok 5.062 (99,5%)**, total 2.809 lawan 2.819 kejadian. Panel diuji menyala
benar pada David Casidi (masuk 23:26 & keluar 23:59 di hari yang sama - mesinnya
membacanya kedatangan sangat terlambat, aturan rekonstruksi membacanya tap
pulang hilang).

**TIGA hal yang WAJIB tidak tertukar** - ketiganya disebut di panel penjelas
halamannya, bukan cuma di komentar kode:
- **"Kekurangan jam kerja" BUKAN "pulang cepat".** Pulang cepat diukur ke jam
  pulang TETAP (16:00 / 16:30) dan itu yang dipotong Pasal 13 ayat (3);
  kekurangan diukur ke *jam harus pulang* yang bergeser ikut jam kedatangan.
  Masuk 09:00 lalu pulang 16:00 = pulang cepat **0 menit**, kekurangan **60
  menit**. Kolom itu tidak memotong apa pun - pernah masuk mesin potongan
  2026-08-06 dan dicabut sehari kemudian.
- **"Jam toleransi pulang" BUKAN jam mulai lembur.** Angkanya sama (jam pulang
  + 60), artinya beda: di sini batas atas kewajiban checkout, di mesin lembur
  titik mulai jam yang dibayar.
- **Kolom "Menit kerja" BUKAN `menit_kerja` e-Presensi.** Yang di sini rumus
  berkas petugas (tanpa batas atas, bisa > 450 dan bisa negatif); milik
  e-Presensi dibatasi 7,5 jam.

Jam yang melewati tengah malam ditulis `08:26 +1`, bukan `32:26` maupun `08:26`
polos - Excel membungkusnya diam-diam jadi bentuk terakhir dan itu terbaca
seperti pagi hari yang sama.

**TODO(confirm) yang TETAP terbuka - batasnya JAM DINDING, bukan "7,5 jam sudah
terpenuhi".** Pegawai yang masuk 10:00 lalu lembur sampai 20:00 dapat **3 jam**
lembur, sama persis dengan yang masuk 07:30 dan lembur di rentang yang sama,
padahal jam kerja hariannya masih kurang 2,5 jam. Yang pertama tetap kena
potongan Pasal 13 ayat (3) atas keterlambatannya (90 menit setelah toleransi =
0,9% bobot kehadiran) - tapi potongan itu ada di **Tunjangan Kinerja**,
sementara **uang lemburnya utuh**. SENGAJA tidak diperbaiki sepihak: itu
kebijakan, dan dokumennya sama dengan yang di atas. Sekarang DORMAN - nol dari
1.109 hari lembur yang juga punya keterlambatan.

**Lembur hari libur & pengecualian WFH/WFA** (permintaan susulan user):
- Jam lembur dipisah **hari kerja vs hari libur/tanggal merah**; yang hari
  libur dibayar `PENGALI_LEMBUR_HARI_LIBUR` = **2x** tarif per jam.
  **PERINGATAN PENTING: pengali 2x ini BUKAN dari SBM.** Seluruh dokumen SBM
  2026 sudah dicek dengan `pdftotext` + grep: kata **"libur" tidak muncul
  sama sekali**, dan tidak ada ketentuan 200%/dua kali untuk lembur (satu-
  satunya "200%" di dokumen itu soal PDU, item lain). SBM cuma menetapkan
  besaran per jam & per hari tanpa membedakan hari kerja/libur. Aturan 2x
  memang lazim dipakai, tapi dasar hukumnya ada di peraturan **TATA CARA**
  pembayaran lembur (PMK/Perdirjen Perbendaharaan) yang belum ada
  salinannya. TODO(confirm): minta dokumennya, lalu ganti komentar di
  `PENGALI_LEMBUR_HARI_LIBUR` dengan kutipan pasalnya.
- **Uang MAKAN lembur TIDAK ikut dikali 2** (`PENGALI_MAKAN_LEMBUR_HARI_LIBUR`
  = 1): sifatnya penggantian konsumsi yang SBM sendiri batasi "paling banyak
  1 kali per hari", jadi melipatgandakannya berarti membayar dua kali makan
  untuk satu hari. Dibuat konstanta terpisah supaya gampang diubah kalau
  ternyata keliru. TODO(confirm).
- Kalau total jam kena batas maksimal, **jam hari libur diprioritaskan tidak
  dipotong** (tarifnya lebih tinggi, jadi lebih menguntungkan pegawai).
- **WFH/WFA TIDAK dapat lembur** walau jam absen keluarnya melewati jam
  kerja. Engine tidak melihat data harian, jadi penyaringannya di sisi
  pengisian rekap - ditegaskan di template & panel aturan di
  `/tukin/presensi`. Yang bisa dicek engine cuma **silang**: klaim jam
  lembur padahal hari WFO-nya NOL ditandai anomali.

**Temuan dari penjelasan SBM hal. -51- (item 23.2)** - syarat 2 jam itu
ternyata ADA di SBM, dan lebih ketat dari yang semula diimplementasi:
*"...setelah bekerja lembur paling kurang 2 (dua) jam **secara
berturut-turut** dan diberikan paling banyak 1 (satu) kali per hari."*
Jadi 2 jam harus BERTURUT-TURUT, bukan akumulasi sehari - lembur 1 jam pagi
+ 1 jam sore TIDAK memenuhi syarat. Engine tidak bisa memverifikasinya
sendiri (inputnya sudah berupa jumlah hari yang memenuhi syarat), jadi ini
ditegaskan di template & halaman upload. Batasan "1 kali per hari" otomatis
terpenuhi karena satuannya memang per hari.

**Template rekap presensi** bertambah 2 kolom lagi: Jam Lembur Hari Libur,
Hari Makan Lembur Hari Libur. Pencocokan header kolom hari libur sengaja
dicek DULUAN supaya tidak diserobot kolom hari kerja yang namanya lebih
pendek ("jam lembur" cocok juga ke "jam lembur hari libur").

### Kalkulasi Tukin satu pintu + perbaikan logika potongan (Permenaker 15/2024)

Dipicu permintaan user: satukan kalkulasi Tukin di Dashboard Tukin (upload
presensi manual + tombol sinkronisasi + upload predikat kinerja jadi satu),
DAN implementasikan tabel potongan Pasal 13/14. User melampirkan PDF
Permenaker 15/2024 - isinya dicek langsung ke Bab IV, bukan dari ringkasan.

**DUA BUG NYATA ketemu waktu mengerjakan ini. Keduanya mengubah angka yang
dibayarkan ke pegawai.**

**Bug 1 - potongan Pasal 13 dihitung dari TOTAL tukin, bukan dari bobot
kehadiran (3,33x terlalu besar).** `hitungTukin` menghitung
`tukinPokok x (0,30 - potongan)`. Karena 0,30 itu pecahan dari TOTAL tukin,
mengurangkan 0,03 di satuan yang sama berarti memotong 3% dari TOTAL - persis
yang dibantah komentarnya sendiri ("dihitung dari bobot kehadiran, bukan dari
total tukin"). Padahal Pasal 13 ayat (1) berbunyi "potongan sebesar 3% DARI
BOBOT KEHADIRAN", jadi 1 hari alpha = 3% x 30% = 0,9% dari total.
Contoh kelas jabatan 10 (tukin pokok Rp 5.979.200), 1 hari alpha:
potongan seharusnya Rp 53.813, logika lama memotong Rp 179.376.
Perbaikannya: potongan dikalikan ke nilai rupiah bobot kehadiran
(`bobotKehadiran x potonganPersen`), bukan dikurangkan dari angka 0,30.
Ambang anomali ikut berubah dari ">30%" jadi ">100% bobot kehadiran".

**Bug 2 - cuti besar bulan ke-2 & ke-3 terbalik.** Pasal 14 huruf c menulis
"Tunjangan Kinerja dibayarkan setelah DIKURANGI persentase sebesar 50% /
75% / 90%", jadi itu POTONGAN. Kode lama mengembalikan 0,75 dan 0,9 sebagai
persen DIBAYAR - efeknya makin lama cuti besar, tukin makin BESAR (50% ->
75% -> 90%), kebalikan dari maksud pasal. Seharusnya 50% -> 25% -> 10%.
Bukti ini keliru dan bukan tafsir sengaja: cuti SAKIT di fungsi yang sama
(huruf d, kalimatnya identik) sudah benar sejak awal. Perbaikannya bukan
sekadar mengganti angka - konstantanya sekarang menyimpan POTONGAN persis
seperti bunyi pasal, lalu yang dibayar diturunkan dengan `1 - potongan`,
supaya kekeliruan "dikurangi vs dibayar" tidak bisa terulang. Fungsinya
di-rename `hitungPersenOverrideCuti` -> `hitungPersenDibayarCuti` biar
namanya menyebut satuan yang dikembalikan.

**Kelengkapan Pasal 13** - dulu cuma 4 dari 6 jenis pelanggaran yang punya
tempat. Pasal 13 ayat (3) mencakup TIGA hal bertarif sama (terlambat, pulang
cepat, meninggalkan kantor) tapi skema cuma punya `totalMenitTerlambat`;
ayat (4) diperlakukan sebagai boolean, bukan hitungan kejadian. Sekarang:
- `RekapKehadiranPeriode` + `PresensiHarian` + `RekapPresensiPeriode` punya
  kolom terpisah buat pulang cepat & meninggalkan kantor (migrasi
  `20260729120000_tambah_rincian_potongan_presensi`, 3 ADD COLUMN
  non-destruktif). Dipisah bukan karena tarifnya beda, tapi supaya bisa
  dijelaskan ke pegawai/auditor menitnya datang dari pelanggaran yang mana.
- Upacara jadi `jumlahTidakIkutUpacara` (per kejadian). TODO(confirm)
  PENTING: teks ayat (4) TIDAK memuat frasa "setiap kali" (beda dengan ayat
  (2) yang eksplisit) - dibuat per-kejadian mengikuti tabel yang diberikan
  user, tapi WAJIB ditegaskan ke Biro Hukum.
- `TukinResult` sekarang membawa `rincianPotonganKehadiran[]` (jenis, dasar
  hukum, jumlah, satuan, tarif, total) supaya UI bisa menampilkan "kenapa
  tukin saya segini" tanpa menghitung ulang.

**Dashboard Tukin jadi satu pintu** (`/tukin`):
- Panel "Sumber data kalkulasi" menampilkan status kedua komponen untuk
  periode terpilih: `X / Y pegawai` buat kehadiran 30% dan capaian kinerja
  70%, masing-masing dengan link ke halamannya. Gunanya supaya ketahuan
  lebih awal siapa yang datanya belum masuk - tanpa panel ini penyebab
  "kok pegawai ini dilewati" baru ketahuan setelah kalkulasi.
- `/predikat-kinerja` DIPINDAH jadi `/tukin/predikat-kinerja`; entri sidebar
  "Predikat Kinerja" yang berdiri sendiri DIHAPUS dari MENU_KASUBAG &
  MENU_PPABP.
- `/tukin/presensi` (BARU) - upload rekap presensi manual + panel
  sinkronisasi e-Presensi. Tombol sinkronisasi SENGAJA nonaktif dan tanpa
  action: adapternya memang belum ada, dan tombol yang kelihatan aktif lalu
  gagal saat diklik lebih membingungkan daripada yang jujur bilang belum
  tersedia. Begitu RealPresensiAdapter ada, cukup ubah konstanta
  `TERSAMBUNG` di `SinkronisasiPresensi.tsx` + pasang action-nya.
- Tombol "Hitung Tukin" cuma muncul buat yang benar-benar berwenang
  (`canAjukanKalkulasiTukinMassalUnit`). ~~**GAP**: PPABP boleh meng-upload
  KEDUA komponen tapi TIDAK boleh menjalankan kalkulasi massal (itu
  KASUBAG_TU + ADMIN).~~ **CATATAN ITU SUDAH BASI** (diperiksa 2026-08-13):
  fungsinya sekarang berbunyi `cekScopeSatkerAtauAdmin(...KASUBAG_TU...) ||
  cekPpabpAtauAdmin(...)`, jadi **PPABP LOLOS** untuk unit mana pun. Artinya
  satu petugas PPABP bisa menuntaskan rantai kerjanya sendiri: tetapkan
  kalender libur -> tarik ulang presensi -> hitung ulang -> approve ->
  export ADK.

**Model `RekapPresensiPeriode`** (migrasi
`20260729130000_tambah_rekap_presensi_periode`) - yang di-upload adalah rekap
BULANAN, sementara `PresensiHarian` per hari. Memecah rekap jadi baris harian
palsu berarti mengarang tanggal kejadian, jadi dibuat tabel sendiri. Kalkulasi
memakai rekap manual kalau ada, kalau tidak jatuh ke `PresensiHarian` (jalur
sinkronisasi). Sejalan dengan Pasal 23 yang memang mengakui penghitungan
manual selama sistem informasi belum berjalan. TODO(confirm): belum ada aturan
mana yang menang kalau keduanya terisi - sekarang rekap manual yang dipakai.

**Format upload presensi**: template Gajihub sendiri, di-key NIP, bisa diunduh
sudah terisi daftar pegawai unit (`/tukin/presensi/template`, Route Handler
CSV). SENGAJA BUKAN parser file export e-Presensi: contoh tarikan e-Presensi
yang ada di-key NAMA dengan penulisan tidak konsisten antar baris, dan
menebak pemetaan nama->NIP di sini berbahaya (salah orang = salah potong
tukin). Kolom templatenya sama persis dengan tabel Pasal 13.

**Diverifikasi manual end-to-end** (production build): unduh template Pusdatik
(81 pegawai) -> isi pelanggaran buat 3 karakter simulasi -> upload (81 baris
tersimpan, peringatan "3 pegawai perlu hitung ulang" muncul) -> jalankan
Kalkulasi Unit (3 dihitung, 78 dilewati dengan alasan "predikat kinerja belum
diupload") -> hasilnya dicocokkan lewat script yang menghitung ULANG dari
tabel Pasal 13 secara independen: ketiganya **COCOK persis**. Contoh Ayu
Puspita Sari (kelas 10): 1 alpha + 2x tidak presensi + 30/20/10 menit + 1x
bolos upacara = potongan 8,60% dari bobot kehadiran, komponen kehadiran
Rp 1.639.497 (harapan = aplikasi).

### Sambungan langsung ke SIAP & e-Presensi (database, bukan API)

Akses database ke DUA sistem sumber akhirnya didapat dari user, dan keduanya
sekarang tersambung sungguhan - bukan mock, bukan upload manual. Ini menutup
sebagian open item #5 (akses sistem eksternal) dan **mencabut** catatan lama
"tombol sinkronisasi sengaja nonaktif".

| Sumber | Alamat | Engine | Kredensial di `.env` |
|---|---|---|---|
| SIAP | `192.168.212.108\MSSQLDEV`, db `simpeg_kemnaker_24102018` | SQL Server 2014 SP3 | `SIAP_HOST/INSTANCE/DB/USER/PASSWORD/ENCRYPT` |
| e-Presensi | `192.168.221.96:4020`, db `presensi_kemnaker` | PostgreSQL | `EPRESENSI_HOST/PORT/DB/USER/PASSWORD` |

**PERHATIAN - ada DUA instance SQL Server di mesin yang sama** (`WIN-7NU35GEFU25`),
dan keduanya punya database bernama SAMA PERSIS. Lihat "Instance SIAP yang
benar" di bawah sebelum menyentuh konfigurasi ini.

**KEDUANYA READ-ONLY, tanpa kecuali.** Semua query hanya `SELECT`. Keduanya
sistem produksi yang sedang dipakai pegawai - SIAP adalah source of truth
kepegawaian, e-Presensi melayani absensi harian. Prinsip proyek ini tetap
"don't replace, integrate": Gajihub cuma mirror.

**JANGAN pernah menaruh alamat sumber ini di `DATABASE_URL`.** `DATABASE_URL`
adalah database MILIK Gajihub (PostgreSQL) tempat Prisma MEMBUAT tabel.
Mengarahkannya ke SIAP berarti `prisma migrate deploy` akan membuat 21 tabel
Gajihub di dalam database SIAP. Selain itu skema ini postgres-only (`enum
Role`, `rolesTambahan Role[]`), jadi provider `sqlserver` tidak akan jalan
tanpa menulis ulang seluruh skema & 13 migrasi.

**Catatan Node**: SIAP jalan di SQL Server 2014 yang cuma bicara TLS 1.0,
sementara Node 22+ (OpenSSL 3) menolak apa pun di bawah TLS 1.2. Tanpa
`cryptoCredentialsDetails: { minVersion: "TLSv1", ciphers:
"DEFAULT@SECLEVEL=0" }` koneksinya gagal `ERR_SSL_UNSUPPORTED_PROTOCOL`.
Dependency baru: `mssql` + `pg` - **deploy WAJIB `npm install` dulu**.

#### Instance SIAP yang benar (MSSQLDEV) - salah pilih TIDAK memberi error

Server `192.168.212.108` menjalankan **dua** instance SQL Server di satu mesin,
dan **keduanya punya database bernama `simpeg_kemnaker_24102018`**:

| Instance | Akses | Baris PEGAWAI | Update terakhir | Kohort TMT tertinggi |
|---|---|---|---|---|
| `SQLEXPRESS2014` (default, port 1433) | `biro_keu_2` | 5.088 | Agustus 2025 | **2024** |
| **`MSSQLDEV`** (named instance) | `sa` | **6.797** | **Agustus 2026** | **2026** |

Selama beberapa waktu proyek ini memakai yang **salah** tanpa ada satu pun
tanda. Tidak ada error, tidak ada peringatan - datanya cuma "lama" dan terlihat
wajar. Ketahuannya lewat jalan memutar: 18 NIP di file Rekap Penilaian
e-Kinerja tidak ketemu di tabel Pegawai, lalu terungkap bahwa **1.578 pegawai
TMT 2025 tidak ada satu pun** di instance default.

**Akibat pindah instance**: pegawai aktif 3.607 -> **5.077**, cakupan kelas
jabatan 99,4% -> **99,8%**, dan pemetaan presensi membaik drastis - ID
e-Presensi yang tidak ketemu di SIAP turun dari **1.689 (33%) jadi ~118 (2%)**.

`src/lib/siapConfig.ts` (BARU) - **satu-satunya** tempat konfigurasi koneksi
SIAP dibentuk, dipakai bareng `importPegawaiSiap.ts` dan `EpresensiAdapter.ts`.
Sebelumnya konfigurasinya disalin di dua tempat, dan itu berbahaya bukan karena
duplikasinya tapi karena cara gagalnya: kalau salah satu menunjuk instance
berbeda, importer menarik daftar pegawai dari satu database sementara pemetaan
`id_pegawai -> NIP` mengambil dari database lain. Yang muncul cuma "sekian
pegawai dilewati", dan penyebabnya nyaris mustahil ditebak.

Dua variabel `.env` baru:
- **`SIAP_INSTANCE`** - kalau diisi, `SIAP_PORT` SENGAJA DIABAIKAN. Named
  instance portnya dinamis (ditemukan lewat SQL Server Browser, UDP 1434);
  mengirim port bersama instanceName membuat driver memakai port dan diam-diam
  menyambung ke instance yang salah.
- **`SIAP_ENCRYPT="false"`** - WAJIB untuk MSSQLDEV. Instance itu memutus
  koneksi (`ECONNRESET`) begitu hasil query cukup besar selama enkripsi
  menyala; query kecil ke instance yang sama normal. Dibuktikan berdampingan
  dengan query importer yang sama: `encrypt: true` -> ECONNRESET,
  `encrypt: false` -> 5.078 baris dalam 8 detik. Penyebabnya TLS 1.0 yang
  memang sudah usang. **Konsekuensinya: nama/NIP/jabatan lewat TANPA enkripsi
  di jaringan kantor** (paket login tetap dienkripsi SQL Server sendiri, jadi
  password tidak terbuka). Default tetap `true` supaya tidak ada yang kehilangan
  enkripsi karena lupa mengisi variabel.

**TODO(confirm) - `sa` adalah akun SYSADMIN.** `biro_keu_2` DITOLAK di
MSSQLDEV, jadi satu-satunya yang bisa masuk sekarang adalah `sa` - punya hak
tulis & hapus atas SELURUH database di server itu. Kode Gajihub hanya
menjalankan SELECT, tapi akun ini tidak menahan apa pun kalau ada kekeliruan.
**Minta akun read-only untuk instance MSSQLDEV**, dan kalau bisa minta SIAP
dinaikkan ke TLS 1.2 supaya `SIAP_ENCRYPT` bisa dicabut.

#### Pegawai yang pensiun/berhenti: DITANDAI, tidak pernah dihapus

Dulu `importPegawaiSiap.ts` membiarkan pegawai yang hilang dari daftar aktif
SIAP tetap bertanda `AKTIF` selamanya - ikut terhitung di dashboard seolah
masih bekerja. Sekarang ada langkah **"Rekonsiliasi status"** di akhir
`main()`: NIP yang ada di Gajihub tapi tidak ada di daftar aktif ditanyakan
statusnya ke SIAP, lalu `Pegawai.statusPegawai` diisi `PENSIUN` (kode 3),
`BERHENTI` (kode 8), `USULAN_CPNS` (kode 0), `NONAKTIF` (kode lain), atau
`TIDAK_DI_SIAP` (tidak ketemu sama sekali).

**TIDAK ADA yang dihapus, dan ini keputusan yang disengaja.** Orang yang
pensiun di tengah tahun tetap berhak atas tukin bulan-bulan yang sudah dia
kerjakan - datanya hilang kalau barisnya dibuang. Terbukti relevan: dari 267
pegawai non-aktif, **28 orang tanggal pensiunnya jatuh di tahun 2026** (Januari
sampai Mei), jadi mereka memang bekerja sebagian tahun ini dan punya presensi.
Penandaan ini juga **bisa berbalik** - `statusPegawai` ikut di-set `"AKTIF"`
pada `update`, jadi kalau status di SIAP dikoreksi, sync berikutnya
mengembalikannya sendiri.

**Kalkulasi tukin SENGAJA TIDAK menyaring `statusPegawai`.** Penyaringnya
adalah ada/tidaknya **presensi di periode itu** - orang yang pensiun Maret
otomatis tidak punya presensi April, jadi April terlewat sendiri tanpa aturan
tambahan, sementara Januari-Maret tetap bisa dihitung. Kalau kalkulasi ikut
menyaring status, justru itu yang menutup kemungkinan membayar hak mereka.

**JANGAN membuat kolom "tanggal berhenti" + aturan "boleh dihitung sampai bulan
X".** Terdengar rapi tapi bersandar pada `TGLPENSIUN` yang sudah terbukti tidak
konsisten: ada baris berstatus Pensiun yang tanggalnya di 2040-an sampai 2055
(itu tanggal BUP terjadwal, bukan tanggal berhenti), dan 52 orang tidak punya
tanggal sama sekali. Aturan itu juga cuma menduplikasi penyaring presensi yang
sudah benar.

**`statusPegawai` akhirnya benar-benar dipakai menyaring** - sebelumnya kolom
itu cuma hiasan (disimpan & ditampilkan sebagai chip, tidak dipakai di satu
query pun). Sekarang di empat tempat, dan pilihannya beda-beda dengan sengaja:

| Tempat | Perilaku |
|---|---|
| Dashboard unit & lintas unit, panel sumber data `/tukin` | hitungan pegawai hanya `AKTIF` |
| `/tukin/predikat-kinerja` (daftar "belum punya predikat") | hanya `AKTIF` - pensiunan tidak akan pernah punya predikat baru |
| `/kasubag/pegawai` | default `AKTIF`, ada tautan "Tampilkan" + jumlahnya, supaya tidak ada yang lenyap tanpa jejak |
| `/pegawai` | **TIDAK disaring** - ini halaman perbaikan data, pensiunan justru termasuk yang datanya mungkin perlu dibetulkan. Yang ditambahkan cuma chip status |

#### Import pegawai dari SIAP (`src/jobs/importPegawaiSiap.ts`)

Menggantikan `importPegawaiXlsx.ts` sebagai jalur utama (file XLSX-nya memang
tidak ada di repo - data pribadi). Snapshot manual, BUKAN live sync.

```bash
npx tsx src/jobs/importPegawaiSiap.ts               # semua pegawai aktif
npx tsx src/jobs/importPegawaiSiap.ts --satker=0101 # Sekretariat Jenderal saja
npx tsx src/jobs/importPegawaiSiap.ts --dry-run
```

Pemetaan kolomnya (hasil penelusuran ke database, bukan tebakan) ada di kepala
file itu. Yang perlu diingat di sini:

- **`nip` dari `NIPBARU`** (18 digit), bukan kolom `NIP` (9 digit, format lama).
- **`satuanKerja` dari `LEFT(SATKERID,6)`** = Eselon II. `SATKERID` di SIAP
  hirarkis: 4 digit Eselon I, 6 digit Eselon II. Nama unitnya cocok persis
  dengan konvensi Gajihub ("Biro Keuangan dan Barang Milik Negara", "Biro
  Umum"). Ini yang dipakai SELURUH scoping kewenangan.
- **`golongan` dari `VWPANGKATTERAKHIR` + `PANGKAT.KODEPANGKAT`**, BUKAN dari
  `PEGAWAI.GOL_AKHIR` - kolom itu kosong total.
- **Data pribadi TIDAK diimpor** (alamat, NPWP, NIK, telepon, HP, email,
  rekening, foto) - konvensi yang sama dengan importer XLSX.
- Filter aktif: `STATUSPEGAWAIID IN ('1','2','23')` = CPNS/PNS/PPPK. Pensiun,
  pemberhentian, dan status '9' (tidak ada di tabel lookup) tidak diimpor.

**KELAS JABATAN - ada di SIAP, tapi menempel pada JABATAN, bukan pada orangnya.**
Ini sempat dikira tidak ada sama sekali. `PEGAWAI.JOBGRADE` memang kosong total
(0 dari 5.088), begitu juga `MANJAB_GRADE` & `MANJAB_MAPJABATAN` (0 baris).
Yang TERISI:

| Jenis jabatan | Sumber kelas jabatan | Terisi |
|---|---|---|
| Fungsional & pelaksana (`JENISJABATAN` 3 & 2) | `MASTERFUNGSIONAL.JOBGRADE` | 2.056 / 2.147 |
| Struktural (`JENISJABATAN` 1) | `SATKER.JOBGRADE` | 175 |

Disambungkan lewat `RIWAYATJABATAN` TERBARU per pegawai (`FUNGSIONALID` untuk
fungsional/pelaksana, `SATKERID` untuk struktural). Cakupan terukur: **3.586
dari 3.609 (99,4%)** - sisanya 23 pegawai yang `FUNGSIONALID`-nya kosong di
`RIWAYATJABATAN`. Nilai di luar 1-17 dibuang jadi null, bukan dipaksa masuk.

Diadu ke kenyataan dan cocok: Sekretaris Jenderal & Dirjen 17, Staf Ahli 16,
Kepala Biro 15, Kepala Bagian 12, Kepala Subbagian 10. Sebaran terbanyak di
kelas 8 (1.168), 10 (798), 7 (619).

**TODO(confirm) YANG TERSISA**: belum ada penegasan resmi bahwa `JOBGRADE` di
kedua tabel itu adalah kelas jabatan versi TERKINI yang dipakai membayar tukin
(bisa saja tertinggal dari SK terbaru). Angka ini LANGSUNG menentukan tarif
tukin pokok - minta sampel beberapa pegawai ke Biro OSDMA dan bandingkan
sebelum dipakai membayar sungguhan.

#### Tarik presensi dari e-Presensi (tombol SUDAH aktif)

Panel "Sinkronisasi e-Presensi" di `/tukin/presensi` **sekarang berfungsi** -
`TERSAMBUNG` sudah true dan tombolnya dipasangi Server Action. Upload PDF
TIDAK dihapus: tetap jalur cadangan kalau jaringan ke server e-Presensi tidak
terjangkau, dan template Excel tetap satu-satunya cara mengisi yang tidak ada
di database (menit meninggalkan kantor, tidak ikut upacara).

Tiga file, batas tanggung jawabnya tegas - dan **dipakai bareng** oleh tombol
UI dan CLI, supaya angkanya tidak bisa berbeda:
- `src/adapters/EpresensiAdapter.ts` - menarik & menganalisis satu periode.
  TIDAK menulis apa pun.
- `src/jobs/simpanRekapPresensi.ts` - menulis ke `RekapPresensiPeriode` +
  `PresensiHarian`.
- `src/app/tukin/presensi/actionsSync.ts` (tombol) dan
  `src/jobs/importPresensiEpresensi.ts` (CLI) - dua pemanggil.

```bash
npx tsx src/jobs/importPresensiEpresensi.ts --bulan=6 --tahun=2026 --dry-run
npx tsx src/jobs/importPresensiEpresensi.ts --bulan=6 --tahun=2026 --oleh=<NIP>
```

**Logika Pasal 13 TIDAK ditulis ulang.** Baris database dibentuk jadi
`LaporanPresensiPdf` - tipe yang sama persis dengan hasil parsing PDF - lalu
diserahkan ke `rekapDariLaporanPdf()` yang sudah ada. Jadi penanganan entri
ganda, aturan akhir pekan, lembur, uang makan lembur, dan seluruh potongan
Pasal 13 berlaku identik di kedua jalur. Pemetaan status ke enum database
juga disatukan di `src/business-logic/presensiKeDb.ts` (diekstrak dari
`actionsPdf.ts`).

**RANTAI PEMETAAN PEGAWAI - bagian paling rawan:**

```
e-Presensi.presensi.id_pegawai -> SIAP.PEGAWAI.PEGAWAIID -> NIPBARU -> Pegawai.nip
```

Database e-Presensi **TIDAK menyimpan NIP sama sekali** (sudah dicek ke
seluruh `information_schema`). Yang ada `id_pegawai`, ID internal.

**PENCOCOKAN HARUS PERSIS - JANGAN menambah/membuang nol di depan.** Waktu
verifikasi, normalisasi nol sempat mencocokkan `00009600` (Deva Dwi Septian di
e-Presensi) ke PEGAWAIID `000009600` milik **orang lain** (Afriansyah Noor).
Dengan pencocokan persis, uji ketat: **150/150 cocok** untuk ID 8 digit, 9
digit, dan 12 digit (nama diverifikasi silang; yang "beda" cuma penulisan
gelar, mis. `"Ir ANNA YULIANA M.Si."` vs `"Anna Yuliana"`). Pegawai ber-UUID
(36 karakter, ~101 orang) TIDAK ada di SIAP dan DILEWATI dengan alasan
eksplisit - TIDAK dicocokkan lewat nama, karena penulisan nama di e-Presensi
tidak konsisten.

**Status kehadiran ternyata sudah cocok.** Tabel `sistem_kerja` berisi persis
12 label yang sama dengan yang muncul di PDF (WFO, WFH, WFA, Cuti, Izin,
Diklat, Dinas Keluar, Lembur, Upacara Bendera, Tidak Hadir, Tidak Presensi,
Tugas Belajar), jadi `kategoriDariStatus()` dipakai apa adanya.

**TODO(confirm) - PERBEDAAN ANGKA YANG HARUS DISADARI:**

- **e-Presensi memberi toleransi terlambat 60 MENIT** (`sistem_kerja.toleransi`
  untuk WFO/WFH/WFA), Gajihub memakai 0 karena Pasal 13 ayat (3) memotong
  "setiap 1 (satu) menit" tanpa menyebut toleransi. **Ini akhirnya menjelaskan
  temuan lama** "238 kedatangan lewat 07:30 tanpa catatan keterlambatan".
  Potongan Gajihub akan LEBIH BESAR dari yang tertera di e-Presensi. Contoh
  tarikan Juni 2026: 1.433.892 menit terlambat untuk 3.392 pegawai (±422
  menit/orang/bulan). Kalau toleransi itu punya dasar resmi, ubah
  `toleransiTerlambatMenit` di `JADWAL_KERJA_DEFAULT` - JANGAN dipatch di
  adapter.
- **Kolom `potongan`, `keterangan_potongan`, dan tabel `potongan_tukin`
  DIABAIKAN sebagai nominal** - Gajihub menghitung sendiri. Yang diambil dari
  situ HANYA penanda "lupa presensi" (fakta, bukan nominal).
- **`jumlahHariKerja` dihitung dari kalender** (Senin-Jumat), karena blok
  "Kewajiban Jam Kerja" hanya ada di PDF. ~~**LIBUR NASIONAL TIDAK DIKENALI** -
  tabel `libur` di e-Presensi ada tapi KOSONG.~~ **CATATAN ITU SALAH, dan
  sudah diperbaiki 2026-08-13**: tabel `libur` berisi **127 baris** (2022-2026)
  dan masih dirawat - lihat "Kalender libur ditarik dari e-Presensi" di bawah.
  Libur nasional sekarang dikenali lewat model `HariLiburNasional` yang
  diisi dari situ. **JEBAKAN**: kalau
  field ini null, `uangMakan.ts` memakainya sebagai batas atas (`Math.min`)
  dan uang makan SELURUH pegawai jadi Rp 0 tanpa error - ketemu waktu dry-run
  pertama.
- **1.689 dari 5.190 pegawai e-Presensi (33%) tidak ada di SIAP** (plus ~101
  ber-UUID). Presensi mereka tidak masuk Gajihub sama sekali. Perlu
  ditelusuri - dugaan: non-ASN/honorer/outsourcing.
- **PPPK golongannya berformat Romawi tunggal** ("IX"), sementara PNS
  "III/d". `golonganRomawi()` di `tarifSbm.ts` mengembalikan null untuk PPPK,
  jadi mereka DILEWATI saat kalkulasi uang makan/lembur (bukan dihitung dengan
  tarif tebakan). Perlu diputuskan tarif SBM mana yang berlaku.
- Database e-Presensi punya **baris bertanggal rusak** (`252026-01-22`,
  `0003-02-28`). Filter periode membuangnya, tapi jangan berasumsi kolom
  tanggalnya selalu waras.

**Kewenangan**: tombol UI mengecek `canUploadRekapPresensi` **per pegawai**
(satu tarikan berisi pegawai lintas unit, jadi Kasubag TU hanya menyimpan
pegawai unitnya). Jalur CLI **TIDAK** memfilter per satker - siapa pun yang
bisa menjalankan skrip itu menarik seluruh kementerian. Jaga aksesnya
sebagaimana akses administratif.

**Diverifikasi**: `npm test` 256/256 lolos, `npx tsc --noEmit` bersih,
`npm run build` (production) lolos. Tarikan Juni 2026 tersimpan: 3.392 pegawai,
71.513 baris `PresensiHarian`, sebaran status masuk akal (WFO 46.698, WFH
7.846, Dinas Luar 7.325, Cuti 3.867, Upacara 3.012, Alpha 1.113, Lembur 196).

### Pasal 9 & 13 diterima teksnya - tiga asumsi tutup, satu kolom dicabut

User mengirim teks Pasal 9, 12, dan 13 Permenaker 15/2024. Dampaknya besar
karena menyentuh angka yang selama ini diturunkan dari data.

**TIGA TODO(confirm) TERTUTUP SEKALIGUS** - `JADWAL_KERJA_DEFAULT` yang dulu
seluruhnya diturunkan dari data ternyata cocok dengan Pasal 9:

| Kode | Pasal 9 |
|---|---|
| `jamKerjaPerHari: 7.5` | ayat (1) "paling sedikit 7,5 jam untuk 1 hari" |
| `07:30` / `16:00` / Jumat `16:30` | ayat (2) |
| `toleransiTerlambatMenit: 60` | ayat (3) "toleransi waktu sebanyak 60 menit" |

Yang ketiga paling penting: toleransi 60 menit dulu ditandai "dasar hukumnya
belum ada, kalau ternyata tidak ada angka ini harus dikembalikan ke 0".
Ternyata tertulis di pasalnya. TIGA sumber bebas menunjuk angka yang sama -
teks pasal, kolom `sistem_kerja.toleransi` e-Presensi, dan rincian manual
Rokeu. Yang MASIH terbuka cuma BENTUK penerapannya (pengurangan per hari vs
ambang) - itu tetap dari data (44/48 vs 22/48).

**TODO(confirm) BARU dari ayat (4)**: jam kerja "dapat DIKECUALIKAN sesuai
ketentuan peraturan perundang-undangan". `JADWAL_KERJA_DEFAULT` berlaku
seragam untuk SEMUA satker; kalau ada UPT/unit shift yang dikecualikan,
jadwalnya harus dibedakan per satker.

**KOLOM "KEKURANGAN JAM KERJA" DICABUT** (migrasi
`20260807000000_cabut_kekurangan_jam_kerja`). Ditambahkan 2026-08-06 sebagai
pelanggaran KEEMPAT bertarif per menit; teks ayat (3) menyebut TEPAT TIGA -
"terlambat hadir, pulang cepat, atau meninggalkan kantor" - dan Pasal 12
huruf c yang dirujuknya menyebut tiga hal yang sama. Aman dicabut: **0 dari
40.740 baris** berisi nilai bukan 0, jadi tidak ada angka tersimpan yang
hilang. Test-nya DIBALIK (bukan dihapus) supaya kalau ada yang menambahkannya
lagi "supaya lengkap", test itu yang jatuh duluan.

### BUG: cuti tahunan 1 hari menghapus SELURUH potongan Pasal 13 (FIXED)

Ketemu saat user menanyakan penanda "cek override cuti / tugas belajar" di
tabel Rincian Tukin. Penandanya benar - yang salah angkanya.

**Mekanismenya**: `hitungTukin` menerapkan override Pasal 14 untuk SETIAP
jenis cuti, termasuk yang persen dibayarnya 100% (cuti tahunan, melahirkan,
alasan penting, cuti besar < 1 bulan). Karena override MENIMPA `tukinPokok`
dengan `tarif kelas x persen`, hasilnya tarif PENUH - dan seluruh potongan
Pasal 13 sebulan lenyap. Pegawai yang terlambat berkali-kali justru dibayar
penuh begitu dia ambil cuti sehari.

**Dorman selama cuti diisi manusia, langsung aktif begitu ditarik otomatis.**
Periode 7/2026 Biro Keuangan: **16 dari 46 pegawai** kehilangan potongannya,
total **Rp 634.959** dalam satu unit satu bulan. Terparah Erni Kusumastuty
(Rp 228.564 hilang karena cuti tahunan 1 hari).

**Dibuktikan keliru ke rincian manual**: Ahmad Henda punya potongan
Rp 30.604 yang terhapus oleh cuti tahunan 1 hari. Tarif kelas 8
Rp 4.595.150 - Rp 30.604 = **Rp 4.564.546**, dan itu PERSIS angka
"Dibayarkan" di rincian manual Rokeu. Ada test yang mengunci angka ini.

**Perbaikannya**: override cuma dijalankan kalau Pasal 14 memang MENGURANGI
(`persenDibayar < 1`). Dasarnya jelas di teks - Pasal 14 mengatur berapa
persen tukin dibayarkan selama cuti, tidak ada satu kata pun yang menyatakan
cuti membatalkan Pasal 13. `overrideCutiDiterapkan` sekarang berarti
"override benar-benar menimpa", bukan "pegawai sedang cuti", jadi penanda di
UI hanya muncul kalau memang ada yang perlu dicek.

**TODO(confirm) yang tersisa**: untuk cuti yang MEMANG memotong (cuti besar,
cuti sakit bulan II ke atas, CLTN), override tetap memakai `tarif kelas x
persen` sehingga potongan Pasal 13 tetap tertimpa. Apakah keduanya
seharusnya berlaku bersamaan belum ditegaskan Biro OSDMA/Hukum. Perlakuan
sekarang lebih menguntungkan pegawai dan sengaja tidak diubah tanpa
konfirmasi.

### Lupa absen diturunkan dari `menit_kerja` e-Presensi (Pasal 13 ayat 2)

Menutup sumber selisih terbesar yang tersisa terhadap rincian tukin manual.

**Masalahnya**: e-Presensi MENGISI jam keluar dengan `23:59` ketika tap pulang
hilang, jadi jamnya tidak terlihat kosong dan pelanggaran ayat (2) lolos.
Contoh Ahmad Henda (Juli 2026): rincian manual menulis 2 lupa absen, Gajihub
0 - selisih 2,00% potongan, persentase kehadiran 29,934% vs 29,334%.

**Sinyalnya kolom `presensi.menit_kerja`** yang belum pernah disentuh. Dari
788 hari kerja 48 pegawai Rokeu, 26 hari ber-`menit_kerja = 0` dan SEMUANYA
berpasangan dengan jam keluar 23:59 - e-Presensi menolkannya sendiri saat tap
pulang hilang.

**SENGAJA `= 0`, BUKAN `< 450`** (7,5 jam Pasal 9), walau ambang 450
mencocokkan 45/48 lawan 41/48. Hari yang jam kerjanya KURANG tapi bukan nol
adalah **pulang cepat** - Pasal 13 ayat (3), bertarif PER MENIT, dan sudah
dihitung dari jam keluarnya. Memakai `< 450` berarti menagih hari yang sama
dua kali dengan dasar hukum berbeda. Contohnya nyata (Rizki Akbar 8 Juli:
masuk 14:20, pulang 17:37, `menit_kerja` 240): yang dilanggar keterlambatan
350 menit, bukan "tidak melakukan presensi".

**DIKLAT, DINAS KELUAR & LEMBUR SEKARANG DIKECUALIKAN** dari potongan ayat (2)
- perubahan perilaku, bukan cuma penambahan. Alasannya SAMA dengan
pengecualian mereka dari terlambat/pulang cepat yang sudah berlaku sejak awal:
jam presensinya mengikuti kegiatan, bukan jam kantor. Dibuktikan: sebelum
pengecualian, Alpha Sandro terhitung **15 kejadian** lawan 2 di rincian manual
- dan 13 selisihnya SEMUANYA hari Diklat; Prasetyo 3 (semuanya Dinas Keluar)
lawan 0. ("Lembur" punya jalur sendiri di blok lembur dan TIDAK diubah -
di sana tap yang hilang dihitung karena tanpa jam masuk-pulang jam lemburnya
memang tidak bisa dihitung.)

**Hasil terhadap rincian manual Juli 2026** (48 pegawai): kolom "Lupa Absen"
cocok **41/48**, "Terlambat" **44/48**. Sisanya penilaian manusia yang tidak
bisa direproduksi aturan - empat menyangkut 15/17 Juli (user menegaskan TIDAK
ada gangguan e-Presensi di tanggal itu), dan dua kasus **datang terlalu siang**
(Abie 22 Juli masuk 12:36 dengan tap lengkap) yang `menit_kerja` tidak tangkap
karena jam kerjanya tetap genap. Ambang jam masuk (mis. "lewat 09:30 =
lupa absen") sempat diuji dan DITOLAK: hanya 38/48, dan tidak punya dasar di
pasal manapun.

**Tersimpan**: sinkronisasi Juli 2026 diulang - 2.084 pegawai punya lupa
absen, total 3.400 kejadian.

### Jenis cuti & potongan Pasal 14 ditarik otomatis dari e-Presensi

Menutup sumber koreksi manual terbesar yang tersisa. Sampai sekarang
`jenisCutiAktif` selalu null lewat jalur sinkronisasi, jadi Pasal 14 TIDAK
PERNAH berjalan otomatis - hari cuti yang jenisnya tidak terbaca bisa
terhitung alpha, dan pegawai cuti besar/sakit tetap dibayar penuh.

**SIAP TIDAK BISA dipakai untuk cuti - jangan buang waktu ke sana.** Tabel
`CUTI` di SIAP memang ada (979 baris) tapi sudah ditinggalkan: puncaknya 2019
(304 baris), 2023 cuma 7, 2024 cuma 11, 2025 cuma 26, dan **NOL baris yang
beririsan dengan Juli 2026**. Entri terakhir Desember 2025. Pengajuan cuti
sudah lama pindah ke e-Presensi. Ada juga `CUTI_copy1`, `JENISCUTI`,
`MASTER_STATUS_CUTI`, `IZIN_TIDAK_MASUK` (41 baris, terakhir 2019) - semuanya
legacy.

**e-Presensi punya semuanya**, di dua tabel yang sebelumnya tidak tersentuh:
```
presensi.id_presensi -> presensi_cuti.id_presensi -> cuti.nama_cuti
```
`presensi_cuti` 168.920 baris; cakupan Juli 2026 **6.761 dari 6.798 hari cuti
(99,5%)** punya jenis.

**TEMUAN YANG MEMBATALKAN ASUMSI LAMA: "bulan ke berapa" ADA di nama
jenisnya.** Master `cuti` memecah sampai tingkat bulan - "Cuti Besar I/II/III",
"Cuti Sakit Bulan I/II/III", "Cuti Sakit Bulan Lebih Dari 3 Bulan" - dan kolom
`cuti.nilai_persen` di sana **cocok persis** dengan tabel Pasal 14 yang sudah
ada di `tukin.ts` (13 dari 13 jenis bertingkat; ada test khusus yang mengadu
keduanya). Dua sumber yang tidak saling menyalin. Penomorannya juga terbukti
dipakai berurutan: satu pegawai tercatat Cuti Besar I (Mei) -> I lalu II
(Juni) -> II lalu III (Juli).

Jadi komentar lama di `RekapPresensiPeriode.bulanCutiKeberapa` ("TIDAK bisa
diturunkan dari data presensi satu bulan, harus diisi manual lewat template")
**sudah tidak berlaku**.

**Perubahan kodenya sengaja tipis** - tidak ada adapter cuti terpisah:
- `EpresensiAdapter.ts` menarik `nama_cuti` lewat **DUA query terpisah** yang
  dipasangkan di memori - JANGAN diubah jadi JOIN/LATERAL. **`presensi_cuti`
  TIDAK punya index atas `id_presensi`** (satu-satunya index di tabel itu PK
  `id_presensi_cuti`), jadi apa pun yang mencari per-baris ke sana memicu Seq
  Scan penuh atas ±169.000 baris SETIAP KALI. Versi pertama memakai
  `LEFT JOIN LATERAL ... LIMIT 1` dan itu **kesalahan yang mahal**: EXPLAIN
  memberi cost **212.999.001** lawan **120.006** untuk bentuk dua-query
  (±1.775x), dan di lapangan tarikan Juli 2026 berjalan **19 menit tanpa
  selesai** dengan CPU proses cuma 3 detik - semuanya menunggu database
  produksi. Setelah diperbaiki: **9 detik**. Menambah index BUKAN pilihan -
  e-Presensi read-only tanpa kecuali. Sifat "satu hari = satu jenis cuti"
  tetap dijaga lewat dedup di JS (`ORDER BY pc."createdAt" ASC`, yang
  belakangan menimpa) - persis perilaku `LIMIT 1` yang digantikan.
- `gabungStatusCuti()` merangkai jadi `"Cuti - Cuti Besar II"` - format yang
  SAMA PERSIS dengan export PDF, jadi `kategoriDariStatus()` yang sudah teruji
  dipakai apa adanya. Jenis cuti cuma ditempel kalau statusnya memang CUTI
  (kalau tidak, kategori hari kerja biasa ikut berubah jadi cuti).
- `jenisCuti.ts` dapat `bulanCutiDariLabel()` + `uraiJenisCuti()`.
- `presensiPdfKeRekap.ts` mengisi `bulanCutiKeberapa`; peringatan "bulan ke
  berapa tidak diketahui" sekarang muncul HANYA kalau nomornya memang tidak
  ada.
- `simpanRekapPresensi.ts` menulis `bulanCutiKeberapa` **hanya kalau non-null**
  - kalau null, kolomnya tidak disertakan sama sekali supaya angka yang pernah
  diisi manual tidak terhapus tiap sinkronisasi.
- **TIDAK ADA MIGRASI** - ketiga kolomnya sudah ada sejak
  `20260806110000_tambah_cuti_rekap_presensi`.

**`CUTI_DI_LUAR_TANGGUNGAN_NEGARA` jenis baru di enum `JenisCuti`**.
Ditambahkan karena e-Presensi memakainya aktif (4 pegawai, 61 hari, Juli 2026)
dan tanpa itu mereka terbaca "cuti tanpa jenis" lalu dibayar PENUH.
**RESOLVED 2026-08-07**: dasarnya **Pasal 4 huruf d** - "Tunjangan Kinerja ...
TIDAK DIBERIKAN kepada ... Pegawai ... yang menjalani Cuti di luar tanggungan
negara". Sebelum teks lengkap Permenaker masuk, ini ditandai TODO(confirm)
karena Pasal 14 tidak menyebutnya dan dasarnya cuma PP 11/2017 dari luar.
Engine **SELALU** menandainya anomali - sekarang bukan karena dasarnya
meragukan, tapi karena ini satu-satunya jalur yang menghapus SELURUH tukin
sebulan. **Yang MASIH terbuka**: huruf d yang sama menyebut "bebas tugas untuk
persiapan masa pensiun" (MPP) dengan akibat SAMA, dan itu belum ditangani -
tidak ada penandanya di skema `Pegawai`.

**JEBAKAN BARU YANG HARUS DISADARI - cuti 1 hari menghapus tukin SEBULAN.**
Pasal 14 memberi satu persentase per PERIODE, tidak ada pembagian proporsional
harian (open item #3). Selama `cutiAktif` cuma diisi manusia lewat template,
ini tidak pernah terjadi. Sejak ditarik otomatis, kasusnya NYATA: Juli 2026
ada 3 pegawai dengan CLTN / cuti sakit >3 bulan sebanyak **satu hari** -
aturannya menghapus tukin mereka sebulan penuh. `hitungTukin` sekarang
menandai `PERIKSA MANUAL` kalau potongan > 0 sementara hari cuti < setengah
hari kerja. Penandanya BUKAN tambalan aturan (mengarang pembagian proporsional
= mengarang kebijakan) - cuma penjamin bahwa kasus itu tidak bisa lewat tanpa
dilihat manusia.

**Perbaikan sampingan**: catatan `"ada N status berbeda di tanggal yang sama"`
dulu muncul untuk baris ganda yang isinya IDENTIK - kalimat yang membantah
dirinya sendiri. Satu pegawai cuti bisa menghasilkan 10-14 catatan palsu
sendirian, dan catatan yang benar-benar perlu dilihat ikut tenggelam. Sekarang
dibandingkan teks statusnya dulu.

**Diverifikasi ke data asli** (bukan mock): dry-run Juli 2026 menarik 122.641
baris / 5.195 pegawai, 5.089 siap disimpan. Empat kasus diuji sampai ke rupiah:
Inayati Ulin Na'mah (Cuti Besar II 13 hari + III 10 hari -> bulan ke-2,
dibayar 25%, catatan "berpindah bulan" muncul), Try Mulya Lestary & Elda
Yunita (Cuti Melahirkan -> 100%, tidak dipotong), Edy Pujimulyono (Cuti Sakit
bulan I -> 100%). Alpha 0 di keempatnya - sebelumnya hari cuti berisiko
terbaca alpha. Dampak ke nominal: **10 pegawai** lintas satker punya cuti
berpotongan di Juli 2026, semuanya cocok NIP-nya, dan **belum satupun punya
kalkulasi Tukin Juli** - jadi tidak ada siklus approval yang ter-reset.

**SUDAH DISINKRONKAN** (2026-08-07, periode 7/2026): 5.089 pegawai tersimpan,
**1.934 punya jenisCutiAktif** (1.337 Cuti Tahunan, 479 Cuti Sakit, 87 Alasan
Penting, 24 Melahirkan, 4 Cuti Besar, 2 CLTN). `bulanCutiKeberapa` terisi 6 -
memang cuma jenis bertingkat (Cuti Besar I/II/III, Cuti Sakit Bulan I/II/III)
yang menyebut nomor bulan; sisanya tidak punya dan itu benar.

**Kalkulasi Tukin yang dibuat SEBELUM sinkronisasi ini jadi basi** - rekap
presensinya berubah (jenis cuti baru terisi), jadi perlu dihitung ulang supaya
potongan Pasal 14 ikut berlaku.

### Upload PDF presensi e-Presensi (1 file / 1 folder sekaligus)

Dipicu 2 file asli dari user: export **"Laporan Detail Presensi Harian"**
e-Presensi dalam bentuk **PDF** (`rekap-presensi-000000008740-6-2026.pdf`,
`gadis rekap-presensi-000000008740-5-2026.pdf`). Permintaannya: bisa dipakai
langsung sebagai presensi bulanan tanpa mengetik ulang ke template Excel,
bisa memproses satu folder PDF sekaligus, kolom "Potongan" bawaan file
diabaikan (dihitung sendiri sesuai Permenaker 15/2024), dan entri ganda
ditangani.

Ini **melengkapi**, bukan mengganti, upload template Excel yang sudah ada -
template itu masih di halaman yang sama (dilipat di bawah) buat koreksi
manual, dan formatnya tidak diubah sama sekali.

**Tiga modul baru, batas tanggung jawabnya tegas:**
- `src/lib/pdfTeks.ts` - SATU-SATUNYA tempat yang menyentuh library PDF
  (`unpdf`, bundel pdfjs untuk server). Keluarannya item teks + koordinat.
- `src/business-logic/presensiPdf.ts` (PURE) - koordinat -> laporan
  terstruktur (identitas, Summary Presensi, tabel harian).
- `src/business-logic/presensiPdfKeRekap.ts` (PURE) - laporan -> rekap
  bulanan berbentuk `BarisRekapPresensi`, **tipe yang sama persis** dengan
  hasil template Excel. Karena itu jalur simpan, validasi, dan kalkulasi
  Tukin/uang makan/uang lembur yang sudah ada TIDAK diubah satu baris pun.

**KENAPA HARUS PAKAI KOORDINAT, bukan teks polos.** Sel yang kosong tidak
menghasilkan teks apa pun. Di file uji ada baris (14-05-2026) yang presensi
masuk 06:05 tapi TIDAK presensi pulang - kolom Jam Keluar kosong. Kalau
barisnya dibaca sebagai deretan teks, "06:05" bergeser jadi jam keluar dan
pelanggaran Pasal 13 ayat (2) hilang tanpa jejak. Batas kolom **dibaca ulang
di tiap halaman**, tidak di-hardcode: di file Mei kolom Status ada di x=353,
di file Juni x=362 (user memang bilang "kadang layout kagak konsisten").

**JAM KERJA ACUAN - ANGKANYA DIBUKTIKAN KE DATA, BUKAN DIASUMSIKAN:**
- Masuk **07:30**: dicek ke 101 baris yang punya catatan "Keterlambatan N
  menit" di 3 file asli. **101 dari 101 cocok persis** dengan
  (jam masuk - 07:30). Nol selisih.
- Pulang **16:00** (Senin-Kamis) / **16:30** (Jumat): dicek ke sebaran jam
  presensi pulang WFO. Puncaknya tepat di 16:00 untuk Senin-Kamis dan tepat
  di 16:30 untuk Jumat, dan hampir tidak ada yang pulang sebelum itu (Jumat:
  2 dari 29) - pola khas menunggu gerbang presensi terbuka.
- **7,5 jam/hari**: "Kewajiban Jam Kerja" di PDF selalu kelipatan 7,5
  (172,5 = 23 hari, 150 = 20 hari, 112,5 = 15 hari). Dari situ
  `jumlahHariKerja` diturunkan - dan itu **angka yang membatasi hari uang
  makan** (`Math.min` di `uangMakan.ts`), bukan sekadar hiasan.
- Ketiganya di `JADWAL_KERJA_DEFAULT`. TODO(confirm): cocok dengan praktik 5
  hari kerja 37,5 jam/minggu, tapi belum ada dokumen resmi jam kerja Kemnaker.

**KOLOM "POTONGAN" DIABAIKAN SEBAGAI NOMINAL - dan memang layak diabaikan.**
Dari 3 file asli (46 laporan, 1.145 baris) ada **238 kedatangan lewat 07:30
yang TIDAK diberi catatan keterlambatan** oleh e-Presensi - termasuk yang
telat 84 menit - sementara yang telat 1 menit justru dicatat.
**KONSEKUENSI YANG HARUS DISAMPAIKAN: potongan hasil hitungan Gajihub akan
LEBIH BESAR dari yang tertera di PDF untuk sebagian pegawai.** Itu memang
yang diminta, tapi jangan sampai kaget waktu diadu ke pegawai.
Satu-satunya yang diambil dari kolom itu adalah **penanda "lupa presensi"** -
itu FAKTA, bukan nominal, dan tidak ada di kolom lain mana pun (jam pulang
diisi 23:59, atau jam masuk & pulang selisih satu menit di sore hari, jadi
tidak bisa disimpulkan dari jamnya saja).

**ENTRI GANDA - tiga pola, semua nyata di file uji:**
- `Cuti + Tidak Hadir` di tanggal sama (23 kasus) -> baris Tidak Hadir dibuang,
  kalau tidak pegawai kena 3% untuk hari yang sebenarnya cuti.
- `Tidak Hadir + Tidak Hadir` persis sama (17 kasus) -> jadi SATU hari alpha,
  kalau tidak potongannya 6% padahal Pasal 13 ayat (1) cuma 3% per HARI.
- `Dinas Keluar + Tidak Hadir` (2 kasus) -> Dinas Keluar yang menang.
Dua status BERBEDA di tanggal sama (bukan Tidak Hadir) dipakai yang pertama
DAN dilaporkan sebagai catatan - tidak diputuskan diam-diam.

**Aturan turunan lain (semua bisa dilihat user di panel halaman upload):**
- **Sabtu & Minggu tidak kena potongan apa pun** - Pasal 13 memotong
  pelanggaran terhadap KEWAJIBAN jam kerja; kalau tidak ada kewajibannya,
  tidak ada yang dilanggar. Terbukti perlu: SEMUA baris tanpa presensi pulang
  di file uji adalah Dinas Keluar hari Sabtu. WFO di akhir pekan juga tidak
  dapat uang makan.
- **Terlambat/pulang cepat cuma untuk WFO & WFH/WFA.** Dinas Keluar, Diklat,
  dan Lembur dikecualikan - jam presensinya mengikuti kegiatan, bukan jam
  kantor (e-Presensi sendiri juga tidak pernah menandainya terlambat).
  TODO(confirm): WFH/WFA DIMASUKKAN karena Permenaker tidak membedakan tempat
  kerja; belum ada penegasan resmi.
- **Ketukan sore tidak dibaca sebagai jam masuk.** Ada baris WFO dengan jam
  masuk 19:46 & pulang 19:47 (satu ketukan disalin ke dua kolom). Dibaca
  mentah = "terlambat 736 menit". Kalau barisnya bertanda "lupa presensi" dan
  jam masuknya sudah lewat jam pulang wajib, ketukan itu tidak dipercaya
  sebagai presensi pagi - yang dihitung kejadian Pasal 13 ayat (2).
- **Lembur HANYA dari baris berstatus "Lembur"** - itu penanda lemburnya
  diperintahkan. Pulang malam di baris WFO biasa bukan lembur. Di hari kerja
  lembur dihitung setelah jam pulang wajib; di akhir pekan penuh dari masuk
  sampai pulang, masuk kolom hari libur (tarif 2x). Uang makan lembur cuma
  kalau bloknya >= 2 jam (SBM 2026 item 23.2). Di file uji 14 dari 14 baris
  Lembur jatuh di Sabtu/Minggu.
- **`jumlahTidakIkutUpacara` SELALU 0** dari jalur ini. Status "Upacara
  Bendera" di PDF artinya pegawai IKUT; yang tidak ikut tidak punya baris,
  dan tanggal upacaranya juga tidak ada di file. Hari berstatus Upacara juga
  tidak dihitung hari kerja WFO (1 Juni 2026 = libur nasional) - dicatat
  eksplisit supaya bisa dikoreksi kalau ternyata hari kerja.
- **`totalMenitMeninggalkanKantor` SELALU 0** - PDF cuma punya satu pasang
  jam masuk & pulang per hari. Isi lewat template Excel kalau satker punya
  catatannya.
- **Libur nasional yang jatuh di hari kerja TIDAK bisa dikenali** (tidak ada
  kalender libur di sistem ini). Yang bisa: Sabtu & Minggu. Kalau jumlah hari
  hadir melebihi hari kerja, itu dijelaskan sebagai kemungkinan dinas di hari
  libur - bukan ditolak seperti jalur template Excel (di sana hadir > hari
  kerja memang berarti salah ketik).

**Cek silang Summary Presensi = INFORMASI SAJA.** Yang dipakai selalu tabel
detail. Blok summary di export lama tidak sinkron dengan tabelnya sendiri:
di file Juli 2025 ada pegawai dengan 16 baris "Tidak Hadir" + 12 baris "WFO"
di tabel, tapi summary-nya menulis "Tidak Hadir : 1" dan "WFO : 1", dan
"Kekurangan Jam Kerja"-nya bahkan negatif (-97,5). Di export 2026 summary-nya
sudah cocok. Kalau total summary jauh di bawah jumlah baris, halaman memberi
tahu eksplisit supaya daftar "selisih" tidak bikin ragu pada angka yang benar.

#### Tata letak `/tukin/presensi` (2026-08-13, mengikuti mockup user)

Urutannya sekarang mengikuti seberapa sering dipakai, bukan urutan
pembangunannya:

```
Kembali -> H1 "Presensi" + "Komponen 30% Tunjangan Kinerja (Tukin)"
  1. Sinkronisasi e-Presensi        <- tiap periode
  2. filter + Rekap Presensi Periode <bulan> <tahun>
  3. [Data e-Presensi Bermasalah] [Kalender Hari Libur]   <- beberapa x setahun
  4. "Cara lain mengisi presensi": PDF & template Excel (tertutup)
```

Dua kartu di nomor 3 **turun dari puncak halaman** - keduanya dibuka beberapa
kali setahun, dan menaruhnya di atas mendorong panel Sinkronisasi (yang
dipakai tiap periode) ke bawah lipatan.

**Kartu Sinkronisasi disusun ulang mengikuti mockup user**: judul + chip
hijau "Tersambung" (pil, `rounded-full` - sengaja beda bentuk dari chip status
data di tabel), lalu SATU baris `[bulan] Tahun [2026] [Tarik Data Presensi]`
tanpa label di atas tiap field, lalu satu paragraf keterangan.
- **Dua paragraf keterangan digabung jadi satu.** Yang soal potongan
  (toleransi 60 menit vs 1 menit) dulu terdampar di KAKI kartu, terpisah dari
  tombolnya oleh blok hasil - padahal keduanya menjawab pertanyaan yang sama:
  "apa yang terjadi kalau tombol ini ditekan".
- Ikon unduh di tombolnya **dicabut lagi** - tidak ada di mockup.

**Dasar hukum pindah ke ikon "i" di samping judul** (`src/app/SumberAcuan.tsx`,
BARU). Deskripsi pembuka dulu memuat "sebagai dasar potongan Pasal 13
Permenaker 15/2024" dan jadi dua baris; nomor pasal itu penting saat
DIPERIKSA (auditor/Itjen/pegawai yang protes), bukan tiap halaman dibuka.
Sekarang deskripsinya satu baris (92 karakter) dan pasalnya di ikon.

- **Tanpa JavaScript sama sekali** - murni CSS `group-hover` +
  `group-focus-within` (bisa di-Tab), plus atribut `title` sebagai cadangan.
  Bukan client component, tidak ada state.
- **SELURUHNYA `<span>`** (*phrasing content*), jadi aman di dalam `<h1>`,
  `<p>`, atau `<td>`. **JANGAN diganti `<details>`** - pelajaran dari
  `BadgePejabatEselon`: elemen itu *flow content*, dan di dalam heading
  parser HTML menutup paksa induknya lalu Next melempar hydration error yang
  menunjuk ke dalam komponennya, bukan ke tempat pemakaiannya.
- Isinya di `/tukin/presensi`: Pasal 5 ayat (2) huruf b (bobot 30%), Pasal 13
  (tarif potongan), Pasal 9 (jam kerja & toleransi), Pasal 14 (cuti), Pasal
  10 ayat (2) (presensi manual saat kendala), + catatan bahwa sumber datanya
  database e-Presensi yang **dibaca, tidak pernah ditulis**.
- Diverifikasi di production build: `<h1>` halaman memuat `role="note"`,
  panelnya memuat kelima pasal, `title` terisi sebagai cadangan, dan nol
  `<details>` di dalam heading.

Komponennya sengaja generik (`acuan: {aturan, tentang}[]` + `catatan`) supaya
halaman lain bisa ikut - **belum dipasang di halaman lain**, tunggu diminta.

**Kolom tabelnya = VARIABEL PRESENSI saja** (daftar dari user):

```
Pegawai | Hari kerja | WFO | WFH/WFA | Dinas luar | Alpha | Lupa absen | Telat | Plg cepat | Cuti
```

Tabel ini menjawab *"bagaimana kehadiran orang ini"*, bukan *"berapa yang
dibayar"*. Yang SENGAJA TIDAK ada di sini:
- **Hasil hitungan** (hari dibayar uang makan, total potongan %) - tempatnya
  `/uang-makan` & `/kasubag/kalkulasi`, bukan tabel presensi.
- **Lembur** - ada di `/uang-lembur` dan di rincian per pegawai.
- **Meninggalkan kantor & tidak ikut upacara** - **0 dari 5.089 baris** periode
  7/2026 berisi nilai bukan nol, dan memang tidak bisa lain: e-Presensi tidak
  mencatat keduanya, jadi jalur sinkronisasi maupun PDF selalu menghasilkan 0
  (hanya template Excel yang bisa mengisinya). Kolom yang nol untuk ribuan
  baris cuma memakan lebar. **Engine TETAP menghitung keduanya** dan keduanya
  tetap tampil di `/tukin/presensi/[nip]` - yang hilang cuma kolomnya di sini.

**Kolom Cuti = total hari SEMUA jenis** (`jumlahHariCuti`), dengan **jenisnya
disebut di bawah angkanya** (`uraiJenisCuti` + `LABEL_JENIS_CUTI`, plus "bln
ke-N" untuk jenis bertingkat). "3 hari cuti" saja tidak cukup buat menilai -
Pasal 14 memotong berbeda per jenis (cuti tahunan 0%, CLTN 100%). Diklat
digabung ke sel Dinas luar (`+N diklat`) karena perlakuannya identik.

Diverifikasi terhadap data nyata (7/2026, 200 baris dirender): 10 kolom / 10
`<td>` per baris, 75 baris memunculkan label jenis cuti, dan tiga baris
pertama **menjumlah tepat ke hari kerja** (18 WFO + 5 cuti = 23; 9 + 13 dinas
+ 1 = 23; 9 + 3 + 10 + 1 = 23).

**Ikon "Satuan Kerja" & "Jumlah Pegawai" dibedakan sesuai artinya** - gedung
untuk unit, orang untuk jumlah pegawai. Sebelumnya keduanya roda gigi, jadi
ikonnya tidak membedakan apa pun (masalah yang sama dengan tiga ikon jam di
sidebar).

**DUA KELAS CSS YANG TIDAK PERNAH ADA - ketemu saat ini dikerjakan:**
- **`.btn-secondary`** dipakai di 3 halaman (`/tukin/presensi`,
  `/tukin/presensi/kendala`, `/ppabp/basis-data-gaji`) tapi **tidak pernah
  didefinisikan** di `globals.css` - tombolnya dirender tanpa warna sama
  sekali, cuma teks + padding. Sekarang didefinisikan memakai palet
  (`teal-tint` + `teal-deep`), bukan warna baru.
- **`.text-danger`** dipakai di `SinkronisasiPresensi.tsx` &
  `ApprovalMassalForm.tsx` - tidak ada token `--color-danger` (yang ada
  `--color-red`), jadi **pesan error dirender tanpa warna merah**. Diganti
  `text-red`. Diverifikasi di CSS hasil `next build`:
  `.text-red{color:var(--color-red)}` ada, `.btn-secondary{...}` ada.

Diverifikasi lewat production build (akun PPABP, periode 7/2026): urutan
blok benar (Sinkronisasi 11.303 -> Rekap 26.797 -> Data Bermasalah 236.191 ->
Cara lain 237.640), `<h1>Presensi</h1>` tunggal, **nol** ikon roda gigi
tersisa, ketiga tombol berikon (Tarik Data Presensi / Periksa Data Bermasalah
/ Kelola Kalender Libur).

**LETAK PDF & TEMPLATE EXCEL DI KAKI HALAMAN** (2026-08-13, permintaan user). Sejak
sambungan langsung ke e-Presensi jalan, upload PDF dan template Excel
keduanya cuma CADANGAN - menaruhnya di atas membuat panel Sinkronisasi yang
dipakai tiap periode justru terdorong ke bawah. Urutan `/tukin/presensi`
sekarang: Sinkronisasi -> filter -> tabel -> bagian "Cara lain mengisi
presensi" berisi dua `<details>` tertutup. Masing-masing dibuka dengan
penjelasan **kapan dipakai** (pertanyaan user: "upload PDF ini buat apa?"):
- **PDF**: server e-Presensi tidak terjangkau, atau cuma perlu satu-dua
  pegawai. Isinya identik dengan tarikan langsung - PDF diubah jadi rekap
  lewat `rekapDariLaporanPdf()` yang SAMA.
- **Template Excel**: buat angka yang memang tidak ada di e-Presensi -
  **menit meninggalkan kantor** & **jumlah tidak ikut upacara**. Keduanya
  selalu 0 lewat jalur sinkronisasi maupun PDF.

**UI** - semua di `/tukin/presensi` (halaman yang sudah ada, sekarang punya
entri sidebar sendiri "Presensi" di MENU_KASUBAG & MENU_PPABP):
- `UploadPresensiPdfForm.tsx` - input `multiple`, plus checkbox "Pilih satu
  folder sekaligus" yang memasang atribut `webkitdirectory` lewat ref (atribut
  itu tidak ada di tipe JSX React). File non-PDF dibuang di sisi klien pakai
  `DataTransfer` supaya tidak ikut terkirim dan tidak memakan jatah ukuran.
  Tanpa JavaScript, input-nya tetap berfungsi sebagai pilih-banyak-file biasa.
- Periode diambil DARI ISI FILE, jadi satu batch boleh berisi periode campuran
  (dilaporkan per periode). Otorisasi dicek **per pegawai**, bukan per file -
  satu PDF gabungan bisa memuat pegawai lintas unit.
- Hasilnya ditampilkan per pegawai + blok "Catatan yang perlu dicek manusia".
- `/tukin/presensi/[nip]` (BARU) - rincian HARIAN satu pegawai satu periode
  (tanggal, status, jam masuk/pulang, telat, pulang cepat, berhak uang makan
  atau tidak). Ini yang menjawab "kenapa potongan saya segini" per tanggal.
  Rincian harian hanya ada untuk periode yang diupload lewat PDF - rekap dari
  template Excel cuma menyimpan angka bulanan, dan itu dikatakan apa adanya.

**Menulis ke DUA tabel**: `RekapPresensiPeriode` (upsert, dipakai kalkulasi)
dan `PresensiHarian` (dihapus sebulan penuh lalu ditulis ulang - kalau cuma
upsert per tanggal, hari yang HILANG dari file baru akan tertinggal sebagai
data basi). Tanggal disimpan tengah malam UTC supaya tidak bergeser hari.
File PDF-nya sendiri TIDAK disimpan. **Tidak ada migrasi** - semua kolom yang
dipakai sudah ada.

**Dependency baru `unpdf`** - deploy WAJIB `npm install` dulu, tidak cukup
pull-build-restart. Catatan Node: pdfjs memanggil `Math.sumPrecise` (Node 22+);
di Node 20 fungsi itu ditambal di `pdfTeks.ts` supaya log server tidak
dibanjiri warning.

**Diverifikasi end-to-end** (production build, bukan dev):
- Upload 2 PDF sekaligus sebagai PPABP -> 2 pegawai tersimpan, periode 5/2026
  & 6/2026 terbaca dari isi file. Angkanya dicocokkan dengan hitungan manual
  dari tabel PDF: Juni telat 340 menit (95+96+110+10+29), 8 hari berhak uang
  makan, 11 dinas, 1 kejadian tidak presensi, alpha 0 (baris ganda dibuang);
  Mei telat 450 menit, lembur hari libur 9 jam + 1 hari makan lembur. Semua
  **cocok persis**. 21 baris `PresensiHarian` Juni tersimpan dengan jam yang
  sama persis dengan PDF.
- Upload PDF gabungan 44 pegawai (243 halaman) sebagai **KASUBAG_TU Pusdatik**
  -> **44 dari 44 DITOLAK** dengan alasan per unit ("di luar kewenangan kamu
  (pegawai Biro Keuangan dan Barang Milik Negara)" dst), **nol baris ditulis**.
- File yang sama sebagai **PPABP** -> 44 pegawai tersimpan, 1.042 baris harian.
  Kecepatan: 243 halaman diekstrak 347 ms.
- Data uji Juli 2025 (44 pegawai) **SUDAH DI-REVERT**. Yang SENGAJA DITINGGAL:
  presensi GADIS SUKMA DEWA periode 5/2026 & 6/2026 - itu data nyata dari file
  yang user kirim dan berguna buat demo. Upsert-nya idempoten, aman diupload
  ulang.

### Bug "akun multi-role kehilangan jangkauan PPABP" (FIXED)

Diminta user: akun ADMIN yang sedang memakai role PPABP harus bisa upload
untuk unit MANA SAJA dan edit pegawai MANA SAJA, "biar gak cuma PPABP yang
bisa tindak lanjut".

**Ternyata memang tidak bisa**, dan penyebabnya bukan di halaman-halaman
baru: `cekPpabp()` (`src/auth/permissions.ts`) menurunkan cakupan PPABP dari
`User.satuanKerja` - kalau kolom itu terisi, PPABP dianggap "PPABP per
satker" dan dikunci ke unit itu. Padahal kolom itu milik KASUBAG_TU dan
**WAJIB terisi** kalau akunnya punya role Kasubag TU (`ubahAssignmentRoleAction`
menolak simpan tanpa unit). Akun ADMIN demo memegang SEMUA role sekaligus,
jadi `satuanKerja`-nya = Pusdatik - dan begitu dia ganti sudut pandang ke
PPABP, jangkauannya menciut ke Pusdatik saja.

**Gagalnya diam-diam, dan itu bagian terburuknya**: halaman-halamannya TETAP
menampilkan semua unit (`dashboardScope.ts` dan `/pegawai` cuma memaksa
scope buat KASUBAG_TU), jadi datanya kelihatan tapi setiap aksi ditolak.
Yang ikut kena bukan cuma upload & edit pegawai yang disebut user, tapi juga
`canApproveJenjangFinal`, `canHandleSelisih`, `canViewRekonsiliasiLintasSatker`,
`canTelaahValidasiPengajuanLintasUnit`, `canMonitorUbahStatusLintasUnit`, dan
`canPindahSatuanKerjaPegawai`.

**Perbaikan**: `cekPpabp()` TIDAK LAGI membaca `satuanKerja` - PPABP selalu
lintas satker (sesuai asumsi pilot "tim PPABP pusat" yang memang berlaku
sekarang). Parameter `targetSatuanKerja` sengaja DIPERTAHANKAN di
signature-nya supaya kalau nanti scoping per-satker jadi diputuskan, cukup
fungsi itu yang diubah.
- **Ini TIDAK melebarkan kewenangan PPABP yang asli**: semua akun PPABP
  sungguhan punya `satuanKerja` NULL, jadi perilakunya persis sama seperti
  sebelumnya. Satu-satunya akun yang berubah adalah akun ADMIN demo - yang
  memang sudah punya privilege penuh lewat role utamanya.
- **Ganti role TETAP berarti**: sebagai PPABP, akun admin tetap KEHILANGAN
  `canKelolaAssignmentRole`/`canEksekusiPerubahanRole`/
  `canMonitorKesehatanSistem`/`canKonfigurasiAdapter`. Ada test khusus buat
  ini supaya tidak ada yang "memperbaiki" bug ini dengan cara meng-OR-kan
  seluruh role yang dimiliki - itu akan membatalkan seluruh gunanya ganti
  role.
- **Kolom `satuanKerja` tetap berfungsi penuh buat KASUBAG_TU** - akun yang
  sama, waktu berperan sebagai Kasubag TU, TETAP terkunci ke unitnya.
- Komentar `User.satuanKerja` di `schema.prisma` ikut diperbarui (perubahan
  KOMENTAR saja - `prisma migrate diff` menghasilkan migrasi KOSONG, tidak
  ada perubahan database).

**Test**: 1 test lama diganti (dulu mengunci "PPABP per-satker cuma
diizinkan buat satkernya"), 5 test baru khusus skenario akun multi-role -
termasuk yang memastikan hak khusus ADMIN TIDAK ikut terbawa, dan yang
memastikan role KASUBAG_TU-nya tetap terkunci unit.

**Diverifikasi manual** (production build, akun Alpha Sandro): login ->
`/admin`; ganti role ke PPABP lewat menu akun -> menu Admin hilang (bukti
bypass ADMIN tidak berlaku); upload rekap e-Kinerja berisi 28 pegawai **Biro
Keuangan** (bukan Pusdatik) -> 28 tersimpan, filter satuan kerja tetap
muncul; buka `/pegawai` untuk pegawai **Biro Umum** -> form edit tampil
(bukan "di luar kewenangan kamu"), field satuan kerja aktif; submit form ->
diterima, `AuditTrail` mencatat `"sumber":"Edit data pegawai (PPABP)"`.
Submit dilakukan TANPA mengubah nilai apa pun (data Herry Susanto sebelum &
sesudah identik) dan baris AuditTrail uji itu sudah dihapus.

### Upload rekap predikat kinerja e-Kinerja BKN (`/predikat-kinerja`)

Dipicu file asli dari user: "Rekap Penilaian (45).xlsx" - export portal
e-Kinerja BKN, 28 pegawai Biro Keuangan dan BMN periode 6/2026. **Menutup
open item #6** (format file rekap BKN yang selama ini belum ada contohnya).
Ini sumber bobot **70% Tukin**, jadi salah baca = salah bayar.

**Bentuk file** (didokumentasikan lengkap di kepala
`src/business-logic/rekapPredikatKinerja.ts`): 3 baris kepala (instansi /
unit penilaian / "Periode Bulanan 6 Tahun 2026"), baris kosong, lalu header
`No | NIP | Nama | Jabatan | Rating Hasil Kinerja | Rating Perilaku Kerja |
Predikat Kinerja Periodik` dan datanya.

- **Periode diambil dari isi file**, tidak dipilih manual - konsisten dengan
  upload gaji induk. Rekap TAHUNAN DITOLAK dengan pesan yang menyuruh
  mengunduh yang bulanan (skema `PredikatKinerja` memang per bulan).
- **Baris "unit" di kepala file (mis. "Subbagian Tata Usaha") BUKAN
  `Pegawai.satuanKerja`** - itu nama sub-unit penilaian. Dipakai CUMA buat
  ditampilkan. Scoping kewenangan WAJIB dari `Pegawai.satuanKerja` hasil
  lookup NIP. Ini bukan detail kosmetik: kalau tertukar, Kasubag TU bisa
  menulis predikat unit lain.
- **Predikat dicocokkan EXACT, tidak pernah ditebak.** Label yang tidak ada
  di daftar resmi (Sangat Baik / Baik / Perlu Perbaikan / Butuh Perbaikan /
  Kurang / Sangat Kurang) DILEWATI dan dilaporkan per baris. Pencocokan
  sengaja bukan `includes()` - "Sangat Baik" tidak boleh kesangkut jadi
  "Baik". Ada test khusus buat jebakan ini.
- Kolom "Rating Hasil Kinerja" & "Rating Perilaku Kerja" DIBACA tapi TIDAK
  disimpan - skema cuma punya satu predikat akhir, dan yang dipakai
  Kepsekjen 82/2025 buat konversi ke persen memang "Predikat Kinerja
  Periodik". Kalau perlu diarsipkan, butuh kolom tambahan (migrasi terpisah).

**Izin** (di `src/auth/permissions.ts`, +5 unit test):
`canBukaHalamanPredikatKinerja` (gate halaman: KASUBAG_TU/PPABP/ADMIN) dan
`canUploadRekapPredikatKinerja(user, satker)` - KOMPOSISI dari izin yang
sudah ada (`canUploadKoreksiPredikatKinerjaUnit` buat Kasubag TU unitnya
sendiri + `cekPpabpAtauAdmin` buat PPABP lintas unit), bukan aturan baru.
**Dicek PER BARIS, bukan sekali per file** - satu file bisa memuat pegawai
lintas unit. `canEditPresensiKinerjaLangsung` TETAP `false` buat semua role:
upload ini bukan pintu belakang buat edit bebas, dan tiap upload menulis
`AuditTrail`. (Form ketik-manual per orang SEKARANG ADA, tapi lewat izin
yang berbeda dan tetap ber-scope unit - lihat "Kelola predikat kinerja per
orang" di bawah.)

**UI**: SATU halaman `/predikat-kinerja` dipakai KASUBAG_TU dan PPABP (pola
yang sama dengan `/pegawai` - bukan dua salinan). KASUBAG_TU dipaksa ke
unitnya di level QUERY dan filter satker-nya disembunyikan; PPABP/ADMIN
lintas satker. Halaman menampilkan sebaran predikat, tabel per periode, dan
**peringatan "Kalkulasi Tukin perlu dihitung ulang"**: pegawai yang
kalkulasi Tukin-nya sudah terlanjur dibuat SEBELUM predikat baru masuk.
Sengaja TIDAK menghitung ulang otomatis - recalculation mereset siklus
approval ke DRAFT (lihat catatan kalkulasi massal Kasubag TU di atas), jadi
keputusannya diserahkan ke user. File-nya sendiri TIDAK disimpan.

**Sumber penilaian menetap di halaman, bukan cuma di hasil upload**
(2026-08-20). Satu satuan kerja lazim dinilai BEBERAPA penilai dengan file
terpisah, dan yang mengupload bisa orang berbeda - data nyata Biro Keuangan
7/2026: `"Kasubbag TU"` 25 orang, `"Kepala Biro"` 21, plus 1 baris input
manual. Semuanya tersimpan berdampingan karena kunci baris adalah
**NIP + bulan + tahun**, bukan file dan bukan unit - jadi file kedua MENAMBAH,
tidak menimpa file pertama, dan urutan siapa mengupload duluan tidak
berpengaruh.

Yang dulu kurang cuma pelaporannya: daftar penilai yang sudah masuk HANYA
muncul di hasil upload (`KelengkapanPredikat`), jadi orang kedua yang membuka
halaman itu besoknya melihat "belum punya predikat 20" tanpa bisa tahu
sebabnya - file penilai lain belum diupload, atau orangnya yang memang belum
dinilai? Dua sebab, dua tindak lanjut. Sekarang barisnya ada tetap di kartu
periode, di bawah Sebaran.

- **Diturunkan dari `PredikatKinerja.unitPenilaian`** yang sudah lama
  tersimpan per baris - tidak ada kolom/migrasi baru.
- **SENGAJA tidak memakai `where` halaman** (yang ikut tersaring pencarian
  nama/NIP): pertanyaannya soal SELURUH unit, alasan yang sama dengan
  `jumlahSeUnitPeriode`. Diverifikasi: mencari "Irwan" tidak mengubah
  angkanya (25/21/1 tetap).
- **Butuh satuan kerja terpilih** - tanpa itu daftarnya jadi seluruh penilai
  se-kementerian. Barisnya tidak dirender sama sekali, dan pesan "Pilih
  satuan kerja di filter" yang sudah ada yang menjelaskan.
- **Baris ber-`unitPenilaian` NULL dipisah sebagai "Tanpa sumber tercatat",
  bukan dibuang** - itu predikat hasil ketik manual (`TambahPredikatForm`).
  Kalau disembunyikan, angka di daftar ini tidak menjumlah ke total unit, dan
  selisihnya jadi misteri. Diverifikasi 25 + 21 + 1 = 47 = jumlah baris unit
  itu.
- **Jumlah penilai BUKAN penentu lengkap/tidaknya** - berapa penilai yang
  seharusnya mengirim file berbeda tiap unit dan tidak dipunyai sistem. Yang
  menentukan tetap kolom "Belum punya predikat" di atasnya.

**Celah yang MASIH terbuka**: kalau NIP yang SAMA muncul di dua file dengan
predikat BERBEDA, yang terakhir diupload menang tanpa peringatan apa pun
(upsert). Ini satu-satunya jalur saling-timpa yang tersisa - sama mekanismenya
dengan duplikat dalam satu file yang sudah tercatat di bawah. TODO(confirm):
perlu diputuskan apakah predikat yang bentrok ditolak, atau ditulis dengan
peringatan eksplisit.

**Riwayat predikat di `/pegawai`**: halaman detail Data Pegawai sekarang
punya panel "Riwayat predikat kinerja" (periode, predikat, nilai persen,
sumber, cara input) - READ-ONLY, dengan link ke `/predikat-kinerja` buat
yang berwenang. Tujuannya supaya pertanyaan "kenapa tukin dia segitu" bisa
dijawab tanpa pindah halaman.

**`MockEKinerjaAdapter.importFromUploadedFile` SUDAH DIIMPLEMENTASI** -
dulu `throw new Error("Belum diimplementasi...")`. Sekarang mendelegasikan
ke parser yang SAMA dengan Server Action upload, jadi CLI dan UI tidak
punya dua parser yang bisa beda perilaku. Perhatikan file adapter itu pakai
`import XLSX from "xlsx"` (default) karena jalan lewat tsx/CJS, sementara
Server Action pakai named import - lihat gotcha di bagian gaji induk.

**Diverifikasi manual end-to-end** (production build):
- **KASUBAG_TU Ayu Puspita Sari (Pusdatik)** upload file berisi 28 pegawai
  Biro Keuangan -> **SEMUA 28 baris ditolak** dengan alasan "di luar
  kewenangan kamu (pegawai Biro Keuangan dan Barang Milik Negara)", tidak
  ada satu baris pun tertulis. Dicek ulang lewat query: 3 baris predikat
  Pusdatik masih bertanggal sync seed lama (25 Juli), dan TIDAK ada
  `AuditTrail` dari percobaan itu.
- **PPABP Irwan Syafril** upload file yang sama -> 28 tersimpan, periode
  6/2026 terbaca dari file, dikelompokkan ke "Biro Keuangan dan Barang Milik
  Negara" (satuan kerja ASLI pegawai, bukan "Subbagian Tata Usaha" dari
  header file), sebaran Baik 25 / Sangat Baik 3, peringatan 2 pegawai perlu
  hitung ulang Tukin muncul benar, `AuditTrail` tercatat.
- Riwayat predikat muncul di `/pegawai` (Wanti Lena Sari: Juni 2026, Sangat
  Baik, 100%, "e-Kinerja BKN (upload manual)").
- Adapter diuji langsung terhadap file asli: 28 baris, semua periode 6/2026,
  semua nilai 100%.

**Data hasil verifikasi SENGAJA TIDAK di-revert** - 28 predikat periode
6/2026 itu data nyata yang berguna buat demo. Upsert-nya idempoten, jadi
upload ulang file yang sama aman.

### Kelola predikat kinerja per orang (tambah / ubah / hapus)

Diminta user: "buat ruang dan tombol khusus untuk edit, hapus, tambah data,
karena kedepannya akan panjang" - supaya Kasubag TU bisa mengurus datanya
sendiri tanpa selalu bergantung file rekap yang utuh.

**TIDAK ADA invarian yang dicabut, dan ini perlu ditegaskan** karena
sekilas terlihat bertentangan. `canEditPresensiKinerjaLangsung` TETAP
`false` dan tidak dipakai di mana pun. Izin yang dipakai adalah
`canUploadRekapPredikatKinerja` - yang komposisinya sudah memuat
`canUploadKoreksiPredikatKinerjaUnit`, fungsi yang sejak awal dideskripsikan
sebagai "upload predikat kinerja **+ koreksi langsung di Gajihub kalau ada
yang salah**", dan disebut eksplisit di komentar
`canEditPresensiKinerjaLangsung` sebagai salah satu jalur koreksi yang SAH.
Yang dilarang itu edit BEBAS tanpa scope & tanpa jejak - bukan koreksi
ber-scope unit yang tercatat. Jadi yang selama ini belum ada cuma UI-nya.

`src/app/tukin/predikat-kinerja/actionsKelola.ts` (BARU) - tiga Server
Action dengan tiga pengaman yang membuatnya bisa dipertanggungjawabkan:

1. **Otorisasi per baris terhadap `Pegawai.satuanKerja` milik baris yang
   disentuh**, bukan terhadap filter yang sedang dibuka - `id` dari form
   tidak dipercaya. Kasubag TU tidak bisa menyentuh unit lain sekalipun
   id-nya ditebak/diedit di form.
2. **`nilaiAngka` TIDAK PERNAH diterima dari form** - selalu diturunkan
   ulang dari predikatnya lewat `konversiPredikatKeNilaiPersen` (Kepsekjen
   82/2025). Tanpa ini orang bisa mengirim predikat "Kurang" dengan nilai
   100% dan tukinnya ikut salah.
3. **Tiap perubahan menulis `AuditTrail` lengkap dengan nilai SEBELUM dan
   SESUDAH**, dan barisnya ditandai `sourceSystem = "Input manual Gajihub"`
   + `inputMethod = MANUAL_ENTRY|MANUAL_EDIT`. Angka hasil ketikan manusia
   TIDAK BISA menyamar sebagai angka resmi dari BKN - di tabel muncul chip
   merah/kuning "bukan dari BKN". Baris yang dihapus pun jejaknya tetap ada
   di `dataSebelum`, jadi bisa dipulihkan manual kalau keliru.

Tidak ada migrasi - `sourceSystem`/`inputMethod` sudah `String` bebas.

**UI** (`/tukin/predikat-kinerja`):
- Panel "Periode yang sudah ada datanya" naik dari satu baris teks jadi
  panel chip per periode (periode aktif disorot, jumlah pegawai ikut
  ditampilkan) - jumlah periode bertambah tiap bulan, jadi bentuk lamanya
  bakal jadi paragraf panjang tak terbaca.
- Panel konteks 4 tile: **Periode dibuka / Unit kerja / Pegawai
  berpredikat / Belum punya predikat** - menjawab "ini data bulan & unit
  apa" yang jadi keluhan awal.
- Kolom **Aksi** per baris: Ubah (form inline, pilih predikat + alasan) dan
  Hapus (konfirmasi dua langkah yang menyebut nama & periodenya - BUKAN
  `confirm()` bawaan browser yang tidak bisa menampilkan konteks). Baris di
  luar kewenangan menampilkan "Di luar kewenangan", tombolnya tidak
  dirender - dan action-nya tetap mengecek ulang sendiri.
- Form **Tambah predikat satuan**, dropdown-nya SENGAJA cuma berisi pegawai
  yang BELUM punya predikat di periode itu. Kalau semua pegawai ikut masuk,
  orang gampang memilih yang sudah ada lalu ditolak - lebih baik
  pilihannya memang tidak ada. Butuh satuan kerja terpilih dulu; tanpa itu
  daftarnya seluruh kementerian (±5.000) dan tidak praktis.

**Diverifikasi end-to-end** (production build, lewat halaman uji sementara
yang membungkus ketiga action sebagai form progressive-enhancement, lalu
dihapus): tambah -> 85% untuk "Perlu Perbaikan"; tambah ulang ditolak
("sudah punya predikat"); KASUBAG_TU Pusdatik ditolak di ketiga aksi untuk
pegawai Biro Keuangan; ubah ke predikat yang sama ditolak; predikat asing
("LUAR_BIASA") ditolak; ubah sah -> `KURANG`/60%/`MANUAL_EDIT`; hapus sah;
hapus baris yang sudah hilang ditolak dengan pesan jelas. AuditTrail
CREATE/UPDATE/DELETE tercatat lengkap. Angka di panel konteks diadu ke
database dan **cocok persis** (27 Biro Keuangan, 8 belum punya predikat).
**Semua mutasi uji SUDAH DI-REVERT** - `predikat_kinerja` kembali 29 baris,
nol baris bertanda input manual, 3 baris AuditTrail uji dihapus.

**Temuan sampingan**: ringkasan upload menghitung BARIS, bukan ORANG. File
"Rekap Penilaian (47).xlsx" melaporkan "Biro Keuangan: 29 pegawai" padahal
di database cuma **27 orang** - 2 baris di file itu duplikat persis
(KHARINA OLIVIA & WANTI LENA SARI, isinya identik) yang meng-upsert ke
kunci unik yang sama. Tidak ada data hilang, TAPI kalau suatu saat NIP yang
sama muncul dua kali dengan predikat BERBEDA, yang terakhir menang tanpa
peringatan. TODO(confirm): perlu diputuskan apakah duplikat dalam satu file
harus ditolak/diperingatkan.

### Riwayat gaji pegawai (gaji induk) & slip gaji format asli

Dipicu 2 file dari user: contoh slip gaji ASLI cetakan PPABP Setjen
("i'mal SLIP GAJI SETJEN cetak februari.pdf") dan file ADK gaji asli dari
GPP/Web Gaji ("Gaji_Bank_45093800_1_000964.xlsx" - satker 450938 Setjen,
periode 07/2026, 350 pegawai). Intinya: slip gaji butuh komponen GAJI INDUK
(gaji pokok + tunjangan keluarga/fungsional/beras + potongan IWP/PPh/BPJS)
yang TIDAK dihitung Gajihub sama sekali - itu domain Web Gaji Kemenkeu -
jadi PPABP meng-UPLOAD-nya.

**Model `GajiInduk`** (migrasi `20260729000000_tambah_gaji_induk`, satu
`CREATE TABLE`, non-destruktif):
- Nama kolom pakai istilah SLIP (gajiPokok/tunjanganIstri/potonganIuran
  Pegawai/dst), BUKAN nama kolom mentah GPP (gjpokok/tjistri/potpfk10) -
  pemetaannya terkumpul di satu tempat, `src/business-logic/gajiInduk.ts`.
- **PII finansial SENGAJA dibuang saat parsing**: kolom `npwp`, `nmrek`,
  `nm_bank`, `rekening`, `kdbankspan`, `nmbankspan`, `kdpos` TIDAK pernah
  masuk database (keputusan eksplisit user). Konsekuensinya: kolom rekening
  di export ADK Tukin TETAP kosong - kalau nanti mau diisi, itu keputusan
  TERPISAH soal menyimpan data rekening, bukan efek samping fitur ini.
- Kolom `kodeSatker` (mis. "450938") adalah SATU-SATUNYA sumber kode satker
  resmi yang dipunya sistem ini sekarang - relevan buat kolom "Kode Satker"
  di export ADK Tukin yang selama ini kosong, TAPI belum disambungkan.
- Baru mendukung gaji INDUK (`kdjns` = "1"). Jenis lain (susulan/kekurangan/
  terusan) DILEWATI dengan alasan eksplisit - unique key
  (pegawai+bulan+tahun) menganggap satu pegawai cuma punya satu baris gaji
  per periode. Kalau nanti perlu, `jenisGaji` harus ikut masuk unique key.
- **`honorarium` TIDAK ada di file GPP** (di slip contoh nilainya Rp 11,4
  jt). Sesuai keputusan user: setelah upload nilainya selalu 0, lalu
  di-edit manual PPABP per pegawai. Upload ulang file GPP TIDAK menimpa
  honorarium yang sudah diketik (kolom itu sengaja tidak ikut di `update`
  upsert). TODO(confirm): sumber resminya belum jelas (kemungkinan SPJ
  kegiatan), jangan diasumsikan bisa ditarik otomatis.

**`src/business-logic/gajiInduk.ts`** (pure, 15 unit test) - pemetaan baris
GPP, penjumlahan total, dan `hitungTotalPenghasilanSlip`. Test-nya memakai
angka ASLI dari slip contoh (5.421.032 / 408.268 / 5.012.764 / 24.048.964)
DAN dua baris asli file GPP, jadi kalau pemetaan kolom bergeser test ini
yang jatuh duluan. Pengecekan `selisihAritmatika` (bruto - potongan vs
kolom `bersih`) adalah deteksi SALAH-BACA file, BUKAN "koreksi" atas angka
resmi - baris tetap disimpan apa adanya dan selisihnya dilaporkan ke UI.

**UI PPABP `/ppabp/gaji-induk`** (izin baru `canKelolaGajiInduk` - PPABP +
ADMIN; KASUBAG_TU SENGAJA DITOLAK, beda dari BuktiPotongPajak, karena yang
memegang ADK gaji Kemenkeu & menandatangani slip memang PPABP):
- Upload file .xlsx, periode diambil DARI ISI FILE (kolom bulan/tahun),
  bukan dipilih manual. **File-nya sendiri TIDAK disimpan** ke disk/object
  storage - cuma dibaca di memori, yang masuk database angkanya saja. Ini
  sengaja menghindari TODO(confirm) storage/retensi dokumen yang masih
  terbuka (sama alasannya dengan upload bukti dukung banding yang sampai
  sekarang belum dibangun).
- Hasil upload dilaporkan eksplisit: jumlah tersimpan per periode, baris
  yang dilewati beserta alasannya (dikelompokkan, bukan 300 baris pesan),
  dan daftar baris yang selisih aritmatikanya bukan nol.
- Upsert ditulis per batch 50 (`prisma.$transaction`) supaya satu file 350+
  baris tidak jadi satu transaksi raksasa.
- Tabel per periode + filter satker + pencarian nama/NIP, maksimal 200
  baris ditampilkan.
- `next.config.mjs` diberi `serverActions.bodySizeLimit: "10mb"` (default
  Next cuma 1 MB, file contoh saja sudah ~600 KB). Action-nya sendiri
  menolak file > 8 MB duluan supaya pesannya jelas.
- **Gotcha penting**: di sini `xlsx` di-import NAMED (`import { read, utils }
  from "xlsx"`), BUKAN default seperti `src/jobs/importPegawaiXlsx.ts`.
  Bundler Next resolve paket itu ke build ESM `xlsx.mjs` yang TIDAK punya
  default export, jadi `import XLSX from "xlsx"` bikin `next build` GAGAL
  (tidak ketahuan waktu `npm run dev`/tsc). Skrip di `src/jobs/` aman karena
  jalan lewat tsx/CJS.

**Slip gaji `/saya/slip-gaji/[bulan]/[tahun]` - badge PLACEHOLDER DICABUT**,
sekarang mengikuti format slip asli: kop "KEMENTERIAN KETENAGAKERJAAN RI" +
unit Eselon I, judul "PERINCIAN PEMBAYARAN GAJI", blok identitas, daftar
PENGHASILAN bernomor, POTONGAN, Jumlah Gaji Bersih, lalu Tunjangan Kinerja/
Uang Makan/Uang Lembur/Honorarium, Total Penghasilan, dan blok tanda tangan
PPABP.
- **`src/business-logic/strukturEselon.ts` AKHIRNYA DIPAKAI** (sebelumnya
  "BELUM dipakai di UI manapun") - `getEselon1()` mengisi baris kedua kop.
  Fallback ke `satuanKerja` kalau unitnya tidak ketemu persis di lookup
  (TODO(confirm) mapping yang sudah ada tetap berlaku).
- Baris "Tunjangan Umum/Jabatan" di slip = `tunjanganUmum` +
  `tunjanganStruktural` (di GPP dua kolom terpisah, di slip satu baris).
  Disimpan tetap terpisah di database supaya tidak ada informasi hilang.
- Nilai nol ditulis "-" persis seperti contoh. Baris "Tunjangan Lain-lain"/
  "Potongan Lain-lain" CUMA muncul kalau isinya > 0 (tidak ada di slip
  contoh, ditambahkan supaya nilai dari satker lain tidak hilang diam-diam).
- Penanda "estimasi" cuma muncul kalau ada komponen yang BELUM approved -
  slip yang sudah final tercetak bersih seperti contoh.
- Kalau gaji induk periode itu belum diupload, slip TIDAK error: tampil
  penjelasan + hanya komponen yang dihitung Gajihub.
- Penanda tangan diambil dari `GajiInduk.diunggahOleh` (PPABP yang upload),
  bukan nama yang dihardcode. Kalau belum ada gaji induk, jadi garis kosong.
- Alamat kantor masih SATU alamat konstan (kantor pusat, sesuai contoh) -
  TODO(confirm) kalau pilot melebar ke satker luar Gatot Subroto.
- Logo Kemnaker di contoh SENGAJA tidak ditiru - yang ada di repo cuma logo
  Gajihub, dan memakainya di dokumen berformat dokumen resmi kementerian
  jelas keliru.
- `/saya` ikut menyesuaikan: tile "Gaji bersih" ditambahkan, "Total" sekarang
  pakai `hitungTotalPenghasilanSlip` yang SAMA dengan slip (biar tidak beda
  angka), dan daftar periode slip ikut memperhitungkan periode yang cuma
  punya gaji induk.

**Diverifikasi manual end-to-end** (production build, PPABP Irwan Syafril):
upload file ADK asli -> 350 baris tersimpan, 1 baris dilewati (baris kosong
di akhir file), total gaji bersih Rp 1.498.538.900 - dicek ulang lewat
script terhadap file ASLI: jumlah baris, total penghasilan, total potongan,
dan total bersih SAMA PERSIS dengan isi database, dan 0 dari 350 baris punya
selisih aritmatika. Edit honorarium tersimpan + tercatat di `AuditTrail`.
Slip gaji Juli 2026 tampil sesuai format contoh dengan aritmatika benar
(6.797.409 - 545.809 = 6.251.600; total 28.467.600). Slip Juni 2026 (belum
ada gaji induk) menampilkan fallback dengan benar. Akun KASUBAG_TU (Ayu
Puspita Sari) dapat "Akses ditolak" di `/ppabp/gaji-induk` dan menunya tidak
muncul di sidebar.

**Data hasil verifikasi SENGAJA TIDAK di-revert** (beda dari verifikasi
OSDMA/PPABP/Admin sebelumnya): 350 baris gaji induk periode 7/2026 justru
data yang dibutuhkan supaya slip gaji bisa didemokan. Yang perlu diingat:
honorarium Rp 11.400.000 pada Irwan Syafril adalah ANGKA UJI (disalin dari
slip contoh milik orang lain), kosongkan lewat `/ppabp/gaji-induk` kalau
tidak mau ikut tampil waktu demo.

### Diklat & Dinas Keluar di akhir pekan tidak lagi dihitung hari kerja

Ketemu waktu user mengadu rincian manual: Alpha Sandro tercatat **14 hari
Diklat** di Juli 2026, rincian manual Rokeu menulis **13**. Selisihnya satu
baris - Diklat di **Sabtu 4 Juli**. 13 sisanya semuanya hari kerja.

Pengecualian akhir pekan di `presensiPdfKeRekap.ts` cuma mencakup
`["WFO", "WFH_WFA", "TIDAK_HADIR"]`, jadi Diklat & Dinas Keluar di Sabtu/Minggu
lolos dan terhitung sebagai hari kerja. Gejala yang paling kelihatan:
**295 dari 5.089 rekap Juli menampilkan hari hadir MELEBIHI hari kerja**
(Alpha Sandro 24 dari 23) - angka yang tidak bisa dibaca sebagai benar oleh
siapa pun yang mencocokkannya.

**TIDAK mengubah rupiah, dan itu perlu ditegaskan** supaya tidak ada yang
mencari selisih pembayaran yang tidak ada: uang makan dihitung dari WFO +
WFH/WFA (Diklat & Dinas Keluar memang tidak berhak, SBM item 22.1), dan
seluruh potongan Pasal 13 sudah dijaga `!hariLibur` sejak awal. Yang berubah
angka pelaporan - dan justru itu yang diadu ke rincian manual.

**Kategori lain SENGAJA tidak ikut ditambahkan.** Di Juli 2026 baris akhir
pekan cuma ada pada Dinas Keluar (540) dan Diklat (51); Cuti, Izin, Upacara,
dan Tugas Belajar **nol**. Menambahkannya berarti mengubah perilaku atas kasus
yang belum pernah terlihat - dan Cuti khususnya berisiko karena
`jumlahHariCuti` ikut jadi dasar penanda `PERIKSA MANUAL` di `hitungTukin`.

Catatan "hari hadir melebihi hari kerja" ikut diperbaiki kalimatnya: Sabtu &
Minggu sudah tidak bisa jadi penyebabnya, jadi yang tersisa cuma libur nasional
di hari kerja (tetap tidak bisa dikenali sistem ini). Catatan itu sekarang jauh
lebih jarang muncul dan lebih layak dipercaya.

**Perbaikan ini berlaku pada TARIKAN BERIKUTNYA, bukan surut** - baris
`RekapPresensiPeriode` yang sudah tersimpan tetap memuat angka lama sampai
periodenya disinkronkan ulang.

### Kendala e-Presensi: satu tanggal rusak, bukan 960 orang lalai

**Dasar: Pasal 10 ayat (2)** - *"Dalam hal presensi elektronik mengalami
kendala atau keadaan kahar, presensi dilakukan secara manual yang diketahui
oleh pimpinan Unit Kerja masing-masing."*

**Kejadian yang melahirkannya.** Absensi Kemnaker **murni online, tidak ada
mesin tap** - jadi kalau webnya tidak bisa diakses, tidak ada cara lain
mencatat kehadiran. Pada 15 & 16 Juli 2026 itu benar-benar terjadi, dan
datanya menunjukkannya tanpa perlu ditanyakan:

| | Hari kerja | Jam keluar 23:59 | % |
|---|---|---|---|
| Hari biasa (Sen-Kam) | ~4.200 | 55-105 | **1,3-2,5%** |
| Jumat (konsisten, tiap minggu) | ~4.400 | 197-223 | **4,5-5,1%** |
| **15 Juli** | 4.237 | **576** | **13,6%** |
| **16 Juli** | 4.223 | **597** | **14,1%** |

**1.173 kejadian, 960 pegawai, Rp 18.178.588** potongan Pasal 13 ayat (2).
Jam `23:59` itu isian otomatis e-Presensi saat absen pulang tidak pernah
masuk - dibuktikan sebarannya: 3.320 baris persis di menit yang sama lawan
456 yang tersebar di 59 menit lain sepanjang jam 23. Manusia tidak menekan
tombol serentak di satu menit.

**Yang PPABP lakukan sebelum ini**: mengetik jam 16:00 satu per satu, hanya
untuk pegawai yang kebetulan melapor beserta foto bertimestamp & geotag.
Yang tidak tahu harus melapor tetap dipotong - untuk kerusakan yang bukan
miliknya.

**Yang membuat pekerjaan itu sebagian besar tidak perlu**: dari 1.173 kasus,
**1.164 (99,2%) masih punya absen MASUK pagi yang tercatat normal** dan nol
yang gagal absen masuk. Kehadiran mereka sudah dibuktikan oleh e-Presensi
sendiri; meminta foto lagi adalah menduplikasi bukti yang sudah ada. Alpha
juga tidak melonjak (1,1% di kedua tanggal, sama dengan hari lain), jadi
tidak ada yang terlanjur tercatat bolos.

**Bentuknya di kode:**
- **`src/business-logic/kendalaEpresensi.ts`** (PURE, 15 unit test) - dua
  tugas yang SENGAJA dipisah: `deteksiTanggalJanggal()` mencari kandidat,
  `indeksKendala()`/`tanggalDikecualikan()` menerapkan penanda yang ditulis
  MANUSIA. **Deteksi tidak pernah langsung jadi pengecualian** - kalau sistem
  boleh memutihkan sendiri tanggal yang kelihatan aneh, hari yang memang
  banyak orang lalai ikut terhapus dan tidak ada yang tahu.
- **Ambang deteksi**: `>= 8%` **DAN** `>= 3x median` bulan itu. Median, bukan
  rata-rata - kalau ada beberapa hari rusak, rata-ratanya ikut terangkat dan
  menyamarkan hari rusak itu sendiri (ada test yang menguncinya). Ambang 8%
  memisahkan 13,6%/14,1% dari Jumat yang 5,1% dengan jarak lega di kedua sisi
  - **hari Jumat memang selalu lebih tinggi, itu perilaku manusia menjelang
  akhir pekan, bukan kerusakan, dan tidak boleh ikut tertandai.**
- **Model `KendalaEpresensi`** (migrasi `20260812140000_kendala_epresensi`,
  satu CREATE TABLE): tanggal + `satuanKerja` nullable (NULL = seluruh
  kementerian) + **`alasan` WAJIB** + siapa & kapan. Alasan tidak boleh kosong
  karena baris itulah yang dibaca auditor ketika bertanya kenapa potongan
  sehari hilang untuk ratusan orang.
- **Pengecualiannya ditaruh DI DALAM `rekapDariLaporanPdf()`** - fungsi yang
  SAMA yang menghitung kejadiannya, lewat parameter ketiga. BUKAN dikurangkan
  belakangan di lapisan kalkulasi: kalau penghitung dan pembatal dipisah,
  keduanya bisa memakai aturan yang sedikit berbeda dan selisihnya baru
  ketahuan setelah uangnya terkirim.
- **`src/lib/kendalaPresensi.ts`** - jembatan ke database, dipakai bareng
  tombol UI dan CLI. Tabel `Pegawai` hanya dibaca kalau memang ada penanda
  ber-scope satker; hasil per satker di-cache (ribuan pegawai cuma tersebar
  di puluhan satker).
- **`/tukin/presensi/kendala`** - tabel per tanggal, panel merah berisi
  kandidat yang belum ditandai, daftar penanda yang sudah ada + tombol cabut
  (konfirmasi dua langkah), dan form penandaan. Agregasinya `$queryRaw` GROUP
  BY - satu periode berisi ~117.000 baris presensi, menariknya ke memori cuma
  untuk dihitung per tanggal jelas pemborosan.

**Yang dibatalkan HANYA Pasal 13 ayat (2).** Keterlambatan (ayat 3) tetap
dihitung - absen masuknya memang berhasil, dan memutihkannya berarti
menghapus pelanggaran yang datanya justru lengkap. Ketidakhadiran (ayat 1)
juga tidak disentuh: sistem rusak tidak membuat orang yang tidak masuk jadi
masuk. Dua-duanya dikunci test.

**Izin `canKelolaKendalaEpresensi` SENGAJA cuma PPABP + ADMIN**, tidak
termasuk KASUBAG_TU - beda dari `canUploadRekapPresensi` yang memang
ber-scope unit. Alasannya bukan jenjang tapi cakupan akibat: satu penanda
bisa menghapus potongan ribuan orang lintas unit sekaligus. TODO(confirm):
kalau nanti Kasubag TU perlu menandai kendala yang cuma menimpa unitnya,
fungsi itu yang dilonggarkan - dengan syarat penandanya WAJIB ber-satuanKerja.

**Sekali klik, banyak sekaligus, dan bisa diubah.** Bentuk pertama cuma punya
"tambah satu" + "hapus", dan itu memancing kebiasaan yang mahal: menambah satu
tanggal lalu menarik ulang presensi, berulang kali. Sekarang:
- **Tombol "Tetapkan libur" langsung di daftar kandidat** hasil deteksi
  (keterangan otomatis "Libur nasional", diperbaiki lewat Ubah). Menuntut orang
  mengetik nama harinya dulu membuat daftar kandidat itu sendiri tidak berguna.
- **Isian banyak tanggal sekaligus** - dipisah spasi/koma/baris baru. Satu
  tahun SKB 3 Menteri masuk sekali kerja, lalu **tarik ulang cukup SEKALI**.
  Yang formatnya salah & yang sudah ada dilaporkan per tanggal, tidak
  menggagalkan yang sah.
- **Ubah** (tanggal, keterangan, jenis) - sebelumnya membetulkan salah ketik
  berarti hapus lalu tambah lagi, dua baris AuditTrail, dan tanggalnya sempat
  hilang dari kalender di antaranya. Kalau TANGGALNYA yang diubah, pesannya
  menyebut **dua** periode yang terdampak, bukan satu.

**MENANDAI TANGGAL TIDAK LANGSUNG MENGUBAH ANGKA.** Pengecualiannya dipakai
saat rekap presensi dihitung, jadi setelah menandai (atau mencabut) harus
**tarik ulang presensi periode itu**, lalu hitung ulang Tukin. Ini disebutkan
di halaman & di pesan sukses action-nya - bukan jebakan tersembunyi. Pilihan
ini disengaja: alternatifnya menyimpan kejadian per hari di `PresensiHarian`
(kolom baru + migrasi) supaya bisa dikurangkan saat kalkulasi, dan itu
menciptakan dua tempat yang menghitung hal yang sama.

**Diverifikasi** (production build, akun PPABP Irwan Syafril, data nyata):
halaman menampilkan 15 Juli **13,6% (7,7x hari biasa)** dan 16 Juli **14,2%
(8,0x)** ber-chip "Janggal - perlu dicek", sementara Jumat 3 Juli (4,8%)
tidak tertandai; KASUBAG_TU Ayu Puspita Sari mendapat "Akses ditolak" dan
panel kendala tidak muncul di `/tukin/presensi` miliknya. Jembatan database
diuji terpisah dengan penanda sungguhan: penanda se-kementerian menjangkau
pegawai Biro Keuangan MAUPUN Pusdatik, penanda ber-scope Pusdatik hanya
menjangkau Pusdatik, dan NIP tak dikenal hanya mendapat penanda
se-kementerian. **Semua baris uji sudah dihapus** (tabel kembali 0 baris).

#### Koreksi jam per hari (petugas absensi)

Alur nyatanya, dari keterangan user: e-Presensi error -> pegawai memotret
dirinya beserta **geotag & jam** -> dikirim ke **WhatsApp petugas absensi** ->
petugas memperbaiki jamnya di Gajihub. Model `KoreksiPresensiHarian` (migrasi
`20260812160000_koreksi_presensi_harian`) tempat perbaikan itu, form-nya per
baris di `/tukin/presensi/[nip]`.

**Sebagian besar kasus TIDAK memerlukannya, dan itu terukur.** Dari 1.173
kejadian 15-16 Juli 2026, **1.114 tidak punya potongan lain sama sekali** -
untuk mereka menandai tanggalnya menghasilkan angka yang **persis sama**
dengan mengetik jam 16:00 (ayat (2) dibatalkan, dan pulang cepat memang sudah
0 karena jam 23:59 tidak pernah dipercaya sebagai jam pulang). Menyediakan
form isian untuk 1.114 orang itu justru mengembalikan pekerjaan yang baru saja
dihapus.

Yang benar-benar butuh koreksi jam ada di sisa **59 baris**, dan yang paling
jelas ada di ujungnya:

```
2026-07-15  ANDI PRASETYO             masuk=19:32  telat=662 menit
2026-07-15  YISWI NILAM PRASTIKASARI  masuk=17:54  telat=564 menit
2026-07-16  RESTU PUJIANTI            masuk=15:52  telat=442 menit
```

Orang tidak datang kerja pukul 19:32 - itu pola lupa yang sama, tapi di sisi
**masuk**. Penanda tanggal tidak menyentuh keterlambatan (memang tidak boleh),
jadi hanya koreksi jam yang bisa membetulkannya.

**KENAPA TABEL SENDIRI, BUKAN MENIMPA `PresensiHarian`**: sinkronisasi
menghapus sebulan penuh lalu menulis ulang, jadi jam hasil koreksi yang
ditulis langsung ke sana **hilang pada tarikan berikutnya** - persis masalah
yang dulu memaksa `kelasJabatanSelamaHukuman` punya kolom sendiri. Data mentah
e-Presensi tetap utuh (jam 23:59 tetap tersimpan dan tetap ditampilkan di
layar), koreksinya ditumpuk di atasnya saat rekap dihitung.

**Tiga pengaman yang membuatnya bisa dipertanggungjawabkan:**
1. **Hanya di tanggal yang sudah ditandai kendala.** Ini yang membedakannya
   dari "edit presensi bebas" - invariant `canEditPresensiKinerjaLangsung =
   false` untuk SEMUA role tetap utuh. Di tanggal biasa, kolomnya berbunyi
   "tanggal belum ditandai kendala" dan action-nya menolak.
2. **Otorisasi terhadap satuan kerja pegawai yang DIKOREKSI** (pakai
   `canUploadRekapPresensi` yang sudah ada, jadi Kasubag TU bisa mengurus
   unitnya sendiri, PPABP/Admin lintas unit) - id dari form tidak dipercaya.
3. **AuditTrail memuat jam ASLI dari e-Presensi di `dataSebelum`.** Itu yang
   membedakan "diperbaiki" dari "dikarang". Hasil rekap juga membawa
   `tanggalDikoreksiManual` + catatan eksplisit, jadi angka ketikan manusia
   tidak bisa menyamar sebagai angka e-Presensi.

Jam hasil koreksi **selalu dipercaya** untuk menghitung terlambat/pulang cepat
(itu keterangan terverifikasi, bukan tebakan atas ketukan hilang), TAPI
**tidak memutihkan pelanggaran**: dikoreksi masuk 09:00 tetap menghasilkan 30
menit terlambat setelah toleransi. Ada test yang menguncinya. Kolom yang
dikosongkan berarti "tidak dikoreksi" - petugas boleh memperbaiki jam pulang
saja tanpa menyentuh jam masuk yang sudah benar.

Foto & geotag-nya sendiri **TIDAK disimpan di Gajihub** (kebijakan
penyimpanan dokumen masih terbuka - lihat TODO(confirm) storage). Yang dicatat
sistem adalah keputusannya beserta dasar tertulisnya.

**Diverifikasi** (production build, akun PPABP, pegawai ACEP SJAIFULLOH R):
sebelum tanggalnya ditandai, kolom Koreksi berbunyi "tanggal belum ditandai
kendala" dan tombolnya tidak ada; setelah 15 Juli ditandai, tombol "Koreksi
jam" muncul; setelah koreksi disimpan, badge "Dikoreksi manual" tampil
**sementara jam asli 23:59 tetap terlihat di kolomnya**. Jembatan ke mesin
hitung mengembalikan `{"2026-07-15":{jamMasukMenit:null,jamKeluarMenit:960}}`
untuk NIP itu dan kosong untuk NIP lain. Semua baris uji sudah dihapus.

**TODO(confirm) - dua hal yang masih menunggu manusia**:
1. **Apa yang sebenarnya terjadi 15-16 Juli 2026 belum dipastikan** ke
   pengelola e-Presensi. Sebelumnya sempat dikatakan tidak ada gangguan;
   datanya membantah, atau setidaknya menunjukkan ada sesuatu yang tidak
   tercatat sebagai gangguan. Tanggal itu **belum ditandai** - sengaja,
   karena penandanya harus keputusan sadar, bukan efek samping fitur ini.
2. **9 orang yang absen masuknya siang/sore** di kedua tanggal itu tetap
   butuh verifikasi bukti (foto & geotag) seperti sebelumnya - untuk mereka
   kehadiran paginya memang tidak tercatat di manapun.

### Periode default halaman (`src/app/periodeDefault.ts`)

Halaman berperiode dulu selalu jatuh ke **bulan berjalan** kalau dibuka tanpa
`?bulan=&tahun=` - dan bulan berjalan hampir selalu bulan yang belum ada
datanya (rekap presensi ditarik setelah bulannya lewat, predikat kinerja
terbit lebih lambat lagi). Link sidebar tidak membawa query string, jadi
mendarat di halaman kosong. Ini pernah benar-benar menyesatkan: *"saya udah
kalkulasi unit, kok belum ada angka data nya di tabel?"* - kalkulasinya
berhasil, yang terbuka bulan yang berbeda.

~~Sekarang: **bulan berjalan tetap diutamakan kalau datanya memang ada**~~
**DIUBAH 2026-08-18 (permintaan user)**: bawaannya sekarang **periode TERBARU
yang datanya ada DAN bulannya sudah lewat** - bulan berjalan sengaja
DILEWATI.

Alasannya bukan selera: bulan berjalan itu periode yang **belum selesai**. Per
18 Agustus, rekap Agustus cuma memuat kehadiran sampai tanggal itu, jadi
potongan Pasal 13, hari uang makan, dan jam lembur semuanya masih akan
berubah sampai bulannya tutup. Menyodorkannya sebagai tampilan bawaan membuat
angka setengah jadi terbaca seperti angka final - dan itu angka yang dipakai
orang memutuskan pembayaran.

- **Bergerak sendiri, tidak ada bulan yang di-hardcode**: begitu masuk
  September, bawaannya jadi Agustus.
- **Kalau yang ada CUMA bulan berjalan** (mis. server baru yang baru sekali
  menarik presensi), bulan itu tetap dipakai - halaman kosong tanpa penjelasan
  lebih buruk daripada angka yang belum final.
- Bulan berjalan tetap bisa dibuka lewat filter - jadi pilihan sadar, bukan
  yang kebetulan terbuka.
- 3 unit test baru (melewati bulan berjalan, satu-satunya periode, dan lintas
  tahun Januari -> Desember tahun sebelumnya).

- **Periode yang dipilih user TIDAK PERNAH dipindahkan diam-diam**, termasuk ke
  periode kosong. Kalau dia membuka Agustus dan Agustus memang kosong, itu
  jawaban yang benar - memindahkannya justru menyembunyikan fakta. Yang
  di-resolve hanya nilai yang tidak ada / tidak waras.
- Nilai ngawur dari query string (`?bulan=abc`, `0`, `13`) dulu jadi `NaN` yang
  diteruskan ke Prisma dan mengembalikan nol baris tanpa penjelasan. Sekarang
  diabaikan dan diganti periode default.
- Kalau cuma salah satu yang terisi (`?bulan=7` tanpa tahun), yang terisi tetap
  menang - sisanya diambil dari periode default.

**Tiap halaman bertanya ke tabel yang jadi isinya sendiri**, sengaja TIDAK
disatukan jadi satu "periode terbaru" global: `/tukin/presensi` punya data
untuk 8 periode sementara kalkulasi cuma 2, dan satu angka untuk keduanya akan
memindahkan salah satunya ke periode kosong.

| Halaman | Sumber periode |
|---|---|
| `/kasubag/kalkulasi` | predikat kinerja, **di-scope ke unitnya** |
| `/tukin/presensi` | rekap presensi (di-scope unit untuk Kasubag TU) |
| `/tukin/presensi/[nip]` | presensi harian PEGAWAI ITU |
| `/ppabp/adk` | kalkulasi Tukin |

Kalkulasi Unit sengaja memakai **predikat kinerja, bukan kalkulasi**: kalkulasi
adalah HASIL halaman itu, jadi memakainya sebagai penentu default membuat
periode yang belum pernah dihitung tidak akan pernah terbuka - persis periode
yang paling perlu dibuka. Predikat adalah komponen yang paling terakhir
tersedia (presensi ada untuk semua bulan), jadi periode terbaru yang punya
predikat = periode terbaru yang benar-benar bisa dihitung.

13 unit test, termasuk penjagaan bahwa periode pilihan user tidak dipindahkan
dan bahwa database kosong tidak membuat halaman gagal dibuka.

### Paginasi tabel (`src/app/Paginasi.tsx`)

Tabel Rincian Tukin di `/kasubag/kalkulasi` menampilkan seluruh roster unit
(±80 baris, dan jauh lebih banyak buat PPABP/ADMIN lintas satker) dalam satu
halaman. Sekarang dipotong: **default 10 baris**, dengan pilihan 20/50/100 dan
navigasi nomor halaman.

- Posisi & ukuran halaman disimpan di query string (`?hal=`, `?per=`), BUKAN
  state klien - konsisten dengan filter periode dan tombol "Lihat rincian
  lengkap" yang sudah ada, jadi tetap jalan tanpa JavaScript dan link-nya bisa
  dibagikan.
- `hitungPaginasi()` PURE dan menjepit nilai ngawur (huruf, nol, negatif,
  ukuran di luar daftar, halaman melebihi total) tanpa melempar error - query
  string datang dari luar. 8 unit test, termasuk penjagaan bahwa menelusuri
  seluruh halaman berurutan menghasilkan setiap baris **persis sekali**.
- Ganti UKURAN halaman selalu kembali ke halaman 1 (dari 100/halaman ke
  10/halaman bisa mendarat di halaman yang tidak ada isinya). Ganti mode
  ringkas/rinci mempertahankan ukuran tapi mengembalikan nomor halaman.
- Nomor urut kolom "No." memakai posisi di SELURUH unit
  (`paginasi.mulai + i + 1`), bukan di halaman itu - kalau di-reset, baris
  pertama halaman 2 ikut bernomor 1.
- **Yang TIDAK ikut dipotong**: panel kelengkapan (`pegawaiAktif`,
  `belumPunyaPredikat`, `belumPunyaPresensi`) dan kalkulasi massalnya tetap
  memakai roster UTUH. Kalau ikut dipotong, panel "siap dihitung" akan
  menjawab pertanyaan berbeda di tiap halaman dan tombol hitungnya ikut salah.

### Nama role Kasubag TU menyebut unitnya (`labelRole`)

Tiap unit/biro punya Kasubag TU sendiri, jadi label "Kasubag TU" saja tidak
menunjuk siapa pun. `src/auth/roleLabel.ts` sekarang punya
`labelRole(role, satuanKerja)` di samping `LABEL_ROLE` yang lama:

| | Dipakai untuk |
|---|---|
| `LABEL_ROLE[role]` | role sebagai JENIS - pilihan di dropdown, role yang DIUSULKAN |
| `labelRole(role, satuanKerja)` | role MILIK SESEORANG - chip sidebar, menu akun, tabel akun, pesan penolakan |

Terpasang di: chip role sidebar & topbar mobile, menu akun (termasuk daftar
"Ganti role"), `/admin/role-assignment`, `/admin/usulan-role`,
`/ppabp/usulan-role`, panel "Akun login pegawai ini" di `/pegawai`, serta
pesan penolakan approval satuan **dan** massal.

Paling terasa di pesan penolakan: *"Role Kasubag TU tidak berwenang approve
untuk satuan kerja Biro Keuangan"* tidak menjelaskan apa-apa, sementara
*"Role Kasubag TU Pusdatik tidak berwenang..."* langsung menyebut sebabnya.

**Role selain KASUBAG_TU TIDAK diberi unit** walau `User.satuanKerja`
kebetulan terisi - kolom itu memang milik KASUBAG_TU, dan menempelkannya ke
PPABP/OSDMA menyiratkan pembatasan wilayah yang tidak berlaku. Itu pernah jadi
bug sungguhan (lihat "Bug akun multi-role kehilangan jangkauan PPABP").

**Unit kosong disebut eksplisit**: `"Kasubag TU (unit belum diisi)"`, bukan
disembunyikan. Akun seperti itu lolos guard role tapi tidak cocok dengan
satuan kerja manapun, jadi semua halamannya tampil kosong tanpa penjelasan -
sekarang penyebabnya terbaca di layar mana pun labelnya muncul.

**SENGAJA TIDAK ADA penyingkat nama unit.** Mengambil beberapa kata pertama
terlihat rapi tapi menghasilkan label yang salah: "Direktorat Bina Kelembagaan
Pelatihan Vokasi" dan "Direktorat Bina Kelembagaan Keselamatan dan Kesehatan
Kerja" dua-duanya jadi "Direktorat Bina" - dua unit berbeda dengan label
identik, di layar yang gunanya justru membedakan unit. Tabel singkatan manual
juga ikut basi tiap reorganisasi. Yang dipakai: nama penuh + `truncate` CSS +
`title` berisi teks lengkap. 6 unit test menjaga semua aturan di atas.

### Pencarian debounce (`src/app/PencarianDebounce.tsx`)

Semua kotak "Cari nama atau NIP" (8 halaman: `/pegawai`, `/kasubag/pegawai`,
`/admin/role-assignment`, `/osdma/update-sk`, `/ppabp/rekening`,
`/ppabp/gaji-induk`, `/tukin/presensi`, `/tukin/predikat-kinerja`) sekarang
menembak sendiri **400 ms** setelah berhenti mengetik. Grep `name="q"` di
`.tsx` sudah tidak menemukan input polos.

400 ms dipilih supaya jeda antar huruf saat mengetik normal terlewati: tanpa
jeda, mengetik "Kharina" berarti 7 query ke tabel 5.000+ baris dan 6 di
antaranya hasilnya langsung dibuang.

**Tiga hal yang SENGAJA dipertahankan** - ini yang membedakannya dari
sekadar mengganti form jadi state klien:
1. **Statusnya tetap di URL** (`?q=`). Link hasil pencarian tetap bisa
   dibagikan, dan parameter lain di halaman yang sama (satker, periode,
   jenis, nonaktif) disalin ulang - cuma `q` yang diubah.
2. **Tetap jalan tanpa JavaScript.** Komponennya dipasang DI DALAM
   `<form method="get">` yang sudah ada dan tombol submitnya TIDAK dihapus,
   jadi tanpa JS perilakunya persis seperti dulu - yang hilang cuma
   otomatisnya. (Beberapa tombol itu juga masih perlu buat menerapkan filter
   periode di form yang sama.)
3. **`router.replace`, bukan `push`.** Kalau tiap jeda ketik menambah entri
   riwayat, tombol Back jadi memutar ulang ketikan huruf per huruf.

Nomor halaman (`?hal=`) ikut di-reset tiap pencarian berubah - hasil baru
hampir selalu lebih pendek, dan bertahan di "halaman 5" berarti mendarat di
tabel kosong yang terlihat seperti "tidak ada hasil".

### Dropdown searchable (`src/app/SearchableSelect.tsx`)

SEMUA `<select>` di aplikasi diganti komponen ini (grep `<select` sekarang
cuma menemukan komentar + string fallback di file komponennya sendiri) -
diminta user, dan memang perlu: daftar satuan kerja ada 82 baris, daftar
pegawai per unit ~80.

- Nilai sebenarnya disimpan di `<input type="hidden" name={name}>`, jadi
  dari sisi Server Action / `<form method="get">` komponen ini TIDAK ADA
  BEDANYA dengan `<select name={name}>` - **tidak ada satupun action yang
  perlu diubah**. Sudah diverifikasi lewat POST no-JS: field `golongan`,
  `kelasJabatan`, `statusPegawai` terkirim persis seperti select biasa.
- Pencarian realtime, cocok ke label DAN baris `keterangan` (mis. cari
  pegawai pakai NIP walau yang tampil namanya). Navigasi panah + Enter +
  Escape.
- **Fallback tanpa JavaScript**: `<select>` native yang sama ditaruh di
  dalam `<noscript>` (via `dangerouslySetInnerHTML` - kalau ditulis sebagai
  JSX, React ribut soal hydration mismatch karena isi `<noscript>`
  diperlakukan sebagai teks saat JS hidup). Jadi janji "filter jalan tanpa
  JavaScript" yang dipegang project ini tetap utuh, dan tidak ada dua field
  bernama sama yang ikut terkirim.
- Dipakai di: FilterBar (bulan + satuan kerja), SatkerPicker, form SK KGB &
  SK Hukuman Disiplin (pilih pegawai), Anggaran & Realisasi, Usulan
  Perubahan Role (akun + role), Export ADK (bulan), Kelola Assignment Role
  (role + satuan kerja), Buat Akun Baru, form eksekusi usulan role, dan
  form edit Data Pegawai.

**JANGAN `npm run build` selama `npm run dev` masih jalan** (kejadian
2026-08-20). Keduanya menulis ke folder `.next` YANG SAMA, dan hasilnya bukan
error melainkan **404 pada sebagian route** - `.next` jadi berisi campuran
`build/` + `dev/`, dan `.next/dev/routes-manifest.json` kehilangan cabangnya.
Gejalanya menyesatkan karena terlihat seperti route yang rusak:

```
/tukin                    200
/tukin/predikat-kinerja   404   <- folder & file-nya ADA di disk
/tukin/presensi           404   <- file ini bahkan tidak disentuh sama sekali
```

Cara membedakannya dari bug sungguhan, dua-duanya cepat: (1) route yang sama
disajikan **200 oleh production build**, (2) log `.next/dev/logs/
next-development.log` **tidak memuat baris "Compiling ..."** untuk route itu -
dev server tidak mencoba meng-compile karena memang tidak tahu route-nya ada.
Kalau route benar-benar rusak, dia akan mencoba lalu gagal.

Perbaikannya: hentikan dev server, `rm -rf .next`, jalankan `npm run dev`
lagi. Kalau memang perlu memverifikasi production build sementara dev jalan,
hentikan dev-nya dulu - JANGAN dijalankan berbarengan.

**Catatan lingkungan dev (BUKAN bug aplikasi)**: waktu verifikasi, dev
server Next 16 + Turbopack beberapa kali HANG total setelah POST Server
Action ke `/pegawai` (request menggantung, GET berikutnya ikut timeout,
sementara PostgreSQL sendiri idle - dicek lewat `pg_stat_activity`).
Request yang SAMA PERSIS jalan normal di production build (`next build` +
`next start`, 44 ms) - dan itu yang dipakai di VPS. Kalau ketemu lagi waktu
`npm run dev`, restart dev server-nya, jangan buang waktu mencari bug di
kode action.

## Yang BELUM ada / open items (jangan asumsikan sudah beres)

1. ~~Pedoman konversi predikat kinerja ke nilai angka~~ **RESOLVED** - Lampiran
   Kepsekjen 82 Tahun 2025 sudah didapat dan diverifikasi (lihat
   `src/business-logic/konversiPredikat.ts`): predikat Sangat Baik/Baik =
   100%, Perlu Perbaikan = 85%, Kurang/Sangat Kurang = 60%. Diverifikasi
   cocok persis dengan nilai rupiah di tabel resmi untuk semua 17 kelas
   jabatan (lihat test-nya). TODO(confirm) yang TERSISA: apakah label
   "Perlu Perbaikan" di Kepsesjen ini sama dengan predikat "Cukup"/"Butuh
   Perbaikan" di SKP standar PermenPANRB 6/2022 - belum ada penegasan
   eksplisit di dokumen.
2. **Pasal 15 (potongan hukuman disiplin)** - belum diimplementasi sama
   sekali di `tukin.ts`. Butuh feed data status disiplin pegawai dari OSDMA.
3. **Cuti besar/sakit yang mulai/berakhir di tengah periode** - `tukin.ts`
   saat ini cuma terima `bulanKeberapa` (integer), belum bisa proporsional
   harian. Perlu konfirmasi praktik ke Biro OSDMA/Hukum. **NAIK PRIORITAS
   sejak jenis cuti ditarik otomatis dari e-Presensi**: dulu ini teoretis
   karena `cutiAktif` cuma diisi manusia, sekarang nyata - Juli 2026 ada 3
   pegawai dengan cuti berpotongan 100% sebanyak SATU HARI, dan aturan
   per-periode menghapus tukin mereka sebulan penuh. Sementara ditandai
   `PERIKSA MANUAL` (lihat "Jenis cuti & potongan Pasal 14 ditarik otomatis
   dari e-Presensi"), TAPI penanda bukan pengganti aturan.
4. ~~**Cuti sakit karena gugur kandungan di atas 1 bulan** - Pasal 14 huruf e
   butuh perhitungan per hari (1%/hari), belum diimplementasi.~~ **RESOLVED**
   - sudah diimplementasi di `hitungPersenDibayarCuti` (butuh input
   `cutiAktif.jumlahHariCuti`). Tanpa jumlah hari, TIDAK menebak: dibayar
   penuh + ditandai anomali. TODO(confirm) yang tersisa: pasal tidak
   mendefinisikan "1 bulan" dalam hari - dipakai 30 hari (batas 1,5 bulan =
   45 hari).
5. **Akses API e-Kinerja BKN dan SAKTI** - masih informal (belum ada
   PKS/MoU). `MockEKinerjaAdapter` mensimulasikan alur upload manual file
   rekap dari portal BKN sesuai workaround yang sudah disepakati.
6. ~~**Format file rekap predikat dari e-Kinerja BKN** - belum ada contoh
   filenya, jadi `importFromUploadedFile` di MockEKinerjaAdapter masih
   melempar error, belum ada parser.~~ **RESOLVED** - user memberi file
   asli "Rekap Penilaian (45).xlsx". Parser ada di
   `src/business-logic/rekapPredikatKinerja.ts` dan `importFromUploadedFile`
   SUDAH jalan (tidak melempar error lagi). Lihat bagian "Upload rekap
   predikat kinerja e-Kinerja BKN" di bawah. Yang MASIH terbuka: akses API
   BKN-nya sendiri (item 5) - ini baru menutup soal FORMAT FILE-nya.
7. **Reconciliation window & kebijakan DRAFT→COCOK/SELISIH/SANGGAH** -
   field-nya sudah disiapkan di schema (`ReconciliationStatus`), tapi durasi
   window verifikasi dan aturan "hold pembayaran vs koreksi siklus
   berikutnya" masih jadi keputusan kebijakan terbuka - jangan hardcode
   sampai ada keputusan resmi.
8. ~~**Tarif uang makan & uang lembur**~~ **RESOLVED sebagian** - user
   memberi PDF SBM 2026, tarif resminya sekarang ada di
   `src/business-logic/tarifSbm.ts` (halaman -13-, item 22.1/23.1/23.2).
   Yang MASIH terbuka: **batas maksimal jam lembur per bulan TIDAK diatur
   di SBM** - angka 40 jam di `uangLembur.ts` tetap asumsi yang belum
   dikonfirmasi ke Biro Keuangan/DJA. Juga belum ditangani: tarif kelompok
   Non-ASN/Satpam/Pengemudi (SBM item 24) - skema `Pegawai` belum
   membedakan kelompok itu.

## Daftar tanya ke OSDMA: `docs/permintaan-data-dan-konfirmasi-osdma.md`

Semua `TODO(confirm)` yang tersebar di kode dikumpulkan di satu dokumen yang
siap dikirim: (A) data pegawai yang belum dipunyai sistem, (B) keputusan
kebijakan yang tidak boleh diputuskan tim teknis, (C) dokumen yang diminta.
Diurutkan dari yang paling besar dampaknya ke uang. Ada juga lampiran "sudah
terjawab" supaya tidak ditanyakan dua kali.

**Perbarui dokumen itu tiap ada TODO(confirm) baru atau yang terjawab** -
kalau tidak, daftarnya jadi basi dan orang kembali menelusuri komentar kode
satu per satu.

## Rencana akses & pengamanan: dua dokumen (2026-08-21)

- **`docs/rencana-akses-dan-pengamanan-gajihub.md`** - untuk tim teknis.
  Fase, prasyarat, arsitektur tujuan, dan opsi demo di luar kantor.
- **`docs/laporan-kesiapan-akses-untuk-pimpinan.md`** - untuk atasan. Enam
  permintaan ke pihak luar beserta ke siapa dan apa yang ditahannya.

**Pemisahan paling penting di kedua dokumen - ARAH KELUAR vs ARAH MASUK.**
Menarik API dari sistem luar (e-Kinerja BKN, Web Gaji, SAKTI) adalah arah
KELUAR dan **tidak butuh aplikasi ini bisa dijangkau dari internet** - server
di balik NAT tetap bisa memanggil API luar. Yang butuh keterbukaan cuma arah
MASUK (pegawai membuka halamannya). Keduanya sering tertukar, dan tertukarnya
menghasilkan keputusan "berarti harus dibuka ke publik dulu" yang keliru.

**Garis yang tidak boleh dilompati: SSO.** Selama password = NIP, membuka
alamatnya ke luar sama dengan menerbitkan gaji + 9.944 nomor rekening tanpa
kunci - NIP tercetak di SK & daftar hadir, jadi itu bukan password lemah,
itu tidak ada password. Demo di luar kantor TIDAK perlu menunggu SSO: jalankan
dari laptop penyaji (nol paparan, sekaligus kebal wifi tempat acara).

**Angka yang menopang argumennya** (diukur 2026-08-21, bukan perkiraan):
**2.562 dari 5.077 pegawai aktif (50,5%) ada di 29 UPT/Balai/BPVP** seluruh
Indonesia - itu sebabnya "lokal" cuma fase, bukan tujuan akhir.

**Temuan sampingan yang layak ditindak lebih cepat dari sisanya**:
`getSecretKey()` di `src/auth/session.ts` diam-diam memakai fallback
`"dev-only-insecure-secret-..."` kalau `SESSION_SECRET` tidak diisi - tanpa
error, tanpa peringatan. Kalau itu yang terpakai di server yang bisa
dijangkau publik, cookie sesi bisa dipalsukan siapa saja karena kuncinya ada
di repo yang PUBLIK. Perlu dicek tiap deploy.

## Perbedaan e-Presensi vs Gajihub: `docs/perbedaan-hitungan-epresensi-vs-gajihub.md`

Tabel ringkas **enam titik penyimpangan** rumus e-Presensi dari Pasal 13,
beserta angka terukurnya, plus daftar hal yang justru SAMA di kedua sistem
(toleransi 60 menit, jam kerja, fakta presensi) supaya tidak dikira beda.
Dokumen ini yang dilampirkan kalau ada yang bertanya kenapa angka di web
e-Presensi tidak sama dengan slip - isinya sama dengan yang ditampilkan
halaman `/tukin/presensi/[nip]?banding=1`, cuma dalam bentuk yang bisa
dikirim.

Memuat juga tiga usulan yang sudah **diuji dan DITOLAK** (ambang 100 menit,
batas 1%, ambang jam masuk) - baca dulu sebelum mengusulkannya lagi.

## Teks peraturan: `docs/permenaker-15-2024-tunjangan-kinerja.md`

Salinan teks Permenaker 15/2024 disimpan di repo. **Kalau kode dan file itu
berbeda, yang benar FILE ITU** - perbaiki kodenya, jangan menyesuaikan
kutipannya supaya cocok.

**LENGKAP Pasal 1-26** (diisi 2026-08-07). Filenya juga memuat peta
pasal→kode dan daftar aturan yang dipakai Gajihub TAPI berasal dari luar
Permenaker ini (SBM 2026, Kepsekjen 82/2025), supaya tidak ada yang
mencarinya di pasal yang salah.

**Tiga hal yang baru ketahuan setelah teks lengkap terbaca** - baca ini
sebelum menyentuh kalkulasi:

1. **Pasal 4 huruf d** memberi dasar langsung untuk CLTN (sebelumnya cuma
   PP 11/2017), DAN menyebut **MPP (bebas tugas persiapan pensiun)** yang
   akibatnya sama tapi **belum ditangani sama sekali**.
2. **Pasal 16 ayat (2) & (3)** - pejabat struktural/fungsional tugas belajar
   seharusnya **pindah ke kelas jabatan 7/6/5**, bukan dikali 80% seperti
   yang Gajihub lakukan sekarang. Ayat (1) (**CPNS 80%**) juga belum ada,
   TAPI **JANGAN mengimplementasikannya dari `STATUSPEGAWAIID='1'` SIAP** -
   flag itu BASI: 660 dari 670 "CPNS" diangkat Mei 2025 (per Juli 2026 sudah
   14 bulan), dan rincian tukin manual Biro Keuangan menulis "PNS" untuk
   ke-13 orang yang muncul di sana serta membayar mereka 100%. Memakai flag
   itu akan memotong 20% dari ~661 pegawai yang sebenarnya sudah PNS.
   Menebak dari NIP juga tidak boleh (pengangkatan tidak otomatis genap
   setahun). Butuh sumber status CPNS/PNS yang terkini dari Biro OSDMA -
   lihat catatan lengkap di `docs/permenaker-15-2024-tunjangan-kinerja.md`.
3. **Pasal 17** - tambahan tukin **Plt/Plh** (20% atau selisih), belum ada.
   Perhatikan ayat (3): pembayarannya tertunda satu bulan.

Selain itu Pasal 14 akhirnya mengunci pembacaan "dibayarkan setelah
**dikurangi** persentase" = POTONGAN, membenarkan perbaikan bug cuti besar
terbalik yang sudah dilakukan.

### Panel Notifikasi & Aktivitas (kanan, bisa dibuka-tutup)

Tombol lonceng mengambang di **kanan atas**, panel geser dari kanan. **Tidak
permanen** - hampir semua halaman di sini bertabel lebar (rincian tukin 12
kolom, grid ADK 33 kolom), jadi panel tetap selebar 320px memakan ruang yang
justru paling dibutuhkan.

- **Isinya diambil saat DIBUKA** lewat `GET /api/kabar`, bukan ikut tiap render
  halaman - kalau ikut, setiap halaman menanggung 4 query untuk panel yang
  mungkin tidak pernah dibuka.
- **Notifikasi** = yang perlu ditangani (kalkulasi DRAFT, banding menunggu,
  rekonsiliasi SELISIH), diturunkan dari data yang sudah ada - tidak ada tabel
  notifikasi baru. **Aktivitas** = `AuditTrail` + `ApprovalLog` digabung lalu
  diurutkan ulang (approval hidup di tabel tersendiri; kalau tidak digabung,
  keputusan approval - salah satu aktivitas terpenting - tidak pernah muncul).
- Tombolnya **tidak dirender untuk PEGAWAI** (server juga menolak, 403) - pola
  sama dengan tombol approval yang disembunyikan dari PIMPINAN: tombol yang
  selalu kosong itu dead-end.

**Penyaring unit - MENYEMPITKAN, tidak pernah melebarkan.** Pemakai lintas
satker (PPABP, OSDMA, Pimpinan, Admin) dapat dropdown satuan kerja di kepala
panel; `?satker=` diteruskan ke `ambilIsiPanelKabar` yang **mengabaikannya**
kalau cakupan akun itu sudah dipaksa. Bedanya dijaga dua field terpisah:
`satkerScope` (dipaksa kewenangan) vs `satkerPilih` (pilihan tampilan).

PPABP TIDAK dikunci ke Biro Keuangan dan BMN walau unit asalnya memang di
situ - mereka memproses pembayaran seluruh unit, jadi mengunci panelnya
berarti menyembunyikan approval unit lain yang justru jadi pekerjaan mereka.
Yang diberi cuma alat menelusuri per unit. Lihat "PPABP per satker - TERJAWAB"
di atas.

Diverifikasi terhadap data nyata: PPABP tanpa saring dapat **84 unit** di
dropdown dengan aktivitas bercampur; disaring ke Biro Keuangan -> **0 baris di
luar unit itu**; KASUBAG_TU Pusdatik yang mengirim `?satker=` unit lain ->
`satkerPilih` tetap **null**, cakupan tetap unitnya, **0 baris bocor**.

#### Kolom `AuditTrail.satuanKerja` - kenapa harus ditambah

Scoping per unit MUSTAHIL dilakukan saat membaca. Formatnya `entitasId` beda
per jenis entitas, dan sudah dibuktikan ke data:

```
tukin_calculation        "kalkulasi-massal-Biro Keuangan dan Baran..."
koreksi_presensi_harian  "198111302025211042-2026-07-15"
app_user                 "<uuid>"
```

Menebak satker dari string itu berarti berisiko menampilkan aktivitas unit lain
ke orang yang tidak berhak. Jadi kolomnya ditambah (migrasi
`20260813120000_audit_trail_satuan_kerja`, satu ADD COLUMN nullable + index) dan
**diisi saat MENULIS**, ketika kodenya memang tahu unitnya.

- **NULL = lintas satker** (penanda kendala se-kementerian, kalender hari libur,
  perubahan role akun). Baris NULL **TIDAK ikut terlihat oleh KASUBAG_TU** -
  itu keputusan tingkat kementerian, bukan urusan unit. Default aman: write
  site yang belum diisi bernilai NULL, jadi tidak bocor ke unit manapun.
- Sudah diisi di: kalkulasi massal, predikat kinerja (tambah & ubah), koreksi
  jam presensi. Sisanya menyusul kalau memang perlu muncul di panel unit.
- **Yang menentukan cakupan adalah satuan kerja yang DIKENAI aksi, bukan satuan
  kerja aktornya** - PPABP (tim pusat) yang mengoreksi data Biro Umum itu
  aktivitas Biro Umum.

**Diverifikasi** lewat production build dengan 3 baris audit tanam (unit
Kasubag TU / unit lain / NULL): Kasubag TU melihat **hanya** baris unitnya
(unit lain `false`, NULL `false`, dan seluruh aktivitasnya ber-unit sendiri);
PPABP melihat ketiganya; PEGAWAI dapat **403** dan tombolnya tidak dirender;
tanpa login **307 ke /login** - tidak pernah sampai ke handler. Semua baris uji
sudah dihapus.

### Perataan isi tabel: tengah-menengah, kecuali kolom nama

Permintaan user: **seluruh tabel di project ini** rata tengah mendatar dan
menengah tegak, **kecuali kolom nama** yang rata kiri (tetap menengah).

Diterapkan lewat **SATU aturan di `globals.css`**, bukan ditempel per sel -
ada 31 tabel / 201 `<th>` / 214 `<td>` di 22 berkas, dan aturan yang harus
ditempel manual pasti terlewat di tabel yang dibuat nanti.

```css
@layer base      { table:not([data-tabel="dokumen"]) :is(th, td) { text-align: center; vertical-align: middle } }
@layer components{ .col-nama { @apply text-left align-middle } }
```

**KENAPA HARUS DI DALAM `@layer`, dan kenapa urutannya penting.** Di Tailwind
v4 urutan layernya `properties, theme, base, components, utilities`, dan CSS
**tanpa layer selalu menang atas semuanya**. Kalau aturan tabel ditulis di luar
layer, `.col-nama` tidak akan pernah berlaku dan satu-satunya jalan keluar
tinggal `!important` di ratusan sel. Perhatikan juga bahwa `.col-nama` (0,1,0)
sebenarnya KALAH spesifisitas dari `table:not([data-tabel="dokumen"])
:is(th,td)` (0,1,2) - yang membuatnya menang **hanya** urutan layer. Jangan
pindahkan salah satunya ke layer lain. Diverifikasi di CSS hasil `next build`:
base mulai byte 3955, `.col-nama` di 7745 (di dalam components yang mulai
7727), `.text-left` di 26827 (utilities).

**Yang DIKECUALIKAN cuma slip gaji** (`data-tabel="dokumen"`, 3 tabel di
`/saya/slip-gaji/[bulan]/[tahun]`). Berkas itu memakai `<table>` sebagai tata
letak DOKUMEN - blok identitas "Nama : nilai", daftar penghasilan bernomor,
kolom rupiah rata kanan, `align-top` di mana-mana - bukan grid data. Slip itu
ditandatangani PPABP; meratakan tengah di situ merusak bentuk cetaknya.

**Utility perataan DICABUT dari sel tabel data**, karena layer utilities
menang dan sel yang masih memakainya akan sendirian tidak ikut aturan:
- `text-right` di kolom angka (`RincianPotonganKehadiran`, `RincianUangMakan`,
  `/saya`, `RekonsiliasiForm`) - 25 sel.
- `align-top` di sel form (`/tukin/presensi/[nip]`).
- `text-left` di konstanta `th` dua halaman - yang **paling penting**, karena
  itu satu baris yang mematikan aturan untuk SELURUH tabelnya:
  `kasubag/kalkulasi` (tabel rinci 40 kolom, juga `align-bottom`) dan
  `tukin/presensi/kendala`.
- `text-left` di `<tr>` thead (24 tempat) - sebenarnya sudah inert begitu
  `th` punya `text-align` sendiri, tapi kelas mati yang bertentangan dengan
  perilaku nyata bikin orang berikutnya mencari bug yang tidak ada.

**Kolom yang ditandai `col-nama`** (selalu BERPASANGAN `<th>` + `<td>`-nya -
itu yang paling gampang terlewat): Nama/Nama Pegawai di 3 tabel
`kasubag/kalkulasi`, Nama di `kasubag/pegawai`, Satuan Kerja di
`ppabp/anggaran`, Nama di SIAP & Nama di Web Gaji di `ppabp/basis-data-gaji`
(halaman + form unggahnya), Pegawai di `ppabp/gaji-induk`, Pegawai & Nama
Rekening di `ppabp/rekening`, Pegawai di `tukin/predikat-kinerja`, Pegawai di
`UploadPresensiPdfForm`, Pegawai di `tukin/presensi`, Sistem Eksternal di
`admin/sistem`, dan kolom Nama sticky di `GridAdkHarian`.

**Diverifikasi lewat production build** terhadap 16 halaman yang benar-benar
dirender: **nol** sel dengan `text-left`/`text-right`/`align-top` tersisa di
seluruh tabel data, sementara slip gaji tetap memegang 34 `align-top` + 4
`text-right` dan kedua tabelnya bertanda `data-tabel="dokumen"`. Jumlah
`col-nama` cocok dengan jumlah baris yang tampil (mis. `/tukin/presensi` 201 =
1 judul + 200 baris, `/ppabp/rekening` 402 = 2 judul + 200 baris x 2 kolom).

**Kalau nanti menambah tabel**: tidak perlu melakukan apa pun untuk perataan
tengahnya - sudah otomatis. Yang perlu diingat cuma dua: tandai kolom namanya
`col-nama` (th DAN td), dan JANGAN memakai `text-left`/`text-right`/`align-*`
di sel tabel data kecuali memang sengaja mengecualikannya.

### SSO Kemnaker (Naco) - OAuth 2.0 Authorization Code (2026-08-21)

Dokumentasi resmi: `https://codes.kemnaker.go.id/naker-api/naco-api`
(`README.md` + `AUTH_CODE_GRANT.md`). Endpoint:

| | |
|---|---|
| Otorisasi | `GET https://account.kemnaker.go.id/auth?response_type=code&client_id=..&redirect_uri=..&scope=basic email` |
| Token | `POST https://account.kemnaker.go.id/api/v1/tokens` (JSON, memuat client_secret) |
| Identitas | `GET https://account.kemnaker.go.id/api/v1/users/me` (`Authorization: Bearer`) |

**Yang berubah cuma CARA MEMBUKTIKAN IDENTITAS.** Setelah identitas terbukti,
login SSO dan login NIP bermuara ke fungsi yang sama (`buatTokenUntukUser` di
`src/auth/sesiCookie.ts`), dan seluruh lapisan di atasnya - peran, otorisasi
(`permissions.ts`), scope satuan kerja, multi-role - **tidak berubah sama
sekali**. Ini yang membuat perpindahannya kecil.

- **`src/auth/sesiCookie.ts` (BARU)** - `OPSI_COOKIE_SESI` +
  `buatTokenUntukUser()`, diekstrak dari `login/actions.ts` begitu Route
  Handler SSO ikut menerbitkan sesi. Dua salinan opsi cookie pasti berbeda
  cepat atau lambat, dan gejalanya "login berhasil tapi langsung logout lagi"
  yang sangat sulit ditelusuri.
- **`src/auth/sso.ts` (BARU, 16 unit test)** - klien Naco. Murni; tidak
  menyentuh database.
- **`/login/sso`** (Route Handler) memberangkatkan ke Naco;
  **`/login/sso/callback`** menukar kode, mengambil identitas, memetakan NIP,
  menerbitkan sesi. Keduanya GET biasa, jadi tombolnya tautan polos yang tetap
  jalan tanpa JavaScript.
- `src/middleware.ts` mengizinkan `/login/sso*` tanpa sesi - memang di situ
  sesinya dibuat.

**`state` DITAMBAHKAN walau tidak disebut dokumentasi Naco.** Tanpa itu,
alamat callback bisa dipanggil siapa saja dengan kode milik orang lain (CSRF
login) dan korbannya berakhir masuk sebagai akun penyerang. Nilainya disimpan
di cookie httpOnly `gajihub_sso_state` lalu dicocokkan ulang. Ada test yang
menguncinya supaya tidak dihapus "karena tidak ada di dokumentasi".

**MASALAH UTAMA YANG BELUM TERTUTUP - balasan `/users/me` TIDAK
TERDOKUMENTASI.** Dokumentasi Naco memberi contoh balasan untuk langkah token
TAPI TIDAK untuk langkah identitas, padahal di situlah satu-satunya hal yang
dibutuhkan Gajihub: **NIP**. Seluruh data di sistem ini berkunci NIP,
sementara scope yang disebut cuma `basic email` - dan email BUKAN NIP.

Penanganannya: `cariNipDariInfo()` **MENCARI, bukan menebak** - menelusuri
seluruh balasan untuk nilai berbentuk NIP (**18 digit**, jadi NIK 16 digit &
nomor telepon tidak tertukar). Kalau tidak ketemu, login **DIHENTIKAN** dan
halaman login menampilkan **nama-nama field yang benar-benar dikirim Naco** -
jadi satu kali percobaan login sudah cukup memastikan bentuknya. Nilainya
sengaja TIDAK ikut ditampilkan (balasan identitas bisa memuat email/NIK/
telepon); yang perlu cuma nama field-nya. Begitu diketahui, isi
`NACO_FIELD_NIP` di `.env` (mis. `data.nip`) supaya pembacaannya eksplisit.

**Dua hal yang SENGAJA TIDAK dilakukan callback**: (1) **tidak membuat akun
baru** - NIP tanpa baris `User` ditolak, karena membuat akun otomatis berarti
siapa pun yang punya Akun Kemnaker langsung masuk ke sistem penggajian;
(2) **tidak menyimpan access/refresh token** - Gajihub tidak memanggil API
Naco lain setelahnya, jadi menyimpannya cuma menambah rahasia yang harus
dijaga tanpa ada yang memakainya.

**Login NIP TETAP ADA berdampingan** selama masa transisi (belum tentu semua
5.077 pegawai punya Akun Kemnaker aktif). TODO(confirm): begitu SSO terbukti
mencakup semua pengguna, **jalur NIP WAJIB DIMATIKAN** - selama masih ada,
seluruh alasan mengganti password = NIP belum tercapai.

**JEBAKAN saat menguji - `redirect_uri` menentukan DI MESIN MANA callback
mendarat.** Naco mengalihkan BROWSER ke alamat yang didaftarkan. Kalau
`NACO_REDIRECT_URI` menunjuk `gajihub.rokeubmn.id` (VPS) tapi pengujian
dimulai dari `localhost:3000`, callback-nya mendarat di VPS - sementara cookie
`state` tersimpan di localhost, jadi hasilnya selalu "state tidak cocok".
**Uji end-to-end di host yang sama dengan `redirect_uri`**, atau minta
pengelola Naco mendaftarkan redirect_uri kedua untuk localhost.

**Konfigurasi `.env`** (`NACO_BASE_URL`, `NACO_CLIENT_ID`,
`NACO_CLIENT_SECRET`, `NACO_REDIRECT_URI`, `NACO_SCOPE`, `NACO_FIELD_NIP`).
SSO **otomatis nonaktif** - tombolnya tidak dirender - selama client id/
secret/redirect uri belum lengkap, jadi aman ditinggal kosong di lingkungan
yang belum siap.

**Diverifikasi**: production build memuat `/login/sso` & `/login/sso/callback`;
`/login/sso` mengalihkan ke `account.kemnaker.go.id/auth` dengan seluruh
parameter + `state`; callback dengan state palsu ditolak dengan pesan yang
menyebut sebabnya. Jangkauan jaringan diuji **lewat Node (bukan curl)**:
`/auth` dan `/api/v1/users/me` membalas **401 Unauthenticated** - wajar tanpa
token, dan membuktikan jalur server-ke-server tembus. Catatan: `curl` di
Windows gagal ke host ini dengan `SEC_E_UNSUPPORTED_FUNCTION` (schannel),
**bukan** tanda jaringannya terblokir - Node memakai OpenSSL dan lolos.

### Halaman login: dua panel (2026-08-20)

Bentuknya mengikuti mockup user: panel kiri navy polos, panel kanan berisi
logo besar, judul, deskripsi satu baris, lalu formulir.

**Ini satu-satunya halaman yang bisa dibuka tanpa sesi** (middleware
mengalihkan yang lain), jadi sekaligus wajah pertama sistem ini. Itu yang
menentukan isi teksnya - dan kenapa sapaan gaya aplikasi konsumen
("Hello Again!" di mockup asal) TIDAK dipakai: ruang paling menonjol di
halaman itu sebaiknya menjawab *"ini sistem apa, punya siapa"*. Alamatnya
sekarang masih `gajihub.rokeubmn.id` (domain pribadi, bukan subdomain resmi
Kemnaker), jadi orang yang menerima tautannya punya alasan wajar untuk ragu -
baris `Kementerian Ketenagakerjaan Republik Indonesia` di kaki halaman yang
menjawabnya.

**Deskripsinya menyebut yang BENAR-BENAR dihitung**: *"Perhitungan Tunjangan
Kinerja, Uang Makan, dan Uang Lembur - dari Presensi sampai ADK"*. Kata
"gaji" atau "pembayaran" sengaja dihindari - gaji pokok & tunjangan keluarga
datang dari Web Gaji lewat upload, pembayarannya di SAKTI, jadi menyebutnya
overclaim dan akan ditagih di forum yang salah.

**`src/app/GajihubLogo.tsx` (BARU)** - mark-nya diekstrak dari `AppShell.tsx`
begitu pemakainya jadi dua. Lambang merek yang disalin ke dua berkas pasti
berbeda cepat atau lambat, dan bedanya baru kelihatan waktu keduanya terbuka
berdampingan. Dua rupa, dan bedanya BUKAN selera - keduanya soal latar:
`sidebar` tile BIRU (tile navy di atas sidebar navy tidak terlihat),
`login` tile NAVY (biru di atas latar terang terbaca lebih lemah). Lingkaran
kecil di dalamnya ikut bertukar warna karena alasan yang sama.

**Cabang "belum login" di `AppShell.tsx` sekarang `return <>{children}</>`** -
bar wordmark tipis yang dulu ada di situ DIHAPUS. Bar itu memotong panel navy
di bagian atas, dan wordmark-nya juga mengulang logo yang sekarang berdiri
besar di tengah halaman.

**Placeholder BERPERAN SEBAGAI LABEL** (tidak ada label kasat mata), dan itu
punya dua akibat yang ditangani, bukan diabaikan:
- Warnanya **tidak boleh `text-muted`** (#5F7085): di atas latar kabut
  (#DBE2EF) rasionya cuma **3,90:1**, di bawah AA. Dipakai `text-ink-2`
  (#3A5A7D) = **5,49:1**. Ini persis alasan yang sama dengan penolakan abu
  terang di acuan desain sidebar.
- Label tetap ADA di DOM (`sr-only`) - placeholder tidak dibacakan sebagai
  nama field, dan begitu orang mengetik, placeholder-nya hilang.

`inputMode="numeric"` **bukan `type="number"`**: yang kedua membuang nol di
depan, dan sebagian NIP diawali nol.

**Panel kiri disembunyikan di bawah `lg`** dan masih kosong - rencananya
slideshow. Kalau nanti diisi: (1) jangan taruh keterangan yang HANYA ada di
situ, karena di HP panel itu tidak dirender sama sekali; (2) kalau animasinya
butuh JavaScript, formulir di kanan harus tetap bisa dipakai tanpa itu.

**Nama merek ditulis `Gajihub`**, bukan `GajiHub` seperti di mockup - seluruh
aplikasi (metadata `layout.tsx`, wordmark sidebar, CLAUDE.md) memakai bentuk
itu, dan merek yang tidak seragam di halaman depan lebih buruk daripada
menyimpang dari satu detail mockup.

Diverifikasi lewat production build: seluruh kelas yang dipakai benar-benar
ada di CSS hasil build (`.size-\[84px\]`, `.rounded-\[22px\]`,
`.lg\:grid-cols-2`, `.placeholder\:text-ink-2::placeholder`,
`.fill-biru`/`.fill-navy`/`.stroke-white`), urutan teksnya benar, nol
`data-sidebar` di halaman itu, dan kontras seluruh pasangan warnanya lulus AA
(judul navy 9,86:1, deskripsi biru 4,64:1, teks di field 8,08:1, putih di
tombol navy 10,52:1).

**CATATAN cara memeriksa CSS**: JANGAN mengadu kelas ke CSS dev server -
chunk-nya sebagian, dan kelas yang sudah lama dipakai pun bisa terlihat
"hilang" di situ (`size-[30px]` milik sidebar ikut tidak ketemu). Yang sahih
CSS hasil `next build`. Dan waktu meng-grep, ingat selektornya di-escape:
yang tertulis di berkas `.size-\[84px\]`, bukan `.size-[84px]`.

### Palet & sidebar baru (2026-08-13)

Palet ditetapkan user, dan **#13416B dipilih karena sama dengan logo Kemnaker**
- jadi itu yang jadi warna UTAMA, bukan sekadar warna teks:

| | Peran |
|---|---|
| **#13416B** navy | warna utama: teks, judul, **item menu aktif**, tombol utama, tile logo |
| **#3F72AF** biru | aksen KEDUA: avatar, ikon penanda, tautan - tidak boleh bersaing dengan navy |
| **#DBE2EF** kabut | garis, permukaan sekunder, chip netral |
| **#F9F7F7** putih | latar halaman |

~~**Sidebar dari navy gelap jadi TERANG**, mengikuti acuan desain yang dikirim
user.~~ **DIKEMBALIKAN JADI GELAP (2026-08-13, permintaan user)**: latar navy
`#13416B`, teks putih. Bentuknya tetap seperti acuan (tile logo beraksen, item
aktif berupa pil, item lain tanpa latar) - yang dibalik cuma terang/gelapnya.

Semua warnanya lewat **token `--color-nav-*`** di `globals.css`, tidak ada satu
pun warna sidebar yang di-hardcode di komponen - jadi kalau mau dibalik lagi,
cukup satu blok itu:

| Token | Nilai | Peran |
|---|---|---|
| `--color-nav-bg` | `#13416B` | latar sidebar |
| `--color-nav-text` | `#C9D6E8` | label item non-aktif |
| `--color-nav-hover` | `#1D5285` | latar hover + tombol akun |
| `--color-nav-line` | `#2A5F93` | garis pemisah & tepi |
| `--color-nav-active` | `#FFFFFF` | pil item aktif |
| `--color-nav-active-text` | `#13416B` | teks di dalam pil |

- **Item aktif DIBALIK jadi pil PUTIH** dengan teks navy. Di atas latar navy,
  pil navy jelas tidak terlihat, dan navy-di-atas-navy-muda cuma ~2:1.
- **Tile logo jadi biru `#3F72AF`**, bukan navy - tile navy di atas sidebar
  navy hilang sama sekali. Aksen kedua palet memang untuk keperluan ini.
- **Popover menu akun TETAP terang** (panel melayang di atas sidebar), jadi
  hover-nya diganti `bg-line-2` - `nav-hover` sekarang navy dan akan membuat
  teksnya hilang. Yang ikut gelap cuma TOMBOL pemicunya di kaki sidebar.
- Kontras diuji ulang, semua **lulus AA**: putih di navy **10,52:1**, label
  `#C9D6E8` di navy **7,15:1**, navy di pil putih **10,52:1**, label di hover
  **5,49:1**, putih di tile biru **4,96:1**.
- Diverifikasi di production build: `<aside>` ber-`bg-nav-bg text-nav-text
  border-nav-line`, 19 label ber-`text-nav-text`, satu pil aktif, dan **nol**
  sisa kelas terang (`text-navy`/`text-ink-2`/`bg-surface-2`/`border-line`) di
  dalam sidebar.

**Scrollbar diset SEKALI di `html`**, bukan ditempel per elemen:
`scrollbar-color` & `scrollbar-width` adalah properti **turunan**, jadi semua
kontainer ber-`overflow` ikut - tabel lebar (rincian tukin, grid ADK 33 kolom),
panel Kabar, sidebar.

```css
html          { scrollbar-width: auto; scrollbar-color: rgb(115 115 115 / .55) rgb(255 255 255 / 0); }
[data-sidebar]{ scrollbar-color: rgb(201 214 232 / .45) rgb(255 255 255 / 0); }
```

- **Track transparan, bukan putih** - banyak kontainer di sini berlatar
  bukan-putih (surface-2, sidebar navy), dan track putih jadi jalur terang
  yang tidak diminta siapa pun.
- **Sidebar dapat thumb sendiri**: abu 115 di alpha 0,55 berbaur jadi
  ~`rgb(72 92 111)` di atas `#13416B` - cuma **1,5:1** terhadap latarnya,
  praktis tidak terlihat. Dipakai nada `nav-text` supaya tetap satu palet.
- Dikunci ke `[data-sidebar]`, **BUKAN ke `aside` polos** - panel Kabar juga
  `<aside>` tapi berlatar putih, dan thumb terang di sana justru hilang.
  Diverifikasi: halaman punya 2 `<aside>`, hanya yang navy ber-`data-sidebar`.
- **SENGAJA TIDAK memakai `::-webkit-scrollbar` sebagai cadangan**: kalau
  selektor itu ada, Chrome memakai jalur lamanya dan mengabaikan yang standar,
  jadi harus dirawat dua kali. Konsekuensinya **Safari kembali ke scrollbar
  bawaan sistem** (belum mendukung properti standar ini) - diterima apa adanya.

Catatan penting kalau nanti menyentuh warna:

- **Token `teal` DIPERTAHANKAN NAMANYA** walau nilainya sekarang navy. Ada ~200
  pemakaian `text-teal-deep` / `bg-teal` di seluruh aplikasi; mengganti namanya
  berarti menyentuh semuanya tanpa mengubah apa pun yang terlihat. Ganti
  belakangan kalau memang mau dirapikan.
- **Warna status (hijau/merah/amber) SENGAJA TIDAK diganti ke palet ini.**
  Keempat warna palet semuanya biru-netral - kalau "disetujui" dan "ditolak"
  dijadikan biru, bedanya hilang, padahal justru itu yang menentukan orang
  berhenti atau lanjut. Yang dilakukan cuma menyetel nadanya.
- **Abu label menu #5F7085, BUKAN abu terang seperti acuan.** Acuan memakai abu
  ~3,0:1 di putih - di bawah 4,5:1 WCAG AA untuk teks 13,5px. Halaman ini
  dipakai memeriksa angka gaji di layar kantor apa adanya; label samar bukan
  pilihan gaya di sini. `gold-deep` juga digelapkan (#9A6715 -> #8F5F13) karena
  di atas tint-nya sendiri cuma 4,33:1.

Seluruh pasangan warna yang benar-benar dipakai sudah diuji rasio kontrasnya
dan **lulus AA**: menu aktif 10,52:1, teks utama 9,86:1, label menu 5,07:1,
amber di tint-nya 4,91:1, hijau 5,03:1, merah 4,96:1.

#### Urutan menu PPABP mengikuti alur kerja

Dulu 15 item berurutan tanpa pola - "Dashboard Tukin" di posisi 2, sementara
Uang Makan & Uang Lembur (fungsinya persis sama) di 5-6, dipisah Presensi dan
Kalkulasi. Sekarang: **Presensi -> Kalkulasi -> Approval Tukin -> Approval Uang
Makan -> Approval Uang Lembur -> Rekonsiliasi -> Export ADK**, persis langkah
yang dikerjakan tiap periode; lalu data pokok, lalu sisanya.

- Ketiganya disandingkan, labelnya cukup **nama domainnya**: "Tukin", "Uang
  Makan", "Uang Lembur". Kata "Approval"/"Dashboard" tidak menambah keterangan
  apa pun - semua halaman di sidebar ini dashboard, dan approval cuma salah
  satu yang bisa dilakukan di situ.
- **Ikonnya dibedakan per domain** (lembar uang / garpu & pisau / bulan). Dulu
  ketiganya **ikon JAM yang sama persis**, jadi ikonnya tidak membedakan apa
  pun dan mata terpaksa membaca label. Jam juga keliru: tukin & uang makan
  tidak berhubungan dengan waktu, dan untuk lembur ikon jam rancu dengan
  halaman Presensi. Ikon mata uang (`M12 2v20M17 5...`) sekarang **hanya**
  dipakai Kalkulasi - sebelumnya dipakai dua arti berbeda di menu yang berbeda.
- `pisah: true` pada item = garis pemisah di atasnya. **Tanpa judul kelompok**,
  mengikuti acuan - grup tetap terbaca dari jeda dan sidebar tidak bertambah
  tinggi. Judul "Menu" yang lama dihapus.
#### Grup yang bisa dilipat

15 item (PPABP) / 12 item (Kasubag TU) berjejer ke bawah membuat sidebar
memanjang melewati lipatan layar. Item yang JARANG dibuka dikelompokkan jadi
grup lipat:

| Menu | Grup | Terlihat |
|---|---|---|
| PPABP | **Data Pokok** (5 item) | 15 -> **11 baris** |
| Kasubag TU | **Pegawai** (2), **Dokumen SK** (2) | 12 -> **10 baris** |

- **Yang HARIAN sengaja TIDAK dilipat.** Menyembunyikan langkah yang dikerjakan
  tiap periode cuma menambah satu klik ke seluruh pekerjaan rutin - persis
  kebalikan dari tujuannya. Yang dilipat selalu yang dibuka beberapa kali
  setahun (perbaikan data, SK).
- **Pakai `<details>` BAWAAN HTML, bukan state React** - buka-tutupnya
  ditangani browser, jadi tetap jalan tanpa JavaScript. Pola yang sama dengan
  `BadgePejabatEselon` dan filter GET.
- **Grup yang memuat halaman aktif dirender `open` dari server** (`adaYangAktif`),
  jadi tidak pernah ada keadaan "halaman yang sedang dibuka tersembunyi di
  balik grup tertutup". Diverifikasi: membuka `/ppabp/rekening` -> grup "Data
  Pokok" terbuka dengan "Rekening Pegawai" bertanda aktif; membuka `/kasubag`
  -> kedua grupnya tertutup.
- Anak grup diberi garis vertikal di kiri, bukan indentasi dalam - hierarkinya
  terbaca tanpa memakan lebar sidebar yang cuma 264px.

- **Hari Libur & Kendala e-Presensi TIDAK dinaikkan jadi item sidebar** - tetap
  panel di dalam `/tukin/presensi`. Keduanya dibuka beberapa kali setahun;
  menaikkannya bikin menu 17 baris dan mendorong yang harian ke bawah lipatan.

Urutan hasilnya diverifikasi lewat production build (15 item, 3 pemisah, judul
"Menu" hilang, gradient navy lama tidak ada lagi).

### Pratinjau grid ADK Uang Makan di `/ppabp/adk`

Dipicu pertanyaan user setelah mengirim contoh ADK: *"apakah bagus jika
menampilkan tabel gitu?"* Jawabannya ya — **sebagai tampilan baca**, bukan
sebagai grid isian. Grid di berkas `.xlsm` operator berbentuk isian manual;
menirunya sebagai form justru mengembalikan pekerjaan yang dihapus Gajihub,
karena datanya sudah ada per hari di database.

Yang dibangun: `src/app/ppabp/adk/GridAdkHarian.tsx` (read-only) +
`dataUangMakanHarian.ts`.

- **`susunGridAdkHarian()` yang SAMA dipakai berkas `.xlsx` dipanggil untuk
  layar** — bukan menyusun ulang. Begitu juga barisnya: penyusunan yang dulu
  inline di Route Handler diekstrak ke `dataUangMakanHarian()` dan sekarang
  dipakai bareng route + halaman. Prinsip yang sama dengan
  `business-logic/adk.ts`: kalau disusun dua kali, pratinjau dan berkas cepat
  atau lambat berbeda, dan bedanya baru ketahuan setelah berkas terkirim.
- **Dua panel peringatan yang sebelumnya tidak ada di mana pun**: pegawai
  APPROVED yang **nol hari** (barisnya kosong di berkas), dan pegawai yang
  **jumlah tanggal di berkas BEDA dari `jumlahHariDibayar` yang disetujui** —
  yang dibayar Web Gaji adalah jumlah tanggal di berkas, bukan angka yang
  di-approve. Komentar lama di route menyebut `selisih` padahal fungsinya tidak
  pernah ada; sekarang benar-benar dihitung.
- Kolom Sabtu/Minggu ditandai merah, kolom Nama `sticky`, dan tabelnya punya
  `overflow-x` sendiri — 31 kolom tidak boleh membuat SELURUH halaman menggeser.
  Dibatasi 25 baris dengan catatan eksplisit berapa yang tidak ditampilkan.

**Diverifikasi** lewat production build (47 pegawai 7/2026, di-APPROVED
sementara lalu **dikembalikan ke DRAFT** — nol baris APPROVED tersisa):
pratinjau menyebut **770 baris / 47 pegawai** dan berkas TXT yang benar-benar
diunduh juga **770 baris**; nol baris jatuh di Sabtu/Minggu; nol baris di luar
periode; header 33 kolom (Nama + 31 tanggal + ringkasan) sama persis dengan
jumlah sel per baris; 8 kolom bertanda akhir pekan (Juli 2026 memang 8).
Panel selisih diuji dengan memaksa satu baris berbeda — muncul, menyebut
namanya, lalu dikembalikan.

**ADK Uang Lembur SENGAJA BELUM diberi pratinjau yang sama.** Diadu ke berkas
asli `ADK-Lembur Peg.Rokeu_Juni 2026.xlsm` (111 entri, 35 pegawai): Gajihub
cuma punya **5 entri** ber-`jamLembur > 0` untuk ke-35 pegawai itu, **nol
cocok penuh**, dan **109 dari 111 entri berkas jatuh di hari kerja**. Itu gap
sumber data yang sudah didokumentasikan (lembur hari kerja tercatat sebagai
WFO pulang malam; lembur butuh SPL yang tidak ada sumbernya di sistem manapun)
— grid yang menampilkan 5 dari 111 lebih menyesatkan daripada tidak ada.
Bangun pratinjaunya SETELAH ada jalan masuk SPL.

### Kalender hari libur nasional & cuti bersama

Keterangan user: **lembur ada 2 jenis** - lembur hari libur (Sabtu, Minggu,
**tanggal merah**) dan lembur hari kerja. Sampai sebelum ini Gajihub cuma
mengenali Sabtu/Minggu, jadi tanggal merah yang jatuh di hari kerja terbaca
sebagai hari kerja biasa - dan itu salah di TIGA tempat sekaligus:

1. **Lembur dibayar 1x, seharusnya 2x.** Terukur: Juni 2026 ada **12 baris
   lembur pada 1 Juni** (Hari Lahir Pancasila) dan **7 baris pada 16 Juni**
   (Tahun Baru Islam).
2. Hari itu ikut terhitung `jumlahHariKerja`, yang jadi **batas atas** hari
   uang makan (`Math.min` di `uangMakan.ts`).
3. Potongan Pasal 13 tetap berlaku, padahal tidak ada kewajiban jam kerja yang
   bisa dilanggar.

**Model `HariLiburNasional`** (migrasi `20260813090000_hari_libur_nasional`,
satu CREATE TABLE) + `src/lib/hariLibur.ts` (jembatan DB) + halaman
`/tukin/presensi/hari-libur` (izin `canKelolaHariLibur` - **PPABP + ADMIN**,
alasan sama dengan penanda kendala: satu tanggal berlaku se-kementerian).

#### Kalender libur ditarik dari e-Presensi (jalur utama)

**Catatan lama "tabel `libur` di e-Presensi ada tapi KOSONG" TERNYATA SALAH.**
Diperiksa ulang 2026-08-13 atas pertanyaan user: tabel itu berisi **127 baris**
(2022: 19, 2023: 26, 2024: 28, 2025: 29, **2026: 25**), terakhir diperbarui
**15 Januari 2026** - jadi memang dirawat, bukan sisa. Selama ini kalender
Gajihub diisi tangan padahal sumbernya sudah ada.

Diadu ke data kehadiran: dari **21 tanggal libur 2026 yang jatuh di hari
kerja**, semuanya ber-kehadiran WFO/WFH/WFA **~0** (hanya 1 Januari yang
bukan nol, dengan 2 baris). Daftarnya cocok dengan kenyataan.

`src/adapters/liburEpresensi.ts` (READ-ONLY, SELECT saja) + tombol **"Tarik
kalender <tahun>"** di `/tukin/presensi/hari-libur`.

- **DI-IMPOR, bukan dibaca langsung saat menghitung** - snapshot, pola sama
  dengan `importPegawaiSiap.ts`. Kalau dibaca live, e-Presensi yang mengubah
  tabelnya diam-diam mengubah angka periode yang SUDAH disetujui, tanpa jejak
  siapa pun; kalender ini menentukan pengali lembur 2x dan batas hari uang
  makan, jadi harus bisa ditelusuri ke baris di database MILIK Gajihub.
- **TIDAK menimpa tanggal yang sudah ada** - koreksi manusia tidak boleh
  dikembalikan ke tulisan e-Presensi oleh impor berikutnya. Jumlah yang
  dilewati disebutkan, bukan hilang diam-diam.
- **JEBAKAN ZONA WAKTU yang sama** seperti `$queryRaw`: kolom `tanggal`
  bertipe `date`, dan driver pg mengembalikannya sebagai tengah malam WAKTU
  LOKAL - di +7, `2026-03-20` terbaca `2026-03-19T17:00Z`, **mundur sehari**.
  Di-cast `::text` di SQL-nya. Diverifikasi: Idul Fitri terbaca 2026-03-20.
- **Penanda `cutiBersama` diturunkan dari NAMA, dan pasti kurang lengkap untuk
  2026**: 2022-2025 punya baris bernama "Cuti Bersama ..." (4/11/8/9), tapi
  2026 **nol** - cuti bersama Idul Fitri 2026 ditulis dengan nama hari rayanya
  ("Hari Raya Idul Fitri 1447 Hijriah", 20-24 Maret). Ini DISEBUTKAN di pesan
  suksesnya supaya penanda kosong tidak dikira kerusakan. Tidak mengubah
  pembayaran (perlakuannya sama), cuma pelaporan.
- Form manual TETAP ada - buat tanggal yang tidak tercakup, dan buat waktu
  server e-Presensi tidak terjangkau (kegagalan koneksi disebut apa adanya,
  bukan dibiarkan jadi galat mentah).

Diverifikasi lewat jalur kode yang sama: `ambilLiburEpresensi(2026)` -> 25
tanggal, tanggal Idul Fitri benar (tidak mundur), 25 akan ditambahkan / 0
dilewati terhadap kalender yang saat itu kosong.

**Sisa data uji yang SUDAH DICABUT**: satu baris `2026-07-31 "testing"`
tertinggal dari verifikasi halaman ini. 31 Juli 2026 itu **hari Jumat** - hari
kerja - jadi kalau presensi Juli ditarik ulang, hari itu akan diperlakukan
libur (lembur 2x, hari kerja berkurang). Rekap 7/2026 terakhir diperbarui
2026-08-12, sebelum baris itu berpengaruh, jadi **tidak ada angka tersimpan
yang terlanjur salah**.

- **Tanggal merah diperlakukan SAMA PERSIS dengan Sabtu/Minggu** - satu baris
  di `rekapDariLaporanPdf` (`jamPulangWajib` dinolkan), sehingga keputusan itu
  merambat sendiri ke pengali lembur, batas uang makan, dan seluruh potongan
  Pasal 13 yang memang sudah dijaga `!hariLibur`. **Bukan** dikurangkan
  belakangan di lapisan kalkulasi - kalau dipisah, ketiganya bisa memakai
  daftar tanggal yang berbeda.
- **Kalender kosong = perilaku persis seperti sebelumnya** (libur cuma
  Sabtu/Minggu). Ada test yang menguncinya, jadi tabel yang belum diisi tidak
  mengubah apa pun.
- **Deteksi kandidat, bukan penetapan otomatis** - pola sama dengan kendala
  e-Presensi. Hari kerja yang kehadirannya di bawah **20% median** bulan itu
  ditawarkan sebagai dugaan; yang menetapkan tetap manusia, dan halamannya
  menyuruh mencocokkan ke SKB 3 Menteri dulu. Diverifikasi: Juni 2026 tepat
  menemukan **1 & 16 Juni** (keduanya 0 hadir, median 4.201) dan **nol** hari
  kerja biasa ikut tertandai.
- `cutiBersama` dipisah BUKAN untuk perlakuan pembayaran (sama saja), tapi
  supaya bisa dilaporkan terpisah - cuti bersama memotong jatah cuti tahunan.
- **Menetapkan tanggal TIDAK langsung mengubah angka**: kalender dipakai saat
  rekap dihitung, jadi harus **tarik ulang presensi** lalu **hitung ulang**.
  Disebutkan di halaman DAN di pesan sukses action-nya.

#### BUG yang ketemu saat mengerjakannya: `$queryRaw` menggeser tanggal 7 jam

Mengoper objek **`Date` sebagai parameter `$queryRaw`** ke kolom `timestamp`
membuat driver pg menyerialkannya memakai **zona waktu LOKAL proses**. Di
Asia/Jakarta (+7) batas periodenya bergeser 7 jam: **tanggal 1 terbuang** dan
tanggal 1 bulan berikutnya ikut masuk.

Terukur: **4.596 baris** presensi hilang diam-diam dari agregasi Juni 2026
(261.342 lawan 265.938), dan **1 Juni tidak pernah muncul sebagai kandidat**
walau seluruh 4.517 barisnya berstatus Upacara. Ketahuannya justru karena
deteksi kalender ini menemukan 16 Juni tapi tidak 1 Juni.

**Halaman kendala e-Presensi kena bug yang SAMA** dan sudah ikut diperbaiki -
di sana tidak kelihatan karena 15 & 16 Juli kebetulan masih di dalam jendela
yang tergeser. Perbaikannya: batas dikirim sebagai TEKS `"YYYY-MM-DD"` lalu
di-cast `::timestamp` di SQL-nya (`batasPeriodeIso()` di kedua halaman).

**API bertipe Prisma (`where: { tanggal: { gte, lt } }`) TIDAK kena** - sudah
diadu langsung, keduanya menghasilkan 107.262 baris untuk Juni 2026. Ini
khusus jalur SQL mentah.

### Rincian uang makan ditampilkan ke layar (golongan → tarif → hari)

Rumus uang makan cuma satu perkalian, tapi dua angkanya tidak kelihatan dari
hasil akhir: **kenapa tarifnya segitu** (golongan) dan **kenapa harinya
sekian** (hari hadir TIDAK sama dengan hari dibayar). Dashboard `/uang-makan`
dulu menulis *"Hadir 22 dari 23 hari kerja"* lalu nominal yang sebenarnya hasil
kali **18** hari — aritmatikanya tidak bisa diperiksa dari layar, dan selisih 4
hari itu tidak punya tempat untuk dijelaskan.

`src/business-logic/rincianUangMakan.ts` (PURE, 13 unit test) +
`src/app/RincianUangMakan.tsx`, dipasang di `/uang-makan` (per kartu) dan
`/saya`. **Tidak ada migrasi** — `jumlahHariDibayar`, `tarifHarian`, dan
golongan semuanya sudah tersimpan; yang belum ada cuma penjelasannya.

- **Dikunci ke fungsi yang membayar.** Ada test `it.each` yang menjalankan
  `rincianUangMakan()` dan `hitungUangMakan()` atas kasus yang sama dan menuntut
  `hariDibayar` + `total` identik — termasuk kasus clamp ke hari kerja. Tampilan
  tidak bisa bercerita beda dari kas.
- **WAJIB `kurungTarifSbm()`, BUKAN `golonganRomawi()`.** Yang kedua cuma
  mengenali format PNS ("III/d") dan mengembalikan null untuk jenjang PPPK
  ("IX"). Memakainya akan menandai **~996 pegawai PPPK "tidak dikenali"** di
  layar padahal kalkulasi tetap membayar mereka lewat `PADANAN_GOLONGAN_PPPK`.
  Nyaris masuk; sekarang ada test yang menguncinya, dan padanan PPPK-nya
  **disebut terang-terangan sebagai TODO(confirm)** di layar.
- **Diklat & Dinas Keluar ditampilkan dicoret + alasannya** ("konsumsi
  ditanggung penyelenggara diklat" / "perjalanan dinas"), bukan dihilangkan
  dari tabel. Itu bukan potongan, dan kalau barisnya tidak ada, selisih hari
  hadir vs dibayar kembali jadi misteri.
- **Direkonstruksi dari `RekapPresensiPeriode`**, pola sama dengan
  `RincianPotonganKehadiran` — beserta konsekuensinya: kalau tidak menjumlah ke
  `totalUangMakan` yang tersimpan, panel kuning bilang presensinya berubah
  setelah kalkulasi terakhir dan perlu dihitung ulang.

Diverifikasi lewat production build terhadap data nyata (periode 7/2026, 47
baris): rincian terender 94 kali (47 × 2, salinan kedua dari RSC flight
payload), dan lima baris pertama diadu ke hitungan ulang independen — **COCOK
semua** (mis. PANUT RAHAYU gol IV/a, 15 hari × Rp 41.000 = Rp 615.000 dengan 8
hari hadir yang tidak dibayar).

## Teks peraturan: `docs/pmk-32-2025-sbm-2026-uang-makan-lembur.md`

Salinan bagian uang makan & uang lembur dari **PMK 32/2025 (SBM TA 2026)**,
sumber `src/business-logic/tarifSbm.ts`. Berkas aslinya `docs/PMK 32 Tahun
2025.pdf`. Aturan yang sama berlaku: **kalau kode dan dokumen itu berbeda,
yang benar dokumen itu**.

Ke-**12 tarif** (item 22.1, 23.1, 23.2) sudah diadu langsung ke berkasnya dan
**cocok persis** dengan konstanta di kode, termasuk perbedaan pengelompokan
golongan (uang makan menyatukan Gol I & II; uang lembur memisahkannya).

**Yang paling penting dari pembacaan itu - dokumen ini TIDAK mengatur siapa
yang berhak dibayar, cuma BESARAN tarifnya.** Pasal 1 menyebutnya "satuan
biaya... dalam penyusunan Rencana Kerja dan Anggaran" dan Pasal 4 melempar tata
cara penerapannya ke PMK Pelaksanaan Anggaran. Terukur: frasa "hari kerja"
muncul **tepat satu kali** di seluruh dokumen, sementara "kehadiran", "masuk
kerja", dan "absen" **nol kali**. Jadi jangan mencari aturan kehadiran uang
makan di berkas itu, dan jangan mengutipnya untuk membela aturan siapa-berhak
yang sekarang dipakai.

TODO(confirm) BARU yang lahir dari situ: penjelasan item 22.1 berbunyi uang
makan "dihitung berdasarkan **jumlah hari kerja**" - bukan hari hadir.
Gajihub membayar per hari WFO + WFH/WFA (Diklat & Dinas Keluar dikecualikan),
aturan yang datang dari keterangan user. Dua-duanya bisa benar kalau "hari
kerja" itu cara MENGANGGARKAN sementara pembayarannya berbasis kehadiran sesuai
peraturan yang dirujuk Pasal 4 - dan itu pembacaan yang dipakai sekarang.
**Minta PMK/Perdirjen Perbendaharaan tentang tata cara pembayaran uang makan
ASN**; di situlah aturan kehadirannya, dan tanpa salinannya aturan siapa-berhak
di Gajihub masih bersandar pada keterangan lisan.

Dokumen itu juga mendaftar aturan yang dipakai Gajihub tapi **tidak ada
dasarnya di SBM**: batas 40 jam lembur/bulan, pengali 2x lembur hari libur
(kata "libur" tidak muncul sama sekali di PMK ini), dan padanan golongan PPPK.

## Konvensi kode

- Business logic engine = pure functions, tidak boleh ada I/O (database,
  network) di dalamnya. Semua data eksternal masuk lewat parameter.
- Setiap keputusan regulasi yang diimplementasi WAJIB dikomentari dengan
  nomor Pasal yang jadi acuan - supaya gampang diverifikasi ulang dan
  gampang dijelaskan ke Itjen/auditor kalau ditanya. Nomor Pasal itu
  merujuk ke `docs/permenaker-15-2024-tunjangan-kinerja.md`.
- Kalau ada asumsi yang belum dikonfirmasi ke pihak terkait (OSDMA, Biro
  Hukum, DJA, dst), tandai eksplisit dengan komentar `TODO(legal-confirm)`
  atau `TODO(confirm)` - jangan diam-diam mengasumsikan sesuatu sebagai final.

## Perbaikan pasca-deploy (real ADK format, struktur eselon, admin buat akun)

Batch perubahan setelah testing internal mulai jalan, dipicu 5 file dari
user: 3 contoh/template ADK asli (`templatelemburPPPK202606.xlsx`,
`ADK-U.Lembur-PNS-Romum_JUni.2026.xlsm`, `adk_tunkin-PNS_ROMUM_JUni__2026.xlsx`),
1 file struktur unit Eselon I/II, 1 contoh tarikan data presensi.

- **Login page** - dibersihkan dari copy "Login approver"/"Login sementara
  khusus untuk pemberi approval berjenjang. Belum terhubung ke SIAP." jadi
  cukup "Gajihub - Login" (`src/app/login/page.tsx`). Info "sementara"
  itu tetap benar secara teknis (lihat TODO(legal-confirm) di
  `src/auth/session.ts`) tapi tidak perlu ditampilkan ke user yang login.
- **Admin bisa buat akun baru langsung** (`src/app/admin/role-assignment/`)
  - SEBELUM ini, "Kelola Assignment Role" cuma bisa ubah role 13 akun yang
    SUDAH ada; tidak ada cara membuat akun otorisasi baru untuk pegawai
    lain dari ±5.069 data Pegawai TANPA lewat alur usulan PPABP (yang juga
    butuh User sudah ada duluan - `UsulanPerubahanRole.userId` mengacu ke
    User, bukan Pegawai). `buatAkunBaruAction` (actions.ts) + pencarian
    pegawai GET-based (pola sama dengan `osdma/update-sk`) mengisi celah
    ini - dipakai kalau ada nodin/arahan Pimpinan yang perlu dieksekusi
    cepat (mis. pegawai baru dilantik jadi Kasubag TU) tanpa nunggu PPABP
    mengusulkan dulu. Password akun baru = NIP (konvensi yang sama).
    Pencarian otomatis menyembunyikan opsi "Pilih" buat pegawai yang
    sudah punya akun (chip "Sudah punya akun") - diarahkan ke tabel di
    bawah buat ubah role yang sudah ada, bukan bikin akun duplikat.
- **`src/business-logic/strukturEselon.ts`** (BARU) - lookup statis Unit
  Eselon II (== `Pegawai.satuanKerja`) ke Unit Eselon I-nya, sumber file
  "Struktur unit kemnaker sd eselon II.xlsx" dari user. Disiapkan supaya
  dashboard Pimpinan/PPABP NANTI gampang dikelompokkan per Eselon I -
  ~~BELUM dipakai di UI manapun~~ SEKARANG dipakai di kop slip gaji
  (`/saya/slip-gaji`, baris kedua kop = unit Eselon I, fallback ke
  `satuanKerja` kalau tidak ketemu). Pengelompokan dashboard per Eselon I
  tetap BELUM dibangun. TODO(confirm)
  PENTING: mapping ini TIDAK 100% cocok dengan `satuanKerja` hasil
  `importPegawaiXlsx.ts` (basis data ±Januari 2026) - beberapa nama unit
  beda (kemungkinan reorganisasi/rename), dan file referensi tidak
  menyebut "Staf Ahli Bidang..." sama sekali padahal ada di data pegawai.
  `getEselon1()` return `undefined` (bukan fuzzy-match/tebak) buat unit
  yang tidak ketemu persis - lihat komentar lengkap di file itu sebelum
  dipakai buat fitur apapun.
- **Export ADK Tukin disamakan dengan format "daftar bayar" ASLI**
  (`src/app/ppabp/adk/tukin/route.ts`, contoh dari user:
  `adk_tunkin-PNS_ROMUM_JUni__2026.xlsx`) - kolom sekarang: NO, Kode
  Satker, Bulan, Tahun, NIP, Nama Pegawai, Nomor SK, Kode Grade, Nilai
  Bruto, Nilai Potongan, Nilai Bersih, Kode Bank SPAN, Nama Bank, Nomor
  Rekening, Nama Rekening, Bulan Awal, Tahun Awal, Bulan Akhir, Tahun
  Akhir, Tukin Kali, Nomor Tukin Lama, Nomor Tukin Baru. Nilai
  Bruto/Potongan/Bersih = tukinPokok/potonganPph/tukinBersih (sudah
  dicek: tukinBersih = tukinPokok - potonganPph, PERSIS sama dengan
  aritmatika di contoh asli). **Kolom yang SENGAJA dikosongkan** (bukan
  lupa - datanya benar-benar tidak ada di skema manapun): Kode Satker
  (belum ada mapping satuanKerja -> kode satker resmi), Nomor SK/Nomor
  Tukin Lama/Baru (TukinCalculation tidak menyimpan referensi SK), Kode
  Bank SPAN/Nama Bank/Nomor Rekening/Nama Rekening (Pegawai TIDAK punya
  data rekening bank sama sekali - PII finansial, JANGAN pernah diisi
  tebakan/dummy - kalau nanti ada sumber datanya, itu migrasi skema
  terpisah, bukan hardcode di route export), Bulan/Tahun Awal/Akhir
  (di contoh asli nilainya beda dari bulan pembayaran, artinya belum
  jelas). "Tukin Kali" default 1 (SEMUA baris contoh asli nilainya 1,
  bukan ditebak - pola konsisten di data referensi).
- **Export ADK Uang Lembur TIDAK diubah** (`src/app/ppabp/adk/uang-lembur/route.ts`)
  - format asli (`templatelemburPPPK202606.xlsx`,
  `ADK-U.Lembur-PNS-Romum_JUni.2026.xlsm`) per-HARI (kolom NIP +
  JHARI1..JHARI31 + total), sementara `UangLembur` di skema Gajihub cuma
  simpan `totalJamLembur` SATU ANGKA per bulan - tidak ada rincian jam
  lembur per tanggal di skema manapun (TODO(confirm) lama yang sama di
  `RekapKehadiranPeriode`, `src/types/index.ts`). Bikin kolom JHARI1..31
  dari data yang ada berarti mengarang rincian harian yang sebenarnya
  tidak tercatat - CSV tetap format ringkas (total per pegawai) sampai
  ada sumber data jam lembur harian yang jelas. Ditambahkan komentar
  penjelasan di route-nya, TIDAK ada perubahan kode fungsional.
- **Contoh tarikan data presensi** ("contoh tarikan data ketidakhadiran
  presensi.xlsx", sheet "Master", ~942rb baris) - CUMA referensi, user
  eksplisit bilang "nanti kalau udah konek ke presensi gw update lagi" -
  TIDAK ada adapter/import job yang dibangun dari file ini sekarang.
  Catatan buat nanti: file ini key oleh **nama_pegawai (nama), BUKAN
  NIP** - ada inkonsistensi penulisan nama yang sama persis di baris
  berbeda (mis. "Ayla Raffany, S.I.Kom" vs "Ayla Raffany S.I.Kom", beda
  koma) - matching by name ke NIP asli PASTI butuh proses
  rekonsiliasi/fuzzy-match manual dulu, TIDAK BISA langsung dipetakan
  1:1 begitu integrasi ini dikerjakan. Kolom yang ada: nama_pegawai,
  nama_sistem_kerja (jenis: Izin/Tidak Hadir/Tidak Presensi/dst),
  tanggal, jam_masuk, jam_keluar, menit_kerja, jumlah_potongan,
  keterangan - berguna dipetakan ke `PresensiHarian.statusKehadiran`
  begitu proses rekonsiliasi nama selesai.

## Deployment testing internal (VPS kantor)

Di-deploy ke VPS kantor (`192.168.221.44`, hostname `AIhelpdeskRokeu`, cuma
bisa diakses lewat jaringan kantor/VPN) buat testing terbatas ke beberapa
pegawai SEBELUM dapat subdomain resmi dari Kemnaker - `gajihub.rokeubmn.id`
(domain pribadi user di Hostinger) dipakai sementara, DNS A record
mengarah ke IP privat itu (makanya cuma bisa diakses dari jaringan yang
bisa route ke sana). Server ini SHARED dengan aplikasi lain (`bot-siska`
di port 3000, `meeting-room-display-api` di port 3001 - JANGAN ganggu
keduanya kalau maintenance server ini lagi) - Gajihub jalan di port 3002
lewat pm2 (`pm2 start npm --name gajihub -- start -- -p 3002`, sudah
`pm2 save` + `pm2-support.service` systemd enabled, jadi otomatis restart
kalau server reboot), nginx reverse-proxy `gajihub.rokeubmn.id` -> port
3002 (config di `/etc/nginx/sites-available/gajihub`). HTTPS SENGAJA belum
dipasang - Let's Encrypt HTTP-01 tidak bisa validasi domain yang resolve ke
IP privat (server tidak bisa diakses publik), jadi jalan HTTP dulu sampai
subdomain resmi Kemnaker (yang publik) tersedia baru upgrade ke HTTPS.

**Bug yang ketemu waktu deploy pertama** (SUDAH DIPERBAIKI di
`prisma/migrations/20260725093725_role_matrix_lengkap_dan_model_baru/migration.sql`):
migrasi itu awalnya generate 2 baris `ALTER TABLE "usulan_perubahan_role"`
di dalam blok AlterEnum, PADAHAL tabel itu baru dibuat beberapa baris di
bawahnya (CREATE TABLE) - jadi `prisma migrate deploy` ke database fresh
(baru pertama kali dipakai, kayak di VPS ini) selalu gagal dengan error
"relation usulan_perubahan_role does not exist". Ini kelewatan sebelumnya
karena database dev lokal kebetulan sudah punya tabel itu (residual dari
percobaan migrasi yang gagal saat langkah 1 dulu), jadi generate-nya salah
tapi tidak ketahuan sampai dicoba di database yang benar-benar kosong.
Sudah dihapus baris yang salah itu dari file migrasi - migrasi ini SEKARANG
aman dijalankan dari database kosong (`prisma migrate deploy` langsung,
TANPA perlu workaround manual psql lagi seperti sebelumnya).

**Alur seed di VPS - SUDAH JAUH LEBIH SEDERHANA sejak sambungan langsung ke
SIAP ada.** Prosedur `pg_dump --data-only --table=pegawai` dari laptop dev ke
VPS **TIDAK DIPERLUKAN LAGI**; dulu itu satu-satunya cara karena file XLSX
sumbernya tidak ada di repo (data pribadi, sengaja). Sekarang cukup:

```bash
npm run sync:pegawai                 # tarik pegawai langsung dari SIAP
npx tsx src/auth/seedAkunPegawai.ts  # akun login buat NIP baru
npm run sync:presensi -- --oleh=<NIP>   # presensi bulan berjalan
```

`seedUsers.ts` & `seedSimulasi.ts` (akun demo + skenario simulasi) tetap butuh
baris Pegawai ada duluan, jadi jalankan SETELAH `sync:pegawai`.

Buat menjaganya tetap segar, jadwalkan dua perintah sync itu lewat cron
(harian sudah cukup - mutasi & pelantikan tidak terjadi tiap jam).

**YANG WAJIB DICEK SEBELUM DEPLOY**: VPS Gajihub (`192.168.221.44`) satu
segmen dengan e-Presensi (`192.168.221.96`) jadi hampir pasti terjangkau,
TAPI SIAP ada di segmen BERBEDA (`192.168.212.108`). Cek dari VPS:

```bash
nc -zv 192.168.221.96 4020    # e-Presensi
nc -zvu 192.168.212.108 1434  # SQL Server Browser - WAJIB buat named instance
```

**Port 1433 TIDAK cukup lagi.** Sejak pindah ke named instance `MSSQLDEV`,
portnya dinamis dan ditemukan lewat **SQL Server Browser di UDP 1434**. Kalau
tim jaringan cuma membuka TCP 1433, yang terjangkau justru instance
`SQLEXPRESS2014` yang datanya lama - dan itu akan "berhasil" tanpa error.
Minta dibuka: **UDP 1434** dan rentang port dinamis SQL Server (atau minta
DBA menetapkan port statis untuk MSSQLDEV, lalu isi `SIAP_PORT` dan kosongkan
`SIAP_INSTANCE`).

Kalau SIAP tidak terjangkau, minta pembukaan rute/firewall ke tim jaringan -
JANGAN kembali ke pola dump-restore manual, itu langkah mundur.

**`.env` VPS perlu tiga baris tambahan** yang belum ada di sana:
`SIAP_INSTANCE="MSSQLDEV"`, `SIAP_ENCRYPT="false"`, dan kredensial instance itu
(`SIAP_PORT` harus DIKOSONGKAN). Tanpa itu VPS tetap menarik data lama tanpa
memberi tanda apa pun.

**JANGAN taruh alamat SIAP/e-Presensi di `DATABASE_URL` VPS.** `DATABASE_URL`
di VPS tetap PostgreSQL milik Gajihub sendiri di server itu; sumber eksternal
lewat `SIAP_*` dan `EPRESENSI_*`.

**Catatan lain**: tabel-tabel baru dari migrasi role-matrix (`banding`,
`bukti_dukung`, `sk_kgb`, `sk_hukuman_disiplin`, `anggaran_realisasi`,
`bukti_potong_pajak`, `usulan_perubahan_role`) sempat ke-`OWNER`-kan ke
`postgres` karena migrasi dijalankan manual lewat `sudo -u postgres psql`
(bukan lewat koneksi `DATABASE_URL` biasa) - sudah di-`ALTER TABLE ...
OWNER TO gajihub_app` semua supaya user aplikasi punya privilege yang
benar. Kalau deploy ke server baru lagi dan migrasi butuh dijalankan manual
lagi (lihat alasan di atas), jangan lupa langkah re-owner ini.

**Deploy fitur riwayat gaji/gaji induk ke VPS**: sama seperti multi-role di
bawah, butuh migrasi (`20260729000000_tambah_gaji_induk`, satu `CREATE
TABLE` + 2 foreign key, non-destruktif - tidak menyentuh tabel yang sudah
ada): `git pull origin main && npx prisma migrate deploy && npm run build &&
pm2 restart gajihub`. Data gaji induk-nya sendiri TIDAK ikut deploy (bukan
seed) - PPABP tinggal upload file ADK GPP lewat `/ppabp/gaji-induk` di
server itu. Kalau migrasi terpaksa dijalankan manual lewat `sudo -u postgres
psql`, jangan lupa `ALTER TABLE gaji_induk OWNER TO gajihub_app` (masalah
owner yang sama seperti tabel-tabel role matrix).

**Deploy fitur multi-role ke VPS**: butuh migrasi database, jadi urutannya
`git pull origin main && npx prisma migrate deploy && npm run build && pm2
restart gajihub` (bukan cuma pull-build-restart seperti biasa). Migrasinya
satu `ALTER TABLE ... ADD COLUMN` yang aman & non-destruktif - semua akun
yang sudah ada tetap single-role sampai Admin menambahkan role tambahan
lewat UI. Kalau mau akun demo ADMIN di VPS langsung punya semua role,
jalankan ulang `npx tsx src/auth/seedUsers.ts` (idempotent, upsert) - TAPI
ingat itu juga akan mengembalikan role 12 akun demo lain ke nilai seed, jadi
kalau ada assignment manual di VPS yang mau dipertahankan, lebih aman
tambahkan role tambahannya lewat halaman "Kelola Assignment Role" saja.

## Cara lanjutin dengan Claude Code

Roadmap awal (validation gate → job scheduler → dashboard + approval
digital) SUDAH SELESAI untuk ketiga domain (Tukin, Uang Makan, Uang
Lembur) - lihat "Yang SUDAH ada" di atas. Semuanya masih pakai data mock
(2 pegawai contoh) kecuali tarif tukin pokok & konversi predikat kinerja
yang sudah resmi (item 1 resolved).

Sisa open items (2, 3, 4, 5, 6, 7, 8 di atas) semuanya butuh info dari
pihak eksternal (OSDMA, Biro Hukum, DJA, akses API BKN/SAKTI) - jangan
diasumsikan atau di-hardcode sampai dokumen/konfirmasinya didapat, ikuti
pola yang sudah ada: TODO(confirm)/TODO(legal-confirm) di kode + tanya
eksplisit ke user kalau mau diimplementasi.

Kalau ada data pegawai asli (bukan mock) yang mau diintegrasikan, cek dulu
kolom apa saja yang tersedia dan diskusikan cakupannya (semua Eselon I vs
pilot Setjen saja per baris 11 di atas) sebelum bikin adapter baru -
jangan import semua kolom mentah-mentah kalau ada data pribadi (alamat,
NPWP, no HP) yang tidak dibutuhkan skema `Pegawai` yang sudah ada.

### Fitur user & role - versi awal (SELESAI, catatan historis)

CATATAN PENTING: catatan di bawah pakai terminologi LAMA yang sudah
di-rename (`Sanggahan`→`Banding`, `BuktiPendukungUpload`→`BuktiDukung`,
`BIRO_OSDMA`→`OSDMA`, `ADMIN_SISTEM`→`ADMIN`, `ITJEN` sudah dihapus dari
enum, `NavBar.tsx` sudah diganti `AppShell.tsx`) - lihat "Simulasi role
matrix lengkap" di atas untuk role matrix yang berlaku SEKARANG. Dibiarkan
apa adanya di bawah sebagai jejak keputusan/verifikasi yang sudah dilakukan,
JANGAN dipakai sebagai referensi nama kode terkini.

Urutan yang sudah dikerjakan (3 langkah):

1. **Skema** (`User`/`Role`/`Sanggahan`/`BuktiPendukungUpload`) - SUDAH SELESAI.
2. **Authorization layer** (`src/auth/permissions.ts`) - SUDAH SELESAI. ~25
   pure function per kombinasi role x aksi (`canViewPegawai`,
   `canApproveJenjang1`, `canViewDataPayroll` buat guard eksplisit
   ADMIN_SISTEM, dst), 39 unit test (termasuk kasus DITOLAK per role, bukan
   cuma kasus diizinkan).
3. **Sambungkan ke dashboard/endpoint yang sudah ada** - BARU approval Tukin
   yang sudah tersambung (sesuai urutan "approval Tukin dulu"):
   - `src/app/actions.ts` (`ajukanApprovalTukinAction`): sebelum approval
     dieksekusi, fetch ULANG `User` dari database (bukan percaya cookie
     sesi) buat cek `canApproveJenjang1`/`canApproveJenjangFinal` sesuai
     jenjang yang diajukan + `satuanKerja` pegawai targetnya. Sudah
     diverifikasi manual di browser: KASUBAG_TU cuma bisa approve jenjang 1
     unit sendiri (ditolak buat unit lain & jenjang final), PPABP approve
     jenjang final berhasil.
   - `src/app/tukin/page.tsx`: `ADMIN_SISTEM` diblokir total (halaman
     "Akses ditolak") pakai `canViewDataPayroll` - guard paling eksplisit
     di role matrix.
   - `src/app/actions.ts` (`ajukanApprovalUangMakanAction`,
     `ajukanApprovalUangLemburAction`): SUDAH di-guard juga - pakai helper
     generik `cekOtorisasiApprovalJenjang` (refactor dari
     `cekOtorisasiApprovalTukin` biar reusable lintas 3 domain), fetch ulang
     `User` dari database sama seperti Tukin. Sudah diverifikasi manual di
     browser buat kedua domain: KASUBAG_TU approve jenjang 1 unit sendiri
     berhasil, approve jenjang 2 (final) ditolak dengan pesan yang jelas.
   - `src/app/uang-makan/page.tsx` & `src/app/uang-lembur/page.tsx`: SUDAH
     dipasangi guard `canViewDataPayroll` yang sama dengan Tukin - sebelumnya
     KEDUA halaman ini TIDAK PUNYA guard sama sekali (celah yang ketemu
     waktu ngerjain scoping, bukan cuma "belum sempat" - ADMIN_SISTEM bisa
     lihat data payroll Uang Makan/Lembur penuh sebelum ini). Sudah
     diverifikasi manual: ADMIN_SISTEM sekarang "Akses ditolak" di ketiga
     halaman.
   - **Scoping list pegawai per role** - SUDAH DIKERJAKAN buat ketiga
     dashboard (Tukin, Uang Makan, Uang Lembur), lewat helper baru
     `src/app/dashboardScope.ts` (`resolveSatkerEfektif`,
     `resolveSatuanKerjaListUntukFilter`): KASUBAG_TU sekarang filter
     satuan-kerja-nya DIPAKSA ke unit sendiri (query `?satker=` dari luar
     diabaikan, dropdown filter cuma nampilin unitnya sendiri) - jadi
     visibility list-nya sudah konsisten dengan approve-nya. Role lintas
     satker (PPABP, BIRO_OSDMA, ITJEN, PIMPINAN) tidak berubah, sudah
     diverifikasi manual PPABP tetap lihat "Semua satuan kerja".
   - **Dashboard self-service PEGAWAI** - SUDAH DIBANGUN, `src/app/saya/`:
     - `page.tsx`: guard `canViewDataSendiri` (cuma role PEGAWAI, cuma data
       sendiri lewat NIP). Nampilin presensi terbaru (14 hari), predikat
       kinerja, dan kalkulasi Tukin/Uang Makan/Uang Lembur milik sendiri
       (label "estimasi" kalau belum APPROVED, "histori pembayaran" kalau
       sudah).
     - `actions.ts` (`ajukanSanggahanAction`): fetch ulang `User` dari
       database (pola sama dengan approval action), cek
       `canAjukanSanggahan`, DAN verifikasi kalkulasi yang disanggah
       memang milik pegawai itu sendiri (bukan cuma percaya `referensiId`
       dari form) sebelum bikin baris `Sanggahan`. `periodeBulan`/`Tahun`
       diambil dari kalkulasi asli, bukan dari form.
     - Ketiga dashboard approver (Tukin/Uang Makan/Uang Lembur) SEKARANG
       pakai guard baru `canViewApproverDashboard` (kombinasi
       `canViewDataPayroll` + blok PEGAWAI) - PEGAWAI diarahkan ke `/saya`
       kalau nyoba akses (sebelumnya PEGAWAI bisa lihat SEMUA pegawai di
       ketiga dashboard itu, celah yang ketemu waktu bangun fitur ini).
       Login & `NavBar` juga disesuaikan: PEGAWAI diarahkan ke `/saya`
       setelah login, nav cuma nampilin "Data Saya" (bukan 3 menu
       approver).
     - **BELUM ADA**: upload bukti pendukung (SENGAJA tidak diimplementasi
       - mekanisme penyimpanan file masih TODO(confirm), lihat item 
       terkait di atas dan komentar di `BuktiPendukungUpload`
       schema.prisma; halaman `/saya` cuma nampilin pesan placeholder,
       jangan bikin storage sendiri tanpa konfirmasi kebijakan retensi
       dokumen). Sudah diverifikasi manual: login PEGAWAI demo (NIP
       ...001) redirect ke `/saya`, data Tukin/Uang Makan/Uang Lembur
       miliknya tampil benar, ajukan sanggahan berhasil dan langsung
       muncul di "Sanggahan saya", akses ke `/tukin` ditolak dengan link
       balik ke `/saya`.

Login sekarang (lihat `src/app/login/`) SUDAH pakai model `User` (bukan
`AkunApprover` lagi, yang itu di-deprecate) - NIP jadi username & password
sekaligus, SEMENTARA sampai SSO Kemnaker tersambung (lihat
`TODO(legal-confirm)` panjang di `src/auth/session.ts` soal risikonya - NIP
bukan rahasia). Akun demo per role: `src/auth/seedUsers.ts`.

Jangan loncat ke langkah 3 sebelum langkah 2 selesai dan direview - pola
yang sama dengan roadmap awal (jangan bangun UI di atas logic yang belum
ditest).
