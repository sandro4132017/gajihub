---
name: gajihub-laws-of-ux
description: Use before adding or reshaping anything a person looks at in Gajihub - a page, a table, a sidebar entry, a form, a confirmation dialog, a warning, a status indicator, an empty state. Covers which Laws of UX bind in this project, the precedents already set in this codebase, the measured budgets (menu entries per role, table columns, response times), and - most importantly - the laws Gajihub deliberately BREAKS because payroll needs friction. Use when tempted to "simplify" a gate, a checklist, or a confirmation step. Use when a reviewer asks why a screen is shaped the way it is.
---

# Gajihub - Laws of UX

> Ditetapkan user 2026-09-28: *"aku mau website gajihub ini punya prinsip laws
> of ux"*.
>
> Acuan: https://lawsofux.com (Jon Yablonski) dan ringkasan berbahasa Indonesia
> yang disusun user di **`docs/Laws_of_UX_30_Prinsip_UI_UX.pdf`** - 30 prinsip
> plus daftar periksa review dan delapan prinsip yang ia sebut paling relevan
> untuk dashboard seperti Gajihub (Hick's, Proximity, Cognitive Load, Tesler,
> Selective Attention, Fitts, Jakob, Peak-End). Kedelapannya sudah dibahas di
> bawah dengan preseden kodenya masing-masing.
>
> **Catatan dari dokumen itu, dan penting**: tidak semuanya "hukum" dalam arti
> ilmiah. Ini kumpulan prinsip, efek, model, dan heuristik - panduan, bukan
> pembuktian. Jadi tidak ada yang otomatis menang atas kebutuhan audit.

**Dokumen ini BUKAN salinan situsnya.** Isinya tiga hal yang tidak bisa didapat
dari situs itu: hukum mana yang mengikat **di sistem penggajian**, preseden
nyata dari kode ini, dan hukum mana yang **sengaja dilanggar** beserta
alasannya.

**Yang paling sering salah dipakai**: "ikut Laws of UX" dijadikan alasan
menyederhanakan hal yang justru harus sulit. Baca bagian "Sengaja dilanggar"
SEBELUM mencabut langkah, gerbang, atau konfirmasi apa pun.

Hampir semua keputusan di bawah lahir dari masalah nyata, bukan dari membaca
daftar hukum. Jadi kalau ada perdebatan baru, **preseden di kode menang atas
kutipan dari situs**.

---

## 1. Hukum yang MENGIKAT, dan preseden kodenya

### Law of Common Region

Elemen yang berbagi satu batas terbaca sebagai satu kelompok.

**Preseden**: "Pemeriksaan sebelum kirim" dan "Kirim rekap ke PPABP" dilebur
jadi SATU kartu dua kolom (`kasubag/kalkulasi/page.tsx`, 2026-09-28). Alasan
user: *"kedua bagian itu sebenarnya satu alur: Periksa data -> semua
terverifikasi -> kirim rekap."* Sebagai dua kartu terpisah, syarat dan
akibatnya terbaca sebagai dua urusan berbeda - padahal kolom kanan TIDAK BISA
dipakai sampai kolom kiri selesai.

**Aturan**: kalau B mustahil dikerjakan sebelum A selesai, A dan B satu kartu.

### Law of Proximity

Yang berdekatan terbaca sebagai berhubungan.

**Preseden**: daftar periksa ditaruh tepat di atas tabel yang diperiksanya -
*"centang 'sudah saya periksa' yang jauh dari barang yang diperiksa adalah
centang yang diisi tanpa dibaca."*

**Aturan**: kontrol yang menyatakan sesuatu tentang data HARUS bersebelahan
dengan datanya. Jangan taruh di dialog, jangan taruh di puncak halaman.

### Von Restorff Effect

Yang berbeda dari sekitarnya paling diingat.

**Preseden**: `SinkronPegawaiForm` menyorot "Pindah unit" dan "Kelas jabatan"
walau nilainya nol - *"justru karena biasanya nol, angka bukan-nol di situ
harus langsung terlihat."*

**Bahayanya**: kalau SEMUANYA disorot, tidak ada yang tersorot. Lihat
"Hierarki empat lapis" di bawah.

### Serial Position Effect

Yang pertama dan terakhir paling diingat.

**Preseden**: keputusan user 2026-09-17 - *"pokoknya fitur atau monitoring yang
penting di atas, agar user tidak perlu scroll kalau itu hal penting"*. Di
`/ppabp/adk`, kartu hasil dipindah ke ATAS panel pemantauan.

