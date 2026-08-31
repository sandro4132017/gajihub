---
name: gajihub-orientasi
description: Use at the START of any Gajihub session and whenever unfamiliar with this project - it carries the project context, the architecture, what already exists in the codebase, the open items that are still blocked on outside parties, and the code-comment conventions. Use before assuming a feature is missing or already done, before answering "apakah X sudah ada", when asked what is left to build, when about to write a code comment, and when about to make a claim about project status.
---

# Gajihub - orientasi & status

> Isi di bawah ini diekstrak **verbatim** dari `CLAUDE.md` (baris 3-13, 43-104,
> 3998-4107, 4826-4870, 5077-5189) saat pemecahan skill 2026-08-31. Tidak ada
> kalimat yang diubah.

**JANGAN percaya angka status di bawah tanpa memeriksanya.** Yang sudah terbukti
basi per 2026-08-31: klaim "`npm test` - 256 test" dan "total 557" - keduanya
sebenarnya **581**. Jalankan `npm test` sendiri sebelum mengutip angkanya.

---

## Baca ini dulu: PROGRESS.md

`PROGRESS.md` di root repo adalah catatan status ringkas buat orientasi cepat
di awal chat: posisi terakhir (commit/test/deploy), daftar **keputusan yang
masih menunggu user**, dokumen/akses yang ditunggu dari pihak luar, alur data
siapa-upload-apa, akun demo, dan jebakan teknis yang sudah pernah menggigit.

CLAUDE.md (file ini) tetap sumber utama soal keputusan desain & detail per
fitur - PROGRESS.md cuma pintu masuknya. **Perbarui PROGRESS.md tiap selesai
satu batch pekerjaan, sebelum ganti chat.**

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

## Komentar dirapikan sebelum pemeriksaan keamanan (2026-08-21)

Komentar NARATIF - yang menceritakan sejarah percobaan ("sempat dipasang lalu
dicabut", tabel hasil uji berbaris-baris, riwayat bug) - dipadatkan jadi
pernyataan aturannya saja. **20 berkas**, 7.459 -> 6.990 baris komentar; blok
>= 12 baris turun dari 158 (3.551 baris) jadi jauh lebih sedikit.

**YANG SENGAJA TIDAK DISENTUH**, karena "Konvensi kode" di bawah mewajibkannya:
- **336 rujukan `Pasal N`** - itu jejak yang menjawab "atas dasar apa angka ini
  segini" kalau ditanya Itjen/auditor.
- **98 penanda `TODO(confirm)` / `TODO(legal-confirm)`** - asumsi yang belum
  dikonfirmasi tetap harus kelihatan.
- **Peringatan "JANGAN ..."** yang menahan bug agar tidak dipasang lagi (mis.
  "TIDAK ADA JEDA SEBELUM LEMBUR", "JANGAN menambah/membuang nol di depan",
  "JANGAN mengalirkan angka dari modul ini ke tukin.ts"). Beberapa di antaranya
  menahan kekeliruan yang PERNAH benar-benar terjadi.

Yang berkurang dari hitungan hanyalah pengulangan dalam berkas yang sama dan
penyebutan TODO yang sudah RESOLVED (mis. "dulu TODO(confirm) jam kerja - kini
Pasal 9"). Tidak ada satu pun pertanyaan terbuka yang hilang; ini diperiksa
per berkas dengan membandingkan ke `HEAD` sebelum commit.

**Kalau menulis komentar baru**: sebutkan ATURAN dan DASARNYA, bukan riwayat
bagaimana aturan itu ditemukan. Riwayatnya tempatnya di CLAUDE.md ini.

**EMPAT KLAIM BASI ketemu saat merapikan ini** - dan itu temuan yang lebih
berharga daripada perapiannya sendiri. Komentar yang isinya sudah tidak benar
lebih berbahaya daripada tidak ada komentar: orang berikutnya percaya, lalu
mencari-cari kenapa fitur yang "belum ada" ternyata dipakai orang.

| Tempat | Klaim basi |
|---|---|
| `tukin/presensi/page.tsx` | "sinkronisasi e-Presensi (belum tersambung)" - panel itu chip hijau **Tersambung** sejak akses database didapat |
| `kasubag/kalkulasi/actions.ts` | "selama e-Presensi belum tersambung, praktis yang dipakai rekap manual" - sinkronisasi mengisi KEDUA tabel |
| `tukin/presensi/UploadPresensiForm.tsx` | **TEKS DI LAYAR**: "Dipakai selama e-Presensi belum tersambung" - yang terbaca pengguna, dan salah |
| `saya/actions.ts` | "verifikasi berjenjang belum ada action-nya" - `verifikasiBandingJenjang1Action` & `approveBandingFinalAction` sudah lama ada |

Keempatnya sudah diperbaiki. Yang ketiga paling parah karena bukan komentar -
itu kalimat yang dibaca petugas di halaman upload, dan mengarahkannya memakai
jalur cadangan seolah jalur utama belum tersedia.

**Kalau nanti sebuah fitur berpindah dari "belum" jadi "sudah"**, grep dulu
frasa itu di seluruh `src/` sebelum menutup pekerjaan - komentar & teks layar
yang menyebut keadaan lama tidak ikut berubah sendiri.

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
