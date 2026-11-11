# Progress & Status Gajihub

Catatan status ringkas untuk **orientasi cepat waktu pindah chat**. Ini BUKAN
pengganti `CLAUDE.md` - dokumen itu tetap sumber utama soal keputusan desain,
alasan, dan detail teknis per fitur. Yang ada di sini cuma: posisi sekarang,
apa yang menunggu keputusan, dan apa yang ditunggu dari pihak luar.

**Cara pakai**: baca file ini dulu, lalu masuk ke bagian `CLAUDE.md` yang
relevan (nama bagiannya disebut di tabel di bawah). Update file ini tiap
selesai satu batch pekerjaan, sebelum ganti chat.

Terakhir diperbarui: **2026-11-11** - sesi berbatas & role bawaan login (migrasi `user_sesi_versi` belum dijalankan, lihat butir 0000), lalu koreksi jam presensi dipersempit ke Kasubag TU (migrasi belum dijalankan, lihat butir 000), lalu rincian lengkap PPABP di `/tukin` (2026-11-11, belum di-commit), lalu rangkuman commit `64d9a46`..`9e3886e`, plus perbaikan pentest Pusdatik (2026-11-06, lihat bagian 3 butir 20)
(2026-10-21 s.d. 2026-10-29), plus akun penguji Tim Pusdatik dan penghapusan login
NIP (2026-11-05, lihat bagian 3 butir 15). Detail per perubahan ada di `docs/ai-log.md`.

0000. **Sesi berbatas, role bawaan login, role Pegawai wajib (2026-11-11, belum di-commit, MIGRASI BELUM DIJALANKAN)**:
   - Sesi: menganggur 30 menit (sliding, env `SESI_MENGANGGUR_MENIT`) dan mutlak 8 jam sejak login.
     Token format lama DITOLAK, jadi semua pengguna login ulang sekali setelah deploy. Logout, nonaktif
     akun, dan "Putus semua sesi" (Admin) memutus semua perangkat. Detail: `gajihub-akses-sso-deploy`.
   - Role bawaan saat login: PIMPINAN > KASUBAG_TU > PPABP > OSDMA > PEGAWAI > ADMIN atas gabungan role
     utama + tambahan. Role Utama dipilih manual Admin dan TIDAK menentukan login. Detail:
     `gajihub-role-otorisasi`.
   - Role PEGAWAI wajib untuk akun ber-NIP di Pegawai (`src/auth/rolePegawaiWajib.ts`). Uji kering lokal:
     4 dari 5.075 akun. Job `npm run lengkapi:role-pegawai` (uji kering bawaan; `-- --terapkan` menulis).
   - Verifikasi (dilaporkan user, belum diulang pencatat): review LULUS (2 putaran); typecheck dan 2.285
     test lulus; check-sensitive 71 temuan lama. Production build belum dijalankan.
   - **Langkah deploy** (dijalankan user sendiri, bukan AI, di luar jam kerja):
     - Lokal: hentikan `npm run dev`, lalu `npx prisma migrate deploy && npx prisma generate`, lalu
       `npm run lengkapi:role-pegawai` (uji kering), lalu `npm run lengkapi:role-pegawai -- --terapkan`,
       lalu `npm run dev`.
     - VPS: `git pull && npx prisma migrate deploy && npx prisma generate && npm run build && pm2 restart gajihub`,
       lalu job yang sama (uji kering, lalu `-- --terapkan`). `prisma generate` ditambahkan karena script
       `build` tidak menjalankannya (hanya `postinstall`); tanpa itu client Prisma tidak mengenal `sesiVersi`.
     - Migrasi `20261111140000_user_sesi_versi` hanya menambah kolom `sesi_versi` (DEFAULT 0). Jangan
       `migrate reset` atau `db push`.
     - Job role Pegawai TIDAK menaikkan sesiVersi: pengguna yang sedang login melihat role baru setelah
       masuk ulang.
   - **Open items** (kode belum diubah):
     - Saran review yang belum dikerjakan: test `x-pathname` palsu ke rute lain; selaraskan pengecualian
       `/tte/verify` (tanpa garis miring) di middleware dengan `src/auth/halamanPublik.ts`; GET
       `/api/auth/keluar` bisa dipakai logout-CSRF ringan (dampak gangguan saja).

000. **Koreksi jam presensi dipersempit (2026-11-11, belum di-commit, MIGRASI BELUM DIJALANKAN)**:
   - Hanya KASUBAG_TU unit pegawai yang bisa mengoreksi jam (`canKoreksiJamPresensi`,
     tanpa bypass ADMIN, tanpa hibah). PPABP dan ADMIN tetap bisa melihat koreksi dan
     buktinya. Gerbang "tanggal harus ditandai kendala" DICABUT; penggantinya bukti wajib
     (JPG/PNG/PDF, maks 2 MB) bila jam masuk/pulang disentuh, disimpan privat, alasan
     minimal 15 karakter, dan ditolak bila rekap unit sudah TERKIRIM. Detail:
     `gajihub-presensi-epresensi`, `gajihub-role-otorisasi`.
   - Verifikasi: review LULUS; typecheck dan 2.175 test lulus; check-sensitive 71 temuan
     lama. Production build belum dijalankan.
   - **Langkah deploy** (dijalankan user sendiri, bukan AI):
     - Lokal: hentikan `npm run dev` dulu, lalu `npx prisma migrate deploy && npx prisma generate`.
     - VPS, sebelum build: cek `npx prisma migrate status`, lalu
       `git pull && npm ci && npx prisma migrate deploy && npx prisma generate && npm run build && pm2 restart gajihub`.
     - Migrasi `20261111120000_koreksi_presensi_bukti_ref` hanya menambah kolom `bukti_ref`
       (nullable), tanpa backfill. Jangan pakai `migrate reset` atau `db push`.
     - Folder `storage/uploads/bukti-koreksi/` dibuat saat bukti pertama disimpan; ikut dibackup bersama `storage/`.
   - **Open items** (kode belum diubah):
     - Koreksi lembur di Kalkulasi menulis langsung ke `PresensiHarian.jamLembur`, jadi bisa
       hilang pada tarikan sync berikutnya.
     - Saran review yang belum dikerjakan: try/catch saat tulis berkas (berkas yatim),
       `Number("")` untuk jam lembur, mengosongkan jam saat edit, test hapus ADMIN/PPABP,
       dan validasi tanggal masa depan.
     - Risiko yang diterima user: unit tanpa akun Kasubag TU tidak bisa dikoreksi sama sekali.

00. **Pop up rincian cuti di `/tukin/presensi` (2026-11-11, belum di-commit)**:
   - Angka kolom Cuti bisa diklik -> pop up "Rincian cuti {nama} - {periode}"
     (jenis | hari | tanggal) dari `namaSistemKerja` e-Presensi. Sel tetap angka.
     Perhitungan Tukin tidak berubah. Detail: `gajihub-presensi-epresensi`.
   - Temuan baca ulang Permenaker 15/2024 (Pasal 14 & 17) ikut dicatat di bagian
     2b butir 4-5. Kode BELUM diubah.

0a. **Rincian lengkap PPABP di `/tukin` (2026-11-11, belum di-commit)**:
   - PPABP memilih satu satker, lalu "Lihat rincian lengkap" (`?rincian=1`)
     menampilkan tabel 38 kolom yang sama dengan Kalkulasi Unit Kasubag TU.
     Hanya unit yang sudah mengirim rekap. "Tampilkan ringkas" kembali ke 7 kolom
     (bawaan).
   - Tabel pindah ke `src/components/tables/TabelRincianTukinLengkap.tsx` (dipakai
     dua halaman; ubah di satu tempat). Detail: `gajihub-role-otorisasi`.
   - `/tukin/presensi/[nip]` dengan `dari=tukin` punya tombol kembali ke rincian.

0. **Panel selesai Kasubag (2026-11-09, belum di-commit)**:
   - `/kasubag`: setelah rekap TERKIRIM dan semua komponen lengkap, kolom kanan
     menampilkan "Data semua komponen sudah lengkap." + ilustrasi karakter
     (`public/ilustrasi/`, sesuai jenis kelamin sesi, bawaan laki-laki; hidden di
     bawah lg). Opsi A dipilih user (kalimat saja).
   - Kolom kiri: periode jadi pil, progress bar disembunyikan saat terkirim.
   - Helper `jenisKelaminTampil` (`src/lib/format/jenisKelamin.ts`) dipakai `/saya`
     dan kartu Kasubag. Tanpa migrasi (hanya komentar `prisma/schema.prisma`).

