---
name: gajihub-presensi-epresensi
description: Use whenever touching presensi - sinkronisasi e-Presensi, EpresensiAdapter, presensiPdf / presensiPdfKeRekap, rekapAbsensiManual, rincianJamKerjaHarian, kendalaEpresensi, koreksi jam per hari, kalender hari libur, jam masuk/keluar yang mustahil, lupa absen, or the /tukin/presensi pages. Use before changing jam kerja, toleransi, ambang, or how a tap is trusted. Use when a potongan number disagrees with the web e-Presensi or with the petugas Excel.
---

# Gajihub - presensi & e-Presensi

> Diekstrak **verbatim** dari `CLAUDE.md` (baris 2094-2285, 2390-2667,
> 2896-3172, 3556-3782, 4643-4752) saat pemecahan skill 2026-08-31.

**Database e-Presensi & SIAP READ-ONLY tanpa kecuali** - semua query hanya
`SELECT`, dan menambah index BUKAN pilihan. Dari e-Presensi diambil **FAKTA**
(tanggal, status, jam), **TIDAK PERNAH angka potongannya**.

---

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