**Aturan**: yang dikerjakan orang di halaman itu ditaruh di atas; yang cuma
dilihat sesekali ditaruh di bawah atau dilipat `<details>`.

### Doherty Threshold (< 400 ms)

Produktivitas melonjak kalau mesin dan orang tidak saling menunggu.

**Preseden**: `PencarianDebounce` menembak **400 ms** setelah berhenti
mengetik - angka yang persis disebut hukum ini. Tanpa jeda, mengetik "Kharina"
= 7 query ke tabel 5.000+ baris dan 6 hasilnya langsung dibuang.

**Aturan**: tiap input yang memicu query ke tabel besar WAJIB di-debounce.
Jangan turunkan di bawah 400 ms "supaya terasa cepat" - yang terjadi justru
server kebanjiran dan hasilnya datang lebih lambat.

### Zeigarnik Effect

Tugas yang belum selesai lebih diingat - dan perlu tempat untuk digantung.

**Preseden**: centang `VerifikasiTabelUnit` **DISIMPAN di database**, bukan
state klien. Alasannya ada di komponennya: *"memeriksa tiga tabel bukan
pekerjaan sekali duduk - orang membuka tabel Tukin hari ini, tabel lembur
besok. Centang yang hilang tiap halaman ditutup memaksa semuanya diperiksa
ulang dalam satu sesi, dan yang terjadi di lapangan bukan orang memeriksa
lebih teliti, melainkan orang mencentang tanpa membaca."*

**Aturan**: pekerjaan yang mungkin menyeberang hari HARUS punya penyimpanan.
Progres yang hilang saat tab ditutup melahirkan pengisian asal-asalan.

### Miller's Law (7 +/- 2)

Memori kerja cuma memuat sekitar tujuh hal.

**Preseden**: `TabelRincianUnit` dipangkas dari **38 kolom jadi 7** (permintaan
user 2026-09-06). Alasannya di komentar berkas: yang dikerjakan orang di
halaman itu adalah menyapu daftar mencari baris yang janggal, dan untuk itu
kolom yang lebih sedikit justru lebih cepat.

**Aturan**: tabel baru mulai dari <= 8 kolom. Lebih dari itu harus jadi mode
terpisah yang DIMINTA (`?rincian=1`), bukan bawaan.

### Chunking

Potongan informasi dikelompokkan jadi satuan yang bermakna.

**Preseden**: grup `anak` di sidebar ("Data Pokok", "Dokumen SK"); batang
sebaran kesiapan di `PanelKesiapan` yang menggantikan tiga angka lepas.

**Jebakan yang sudah kena**: batang bertumpuk hanya sah kalau potongannya
SALING LEPAS. Di `RingkasanKesiapan`, `jumlahPerluDiperiksa` sudah memuat
`jumlahTerhalang` - menumpuk keduanya apa adanya menghasilkan batang melebihi
100%. Partisi yang benar:
`lengkap + terhalang + (perluDiperiksa - terhalang) = diperiksa`.

### Goal-Gradient Effect

Dorongan menyelesaikan menguat makin dekat tujuan.

**Preseden**: bar progres presensi & predikat di dashboard unit; badge
"N belum diperiksa" -> "Semua diperiksa" di panel verifikasi.

### Postel's Law

Longgar saat menerima, ketat saat mengirim.

**Preseden**: `normalkanNip()` menerima NIP berspasi/titik/strip, TAPI menolak
NIP bertipe angka - `JSON.parse('{"nip": 197303072005011001}')` menghasilkan
`...000`, tiga digit terakhir sudah rusak sebelum kode mana pun melihatnya.

**Aturan**: longgar pada BENTUK, tidak pernah longgar pada KEBENARAN.

### Jakob's Law

Orang menghabiskan waktunya di situs lain, jadi mereka mengharapkan pola yang
sudah dikenal.

**Preseden**: seluruh keadaan halaman hidup di URL (`?bulan=`, `?hal=`, `?q=`)
supaya tombol Back dan berbagi tautan bekerja seperti yang orang harapkan;
`SearchableSelect` menyediakan `<select>` asli di dalam `<noscript>`.

### Tesler's Law (kekekalan kerumitan)

Tiap sistem punya kerumitan yang tidak bisa dihapus - hanya dipindahkan.