1. **Dashboard dirombak**:
   - `/kasubag`: kartu sambutan dan stepper tutup bulan lima langkah, yang
     statusnya dihitung dari data (`langkahTutupBulan.ts`, `kalkulasiBasi.ts`),
     ditambah kolom "Perlu perhatian".
   - `/ppabp` & `/pimpinan`: empat pie komposisi pegawai dan tabel monitoring
     satker. Kartu "Status Dokumen & Anggaran" dicabut, dan "Data yang
     Menghalangi Pembayaran" sekarang tampil sebagai bar horizontal.
   - Monitoring Banding memuat **keputusan pembayaran** per pegawai-periode
     (`putuskanPembayaranAction`, lengkap dengan audit trail).
     `/ppabp/rekonsiliasi` lama masih ada sampai "Tahap 3".
2. **Berkas privat**: unggahan TTE & bukti dukung pindah dari `public/uploads/`
   ke `storage/uploads/`, dan hanya bisa diunduh lewat `/berkas/*` yang
   berizin (`src/lib/storage/`). Belum tercakup: `BuktiPotongPajak.fileUrl`
   dan `SkKgb.fileUrl`. **`storage/` wajib ikut dibackup.** Urutan deploy ada
   di `docs/ai-log.md` (job `pindah:unggahan`: `--dry-run`, lalu `--terapkan`).
3. **Jenis pegawai (PNS/PPPK) diambil dari SIAP** (`STATUSPEGAWAIID`), bukan
   dari Excel. Dipakai untuk memisah ADK PNS/P3K dan untuk pie komposisi.
   Rekening GAJI ditahan (`REKENING_GAJI_DITERIMA = false`).
4. **TTE**: halaman verifikasi dokumen beserta unduhan berkasnya
   (`/tte/verify/[id]`), validasi naskah, dan hash berkas
   (`isi:hash-tte`).
5. **Perapian struktur**: komponen lintas-role pindah ke `src/components/`,
   format tampilan ke `src/lib/format/`. **`src/approval/` dihapus**, karena
   alurnya sudah diganti "kirim rekap ke PPABP" (lihat
   `gajihub-approval-siklus`).
6. **Mode jaringan internal/publik** (`src/auth/modeJaringan.ts`,
   `asalTepercaya.ts`), gelar pegawai, dan font yang di-host sendiri di
   `public/fonts/` (tidak lagi lewat `next/font`).
7. **Alat kerja agent**: skill desain pihak ketiga, agent `planner` /
   `implementer` / `reviewer` / `archivist`, `tools/verify.mjs`, dan
   `tools/check-sensitive.mjs`.

Sebelumnya, **2026-10-19** - kalkulasi massal Tukin dialihkan ke JSON API,
supaya respons Server Action tidak gagal di balik proxy:

1. **Integrasi TTE BSrE BSSN (Esign Client Service v2.2.2)**:
   - Terhubung langsung ke Esign Client (`192.168.221.11`).
   - Kepatuhan 11 Kriteria Integrasi BSrE: Passphrase HANYA di memori saat fetch (zero persistence, `autocomplete="off"`, Kriteria V & VIII), audit log kegagalan resmi di `log_gagal_tte` (Kriteria IX), dan footer resmi BSrE pada PDF SPTJM (Kriteria XI).
   - Pengujian end-to-end penandatanganan dan verifikasi berhasil (status VALID, signer Hantek Production).
   - Model database: `DokumenTte` dan `LogGagalTte`.
2. **Koreksi Jam Lembur Harian & Tracker Banding**:
   - Koreksi jam lembur harian Kasubag TU dengan validasi bilangan bulat 0-24 jam & alasan minimal 10 karakter (SPL).
   - Tracker status banding kehadiran dan format cetak lembur Excel.
3. **Agent OS Bootstrap & Penguatan Keamanan**:
   - 4 Global skills (`task-graph`, `autonomous-decision`, `self-improve`, `hygiene-sweep`) terhubung via junction di `$HOME\.claude\skills`.
   - Skill baru: `gajihub-tte-bsre` untuk panduan integrasi dan kepatuhan TTE.
   - Hook `stop.mjs` diperkuat dengan deteksi kebocoran kredensial BSrE (`ESIGN_API_PASS`), private key sertifikat, dan passphrase.
   - Batch keamanan 2026-10-12: 23 test terarah lulus dan `npm run typecheck` lulus.
4. **Tindak lanjut laporan WAS**:
   - `SESSION_SECRET` tidak lagi memakai fallback; token sesi gagal diterbitkan/diverifikasi jika secret kosong atau kurang dari 32 byte.
   - Token CSRF statis yang tidak diverifikasi di form login dihapus; perlindungan Server Action tetap mengandalkan pemeriksaan Origin bawaan Next.js.
   - Header keamanan dari laporan sudah diterapkan di source; retest pada deployment/proxy publik masih diperlukan.
5. **Kalkulasi massal Tukin**:
   - Form `/kasubag/kalkulasi` memakai `POST /api/kasubag/kalkulasi` agar tidak bergantung pada transport Server Action yang bermasalah di balik proxy.
   - Pemeriksaan sesi, role, satker, dan penguncian periode tetap dilakukan oleh aksi server yang sama. Perubahan ini baru di source; verifikasi pada deployment masih menunggu.

Sebelumnya, **2026-08-12** - **kendala e-Presensi**. Ketahuan waktu
menelusuri kenapa satu pegawai punya "lupa absen" di Gajihub tapi tidak di
rincian manual PPABP: **15 & 16 Juli 2026 web e-Presensi bermasalah**, dan
karena absensi Kemnaker murni online (tidak ada mesin tap) **960 pegawai
kena potongan Rp 18.178.588** untuk kerusakan yang bukan miliknya. Sekarang
ada penanda tanggal kendala (Pasal 10 ayat (2)) + deteksi otomatis di
`/tukin/presensi/kendala`: satu keputusan menggantikan ~960 koreksi manual,
dan yang tidak sempat melapor ikut terkoreksi. **99,2% dari kasus itu
sebenarnya tidak perlu bukti foto** - absen masuk paginya sudah tercatat
normal. Tanggalnya **sengaja belum ditandai**, menunggu konfirmasi ke
pengelola e-Presensi. Ditambah **koreksi jam per hari** untuk petugas absensi
(alurnya: pegawai lapor via WhatsApp dengan foto bergeotag & jam -> petugas
memperbaiki di `/tukin/presensi/[nip]`) - hanya boleh di tanggal yang sudah
ditandai kendala, jadi larangan "edit presensi bebas" tetap utuh. Test 411 ->
438.

Sebelumnya, **2026-08-07 (batch 2)** - teks Pasal 9, 12, 13 diterima
dari user. **Tiga TODO(confirm) tertutup sekaligus** (jam kerja 7,5 jam, jam
07:30-16:00/16:30, dan toleransi 60 menit - semuanya ternyata tertulis di
Pasal 9). Kolom **"kekurangan jam kerja" DICABUT** (ayat (3) cuma menyebut
tiga pelanggaran). **Lupa absen sekarang otomatis** dari kolom `menit_kerja`
e-Presensi - cocok 41/48 dengan rincian manual, naik dari 34/48. Diklat &
Dinas Keluar dikecualikan dari potongan itu. Tabel Rincian Tukin dapat
**paginasi** (default 10, bisa 20/50/100). **BUG BESAR DIPERBAIKI**: cuti
tahunan 1 hari menghapus SELURUH potongan Pasal 13 sebulan - 16 dari 46
pegawai Biro Keuangan kena, Rp 634.959 dalam satu unit. Test 318 -> 334.

