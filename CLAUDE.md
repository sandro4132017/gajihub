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
  akun approver, user/role, sanggahan, bukti pendukung upload)
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
- Fitur "user & role" (skema `User`/`Role`/`Sanggahan`/`BuktiPendukungUpload`,
  authorization layer `src/auth/permissions.ts`, guard di semua dashboard +
  approval action, dan dashboard self-service PEGAWAI di `src/app/saya/`) -
  ketiga langkahnya SUDAH SELESAI. Lihat "Role matrix" di bawah untuk detail
  & sisa open item per role (upload bukti pendukung, alur verifikasi
  sanggahan, dst - masih menunggu keputusan kebijakan eksternal).

## Role matrix (fitur user & role - in progress)

7 role yang perlu didukung sistem ini (enum `Role` di schema). Progress:
skema SUDAH ada, authorization layer (`src/auth/permissions.ts` atau serupa)
dan koneksi ke dashboard BELUM dikerjakan - jangan asumsikan otorisasi
sudah berjalan cuma karena modelnya ada.

| Role | Cakupan akses | Catatan |
|---|---|---|
| `PEGAWAI` | Data diri sendiri saja (presensi, predikat kinerja, estimasi pendapatan, histori pembayaran). Bisa ajukan sanggahan + upload bukti pendukung, lihat status sanggahan sendiri. TIDAK BOLEH lihat pegawai lain atau edit data presensi/kinerja langsung. | ±5.000 user, self-service |
| `KASUBAG_TU` | Rekap seluruh pegawai DI SATUAN KERJANYA SAJA (scoping lewat `User.satuanKerja`). Verifikasi sanggahan masuk dari unitnya, approval jenjang 1. Monitor status rekonsiliasi unitnya. TIDAK BOLEH approval final atau lihat unit lain. | Verifikator tingkat satker |
| `PPABP` | Approval jenjang final lintas satker, handle SELISIH, generate ADK Web Gaji/SAKTI, lihat rekonsiliasi lintas satker dalam kewenangannya. TIDAK BOLEH ubah data mentah presensi/kinerja. | Asumsi pilot: 1 PPABP pusat (`User.satuanKerja` = NULL). Skema sudah siap di-scale ke PPABP per satker tanpa migrasi (tinggal isi `satuanKerja`) - TAPI ini keputusan kebijakan yang belum diambil. |
| `BIRO_OSDMA` | Review & approve perubahan data master pegawai yang disengketakan, monitor kepatuhan penggunaan data, lihat log akses (pola, bukan data personal). TIDAK BOLEH approval pembayaran. | Data steward |
| `ADMIN_SISTEM` | Kelola assignment role user, monitor kesehatan sistem, konfigurasi adapter. SENGAJA TIDAK BOLEH lihat/ubah data substantif payroll - pemisahan kewenangan teknis vs bisnis, JANGAN dilonggarkan waktu bangun authorization layer. | Pusdatik/TA IT |
| `ITJEN` | Read-only ke seluruh audit trail, approval log, histori sanggahan. Export laporan. TIDAK BOLEH approve/edit/hapus apapun. | Auditor |
| `PIMPINAN` | Dashboard ringkasan tingkat kementerian (status siklus, jumlah sanggahan terbuka, anomali besar). | Executive dashboard |

### Open items khusus fitur ini (selain yang sudah tercantum di daftar utama di bawah)

- **User vs AkunApprover** - dua model akun berjalan paralel sekarang
  (`AkunApprover` buat login approver Tukin yang sudah ada, `User` buat
  role/otorisasi yang baru). BELUM diputuskan cara menyatukannya. Jangan
  kembangkan keduanya sebagai sistem independen permanen.
- **Auto-mapping jabatan→role** - BELUM diputuskan apakah role di-assign
  otomatis dari jabatan/eselon di SIAP atau manual oleh Admin Sistem.
  Sekarang manual/seed dulu (lihat `TODO(legal-confirm)` di model `User`).
- **Alur verifikasi sanggahan** - berapa tahap (cukup Kasubag TU, atau wajib
  diteruskan ke OSDMA untuk kasus data kepegawaian) belum ditentukan. Model
  `Sanggahan` didesain generik (reuse `ApprovalLog` buat histori verifikasi)
  supaya mendukung berapa pun tahap, tapi alurnya belum di-hardcode di mana
  pun - jangan asumsikan cuma 1 tahap.
- **SLA batas waktu sanggahan** - field `Sanggahan.batasWaktuVerifikasi` dan
  `ReconciliationStatus.windowVerifikasiBerakhir` sudah ada, durasinya belum
  diisi dari konstanta resmi manapun.
- ~~Sanggahan ↔ ReconciliationStatus belum tersambung~~ **RESOLVED** -
  `ajukanSanggahanAction` (`src/app/saya/actions.ts`) sekarang upsert
  `ReconciliationStatus.status` jadi `"SANGGAH"` untuk pegawai+periode yang
  sama, dalam satu `$transaction` bareng pembuatan baris `Sanggahan`-nya.
  Upsert (bukan update) karena belum ada job/service lain yang bikin baris
  `ReconciliationStatus` duluan (belum ada proses rekonsiliasi otomatis di
  sistem ini) - diverifikasi manual: 2 sanggahan beda referensi
  (Tukin & Uang Makan) buat pegawai+periode yang sama menghasilkan SATU
  baris `ReconciliationStatus` (bukan duplikat), status `SANGGAH`. Durasi
  `windowVerifikasiBerakhir` dan aturan hold-pembayaran-vs-koreksi-siklus
  TETAP belum diisi - itu masih TODO(confirm) kebijakan terpisah (lihat
  item SLA di atas).
- **Mekanisme penyimpanan file bukti pendukung** - `BuktiPendukungUpload.
  fileUrl` cuma referensi string generik, belum ada implementasi storage
  (local disk vs object storage) ataupun kebijakan retensi dokumen.
- **PPABP per satker** - skema sudah siap (`User.satuanKerja` nullable),
  tapi keputusan buat benar-benar scale dari 1 PPABP pusat ke banyak PPABP
  per satker adalah keputusan kebijakan terpisah, jangan diasumsikan bakal
  terjadi otomatis.

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

### Fitur user & role (in progress, 3 langkah, jangan sekaligus)

Lihat "Role matrix" di atas untuk detail 7 role dan open items-nya.
Urutan yang sedang dikerjakan:

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