**Preseden**: koreksi jam lembur per TANGGAL. Bisa saja disederhanakan jadi
satu angka sebulan - dan memang pernah begitu - tapi ADK dibentuk dari rincian
HARIAN, jadi penyederhanaan itu memindahkan kerumitan ke tempat yang tidak
terlihat: total bulanan dan rincian harian jadi bisa berbeda tanpa ada yang
tahu. Kerumitannya dikembalikan ke layar, bukan dihapus.

**Aturan**: sebelum menyederhanakan, tanyakan *"kerumitan ini pindah ke mana?"*
Kalau jawabannya "ke tempat yang tidak dilihat siapa pun", itu bukan
penyederhanaan.

**Rumusan yang lebih tajam** (dari `docs/Laws_of_UX_30_Prinsip_UI_UX.pdf`):
*"Tangani kompleksitas sebanyak mungkin di SISTEM, bukan memindahkannya ke
PENGGUNA."* Di Gajihub artinya: kalau sebuah angka bisa dihitung mesin, jangan
minta orang menghitungnya sendiri. Contoh benar - `perluHitungUlang()`
menyimpulkan sendiri bahwa angka sudah basi; orang tidak disuruh membandingkan
cap waktu presensi dengan cap waktu kalkulasi.

### Aesthetic-Usability Effect

Yang terlihat rapi dianggap lebih mudah dipakai.

**Di sini ini PEDANG BERMATA DUA.** Tampilan rapi membuat orang lebih percaya
pada angkanya dan lebih malas memeriksa. Untuk sistem yang membayar 5.000
orang itu risiko - dan itulah sebabnya gerbang verifikasi dipertahankan justru
sambil tampilannya dirapikan.

### Cognitive Load

Beban mental yang dibutuhkan untuk memahami dan memakai layar.

**Preseden - menghapus yang benar**: rincian "per unit penilai" (Kepala Biro /
Kasubbag TU / sumber tidak tercatat) SENGAJA tidak ditampilkan di
`/kasubag/kalkulasi`, atas permintaan user dua kali. Alasannya di komentar
kode: *"Yang perlu diketahui Kasubag TU cuma BERAPA yang sudah punya predikat,
bukan siapa penilainya."*

Pola yang sama: kolom "Jam Lembur" dicabut dari tabel Rincian Tukin karena
sudah ada tabel lembur tersendiri; kolom "Rincian harian" dicabut dari tabel
Jam Lembur karena panel "beda dari total" sudah menjawab pertanyaannya.

**Aturan**: tiap kolom/angka/keterangan harus menjawab pertanyaan yang
BENAR-BENAR ditanya orang di halaman itu. Kalau jawabannya "supaya lengkap",
itu beban, bukan informasi.

### Selective Attention

Orang cuma memperhatikan sebagian kecil dari yang ada di layar.

**Preseden**: penanda ketidakcocokan ditaruh sebagai kartu DI ATAS tabel, bukan
sebagai tanda kecil di dalam barisnya - *"ini yang paling mahal kalau terlewat,
dan yang paling gampang tidak terlihat kalau cuma berupa tanda kecil di baris
ke-40."*

**Aturan**: temuan yang mahal kalau terlewat tidak boleh cuma hidup sebagai
penanda di dalam baris. Ringkasnya naik ke atas tabel.

### Fitts's Law

Waktu meraih target ditentukan ukuran dan jaraknya.

**Preseden**: tombol "Kirim & kunci" dan tombol matinya dibuat `w-full` supaya
posisinya sama di kedua keadaan dan targetnya selebar kolom.

**Aturan**: aksi utama satu kartu dibuat selebar kartunya. Jangan pakai
`btn-sm` untuk aksi yang mengunci data atau mengirim ke PPABP - ukuran kecil
untuk aksi kecil.

### Peak-End Rule

Orang menilai pengalaman dari puncaknya dan dari bagaimana ia berakhir.

**Preseden**: `Modal.tsx` menolak menampilkan hasil pengiriman sebagai baris
teks kecil - *"Pemberitahuan berhasil/gagal yang cuma muncul sebagai sebaris
teks kecil gampang terlewat... hasilnya harus menghentikan pandangan, bukan
menyelinap."*

**Aturan**: tiap proses berat - kalkulasi massal, sinkronisasi pegawai, export
ADK, kirim ke PPABP - WAJIB berakhir dengan pemberitahuan yang menyebut
ANGKANYA ("5.063 pegawai tersimpan, 21 pindah unit"), bukan cuma "berhasil".
Akhir yang kabur membuat seluruh prosesnya terasa tidak bisa dipercaya.