Sebelumnya, **2026-08-07 (batch 1)** - **jenis cuti & potongan Pasal 14 sekarang
ditarik OTOMATIS dari e-Presensi**, termasuk "bulan ke berapa" yang selama ini
dikira mustahil diturunkan dan harus diketik manual (ternyata ada di nama
jenisnya: "Cuti Besar II", "Cuti Sakit Bulan III"). SIAP sudah dicek dan
TIDAK bisa dipakai untuk cuti - modulnya mati sejak 2019. Ada jebakan baru
yang butuh keputusan user: cuti SATU HARI bisa menghapus tukin sebulan penuh
(lihat bagian 3 nomor 0). Test 300 -> 318.

Sebelumnya, **2026-08-05** - dua hal besar: (1) ternyata proyek ini
selama beberapa waktu menarik data dari **instance SIAP yang SALAH** (dua
instance, database bernama sama, tidak ada error sama sekali) - setelah pindah,
pegawai aktif 3.607 -> **5.077** dan pemetaan presensi membaik dari 67% jadi
98%; (2) pegawai pensiun/berhenti sekarang **DITANDAI, tidak dihapus**, dan
`statusPegawai` akhirnya benar-benar dipakai menyaring. Plus kelola predikat
kinerja per orang (tambah/ubah/hapus).

---

## 1. Posisi sekarang

Angka di bawah diukur **2026-10-29**. Tiap baris menyebut perintah untuk
memeriksanya ulang - jangan dikutip tanpa menjalankan perintahnya dulu.

| | | Cek ulang |
|---|---|---|
| Commit terakhir di `main` | `9e3886e` (2026-10-29) | `git log -1 --format='%h %ad' --date=short` |
| Test | **3.016** lolos, 2 di-skip (178 file) | `npm test` |
| Typecheck | lulus | `npm run typecheck` |
| Migrasi | **42** total, terakhir `20261027120000_jenis_pegawai_dari_siap` | `ls prisma/migrations \| grep -c '^2'` |
| Model Prisma | **33** | `grep -c '^model ' prisma/schema.prisma` |
| Belum di-commit | tidak ada (bersih) | `git status --porcelain` |
| Deploy | VPS kantor `192.168.221.44:3002` via pm2 (`gajihub`), nginx -> `gajihub.rokeubmn.id` (HTTP) | `pm2 list` di VPS |
| Repo | https://github.com/sandro4132017/gajihub | - |

**Status migrasi di VPS TIDAK diketahui dari sini.** Sejak 2026-09-22 ada
tujuh migrasi baru (`20260922120000_*` sampai `20261027120000_*`). Cek dengan
`npx prisma migrate status` di VPS sebelum deploy berikutnya.

> **`npm ci` WAJIB sebelum build di VPS**, karena dependensi bisa berubah
> antar-commit. Font (Manrope, JetBrains Mono) sudah di-host sendiri di
> `public/fonts/`, jadi build tidak lagi butuh internet untuk font.

> **`docs/` ada di `.gitignore`.** Teks peraturan yang menjadi acuan kode
> hanya ada di checkout utama `D:\Sakeh\Project\gajihub`. Worktree dan clone
> baru TIDAK memilikinya.

**Kebiasaan kerja yang berlaku**: git dipegang user (lihat "Mode operasi" di
`CLAUDE.md`). Sebelum menyatakan selesai, jalankan `node tools/verify.mjs`.
Deploy di VPS: `git pull && npm ci && npx prisma migrate deploy && npm run
build && pm2 restart gajihub`. Server itu SHARED - jangan ganggu `bot-siska`
(port 3000) dan `meeting-room-display-api` (port 3001).

---

## 2. Yang sudah jalan (dan di mana baca detailnya)

| Fitur | Bagian di `CLAUDE.md` |
|---|---|
| **Import pegawai LANGSUNG dari database SIAP** (instance `MSSQLDEV`) | "Sambungan langsung ke SIAP & e-Presensi", "Instance SIAP yang benar" |
| **Pegawai pensiun/berhenti ditandai, tidak dihapus** + `statusPegawai` dipakai menyaring | "Pegawai yang pensiun/berhenti: DITANDAI, tidak pernah dihapus" |
| **Tarik presensi LANGSUNG dari database e-Presensi** (tombol sinkronisasi SUDAH aktif) | idem |
| Kalkulasi Tukin 30/70 + potongan Pasal 13/14 | "Kalkulasi Tukin satu pintu + perbaikan logika potongan" |
| Dashboard Tukin satu pintu (presensi + kinerja + kalkulasi) | idem |
| Upload rekap presensi manual + tombol sinkronisasi e-Presensi | idem |
| **Upload PDF presensi e-Presensi (1 file / 1 folder)** | "Upload PDF presensi e-Presensi" |
| **Jenis cuti + "bulan ke berapa" ditarik otomatis dari e-Presensi (Pasal 14 jalan sendiri)** | "Jenis cuti & potongan Pasal 14 ditarik otomatis dari e-Presensi" |
| **Lupa absen otomatis dari `menit_kerja` e-Presensi** | "Lupa absen diturunkan dari `menit_kerja` e-Presensi" |
| **Jam kerja & toleransi 60 menit punya dasar hukum (Pasal 9)** | "Pasal 9 & 13 diterima teksnya" |
| **Paginasi tabel (10/20/50/100)** | "Paginasi tabel" |
| Upload rekap predikat kinerja e-Kinerja BKN | "Upload rekap predikat kinerja e-Kinerja BKN" |
| **Kelola predikat kinerja per orang (tambah/ubah/hapus) + filter periode & unit** | "Kelola predikat kinerja per orang" |
| Uang makan & uang lembur per SBM 2026 | "Uang makan & uang lembur mengikuti SBM 2026" |
| Lembur hari libur 2x + WFH/WFA tidak dapat lembur | idem |
| Gaji induk (upload ADK GPP) + slip gaji format asli | "Riwayat gaji pegawai (gaji induk) & slip gaji format asli" |
| Rekening pegawai per jenis + ADK dipisah per bank | "Rekening pegawai & pemisahan ADK per bank" |
| Export ADK dua format (Excel & TXT) | "Export ADK dua format" |
| 6 role + multi-role + ganti sudut pandang | "Simulasi role matrix lengkap", "Multi-role per akun" |
| Data Pegawai, banding, SK KGB, SK hukdis, anggaran, usulan role | "Simulasi role matrix lengkap" |

---

## 2b. Yang ditunggu dari OSDMA / Biro Hukum / Biro Keuangan

Semuanya sudah dikumpulkan jadi satu dokumen siap kirim:
**`docs/permintaan-data-dan-konfirmasi-osdma.md`**.

Tiga yang paling menahan pekerjaan:

1. **Status CPNS/PNS terkini** — flag di SIAP BASI (660 dari 670 "CPNS"
   diangkat Mei 2025). Pasal 16 ayat (1) tidak bisa dijalankan sampai ada
   sumber yang benar. JANGAN pakai flag SIAP.
2. **Cuti beberapa hari yang memotong sebulan penuh** — 3 pegawai Juli 2026
   punya cuti berpotongan 100% sebanyak SATU HARI.
3. **Peraturan tata cara lembur & potongan hukuman disiplin** — dua dokumen
   yang belum ada sama sekali, keduanya mengubah uang.
4. **Pasal 14: cuti dihitung proporsional ke masa cuti atau sebulan penuh?**
   (BARU, 2026-11-11, OPEN ITEM - kode BELUM diubah). Kalimat pembuka Pasal 14
   ("Tunjangan Kinerja selama menjalani Cuti dibayarkan...") mendukung
   pembacaan proporsional; kasus Deddy (cuti besar bulan ke-2, 9 hari) jadi
   contoh. Ini bertentangan dengan butir 0 di bagian 3 dan klaim "tidak ada
   pembagian proporsional" di `gajihub-tukin-potongan`. Menunggu keputusan
   **tertulis Biro Hukum**.
5. **Pasal 17: tambahan Tukin Plt/Plh (20% atau selisih)** (BARU, 2026-11-11).
   Belum diimplementasi sama sekali; ayat (3) pembayaran tertunda satu bulan.
   Menunggu **konfirmasi OSDMA/Biro Hukum** atas dasar dan besarannya.

---

## 2c. Periode yang rekapnya masih memakai tarikan lama (2026-08-10)

Rekap presensi ditarik beberapa kali, dan tarikan lama dilakukan SEBELUM kolom
cuti ada / sebelum jenis cuti bisa dibaca. Akibatnya beda per periode:

