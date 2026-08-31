---
name: gajihub-tukin-potongan
description: Use whenever touching Tunjangan Kinerja - src/business-logic/tukin.ts, tarifTukinPokok.ts, kelasJabatanEfektif.ts, pejabatPimpinanTinggi.ts, konversiPredikat.ts - or anything citing Pasal 4, 5, 9, 11-17 Permenaker 15/2024. Use for potongan kehadiran, bobot 30/70, cuti overrides, penurunan kelas jabatan karena hukuman disiplin, pengecualian JPT Eselon I/II, and tugas belajar. Use before changing any percentage, tariff, or rounding that reaches money.
---

# Gajihub - Tukin & potongan (Permenaker 15/2024)

> Diekstrak **verbatim** dari `CLAUDE.md` (baris 1265-1554, 2286-2389,
> 2668-2895, 4108-4142) saat pemecahan skill 2026-08-31.

**Kalau kode dan `docs/permenaker-15-2024-tunjangan-kinerja.md` berbeda, yang
benar DOKUMEN ITU** - perbaiki kodenya, jangan menyesuaikan kutipannya supaya
cocok.

---

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

## Teks peraturan: `docs/permenaker-15-2024-tunjangan-kinerja.md`

Salinan teks Permenaker 15/2024 ada di `docs/`. **TAPI `docs/` DIABAIKAN git**
(`.gitignore` baris 9) - nol berkas di sana yang ter-track, jadi clone baru
TIDAK akan memilikinya sama sekali dan setiap rujukan "lihat docs/..." di kode
maupun skill akan menggantung. Salin manual kalau pindah mesin.
**Kalau kode dan file itu
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