---

## 2. Hukum yang SENGAJA DILANGGAR

**Bagian terpenting di dokumen ini.** Tanpa bagian ini, "ikut Laws of UX"
berubah jadi alasan mencabut pengaman.

### Occam's Razor & Hick's Law - DILANGGAR di alur kirim

Gerbang kirim ke PPABP menambah langkah: empat tabel harus dicentang, plus
pernyataan, plus dialog konfirmasi. Secara hukum UX murni ini kelebihan
gesekan.

**Tetap dipertahankan**, karena pengiriman **mengunci periode** dan angkanya
langsung jadi berkas ADK yang dibayarkan. Yang bisa membuka kuncinya hanya
PPABP. Gesekan di sini lebih murah daripada koreksi sesudah uang keluar.

> **Jangan cabut centang, pernyataan, atau dialog konfirmasi dengan alasan
> "terlalu banyak langkah".** Kalau ada permintaan begitu, eskalasikan ke user
> dengan menyebut akibatnya - jangan kerjakan sendiri.

### Paradox of the Active User - DILANGGAR sebagian

Orang tidak membaca manual. Tapi beberapa layar Gajihub TETAP memuat penjelasan
panjang (panel aturan lembur, banner TODO(confirm) SK Hukuman Disiplin).

**Alasannya**: yang dijelaskan bukan cara memakai aplikasi, melainkan **dasar
hukum angkanya**. Itu harus bisa ditunjukkan ke Itjen/auditor. Peredamnya:
dilipat `<details>`, bukan dihapus.

### Flow - DILANGGAR dengan sengaja di titik tak-bisa-dibatalkan

Dialog konfirmasi memutus alur. Itu memang tujuannya. `Modal.tsx` menyebutnya
sendiri: hasil pengiriman *"harus menghentikan pandangan, bukan menyelinap."*

---

## 3. Anggaran terukur - dipakai memutuskan, bukan hiasan

### Entri menu per role (diukur 2026-09-28)

| Menu | Entri |
|---|---|
| `MENU_PPABP` | **14** |
| `MENU_KASUBAG` | **11** |
| `MENU_OSDMA` | 6 |
| `MENU_ADMIN` | 6 |
| `MENU_PIMPINAN` | 2 |
| `MENU_PEGAWAI` | 1 |

**PPABP 14 dan Kasubag TU 11 sudah di atas 7+/-2.** Peredamnya grup `anak`
yang bisa dilipat.

> **Sebelum menambah entri menu**: kalau menu role itu sudah >= 10, jangan
> tambah entri datar - masukkan ke grup `anak` yang sudah ada, atau buat grup
> baru. Menambah entri ke-15 di PPABP tanpa mengelompokkan = melanggar.

### Jumlah `<th>` per berkas (diukur 2026-09-28)

| Berkas | `<th>` |
|---|---|
| `kasubag/kalkulasi/page.tsx` (beberapa tabel) | 54 |
| `RekonsiliasiForm` | 13 |
| `TabelRincianJamKerja` | 12 |
| `tukin/presensi/page.tsx` | 11 |
| `TabelRincianUnit` | 8 |

### Ambang lain

| Hal | Ambang | Sumber |
|---|---|---|
| Debounce pencarian | 400 ms | `PencarianDebounce` |
| Baris per halaman | 10 (bawaan) | `Paginasi` |
| Kolom tabel baru | <= 8 | preseden `TabelRincianUnit` |
| Dropdown > ~15 pilihan | wajib `SearchableSelect` | 82 satuan kerja |

---

## 4. Hierarki empat lapis - satu kartu, empat bobot

Ditetapkan user 2026-09-28: *"kalau semuanya diberi kotak/penekanan, hierarki
visualnya jadi datar."*

| Lapis | Bentuk | Contoh |
|---|---|---|
| **Informasi** | strip beraksen kiri, latar netral | Catatan pengembalian PPABP |
| **Warning** | strip beraksen kiri berwarna | "Pengiriman mengunci periode ini" |
| **Status** | teks kecil + ikon, tanpa kotak | "Semua pemeriksaan selesai" |
| **Action** | SATU kotak bergaris penuh | Blok pernyataan + tombol |