| Periode | Rekap ditarik | Jenis cuti | Layak dipakai? |
|---|---|---|---|
| 7/2026 | **10 Agu (ulang)** | 1.935 | **ya** |
| 5/2026 | **10 Agu (ulang)** | 1.686 | **ya** |
| 1,2,3,4,6,8/2026 | 5 Agu | 0 | tidak - belum mendesak |

Mei & Juli sudah ditarik ulang 10 Agu, jadi keduanya memuat jenis cuti (Pasal
14 jalan) DAN perbaikan Diklat/Dinas Keluar akhir pekan. Hasilnya terverifikasi:
Alpha Sandro Diklat **14 -> 13** (cocok rincian manual), dan rekap dengan hari
hadir melebihi hari kerja **295 -> 0**.

Periode 1,2,3,4,6,8 sengaja dibiarkan - belum ada predikat kinerja, jadi belum
bisa dihitung sama sekali. Tarik ulang kalau nanti diperlukan.

**SISA LANGKAH USER**: hitung ulang Kalkulasi Unit **Mei & Juli** lewat
`/kasubag/kalkulasi` - baris Tukin keduanya masih memakai rekap sebelum tarikan
ini. Semua baris berstatus DRAFT (nol approval), jadi tidak ada siklus yang
hilang saat dihitung ulang.

### ADK Uang Lembur: formatnya sudah benar, ISINYA yang belum ada

Format export uang makan & uang lembur sudah diganti mengikuti template asli
(daftar per hari, tanpa rupiah) - detail di `CLAUDE.md`, bagian "ADK Uang
Makan & Uang Lembur". Uang makan terbukti cocok **415 dari 415** entri
terhadap file asli.

Uang lembur beda ceritanya. Gajihub cuma mengenali lembur dari baris berstatus
"Lembur" di e-Presensi, dan di hari kerja status itu hampir tidak pernah
dipakai - pegawainya tercatat WFO lalu pulang malam. Juni 2026 se-kementerian
cuma **21 baris lembur hari kerja**; file ADK asli satu unit saja memuat
**109**.

**Perlu diputuskan**: Gajihub menerima upload/entri **surat perintah lembur**
(satu-satunya sumber sah), atau ADK lembur tetap diisi manual di luar sistem.
**JANGAN menurunkannya dari jam pulang** - di unit yang sama 46 dari 48
pegawai punya hari dengan jam keluar lewat 17:00 (367 hari), sementara yang
benar-benar diajukan 35 orang / 111 hari.

### Roster = unit HARI INI, bukan unit periode itu

`Pegawai.satuanKerja` cuma menyimpan unit sekarang - tidak ada riwayat unit.
Jadi periode yang dihitung SETELAH seseorang mutasi ikut pindah ke unit baru,
walau orangnya bekerja sebulan penuh di unit lama.

Sudah terjadi: **ERIYANI**  punya rekap presensi Juli
DAN predikat Juli (diupload sebagai "Subbagian Tata Usaha"), tapi tidak punya
kalkulasi Tukin Juli - SK `1/1779/KP.11.00/VII/2026` TMT **1 Agustus 2026**
memindahkannya dari Biro Keuangan dan BMN ke Pusat Pasar Kerja, dan import
pegawai jalan 5 Agustus. Inilah sebabnya Juli Biro Keuangan **46 baris, bukan
47**.

Skalanya terukur: **11 pegawai pindah Eselon II dengan TMT >= 1 Juli 2026**
(3 di antaranya TMT 1 Agustus). Bukan 65 - sisanya naik jabatan di dalam
Eselon II yang sama.

**Belum diputuskan & JANGAN diputuskan sendiri**: Tukin Juli orang yang pindah
1 Agustus ditagihkan ke unit LAMA (yang Kasubag TU-nya memverifikasi presensi &
predikatnya, dan pagunya di situ) atau unit BARU (yang membayarkan di Agustus)?
Ini menentukan unit mana yang approve dan pagu siapa yang terpakai.

**Tidak ada yang hilang, jadi tidak perlu buru-buru membangun riwayat unit**:
SIAP menyimpan `RIWAYATJABATAN` lengkap dengan TMT selamanya, jadi "siapa di
unit mana pada bulan X" selalu bisa direkonstruksi kapan pun. Putuskan
kebijakannya dulu, baru implementasi sekali.

**Tambahan dari audit ulang seluruh jalurnya (2026-09-09)** - dikerjakan
NANTI, sesudah kebijakannya diputuskan. Tidak ada yang mendesak di sini;
dicatat supaya tidak ditemukan ulang dari nol:

1. **Kalau kebijakannya "tetap di unit lama", ini bukan tambalan satu query.**
   Tidak satu pun dari `TukinCalculation`, `RekapPresensiPeriode`,
   `PredikatKinerja`, `UangMakan`, dan `UangLembur` menyimpan satuan kerja -
   semuanya disaring lewat relasi `pegawai: { satuanKerja }` yang HIDUP, di
   **41 tempat**. Artinya butuh kolom snapshot (diisi saat kalkulasi, lalu
   dibekukan) + migrasi pengisian baris lama. Sekali kerja, tapi menyentuh
   angka yang muncul di laporan unit dan di ADK.

2. **`PengirimanUnit` setengah beku - periksa ini waktu implementasi.**
   `jumlahPegawai`/`jumlahKalkulasi` memang sengaja dibekukan saat Kirim
   (komentarnya ada di `schema.prisma`), TAPI daftar barisnya tetap
   diturunkan dari satker hidup. Sesudah ada yang mutasi, ringkasan
   "48 terkirim" bisa tidak cocok dengan isi tabel di bawahnya.

3. **Akun login TIDAK ikut mutasi, dan ini yang paling cepat menggigit.**
   `User.satuanKerja` terpisah dari `Pegawai.satuanKerja` dan tidak pernah
   disentuh `sync:pegawai`. Pegawainya sudah pindah keesokan pagi (cron
   `scripts/sync-harian.sh`, 02.00), akunnya tidak - Kasubag TU yang mutasi
   tetap melihat unit LAMA sampai Admin mengubahnya di
   `/admin/role-assignment`. Belum ada peringatan apa pun di layar waktu
   kedua kolom itu tidak lagi sama. Ini BISA dikerjakan lebih dulu dan
   terpisah dari keputusan kebijakan di atas - sifatnya cuma menandai, tidak
   menyentuh angka pembayaran.

4. **Status `MUTASI` tidak pernah dipakai.** Skema menyebutnya sebagai contoh
   nilai `statusPegawai`, tapi terhitung 2026-09-09 isinya: AKTIF 5.072,
   PENSIUN 212, BERHENTI 17, NONAKTIF 1 - **MUTASI nol**. Mutasi tidak
   mengubah status, cuma satuan kerjanya. Jangan bangun logika yang menunggu
   status itu muncul.

---

## 3. MENUNGGU KEPUTUSAN USER

Ini yang paling gampang hilang waktu pindah chat. Semuanya sudah pernah
disampaikan, belum dijawab. Tidak ada yang memblokir pekerjaan lain - tapi
beberapa **mengubah angka yang dibayarkan**, jadi jangan diputuskan sendiri.

### Mengubah uang

0. **Cuti beberapa hari yang memotong tukin SEBULAN PENUH** (BARU, 2026-08-07,
   paling mendesak di daftar ini). Pasal 14 memberi satu persentase per
   PERIODE, tidak ada pembagian proporsional harian. Sejak jenis cuti ditarik
   otomatis dari e-Presensi, Juli 2026 memunculkan **3 pegawai dengan cuti
   berpotongan 100% sebanyak SATU HARI** (2 CLTN, 1 cuti sakit >3 bulan) -
   aturannya menghapus tukin mereka sebulan. Sekarang cuma ditandai
   `PERIKSA MANUAL` di anomali, angkanya tetap dipotong penuh. Perlu keputusan:
   proporsional harian, ambang minimal hari, atau memang begitu aturannya.
   Lihat `src/business-logic/tukin.ts` + open item #3 di `CLAUDE.md`.

