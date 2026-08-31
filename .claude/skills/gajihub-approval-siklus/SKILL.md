---
name: gajihub-approval-siklus
description: Use whenever touching approval - the jenjang 1 / jenjang final flow, ApprovalLog, evaluasiApproval, ajukanApprovalTukin/UangMakan/UangLembur, the "Setujui semua" mass-approval button, or the "sudah APPROVED" gate on the Hitung sekarang button. Use before writing status APPROVED anywhere, before any recalculation that resets status to DRAFT, and when an export comes out empty because nothing is approved.
---

# Gajihub - approval & siklus perhitungan

> Diekstrak **verbatim** dari `CLAUDE.md` (baris 1174-1264) saat pemecahan skill
> 2026-08-31.

**Jangan pernah menulis `status = "APPROVED"` langsung ke tabel kalkulasi.** Tiap
baris harus lewat `ajukanApprovalTukin`/`UangMakan`/`UangLembur` yang sama dengan
tombol satuan, supaya urutan jenjang dan penolakan siklus basi tetap dievaluasi
engine yang sama.

**Menghitung ulang selalu me-reset ke DRAFT** dan memperbarui `calculatedAt`,
sehingga seluruh `ApprovalLog` sebelum waktu itu dianggap basi.

---

### Tombol "Setujui semua" (approval massal)

Ada di ketiga dashboard approver (`/tukin`, `/uang-makan`, `/uang-lembur`),
`src/app/actionsApprovalMassal.ts` + `ApprovalMassalForm.tsx`. Dibuat karena
satu periode bisa berisi ratusan baris x 2 jenjang, dan menyetujui satu per
satu membuat pengujian end-to-end (mis. memastikan export ADK ada isinya)
praktis mustahil.

**Yang membedakannya dari jalan pintas** - ini yang menentukan boleh/tidaknya
fitur seperti ini ada:
- **TIDAK** menulis `status = "APPROVED"` langsung ke tabel kalkulasi. Tiap
  baris tetap lewat `ajukanApprovalTukin`/`UangMakan`/`UangLembur` yang sama
  dengan tombol satuan, jadi urutan jenjang, penolakan siklus basi (log
  sebelum `calculatedAt`), dan pembaruan status tetap dievaluasi engine yang
  sama.
- **TIDAK** melewati otorisasi. Izin dicek **per baris** terhadap satuan kerja
  pegawainya - bukan sekali di awal - memakai `canApproveJenjang1` /
  `canApproveJenjangFinal`. Kasubag TU tetap cuma jenjang 1 di unitnya; baris
  di luar kewenangannya **dilewati dengan alasan yang ditampilkan**, bukan
  diloloskan. `?satker=` dari form tidak dipercaya untuk KASUBAG_TU.
- **TIDAK** memalsukan jejak. Tiap keputusan tetap satu baris `ApprovalLog`
  atas nama akun yang menekan tombol, bercatatan `"Approval massal"` - jadi
  bisa dibedakan dari approval yang benar-benar diperiksa satu per satu.
- Periode **wajib** sudah dipilih; tanpa `?bulan=&tahun=` tombolnya tidak
  muncul sama sekali (tanpa periode, "semua" berarti seluruh riwayat).
  PIMPINAN tidak pernah melihatnya (read-only).
- Konfirmasi dua langkah, bukan `confirm()` bawaan browser - dialog itu tidak
  bisa menampilkan berapa baris & periode mana, padahal justru itu yang perlu
  dibaca.

Satu akun bisa menuntaskan kedua jenjang hanya kalau memang berwenang di
keduanya (mis. ADMIN). Kasubag TU yang menekannya akan memajukan semua baris
ke jenjang 2 lalu berhenti, dan pesannya menyebutkan itu apa adanya.

**TODO(confirm)**: approval massal berarti approver menyetujui tanpa melihat
rincian tiap pegawai. Untuk pengujian wajar; untuk production perlu diputuskan
apakah tombol ini boleh ada, atau dibatasi ke lingkungan non-production.

