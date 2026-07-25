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
  disiplin, anggaran realisasi, bukti potong pajak, usulan perubahan role -
  lihat "Simulasi role matrix lengkap" di bawah untuk konteks penambahan
  model-model terakhir)
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
- Unit test lengkap untuk semua kalkulasi, job scheduler, approval, dan
  session login di atas (`npm test`)
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
- **PPABP per satker** - skema sudah siap (`User.satuanKerja` nullable),
  tapi keputusan buat benar-benar scale dari tim PPABP pusat ke PPABP per
  satker adalah keputusan kebijakan terpisah, jangan diasumsikan bakal
  terjadi otomatis.

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
| `KASUBAG_TU` | Privilege Pegawai + scope unit kerjanya: lihat semua pegawai unit, approval tahap 1 banding, tarik/upload manual data presensi (dasar bobot 30% Tukin), upload/koreksi predikat kinerja (bobot 70% Tukin), tombol "tarik ulang data" presensi (BUKAN auto-sync - koreksi sebenarnya terjadi di e-Presensi eksternal), "ajukan semua pegawai unit" buat kalkulasi Tukin massal + preview nominal, telaah & ajukan Uang Makan unit, telaah/koreksi/ajukan Uang Lembur unit, dashboard unit (total pegawai, total nominal, status siklus, jumlah tertolak/belum diajukan - filter periode), ajukan SK KGB (approval OSDMA), input SK Hukuman Disiplin (approval OSDMA - TODO(confirm) besar, lihat di bawah). |
| `OSDMA` | Privilege Pegawai + approval final banding & SK KGB, update SK pegawai baru dilantik/naik pangkat. |
| `PPABP` (Tim PPABP Rokeu) | Privilege Pegawai + tarik/upload manual presensi (fallback kalau Kasubag TU tidak bisa), telaah & validasi pengajuan Tukin/Uang Makan/Uang Lembur SEMUA unit, export ADK (3 jenis terpisah), upload Anggaran & Realisasi Belanja Pegawai, monitoring lintas unit + ubah status pengajuan, LIHAT & USULKAN perubahan role (eksekusi final di Admin), dashboard lintas unit (+ total Anggaran vs Realisasi). |
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
- **Slip gaji** - PEGAWAI TIDAK PUNYA sengaja model baru untuk ini,
  karena user eksplisit bilang formatnya "placeholder dulu, jangan
  didesain sebagai final" - akan dihitung on-the-fly dari
  TukinCalculation/UangMakan/UangLembur yang sudah ada begitu UI dibangun,
  BUKAN data tersimpan terpisah. Tunggu format detail dari user sebelum
  desain final (termasuk apakah perlu PDF generation, dst).
- **AnggaranRealisasi belum dipecah per jenis belanja** (Tukin/Uang
  Makan/Uang Lembur) - satu baris = total pagu/realisasi per satuan
  kerja+periode, karena kebutuhan dashboard saat ini cuma minta total.
  Kalau nanti butuh breakdown, itu perlu migrasi tambahan.
- **Usulan Perubahan Role** (model `UsulanPerubahanRole`, BUKAN nama yang
  diminta eksplisit user - dibuat buat mewadahi "PPABP usul, Admin
  eksekusi") - action/UI SUDAH ADA (langkah 4d PPABP mengusulkan, langkah
  4e Admin eksekusi/tolak). Bukan approval berjenjang seperti
  `ApprovalLog` - cuma usul (PPABP) lalu keputusan tunggal (Admin):
  eksekusi atau tolak. **Gap yang ketemu**: model ini TIDAK punya kolom
  `satuanKerja` - promosi ke `KASUBAG_TU` lewat alur ini mengubah
  `User.role` tapi TIDAK mengisi `User.satuanKerja` (tetap NULL sampai
  Admin mengisinya manual lewat halaman "Kelola Assignment Role" terpisah)
  - lihat detail di "Detail UI Admin (langkah 4e)" di atas.
- **Kalkulasi massal Kasubag TU tidak punya pengaman "sudah APPROVED"** -
  tombol "Hitung sekarang" (`src/app/kasubag/kalkulasi/`) akan mem-buka-
  lagi siklus approval pegawai yang datanya sudah disetujui penuh (reset
  ke DRAFT, sesuai konvensi recalculation yang sudah ada), tanpa
  konfirmasi/peringatan UI dulu. Perlu diputuskan apakah ini perilaku yang
  diinginkan (recalculation memang harus selalu buka ulang siklus) atau
  butuh guard tambahan (skip pegawai yang sudah APPROVED kecuali dipaksa)
  sebelum dipakai ke luar simulasi.

### Seed data simulasi

Dijalankan berurutan (`src/auth/seedUsers.ts` DULU, baru
`src/db/seedSimulasi.ts`):

```bash
npx tsx src/auth/seedUsers.ts
npx tsx src/db/seedSimulasi.ts
```

**PENTING**: NIP di seed ini adalah NIP ASLI dari data pegawai yang sudah
diimpor (`prisma.pegawai`, ±5.069 baris via `src/jobs/importPegawaiXlsx.ts`)
- BUKAN pegawai fiktif baru, supaya karakter simulasi punya data kepegawaian
konsisten dengan basis data yang sudah ada. Login pakai NIP sebagai
username SEKALIGUS password (sama seperti pola login lain di project ini).

13 akun lintas 6 role & 3 satuan kerja (+ 2 pimpinan lintas unit):

| NIP | Nama | Satuan kerja | Role | Skenario periode berjalan (7/2026) |
|---|---|---|---|---|
| 198703232015031002 | Alpha Sandro Adithyaswara | Biro Keuangan dan BMN | `ADMIN` | lancar |
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
4. **Cuti sakit karena gugur kandungan di atas 1 bulan** - Pasal 14 huruf e
   butuh perhitungan per hari (1%/hari), belum diimplementasi, masih
   default ke 100%.
5. **Akses API e-Kinerja BKN dan SAKTI** - masih informal (belum ada
   PKS/MoU). `MockEKinerjaAdapter` mensimulasikan alur upload manual file
   rekap dari portal BKN sesuai workaround yang sudah disepakati.
6. **Format file rekap predikat dari e-Kinerja BKN** - belum ada contoh
   filenya, jadi `importFromUploadedFile` di MockEKinerjaAdapter masih
   melempar error, belum ada parser.
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