**Aturan**: dalam satu kolom/kartu, **paling banyak SATU** blok berkotak penuh,
dan itu milik aksinya. Sisanya turun jadi strip atau teks.

---

## 5. Sepuluh pertanyaan untuk MEREVIEW layar yang sudah ada

Diambil dari `docs/Laws_of_UX_30_Prinsip_UI_UX.pdf` (ringkasan yang disusun
user). Bedanya dengan daftar di bawah: yang ini dipakai saat **menilai layar
yang sudah jadi**, yang di bawah saat **menambah sesuatu yang baru**.

| # | Pertanyaan | Hukumnya |
|---|---|---|
| 1 | Apakah user diberi terlalu banyak pilihan sekaligus? | Choice Overload / Hick's |
| 2 | Informasi dan aksi yang berhubungan diletakkan berdekatan? | Proximity |
| 3 | Terlihat jelas mana yang satu kelompok? | Common Region / Similarity |
| 4 | User langsung tahu mana yang paling penting? | Selective Attention / Von Restorff |
| 5 | User harus mengingat/menghitung sendiri terlalu banyak? | Cognitive Load / Tesler |
| 6 | Pola interaksinya sesuai yang sudah dikenal user? | Jakob / Mental Model |
| 7 | Tombol penting mudah ditemukan dan diklik? | Fitts |
| 8 | Sesudah user melakukan sesuatu, sistem menjelaskan apa yang terjadi? | Peak-End / Doherty |
| 9 | Detail hanya muncul saat dibutuhkan? | Progressive disclosure |
| 10 | Komponen berfungsi sama terlihat & berperilaku sama? | Similarity / Uniform Connectedness |

**Nomor 5 dan 8 yang paling sering gagal di Gajihub**, karena keduanya menuntut
sistem mengerjakan sesuatu - bukan sekadar menata ulang tampilan.

---

## 6. Daftar periksa sebelum menambah sesuatu

**Halaman baru**
- [ ] Yang dikerjakan orang ada di atas? (Serial Position)
- [ ] Periode bawaannya melewati bulan berjalan? (`periodeDefault`)
- [ ] Keadaannya di URL, bukan state klien? (Jakob)

**Tabel baru**
- [ ] <= 8 kolom? Kalau tidak, jadikan mode `?rincian=1`
- [ ] Kolom nama bertanda `col-nama` (th DAN td)?
- [ ] Keadaan kosongnya menyebut SEBAB, bukan cuma "tidak ada data"?

**Entri menu baru**
- [ ] Menu role itu sudah >= 10 entri? Masukkan ke grup, jangan datar
- [ ] Ikonnya berbeda dari tetangganya? (Von Restorff - ikon yang sama di dua
      entri tidak membedakan apa pun)

**Peringatan / penanda baru**
- [ ] Di kartu itu sudah ada berapa blok berkotak? Lebih dari satu = turunkan
- [ ] Warnanya punya ARTI, atau cuma hiasan? Warna semantik jangan dipakai
      untuk dekorasi
- [ ] Ada penanda selain warna (ikon/teks)?

**Diagram / batang bertumpuk baru**
- [ ] Potongannya saling lepas, dan jumlahnya persis 100%?
- [ ] Angka mutlaknya ikut tampil, bukan cuma lebar batangnya?

**Mencabut langkah / gerbang / konfirmasi**
- [ ] Apakah langkah itu menahan sesuatu yang TIDAK BISA dibatalkan?
- [ ] Kalau ya - **jangan cabut, eskalasikan ke user** dengan menyebut
      akibatnya

---

## Font & tipografi

Dimuat `next/font` di `layout.tsx` (di-host sendiri), BUKAN `@import` ke
`fonts.googleapis.com`. Sebabnya bukan kecepatan: VPS Gajihub cuma terjangkau
lewat jaringan kantor/VPN, jadi browser yang tidak tembus internet jatuh
DIAM-DIAM ke Segoe UI tanpa tanda apa pun.

**Angka SELALU `font-mono`.** Lebar angka pada font teks tidak seragam, jadi
kolom rupiah dan NIP bergoyang antar baris - persis kolom yang gunanya
dibandingkan sekilas dari atas ke bawah.

Riwayat pilihan font: Plus Jakarta Sans -> Poppins -> Public Sans -> **Manrope**
(2026-09-28, semuanya dalam satu hari atas permintaan user). Gilroy DITOLAK:
font komersial berbayar, sementara repo ini publik.
