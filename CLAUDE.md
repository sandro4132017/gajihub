# Gajihub - Integration Layer Sentralisasi Belanja Pegawai

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
  e-Kinerja
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
- Unit test lengkap untuk semua kalkulasi, job scheduler, approval, dan
  session login di atas (`npm test` - 177 test)
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
- **PPABP per satker** - masih keputusan kebijakan terbuka, jangan
  diasumsikan bakal terjadi otomatis. **CATATAN PENTING**: dulu di sini
  tertulis "skema sudah siap (`User.satuanKerja` nullable)" - itu SUDAH
  TIDAK BERLAKU. Rencana numpang kolom `satuanKerja` buat men-scope PPABP
  sudah DICABUT karena bentrok dengan multi-role (lihat "Bug akun
  multi-role kehilangan jangkauan PPABP" di bawah). Kalau nanti jadi
  di-scale, itu BUTUH kolom sendiri + migrasi.

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
  (`canAjukanKalkulasiTukinMassalUnit`). **GAP yang ketemu waktu verifikasi**:
  PPABP boleh meng-upload KEDUA komponen tapi TIDAK boleh menjalankan
  kalkulasi massal (itu KASUBAG_TU + ADMIN). Belum diubah - itu keputusan
  kewenangan tersendiri, bukan efek samping penyatuan menu ini.

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
upload ini bukan pintu belakang buat edit bebas, tidak ada form ketik-manual
predikat di manapun, dan tiap upload menulis `AuditTrail`.

**UI**: SATU halaman `/predikat-kinerja` dipakai KASUBAG_TU dan PPABP (pola
yang sama dengan `/pegawai` - bukan dua salinan). KASUBAG_TU dipaksa ke
unitnya di level QUERY dan filter satker-nya disembunyikan; PPABP/ADMIN
lintas satker. Halaman menampilkan sebaran predikat, tabel per periode, dan
**peringatan "Kalkulasi Tukin perlu dihitung ulang"**: pegawai yang
kalkulasi Tukin-nya sudah terlanjur dibuat SEBELUM predikat baru masuk.
Sengaja TIDAK menghitung ulang otomatis - recalculation mereset siklus
approval ke DRAFT (lihat catatan kalkulasi massal Kasubag TU di atas), jadi
keputusannya diserahkan ke user. File-nya sendiri TIDAK disimpan.

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
   harian. Perlu konfirmasi praktik ke Biro OSDMA/Hukum.
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
8. **Tarif uang makan & uang lembur, batas maksimal jam lembur** - ini
   mengikuti Standar Biaya Masukan (SBM) PMK yang terbit tahunan, perlu
   dikonfirmasi ke Biro Keuangan/DJA sebelum dipakai di data production.

## Konvensi kode

- Business logic engine = pure functions, tidak boleh ada I/O (database,
  network) di dalamnya. Semua data eksternal masuk lewat parameter.
- Setiap keputusan regulasi yang diimplementasi WAJIB dikomentari dengan
  nomor Pasal yang jadi acuan - supaya gampang diverifikasi ulang dan
  gampang dijelaskan ke Itjen/auditor kalau ditanya.
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

**Alur seed di server production/VPS BEDA dari lokal**: data Pegawai asli
(±5.069 baris) TIDAK diimpor ulang dari file XLSX (file itu tidak ada di
repo, sengaja - data pribadi pegawai) - dipindahkan langsung via
`pg_dump --data-only --table=pegawai` dari database dev lokal lalu
di-restore ke database VPS, BARU jalanin `seedUsers.ts` dan
`seedSimulasi.ts` seperti biasa (keduanya butuh baris Pegawai dengan NIP
asli sudah ada duluan). Kalau nanti pindah ke server lain lagi, ulangi pola
yang sama (dump+restore tabel `pegawai`) KECUALI sudah ada sumber data
pegawai yang lebih baru buat diimpor ulang via `importPegawaiXlsx.ts`.

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