0b. **Cuti di Luar Tanggungan Negara dipotong 100%** - jenis ini TIDAK disebut
   Pasal 14. Dasarnya PP 11/2017 Pasal 312-313 + `cuti.nilai_persen` = 100 di
   e-Presensi. Kena 4 pegawai di Juli 2026. Engine selalu menandainya anomali.
   Perlu penegasan Biro OSDMA/Hukum.

1. **Pembulatan rupiah** - kalkulasi tukin menghasilkan pecahan (pernah
   ketemu total `Rp 95.443.018,725`). Sekarang dibulatkan **hanya di lapisan
   export ADK**, jadi angka di database, slip gaji, dan ADK belum persis sama.
   Pilihannya: bulatkan juga saat kalkulasi (berarti mengubah angka yang sudah
   di-approve) atau biarkan seperti sekarang.
   Lihat `src/business-logic/adk.ts`.

2. **Uang makan untuk IZIN / SAKIT / CUTI / Tugas Belajar** - belum ditegaskan.
   Sekarang semuanya TIDAK dibayar (karena bukan WFO/WFH/WFA).
   Lihat `src/business-logic/uangMakan.ts`.

3. **Uang makan lembur di hari libur** - ikut dikali 2 atau tidak? Sekarang
   TIDAK (`PENGALI_MAKAN_LEMBUR_HARI_LIBUR = 1`), alasannya penggantian
   konsumsi dan SBM sendiri membatasi "paling banyak 1 kali per hari". Kalau
   keliru, cukup ubah satu konstanta.
   Lihat `src/business-logic/tarifSbm.ts`.

4. **Potongan tidak ikut upacara: per kejadian atau sekali per periode?**
   Teks Pasal 13 ayat (4) TIDAK memuat frasa "setiap kali" (beda dengan ayat
   (2) yang eksplisit). Sekarang dibuat per-kejadian mengikuti tabel yang
   diberikan user. **Perlu ditegaskan ke Biro Hukum.**

### Baru - dari upload PDF presensi e-Presensi

5. **Potongan hasil Gajihub akan LEBIH BESAR dari yang tertera di PDF.**
   Bukan bug, tapi angkanya perlu disadari sebelum dipakai bayar. Dari 3 file
   presensi asli ada **238 kedatangan lewat 07:30 yang tidak diberi catatan
   keterlambatan sama sekali** oleh e-Presensi (termasuk yang telat 84 menit),
   sementara yang telat 1 menit justru dicatat. Gajihub menghitung semuanya
   sesuai Pasal 13 ayat (3), tanpa toleransi. Kalau ternyata ada kebijakan
   toleransi resmi, ubah `toleransiTerlambatMenit` di
   `src/business-logic/presensiPdfKeRekap.ts`.

6. **WFH/WFA kena potongan terlambat & pulang cepat - benar?** Sekarang IYA,
   alasannya Permenaker tidak membedakan tempat kerja. Dinas Keluar, Diklat,
   dan Lembur dikecualikan. Data uji tidak bisa memutuskan (e-Presensi sendiri
   tidak konsisten). Kalau WFH/WFA mau dikecualikan, hapus dari
   `KATEGORI_WAJIB_JAM_KERJA`.

7. **Hari berstatus "Upacara Bendera" dapat uang makan atau tidak?** Sekarang
   TIDAK dihitung hari kerja WFO, alasannya upacara kenegaraan sering jatuh di
   libur nasional (contoh 1 Juni 2026 di file uji). Kalau upacara di hari kerja
   biasa juga muncul dengan status itu, pegawainya kehilangan hak uang makan
   sehari - dan sistem tidak bisa membedakannya sendiri.

8. **Lembur dibayar per jam desimal atau dibulatkan?** Sekarang desimal apa
   adanya dari selisih jam presensi (mis. 6,57 jam x tarif). Praktik lain:
   dibulatkan ke bawah jadi jam penuh. SBM cuma menyebut satuan "OJ".

9. **Dinas Keluar di HARI KERJA yang lupa presensi pulang: kena 1% atau
   tidak?** Sekarang KENA (Pasal 13 ayat (2) tidak mengecualikan dinas). Di
   akhir pekan sudah dibebaskan. Kasus nyata di file uji: dinas ke luar kota
   di hari libur nasional - tapi libur nasional tidak bisa dikenali sistem.

### Baru - dari sambungan langsung SIAP & e-Presensi (2026-08-04)

15. **KELAS JABATAN - SUDAH KETEMU, tapi butuh dicek silang ke Biro OSDMA.**
   Bukan di kolom pegawai (`PEGAWAI.JOBGRADE` kosong total, begitu juga
   `MANJAB_GRADE`/`MANJAB_MAPJABATAN`), melainkan menempel pada JABATAN-nya:
   `MASTERFUNGSIONAL.JOBGRADE` (fungsional & pelaksana) dan `SATKER.JOBGRADE`
   (struktural), disambungkan lewat `RIWAYATJABATAN` terbaru. Sudah dipasang
   di `importPegawaiSiap.ts` - **3.586 dari 3.609 pegawai (99,4%) terisi**.
   Diadu ke kenyataan dan cocok (Sekjen/Dirjen 17, Staf Ahli 16, Ka. Biro 15,
   Ka. Bagian 12, Ka. Subbagian 10).
   **YANG MASIH PERLU DIPUTUSKAN**: belum ada penegasan bahwa JOBGRADE di
   kedua tabel itu versi TERKINI yang dipakai membayar (bisa tertinggal dari
   SK terbaru). Angka ini LANGSUNG menentukan tarif tukin pokok. Minta
   sampel beberapa pegawai ke Biro OSDMA lalu bandingkan sebelum dipakai
   membayar sungguhan.

16. **e-Presensi memberi toleransi terlambat 60 MENIT, Gajihub 0 menit.**
   Angkanya akhirnya pasti: `sistem_kerja.toleransi` = 60 untuk WFO/WFH/WFA.
   Ini yang menjelaskan butir 5 di atas. Contoh dampaknya pada tarikan Juni
   2026: total keterlambatan 1.433.892 menit untuk 3.392 pegawai (rata-rata
   ±422 menit/orang/bulan). Kalau toleransi itu ternyata punya dasar resmi,
   ubah `toleransiTerlambatMenit` di `JADWAL_KERJA_DEFAULT` - jangan dipatch
   di adapter.

17. **1.689 dari 5.190 pegawai di e-Presensi (33%) tidak ada di SIAP.**
   Plus ~101 yang `id_pegawai`-nya berbentuk UUID. Mereka DILEWATI dengan
   alasan eksplisit, TIDAK dicocokkan lewat nama. Perlu ditelusuri siapa
   mereka - dugaan: non-ASN/honorer/outsourcing yang absen di e-Presensi
   tapi tidak tercatat di database kepegawaian. Selama belum jelas, presensi
   mereka tidak masuk Gajihub sama sekali.

18. **PPPK: golongan berformat angka Romawi tunggal** ("IX", "XI"), sementara
   PNS "III/d". `golonganRomawi()` di `tarifSbm.ts` hanya mengenali format
   PNS dan mengembalikan null untuk PPPK - artinya PPPK DILEWATI saat
   kalkulasi uang makan/lembur (dengan alasan eksplisit, bukan tarif
   tebakan). Perlu diputuskan tarif SBM mana yang berlaku untuk PPPK.

### Kewenangan

10. **PPABP tidak boleh menjalankan kalkulasi massal Tukin** - padahal boleh
   meng-upload KEDUA komponennya (presensi & predikat). Kalkulasi massal cuma
   KASUBAG_TU + ADMIN. Tombol "Hitung Tukin" sekarang disembunyikan dari yang
   tidak berwenang supaya tidak ada tombol yang pasti gagal. Mengingat
   permintaan "gak cuma PPABP yang bisa tindak lanjut", mungkin ini mau
   dibalik juga. Lihat `canAjukanKalkulasiTukinMassalUnit`.

### Keamanan - naik prioritas

11. **HTTPS + login sungguhan.** Sejak fitur rekening masuk, database ini
   menyimpan **nomor rekening bank ribuan pegawai**. Login NIP (password = NIP)
   sudah **dihapus total dari kode** (2026-11-05): pegawai masuk lewat SSO
   Akun Kemnaker, login kata sandi tersisa hanya akun dev dan akun penguji.
   Dampaknya ±4 pegawai dengan NIK ganda/kosong di SIAP belum bisa masuk
   sampai datanya dibereskan. HTTPS masih perlu dibereskan sebelum VPS dibuka
   lebih luas dari beberapa pegawai yang tes sekarang.
   Lihat `TODO(legal-confirm)` di `src/auth/session.ts` dan model
   `RekeningPegawai`.

