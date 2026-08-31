---
name: gajihub-ui-konvensi
description: Use whenever touching the Gajihub UI - adding a table, a filter, a dropdown, a search box, pagination, a sidebar menu entry, a badge, a colour, or a page that defaults to a period. Covers the navy/biru palette and its contrast rules, sidebar tokens, table alignment (centre except col-nama), SearchableSelect, PencarianDebounce, Paginasi, periodeDefault, the notification panel, the login page, and BadgePejabatEselon. Use before adding any text-left / text-right / align-* to a data cell, before putting details inside a heading or p, and before running a build while dev is running.
---

# Gajihub - konvensi UI

> Diekstrak **verbatim** dari `CLAUDE.md` (baris 3783-3997, 4143-4276,
> 4385-4597) saat pemecahan skill 2026-08-31.

**Dua jebakan yang sudah menghasilkan error nyata**: `<details>` (BadgePejabat
Eselon) di dalam `<p>` atau heading melempar hydration error yang menunjuk ke
dalam komponennya, bukan ke tempat pemakaiannya; dan `npm run build` sambil
`npm run dev` jalan menghasilkan **404 pada route yang file-nya ada**.

---

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

