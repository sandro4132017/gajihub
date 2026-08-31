---
name: gajihub-uang-makan-lembur
description: Use whenever touching Uang Makan or Uang Lembur - src/business-logic/uangMakan.ts, uangLembur.ts, tarifSbm.ts, adkHarian.ts, rincianUangMakan.ts - or SBM 2026 / PMK 32 2025 tariffs, golongan-to-tariff mapping, siapa berhak (WFO / WFH / Diklat / Dinas Keluar), jam lembur hari kerja vs hari libur, the 2x multiplier, uang makan lembur and its 2-jam-berturut-turut condition, or the 40-jam monthly cap.
---

# Gajihub - uang makan & uang lembur (SBM 2026)

> Diekstrak **verbatim** dari `CLAUDE.md` (baris 1555-2093, 4753-4825) saat
> pemecahan skill 2026-08-31.

**Pengelompokan golongan uang makan dan uang lembur SENGAJA BEDA** (makan
menyatukan Gol I & II, lembur memisahkannya) - ada test khusus supaya tidak ada
yang "merapikan" jadi seragam. **Pengali 2x lembur hari libur dan batas 40 jam
BUKAN dari SBM** - dasarnya masih TODO(confirm).

---

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