12. **`rolesTambahan` (multi-role) bertentangan dengan pemisahan kewenangan** -
   pengaju SK KGB tidak seharusnya juga jadi approver-nya. Sebelum production:
   hapus kolomnya, atau batasi ke lingkungan non-production.

13. **Role `ADMIN` punya privilege SEMUA role + seluruh data payroll** - khusus
   kebutuhan demo. Sebelum production WAJIB dipecah jadi System Admin (teknis)
   + role bisnis terpisah.

### Data uji yang masih menempel

14. **Honorarium Rp 11.400.000 pada Hanindita Widagdo** (periode 7/2026) adalah
   ANGKA UJI, disalin dari slip contoh milik orang lain. Cuma ada di database
   LOKAL, tidak ikut ke VPS. Kosongkan lewat `/ppabp/gaji-induk` kalau tidak
   mau ikut tampil waktu demo.

### Keputusan 2026-11-05 - akun penguji Tim Pusdatik

15. **Keputusan user: akun "Tim Pusdatik" (semua peran termasuk ADMIN dan PPABP)
   DIHIDUPKAN di staging dan prod untuk pengujian Pusdatik.** Risiko diterima
   eksplisit: pemegang password bisa mengunduh ADK asli, mengunggah gaji induk
   / rekening, sinkron SIAP, dan mengubah peran. Disarankan isi
   `PENGUJI_BERLAKU_SAMPAI` di prod. Matikan setelah pengujian: nonaktifkan di
   `/admin/role-assignment`, atau kosongkan `PENGUJI_PASS_HASH` lalu `pm2
   restart`, atau `npm run seed:uji -- --hapus --terapkan`.
   TTE: akun ini BOLEH menandatangani SPTJM unit uji coba memakai NIK demo
   (pegawai dummy tanpa sidik NIK, jadi cek NIK = pemegang sesi dilewati) -
   keputusan user 2026-11-05, untuk pengujian. Akun SSO tetap menolak NIK orang lain.
   NIK demo bisa dibuka untuk SEMUA akun lewat `TTE_IZINKAN_NIK_DEMO="true"`
   (bawaan mati) - matikan sebelum SPTJM jadi dasar pembayaran.

### Pentest Pusdatik 2026-11-06 - status perbaikan (belum di-commit)

20. **Temuan pentest Pusdatik (`Laporan_Pentest_Gajihub_Gabungan.pdf`) diperbaiki di
   worktree `resume-80863d1d-4e9915`; review LULUS, belum di-commit (git dipegang user).**
   - **Ditutup di Gajihub**: F-03 Host header -> open redirect (`asalPublik` hanya
     memakai host dari allowlist `src/auth/asalTepercaya.ts`; loopback ditolak di
     production; IP 192.168.223.206/207 `:3002` masuk allowlist dan `next.config.mjs`).
     F-01 role-assignment (ubah akun sendiri ditolak, UUID wajib sah, ADMIN baru
     wajib centang konfirmasi, audit menyimpan `aktorNama`). F-02 (Excessive Data
     Exposure, OWASP API3:2023) **ditutup penuh 2026-11-09**; sebelumnya hanya
     pembatasan kolom. `revalidatePath` dibuang dari `ubahAssignmentRoleAction` dan
     `buatAkunBaruAction`, sehingga response Server Action tidak lagi memuat daftar
     akun; respons hanya berisi baris yang berubah. Trade-off: angka ringkasan, tab
     filter, dan panel pegawai baru segar setelah muat ulang halaman. F-07 CSP di
     `src/middleware.ts` (`kebijakanCsp`; `'unsafe-inline'` untuk script/style, dan
     frame-ancestors/object-src hanya untuk `/berkas/`). F-05 CSRF lapis 2 (Origin
     asing atau "null" di POST/PUT/PATCH/DELETE ditolak 403). `src/app/robots.ts`.
   - **Tanggung jawab Pusdatik/Naco (di luar Gajihub)**: TLS 1.0/1.1 dan IDEA (proxy
     Pusdatik), cookiesession1 (FortiWeb), dan semua temuan account.kemnaker.go.id,
     plausible, serta CDN.
   - **Uji manual yang tersisa (wajib di staging)**: pratinjau PDF di Chrome, Console
     tanpa pelanggaran CSP, login dan SSO, `curl -H "Host: evil.com"` harus dialihkan
     ke domain resmi. Prod butuh lebih dari satu ADMIN, karena admin tidak bisa
     mengubah akunnya sendiri.
   - **Saran tertunda**: persempit wildcard `*.kemnaker.go.id`; nonaktifkan tombol
     Simpan untuk akun sendiri (saat ini server yang menolak); CSP dengan nonce
     (tindak lanjut).

### Baru - dari kelola predikat kinerja per orang (2026-08-05)

19. **NIP duplikat dalam SATU file rekap predikat - ditolak atau dibiarkan?**
   File "Rekap Penilaian (47).xlsx" punya 49 baris tapi cuma **47 orang**
   (JAGADITYA SARASWATI & WIRAPATI ANGGARA masing-masing muncul 2x). Isinya
   kebetulan identik jadi tidak ada yang rusak - TAPI kalau NIP yang sama
   muncul dua kali dengan predikat BERBEDA, upsert membuat **yang terakhir
   menang tanpa peringatan**, dan itu langsung mengubah bobot 70% Tukin orang
   tersebut. Efek sampingnya juga bikin ringkasan upload membingungkan:
   dilaporkan "Biro Keuangan: 29 pegawai" padahal di database 27 - ringkasan
   menghitung BARIS, bukan ORANG.
   Lihat `src/app/tukin/predikat-kinerja/actions.ts`.

20. **Predikat hasil ketikan manual boleh dipakai membayar?** Fitur
   tambah/ubah/hapus per orang sudah ada (`/tukin/predikat-kinerja`), dibatasi
   unit + tercatat di `AuditTrail` + ditandai chip "bukan dari BKN". Yang
   belum ditegaskan: apakah baris bertanda manual itu sah jadi dasar bayar,
   atau harus disusul file resmi e-Kinerja sebelum siklus approval jalan.
   Sekarang sistem TIDAK membedakannya saat kalkulasi.
   Lihat `src/app/tukin/predikat-kinerja/actionsKelola.ts`.

---

## 4. MENUNGGU DOKUMEN / AKSES DARI PIHAK LUAR

Jangan diasumsikan atau di-hardcode sampai dokumennya ada. Semua sudah
ditandai `TODO(confirm)` / `TODO(legal-confirm)` di kode.

