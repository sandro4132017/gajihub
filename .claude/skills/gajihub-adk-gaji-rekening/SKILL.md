---
name: gajihub-adk-gaji-rekening
description: Use whenever touching export ADK (Tukin, Uang Makan, Uang Lembur), src/business-logic/adk.ts, responseAdk.ts, the /ppabp/adk routes, gaji induk upload from GPP, RekeningPegawai and per-bank splitting, IdentitasWebGaji, basis data gaji, slip gaji, or strukturEselon. Use before changing a column, a rounding, a Nilai Bruto / Potongan / Bersih derivation, or anything that ends up in a file sent to Web Gaji or SAKTI.
---

# Gajihub - ADK, gaji induk, rekening & slip

> Diekstrak **verbatim** dari `CLAUDE.md` (baris 963-1173, 3437-3555,
> 4598-4642, 4883-4968) saat pemecahan skill 2026-08-31.

**Barisnya disusun SEKALI di `business-logic/adk.ts`**; format hanya membungkus.
Kalau baris data disusun dua kali di dua tempat, cepat atau lambat keduanya
berbeda - dan bedanya baru ketahuan setelah berkas salah terkirim ke Web Gaji.

**Rekening TUKIN dan GAJI beda bank** - 96 dari 96 NIP berbeda nomornya. Jangan
pernah menurunkan rekening tukin dari file gaji induk.

---

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

