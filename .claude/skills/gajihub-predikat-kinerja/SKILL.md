---
name: gajihub-predikat-kinerja
description: Use whenever touching predikat kinerja - the bobot 70% of Tukin - including src/business-logic/rekapPredikatKinerja.ts, the /tukin/predikat-kinerja page, upload of the e-Kinerja BKN "Rekap Penilaian" file, manual tambah/ubah/hapus per orang, MANUAL_ENTRY / MANUAL_EDIT marking, unitPenilaian, or MockEKinerjaAdapter.importFromUploadedFile. Use before writing any predikat into the database.
---

# Gajihub - predikat kinerja (e-Kinerja BKN)

> Diekstrak **verbatim** dari `CLAUDE.md` (baris 3232-3436) saat pemecahan skill
> 2026-08-31.

**JANGAN PERNAH mengarang predikat kinerja di database produksi** - angka itu
menentukan 70% Tukin. `nilaiAngka` tidak pernah diterima dari form; selalu
diturunkan ulang lewat `konversiPredikatKeNilaiPersen` (Kepsekjen 82/2025).

---

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
upload ini bukan pintu belakang buat edit bebas, dan tiap upload menulis
`AuditTrail`. (Form ketik-manual per orang SEKARANG ADA, tapi lewat izin
yang berbeda dan tetap ber-scope unit - lihat "Kelola predikat kinerja per
orang" di bawah.)

**UI**: SATU halaman `/predikat-kinerja` dipakai KASUBAG_TU dan PPABP (pola
yang sama dengan `/pegawai` - bukan dua salinan). KASUBAG_TU dipaksa ke
unitnya di level QUERY dan filter satker-nya disembunyikan; PPABP/ADMIN
lintas satker. Halaman menampilkan sebaran predikat, tabel per periode, dan
**peringatan "Kalkulasi Tukin perlu dihitung ulang"**: pegawai yang
kalkulasi Tukin-nya sudah terlanjur dibuat SEBELUM predikat baru masuk.
Sengaja TIDAK menghitung ulang otomatis - recalculation mereset siklus
approval ke DRAFT (lihat catatan kalkulasi massal Kasubag TU di atas), jadi
keputusannya diserahkan ke user. File-nya sendiri TIDAK disimpan.

**Sumber penilaian menetap di halaman, bukan cuma di hasil upload**
(2026-08-20). Satu satuan kerja lazim dinilai BEBERAPA penilai dengan file
terpisah, dan yang mengupload bisa orang berbeda - data nyata Biro Keuangan
7/2026: `"Kasubbag TU"` 25 orang, `"Kepala Biro"` 21, plus 1 baris input
manual. Semuanya tersimpan berdampingan karena kunci baris adalah
**NIP + bulan + tahun**, bukan file dan bukan unit - jadi file kedua MENAMBAH,
tidak menimpa file pertama, dan urutan siapa mengupload duluan tidak
berpengaruh.

Yang dulu kurang cuma pelaporannya: daftar penilai yang sudah masuk HANYA
muncul di hasil upload (`KelengkapanPredikat`), jadi orang kedua yang membuka
halaman itu besoknya melihat "belum punya predikat 20" tanpa bisa tahu
sebabnya - file penilai lain belum diupload, atau orangnya yang memang belum
dinilai? Dua sebab, dua tindak lanjut. Sekarang barisnya ada tetap di kartu
periode, di bawah Sebaran.

- **Diturunkan dari `PredikatKinerja.unitPenilaian`** yang sudah lama
  tersimpan per baris - tidak ada kolom/migrasi baru.
- **SENGAJA tidak memakai `where` halaman** (yang ikut tersaring pencarian
  nama/NIP): pertanyaannya soal SELURUH unit, alasan yang sama dengan
  `jumlahSeUnitPeriode`. Diverifikasi: mencari "Irwan" tidak mengubah
  angkanya (25/21/1 tetap).
- **Butuh satuan kerja terpilih** - tanpa itu daftarnya jadi seluruh penilai
  se-kementerian. Barisnya tidak dirender sama sekali, dan pesan "Pilih
  satuan kerja di filter" yang sudah ada yang menjelaskan.
- **Baris ber-`unitPenilaian` NULL dipisah sebagai "Tanpa sumber tercatat",
  bukan dibuang** - itu predikat hasil ketik manual (`TambahPredikatForm`).
  Kalau disembunyikan, angka di daftar ini tidak menjumlah ke total unit, dan
  selisihnya jadi misteri. Diverifikasi 25 + 21 + 1 = 47 = jumlah baris unit
  itu.
- **Jumlah penilai BUKAN penentu lengkap/tidaknya** - berapa penilai yang
  seharusnya mengirim file berbeda tiap unit dan tidak dipunyai sistem. Yang
  menentukan tetap kolom "Belum punya predikat" di atasnya.

**Celah yang MASIH terbuka**: kalau NIP yang SAMA muncul di dua file dengan
predikat BERBEDA, yang terakhir diupload menang tanpa peringatan apa pun
(upsert). Ini satu-satunya jalur saling-timpa yang tersisa - sama mekanismenya
dengan duplikat dalam satu file yang sudah tercatat di bawah. TODO(confirm):
perlu diputuskan apakah predikat yang bentrok ditolak, atau ditulis dengan
peringatan eksplisit.

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

### Kelola predikat kinerja per orang (tambah / ubah / hapus)

Diminta user: "buat ruang dan tombol khusus untuk edit, hapus, tambah data,
karena kedepannya akan panjang" - supaya Kasubag TU bisa mengurus datanya
sendiri tanpa selalu bergantung file rekap yang utuh.

**TIDAK ADA invarian yang dicabut, dan ini perlu ditegaskan** karena
sekilas terlihat bertentangan. `canEditPresensiKinerjaLangsung` TETAP
`false` dan tidak dipakai di mana pun. Izin yang dipakai adalah
`canUploadRekapPredikatKinerja` - yang komposisinya sudah memuat
`canUploadKoreksiPredikatKinerjaUnit`, fungsi yang sejak awal dideskripsikan
sebagai "upload predikat kinerja **+ koreksi langsung di Gajihub kalau ada
yang salah**", dan disebut eksplisit di komentar
`canEditPresensiKinerjaLangsung` sebagai salah satu jalur koreksi yang SAH.
Yang dilarang itu edit BEBAS tanpa scope & tanpa jejak - bukan koreksi
ber-scope unit yang tercatat. Jadi yang selama ini belum ada cuma UI-nya.

`src/app/tukin/predikat-kinerja/actionsKelola.ts` (BARU) - tiga Server
Action dengan tiga pengaman yang membuatnya bisa dipertanggungjawabkan:

1. **Otorisasi per baris terhadap `Pegawai.satuanKerja` milik baris yang
   disentuh**, bukan terhadap filter yang sedang dibuka - `id` dari form
   tidak dipercaya. Kasubag TU tidak bisa menyentuh unit lain sekalipun
   id-nya ditebak/diedit di form.
2. **`nilaiAngka` TIDAK PERNAH diterima dari form** - selalu diturunkan
   ulang dari predikatnya lewat `konversiPredikatKeNilaiPersen` (Kepsekjen
   82/2025). Tanpa ini orang bisa mengirim predikat "Kurang" dengan nilai
   100% dan tukinnya ikut salah.
3. **Tiap perubahan menulis `AuditTrail` lengkap dengan nilai SEBELUM dan
   SESUDAH**, dan barisnya ditandai `sourceSystem = "Input manual Gajihub"`
   + `inputMethod = MANUAL_ENTRY|MANUAL_EDIT`. Angka hasil ketikan manusia
   TIDAK BISA menyamar sebagai angka resmi dari BKN - di tabel muncul chip
   merah/kuning "bukan dari BKN". Baris yang dihapus pun jejaknya tetap ada
   di `dataSebelum`, jadi bisa dipulihkan manual kalau keliru.

Tidak ada migrasi - `sourceSystem`/`inputMethod` sudah `String` bebas.

**UI** (`/tukin/predikat-kinerja`):
- Panel "Periode yang sudah ada datanya" naik dari satu baris teks jadi
  panel chip per periode (periode aktif disorot, jumlah pegawai ikut
  ditampilkan) - jumlah periode bertambah tiap bulan, jadi bentuk lamanya
  bakal jadi paragraf panjang tak terbaca.
- Panel konteks 4 tile: **Periode dibuka / Unit kerja / Pegawai
  berpredikat / Belum punya predikat** - menjawab "ini data bulan & unit
  apa" yang jadi keluhan awal.
- Kolom **Aksi** per baris: Ubah (form inline, pilih predikat + alasan) dan
  Hapus (konfirmasi dua langkah yang menyebut nama & periodenya - BUKAN
  `confirm()` bawaan browser yang tidak bisa menampilkan konteks). Baris di
  luar kewenangan menampilkan "Di luar kewenangan", tombolnya tidak
  dirender - dan action-nya tetap mengecek ulang sendiri.
- Form **Tambah predikat satuan**, dropdown-nya SENGAJA cuma berisi pegawai
  yang BELUM punya predikat di periode itu. Kalau semua pegawai ikut masuk,
  orang gampang memilih yang sudah ada lalu ditolak - lebih baik
  pilihannya memang tidak ada. Butuh satuan kerja terpilih dulu; tanpa itu
  daftarnya seluruh kementerian (±5.000) dan tidak praktis.

**Diverifikasi end-to-end** (production build, lewat halaman uji sementara
yang membungkus ketiga action sebagai form progressive-enhancement, lalu
dihapus): tambah -> 85% untuk "Perlu Perbaikan"; tambah ulang ditolak
("sudah punya predikat"); KASUBAG_TU Pusdatik ditolak di ketiga aksi untuk
pegawai Biro Keuangan; ubah ke predikat yang sama ditolak; predikat asing
("LUAR_BIASA") ditolak; ubah sah -> `KURANG`/60%/`MANUAL_EDIT`; hapus sah;
hapus baris yang sudah hilang ditolak dengan pesan jelas. AuditTrail
CREATE/UPDATE/DELETE tercatat lengkap. Angka di panel konteks diadu ke
database dan **cocok persis** (27 Biro Keuangan, 8 belum punya predikat).
**Semua mutasi uji SUDAH DI-REVERT** - `predikat_kinerja` kembali 29 baris,
nol baris bertanda input manual, 3 baris AuditTrail uji dihapus.

**Temuan sampingan**: ringkasan upload menghitung BARIS, bukan ORANG. File
"Rekap Penilaian (47).xlsx" melaporkan "Biro Keuangan: 29 pegawai" padahal
di database cuma **27 orang** - 2 baris di file itu duplikat persis
(KHARINA OLIVIA & WANTI LENA SARI, isinya identik) yang meng-upsert ke
kunci unik yang sama. Tidak ada data hilang, TAPI kalau suatu saat NIP yang
sama muncul dua kali dengan predikat BERBEDA, yang terakhir menang tanpa
peringatan. TODO(confirm): perlu diputuskan apakah duplikat dalam satu file
harus ditolak/diperingatkan.