| Yang ditunggu | Untuk apa | Sekarang bagaimana |
|---|---|---|
| **PMK/Perdirjen tata cara pembayaran lembur** | Dasar hukum pengali lembur hari libur 2x. Sudah dicek: kata "libur" TIDAK ADA di seluruh SBM 2026 | Dipakai 2x atas instruksi user, konstantanya diberi peringatan + TODO |
| **Batas maksimal jam lembur per bulan** | SBM tidak mengaturnya | Dipakai 40 jam (asumsi lama, belum dikonfirmasi) |
| **Contoh ADK Uang Makan & Uang Lembur resmi** | Format kolomnya | Dipakai kolom ringkas buatan sendiri |
| ~~**Akses API e-Presensi**~~ **SUDAH DIDAPAT (bukan API, tapi akses DATABASE)** | Sinkronisasi otomatis presensi | **SELESAI** - tombol "Tarik data presensi" di `/tukin/presensi` SUDAH AKTIF, membaca langsung database PostgreSQL e-Presensi (`192.168.221.96:4020`). Upload PDF tetap ada sebagai jalur cadangan. Lihat bagian 9 |
| ~~**Kelas jabatan (grade 1-17)**~~ **SUDAH KETEMU** | Tarif tukin pokok | Diturunkan dari `MASTERFUNGSIONAL.JOBGRADE` / `SATKER.JOBGRADE` lewat `RIWAYATJABATAN` - 3.586/3.609 terisi. Yang ditunggu tinggal **konfirmasi Biro OSDMA** bahwa angkanya versi terkini - lihat butir 15 |
| **Identitas 1.689 pegawai e-Presensi yang tidak ada di SIAP** | Presensi mereka tidak bisa masuk Gajihub | Dilewati dengan alasan eksplisit - lihat butir 17 |
| ~~**SIAP diperbarui untuk pegawai TMT 2025**~~ **SELESAI - ternyata salah INSTANCE, bukan datanya yang belum ada** | Pegawai baru tidak ada di Gajihub | Server `192.168.212.108` punya **DUA instance** dengan database bernama sama. Yang dipakai (`SQLEXPRESS2014`, port 1433) berhenti di Agustus 2025; yang benar (`MSSQLDEV`) terkini. Setelah pindah: pegawai aktif 3.607 -> **5.077**, 18 NIP yang hilang itu **18/18 ketemu**, ID e-Presensi tak terpetakan turun dari **1.689 (33%) jadi ~118 (2%)**. Lihat "Instance SIAP yang benar" di CLAUDE.md |
| **Akun read-only di instance MSSQLDEV** | `biro_keu_2` DITOLAK di sana, jadi `.env` sekarang memakai **`sa`** - sysadmin dengan hak tulis & hapus atas seluruh database di server SIAP | Kode hanya SELECT, tapi akunnya tidak menahan apa pun kalau ada kekeliruan. **Minta akun terbatas ke pengelola SIAP** |
| **SIAP dinaikkan ke TLS 1.2** | MSSQLDEV memutus koneksi (`ECONNRESET`) pada hasil query besar selama enkripsi menyala - TLS 1.0 | `SIAP_ENCRYPT="false"`; nama/NIP/jabatan lewat tanpa enkripsi di jaringan kantor (password tetap aman). Begitu TLS 1.2 ada, cabut variabel itu |
| **Identitas 43 pegawai yang hilang total dari SIAP** | Sempat terhapus dari Gajihub dan **tidak bisa dipulihkan otomatis** - tidak ada sumber datanya | NIP + nama + satuan kerja mereka tersimpan di `AuditTrail` (`entitasId = "hapus-massal-nonaktif"`). Tanyakan ke OSDMA kalau ternyata penting |
| **Dokumen resmi jam kerja Kemnaker** | Membenarkan acuan masuk 07:30, pulang 16:00 (Sen-Kam) / 16:30 (Jumat), 7,5 jam/hari | Dipakai angka itu - sudah dicocokkan ke 3 file presensi asli (101/101 catatan keterlambatan cocok), tapi belum ada dokumen resminya. Ada di `JADWAL_KERJA_DEFAULT` |
| **Kalender hari libur nasional** | Membedakan lembur hari libur (2x) & membebaskan potongan di tanggal merah | Yang dikenali baru Sabtu & Minggu. Libur nasional di hari kerja tetap terbaca sebagai hari kerja - dilaporkan sebagai catatan, tidak didiamkan |
| **Akses API e-Kinerja BKN** | Tarik predikat otomatis | Upload manual file Rekap Penilaian (format sudah didukung) |
| **Akses API SAKTI & Web Gaji** | Kirim SPP/SP2D otomatis | Export ADK manual (Excel/TXT) |
| **Pasal 15 - potongan hukuman disiplin** | Belum diimplementasi sama sekali | Butuh feed status disiplin dari OSDMA |
| **Aturan cuti mulai/berakhir di tengah periode** | Proporsional harian | Belum ditangani, cuma `bulanKeberapa` |
| **Durasi window verifikasi rekonsiliasi** | `windowVerifikasiBerakhir` masih kosong | Belum dipakai |
| **Kode satker resmi per satuan kerja** | Kolom Kode Satker di ADK | Diambil dari `GajiInduk.kodeSatker` hasil upload GPP; kosong kalau periode itu belum diupload |
| **Tarif Non-ASN/Satpam/Pengemudi (SBM item 24)** | Kelompok pegawai itu | Belum diimplementasi, skema `Pegawai` belum membedakannya |

---

## 5. Alur data sekarang (siapa upload apa)

```
(otomatis)          ->  src/jobs/importPegawaiSiap.ts     -> Pegawai (dari database SIAP)
KASUBAG_TU / PPABP  ->  /tukin/presensi  tombol "Tarik data presensi"
                                          -> RekapPresensiPeriode + PresensiHarian
                                             (LANGSUNG dari database e-Presensi)
KASUBAG_TU / PPABP  ->  /tukin/presensi  (PDF e-Presensi, 1 file / 1 folder - cadangan)
                                          -> RekapPresensiPeriode  (30% kehadiran)
                                          +  PresensiHarian        (rincian per tanggal)
KASUBAG_TU / PPABP  ->  /tukin/predikat-kinerja   -> PredikatKinerja       (70% kinerja)
KASUBAG_TU + ADMIN  ->  /kasubag/kalkulasi        -> TukinCalculation, UangMakan, UangLembur
PPABP               ->  /ppabp/gaji-induk         -> GajiInduk             (gaji pokok & tunjangan)
PPABP               ->  /ppabp/rekening           -> RekeningPegawai       (per jenis: TUKIN / GAJI)
PPABP               ->  /ppabp/adk                -> file ADK per bank     (Excel / TXT)
PEGAWAI             ->  /saya/slip-gaji           -> slip "Perincian Pembayaran Gaji"
```

**Tidak ada** form ketik-manual untuk presensi & predikat kinerja di manapun -
satu-satunya jalur masuk adalah upload file resmi, dan tiap upload menulis
`AuditTrail`. `canEditPresensiKinerjaLangsung` tetap `false` untuk semua role.

Presensi punya DUA jalur upload di halaman yang sama: **PDF export e-Presensi**
(jalur utama sekarang - boleh banyak file atau satu folder, periode dibaca dari
isi file) dan **template Excel Gajihub** (dilipat di bawah, buat koreksi manual
& mengisi yang tidak ada di PDF: menit meninggalkan kantor, tidak ikut upacara).
Rincian harian per tanggal ada di `/tukin/presensi/<nip>` - hanya untuk periode
yang masuk lewat PDF.

---

## 6. Seed data & akun demo

**`seedUsers.ts`, `seedSimulasi.ts`, dan `akunDemo.ts` dihapus 2026-10-10**
(commit `a12552b`, "bersihkan file dan skrip demo lama"). Yang tersisa:

```bash
npx tsx src/auth/seedAkunPegawai.ts  # akun PEGAWAI untuk tiap Pegawai yang belum punya akun
```

Role selain PEGAWAI diberikan lewat halaman Admin "Kelola Assignment Role"
(`/admin/role-assignment`), dengan mengubah akun yang sudah ada.

Login: pegawai masuk lewat SSO Akun Kemnaker saja (login NIP sudah dihapus 2026-11-05).
Daftar akun demo lama (Alpha Sandro, Hanindita Widagdo, dst.) **belum
diverifikasi masih ada** di database lokal maupun VPS. Cek dulu sebelum
dipakai untuk demo.

Komentar di beberapa file masih menyebut `seedUsers.ts`/`seedSimulasi.ts`
(`src/auth/seedAkunPegawai.ts`, `src/app/kasubag/kalkulasi/`,
`src/app/admin/role-assignment/actions.ts`, `src/jobs/*PegawaiSiap.ts`, dan
tiga skill). Itu klaim basi yang perlu dirapikan.

---

## 7. Jebakan teknis yang sudah pernah menggigit

Ditulis di sini supaya tidak terulang di chat baru:

1. **Deploy yang menambah dependency WAJIB `npm install` dulu** - urutan
   pull-build-restart yang biasa TIDAK cukup. Terakhir kena: `unpdf` (pembaca
   PDF presensi). Catatan Node: pdfjs memanggil `Math.sumPrecise` yang baru ada
   di Node 22+; VPS jalan di Node 20, jadi fungsinya ditambal di
   `src/lib/pdfTeks.ts` - tanpa itu log server dibanjiri warning tiap halaman.