### Gerbang "sudah disetujui" di tombol Hitung sekarang

Menutup TODO lama *"Kalkulasi massal Kasubag TU tidak punya pengaman sudah
APPROVED"*. Menghitung ulang selalu mengembalikan status ke `DRAFT` dan
memperbarui `calculatedAt`, sehingga seluruh `ApprovalLog` sebelum waktu itu
dianggap basi oleh `evaluasiApproval` - satu klik menghapus hasil approval satu
unit penuh.

**Bukan skenario teoretis.** Periode 7/2026 Biro Keuangan punya **278 baris
ApprovalLog** (139 jenjang 1 + 139 jenjang 2) untuk **47 pegawai** - siklusnya
terulang sekitar **tiga kali**, dan tiap kali export ADK-nya kosong lagi.
Terakhir: approval pukul 10.08.11, kalkulasi ulang pukul 10.08.33 - **22 detik**
kemudian.

Sekarang, kalau periode itu punya baris APPROVED, form menampilkan panel merah
berisi jumlahnya dan dua pilihan:
- **Lewati yang sudah disetujui** (bawaan) - hanya baris non-APPROVED yang
  dihitung, approval yang ada tetap utuh.
- **Hitung ulang semua** - baru muncul kotak konfirmasi yang menyebut jumlah
  approval yang akan dibatalkan. Dua langkah, pola sama dengan "Setujui semua".

**Bawaannya yang aman, bukan yang merusak** - dan hasilnya disebutkan apa
adanya di pesan sukses (`N pegawai yang sudah APPROVED DILEWATI` atau
`PERHATIAN: N approval DIBATALKAN`). Dicek ULANG di server (form bisa dikirim
siapa saja, dan jumlahnya bisa berubah antara halaman dirender dan tombol
ditekan) - pola sama dengan gerbang kelengkapan predikat yang sudah ada.

Diverifikasi lewat production build terhadap data nyata: panel muncul berbunyi
"1 pegawai periode Juli 2026 sudah APPROVED", radio `lewati` ber-`checked`, dan
kotak konfirmasi belum dirender selama pilihannya masih "lewati".

**"Nol dihitung" TIDAK LAGI tampil hijau.** Kalau seluruh baris dilewati karena
sudah APPROVED, pesannya dulu berbunyi *"Tukin terhitung untuk 0 pegawai... 47
pegawai yang sudah APPROVED DILEWATI"* — kalimat benar, warna salah: hijau
terbaca "beres" dan orang berhenti di situ. Terjadi betulan sesudah koreksi jam
Acep: tombolnya ditekan, ke-47 baris Biro Keuangan tetap basi, dan penanda
kuning di tabel dikira kerusakan. Sekarang keadaan itu memakai field terpisah
`peringatan` (panel kuning, BUKAN `success`) yang menyebut penyebabnya dan
langkah berikutnya. Syaratnya sempit — `dihitung === 0` DAN yang dilewati murni
karena APPROVED — supaya kasus "dilewati karena predikat belum ada" tetap
memakai jalur laporan yang sudah ada.

**TODO(confirm) - ADK Tukin TIDAK di-filter per satuan kerja.** Route-nya cuma
menyaring periode + `status: "APPROVED"` + `?bank=`, jadi satu berkas memuat
SEMUA unit yang barisnya sudah disetujui, dikelompokkan per bank saja. Sekarang
tidak kelihatan karena baru satu unit yang punya baris APPROVED. Kalau SAKTI SPP
ternyata butuh per satker DAN per bank, route ini perlu parameter satker
tambahan - perlu ditanyakan sebelum dipakai membayar lintas unit.

Diverifikasi lewat jalur kode yang sama (2 baris Tukin 7/2026): baris yang
sudah punya jenjang 1 dilanjutkan dari jenjang 2, baris kosong dijalankan
1 lalu 2, keduanya berakhir `APPROVED` dengan `ApprovalLog` lengkap.