2. **`import XLSX from "xlsx"` GAGAL di `next build`** (tapi lolos di `npm run
   dev` dan `tsc`). Bundler Next resolve ke build ESM yang tidak punya default
   export. Di kode app pakai **named import** (`import { read, utils } from
   "xlsx"`); skrip di `src/jobs/` aman karena jalan lewat tsx/CJS.
3. **Prisma tidak menerima komentar `/** */` di dalam model** - pakai `//`.
4. **Dev server Next 16 + Turbopack pernah HANG** setelah POST Server Action.
   Request yang sama normal di production build. Kalau ketemu, restart dev
   server - jangan cari bug di action-nya.
5. **Job yang punya `main()` di top-level tanpa guard `require.main`**
   menjalankan ulang seluruh job begitu di-import. Yang dulu kena adalah
   `src/db/seedSimulasi.ts` (sudah dihapus 2026-10-10). Pola ini jangan
   ditiru di job baru.
6. **Menghitung ulang kalkulasi MERESET siklus approval ke DRAFT** - itu
   konvensi yang memang dipegang, tapi berarti tombol "Hitung sekarang" tidak
   boleh diklik sembarangan untuk pegawai yang sudah APPROVED.
7. **Verifikasi lewat UI itu MUTASI NYATA** - approval, edit role, dan
   keputusan rekonsiliasi tersimpan permanen. Kalau dipakai buat verifikasi,
   revert setelahnya (kecuali datanya memang dibutuhkan buat demo).
8. **SIAP jalan di SQL Server 2014 yang cuma bicara TLS 1.0**, sementara
   Node 22+ (OpenSSL 3) menolak apa pun di bawah TLS 1.2. Tanpa
   `cryptoCredentialsDetails: { minVersion: "TLSv1", ciphers:
   "DEFAULT@SECLEVEL=0" }` koneksinya gagal dengan
   `ERR_SSL_UNSUPPORTED_PROTOCOL`. Sudah dipasang di
   `EpresensiAdapter.ts` & `importPegawaiSiap.ts`.
9. **JANGAN normalisasi nol depan waktu mencocokkan `id_pegawai` ke
   `PEGAWAIID`.** Sempat terjadi waktu verifikasi: "00009600" (Deva Dwi
   Septian) tercocok ke PEGAWAIID "000009600" milik ORANG LAIN (Afriansyah
   Noor). Pencocokan HARUS persis. Uji ketat: 150/150 cocok untuk ID 8, 9,
   dan 12 digit.
10. **`npx prisma generate` gagal `EPERM` di Windows kalau dev server masih
   jalan** - DLL query engine sedang dikunci. Matikan `npm run dev` dulu.
11. **Kalau menambah jalur data presensi baru, isi `kewajibanJamKerja`.**
   `rekapDariLaporanPdf` menurunkan `jumlahHariKerja` dari situ, dan
   `uangMakan.ts` memakainya sebagai BATAS ATAS hari dibayar (`Math.min`).
   Kalau null, uang makan SELURUH pegawai jadi Rp 0 tanpa error apa pun -
   ketemu waktu dry-run pertama jalur database.
12. **Server SIAP punya DUA instance dengan database bernama SAMA PERSIS.**
   `SQLEXPRESS2014` (port 1433) datanya berhenti Agustus 2025; `MSSQLDEV`
   yang terkini. Salah pilih **tidak memberi error apa pun** - datanya cuma
   "lama" dan terlihat wajar. Proyek ini sempat memakai yang salah tanpa
   sadar sampai 18 NIP e-Kinerja tidak ketemu. Kalau `SIAP_INSTANCE` diisi,
   **`SIAP_PORT` harus kosong** - mengirim keduanya membuat driver memakai
   port dan mengabaikan instance-nya.
13. **`SIAP_ENCRYPT="false"` itu wajib untuk MSSQLDEV, bukan kemalasan.**
   Dengan enkripsi menyala, instance itu memutus koneksi (`ECONNRESET`)
   begitu hasil query cukup besar - query kecil tetap normal, jadi gampang
   dikira masalah kredensial. Penyebabnya TLS 1.0.
14. **Password di `.env` yang diawali `#` WAJIB diapit tanda kutip.** Tanpa
   kutip, `#` dibaca sebagai awal komentar dan passwordnya jadi kosong -
   errornya muncul sebagai "login failed", bukan "password kosong". Juga:
   kunci ganda di `.env` membuat yang TERAKHIR menang, jadi baris duplikat
   tanpa nilai bisa diam-diam mengosongkan kredensial yang sudah benar.

---

## 8. Kandidat pekerjaan berikutnya

Belum ada yang diminta user - ini cuma daftar yang wajar menyusul, bukan
komitmen:

- HTTPS + login sungguhan (lihat butir 6 di bagian 3 - taruhannya sudah naik)
- Pasal 15: potongan hukuman disiplin (butuh feed dari OSDMA)
- Pengelompokan dashboard Pimpinan/PPABP per Eselon I (`strukturEselon.ts`
  sudah ada, baru dipakai di kop slip gaji)
- Generate PDF slip gaji (sekarang `window.print()`)
- Kebijakan retensi dokumen bukti dukung (penyimpanannya sudah ada di
  `storage/uploads/` sejak 2026-10-28; aturan berapa lama disimpan belum ada)
- Pindahkan `BuktiPotongPajak.fileUrl` & `SkKgb.fileUrl` ke penyimpanan privat
- Halaman audit log generik (`canMonitorKepatuhanData` belum ada UI-nya)

---

## 9. Sambungan langsung SIAP & e-Presensi (2026-08-04)

Dua sumber data eksternal sekarang **benar-benar tersambung**, tidak lagi mock
maupun upload manual. Detail lengkap di `CLAUDE.md` bagian "Sambungan langsung
ke SIAP & e-Presensi".

| Sumber | Alamat | Engine | Dipakai untuk |
|---|---|---|---|
| SIAP | `192.168.212.108:1433` | SQL Server 2014 | Data pegawai + pemetaan `id_pegawai` -> NIP |
| e-Presensi | `192.168.221.96:4020` | PostgreSQL | Presensi harian (30% Tukin, uang makan, uang lembur) |

Kredensial ada di `.env` (`SIAP_*`, `EPRESENSI_*`). **KEDUANYA READ-ONLY** -
hanya `SELECT`. Jangan pernah menulis ke sana: keduanya sistem produksi yang
sedang melayani pegawai.

**Rantai pemetaan pegawai** (ini yang paling rawan):

```
e-Presensi.presensi.id_pegawai -> SIAP.PEGAWAI.PEGAWAIID -> NIPBARU -> Gajihub.Pegawai.nip
```

e-Presensi TIDAK menyimpan NIP sama sekali. Pencocokan HARUS persis - lihat
jebakan nomor 9 di bagian 7.

**File baru:**
- `src/jobs/importPegawaiSiap.ts` - import pegawai dari SIAP
- `src/adapters/EpresensiAdapter.ts` - penarik presensi (dipakai tombol & CLI)
- `src/jobs/importPresensiEpresensi.ts` - CLI tarikan massal
- `src/jobs/simpanRekapPresensi.ts` - penulis DB, dipakai bareng
- `src/business-logic/presensiKeDb.ts` - pemetaan status, dipakai bareng jalur PDF

**Dependency baru** (deploy WAJIB `npm install` dulu): `mssql`, `pg`.

**Perintah sinkronisasi** (dijadwalkan lewat cron/Task Scheduler, harian):

```bash
npm run sync:pegawai                     # pegawai dari SIAP
npm run sync:presensi -- --oleh=<NIP>    # presensi BULAN BERJALAN
```

**Deploy ke VPS jadi lebih sederhana**: `pg_dump --table=pegawai` dari laptop
dev **tidak diperlukan lagi**, cukup jalankan `sync:pegawai` di sana. TAPI cek
dulu jangkauan jaringannya - VPS (`192.168.221.44`) satu segmen dengan
e-Presensi, sementara SIAP di segmen berbeda (`192.168.212.108`). Detail di
CLAUDE.md bagian "Deployment testing internal (VPS kantor)".

**Status data lokal saat ini**: 3.607 pegawai aktif dari SIAP, 3.392 rekap
presensi periode 6/2026 (71.513 baris harian). Belum ada predikat kinerja dan
belum ada kelas jabatan, jadi **Tukin masih belum bisa dihitung**.
