# Progress & Status Gajihub

Catatan status ringkas untuk **orientasi cepat waktu pindah chat**. Ini BUKAN
pengganti `CLAUDE.md` - dokumen itu tetap sumber utama soal keputusan desain,
alasan, dan detail teknis per fitur. Yang ada di sini cuma: posisi sekarang,
apa yang menunggu keputusan, dan apa yang ditunggu dari pihak luar.

**Cara pakai**: baca file ini dulu, lalu masuk ke bagian `CLAUDE.md` yang
relevan (nama bagiannya disebut di tabel di bawah). Update file ini tiap
selesai satu batch pekerjaan, sebelum ganti chat.

Terakhir diperbarui: **2026-07-29** (commit `b9e38a1`).

---

## 1. Posisi sekarang

| | |
|---|---|
| Commit terakhir di `main` | `b9e38a1` |
| Test | 222 lolos (`npm test`) |
| Migrasi | 13, semua sudah `deploy` di lokal & VPS |
| Deploy | VPS kantor `192.168.221.44:3002` via pm2 (`gajihub`, restart ke-16), nginx -> `gajihub.rokeubmn.id` (HTTP) |
| Repo | https://github.com/sandro4132017/gajihub |

**Kebiasaan kerja yang berlaku**: tiap selesai edit, langsung commit + push ke
`main` lalu deploy ke VPS (`git pull && npx prisma migrate deploy && npm run
build && pm2 restart gajihub`). Jalankan `npm test` + `npx tsc --noEmit` dulu.
Server itu SHARED - jangan ganggu `bot-siska` (port 3000) dan
`meeting-room-display-api` (port 3001).

---

## 2. Yang sudah jalan (dan di mana baca detailnya)

| Fitur | Bagian di `CLAUDE.md` |
|---|---|
| Kalkulasi Tukin 30/70 + potongan Pasal 13/14 | "Kalkulasi Tukin satu pintu + perbaikan logika potongan" |
| Dashboard Tukin satu pintu (presensi + kinerja + kalkulasi) | idem |
| Upload rekap presensi manual + tombol sinkronisasi e-Presensi | idem |
| Upload rekap predikat kinerja e-Kinerja BKN | "Upload rekap predikat kinerja e-Kinerja BKN" |
| Uang makan & uang lembur per SBM 2026 | "Uang makan & uang lembur mengikuti SBM 2026" |
| Lembur hari libur 2x + WFH/WFA tidak dapat lembur | idem |
| Gaji induk (upload ADK GPP) + slip gaji format asli | "Riwayat gaji pegawai (gaji induk) & slip gaji format asli" |
| Rekening pegawai per jenis + ADK dipisah per bank | "Rekening pegawai & pemisahan ADK per bank" |
| Export ADK dua format (Excel & TXT) | "Export ADK dua format" |
| 6 role + multi-role + ganti sudut pandang | "Simulasi role matrix lengkap", "Multi-role per akun" |
| Data Pegawai, banding, SK KGB, SK hukdis, anggaran, usulan role | "Simulasi role matrix lengkap" |

---

## 3. MENUNGGU KEPUTUSAN USER

Ini yang paling gampang hilang waktu pindah chat. Semuanya sudah pernah
disampaikan, belum dijawab. Tidak ada yang memblokir pekerjaan lain - tapi
beberapa **mengubah angka yang dibayarkan**, jadi jangan diputuskan sendiri.

### Mengubah uang

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

### Kewenangan

5. **PPABP tidak boleh menjalankan kalkulasi massal Tukin** - padahal boleh
   meng-upload KEDUA komponennya (presensi & predikat). Kalkulasi massal cuma
   KASUBAG_TU + ADMIN. Tombol "Hitung Tukin" sekarang disembunyikan dari yang
   tidak berwenang supaya tidak ada tombol yang pasti gagal. Mengingat
   permintaan "gak cuma PPABP yang bisa tindak lanjut", mungkin ini mau
   dibalik juga. Lihat `canAjukanKalkulasiTukinMassalUnit`.

### Keamanan - naik prioritas

6. **HTTPS + login sungguhan.** Sejak fitur rekening masuk, database ini
   menyimpan **nomor rekening bank ribuan pegawai**, sementara aplikasinya
   masih jalan di **HTTP dengan password = NIP**. Sebelumnya kalau bocor yang
   bocor nama & NIP; sekarang rekening bank. Ini bukan alasan menghentikan
   fitur (Web Gaji memang butuh datanya), tapi HTTPS + SSO/password sungguhan
   sebaiknya naik prioritas sebelum VPS dibuka lebih luas dari beberapa
   pegawai yang tes sekarang.
   Lihat `TODO(legal-confirm)` di `src/auth/session.ts` dan model
   `RekeningPegawai`.

7. **`rolesTambahan` (multi-role) bertentangan dengan pemisahan kewenangan** -
   pengaju SK KGB tidak seharusnya juga jadi approver-nya. Sebelum production:
   hapus kolomnya, atau batasi ke lingkungan non-production.

8. **Role `ADMIN` punya privilege SEMUA role + seluruh data payroll** - khusus
   kebutuhan demo. Sebelum production WAJIB dipecah jadi System Admin (teknis)
   + role bisnis terpisah.

### Data uji yang masih menempel

9. **Honorarium Rp 11.400.000 pada Irwan Syafril** (periode 7/2026) adalah
   ANGKA UJI, disalin dari slip contoh milik orang lain. Cuma ada di database
   LOKAL, tidak ikut ke VPS. Kosongkan lewat `/ppabp/gaji-induk` kalau tidak
   mau ikut tampil waktu demo.

---

## 4. MENUNGGU DOKUMEN / AKSES DARI PIHAK LUAR

Jangan diasumsikan atau di-hardcode sampai dokumennya ada. Semua sudah
ditandai `TODO(confirm)` / `TODO(legal-confirm)` di kode.

| Yang ditunggu | Untuk apa | Sekarang bagaimana |
|---|---|---|
| **PMK/Perdirjen tata cara pembayaran lembur** | Dasar hukum pengali lembur hari libur 2x. Sudah dicek: kata "libur" TIDAK ADA di seluruh SBM 2026 | Dipakai 2x atas instruksi user, konstantanya diberi peringatan + TODO |
| **Batas maksimal jam lembur per bulan** | SBM tidak mengaturnya | Dipakai 40 jam (asumsi lama, belum dikonfirmasi) |
| **Contoh ADK Uang Makan & Uang Lembur resmi** | Format kolomnya | Dipakai kolom ringkas buatan sendiri |
| **Format & akses e-Presensi** | Sinkronisasi otomatis presensi | Upload manual pakai template Gajihub ber-NIP. Tombol sinkronisasi ada tapi nonaktif. Contoh tarikan e-Presensi yang ada di-key NAMA (tidak konsisten), butuh rekonsiliasi nama->NIP dulu |
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
KASUBAG_TU / PPABP  ->  /tukin/presensi          -> RekapPresensiPeriode  (30% kehadiran)
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

---

## 6. Seed data & akun demo

Urutan seed (penting, lihat catatan di tiap file):

```bash
npx tsx src/auth/seedUsers.ts        # 13 akun demo dgn role khusus
npx tsx src/db/seedSimulasi.ts       # presensi/kalkulasi/approval/banding/dst
npx tsx src/auth/seedAkunPegawai.ts  # akun PEGAWAI massal buat SISA pegawai
```

Login: NIP sebagai username SEKALIGUS password. Akun demo lengkap ada di tabel
di `CLAUDE.md` bagian "Seed data simulasi". Yang paling sering dipakai:

- `198703232015031002` Alpha Sandro - ADMIN + semua role (buat keliling sudut pandang)
- `197303072005011001` Irwan Syafril - PPABP
- `199006212015032005` Ayu Puspita Sari - KASUBAG_TU Pusdatik
- `197410061999032002` Dian Kreshnadjati - OSDMA
- `196906241990031004` Cris Kuntadi - PIMPINAN

---

## 7. Jebakan teknis yang sudah pernah menggigit

Ditulis di sini supaya tidak terulang di chat baru:

1. **`import XLSX from "xlsx"` GAGAL di `next build`** (tapi lolos di `npm run
   dev` dan `tsc`). Bundler Next resolve ke build ESM yang tidak punya default
   export. Di kode app pakai **named import** (`import { read, utils } from
   "xlsx"`); skrip di `src/jobs/` aman karena jalan lewat tsx/CJS.
2. **Prisma tidak menerima komentar `/** */` di dalam model** - pakai `//`.
3. **Dev server Next 16 + Turbopack pernah HANG** setelah POST Server Action.
   Request yang sama normal di production build. Kalau ketemu, restart dev
   server - jangan cari bug di action-nya.
4. **Jangan import apa pun dari `src/db/seedSimulasi.ts`** - file itu punya
   `main()` di top-level tanpa guard `require.main`, jadi meng-import-nya
   me-re-run seluruh seed.
5. **Menghitung ulang kalkulasi MERESET siklus approval ke DRAFT** - itu
   konvensi yang memang dipegang, tapi berarti tombol "Hitung sekarang" tidak
   boleh diklik sembarangan untuk pegawai yang sudah APPROVED.
6. **Verifikasi lewat UI itu MUTASI NYATA** - approval, edit role, dan
   keputusan rekonsiliasi tersimpan permanen. Kalau dipakai buat verifikasi,
   revert setelahnya (kecuali datanya memang dibutuhkan buat demo).

---

## 8. Kandidat pekerjaan berikutnya

Belum ada yang diminta user - ini cuma daftar yang wajar menyusul, bukan
komitmen:

- HTTPS + login sungguhan (lihat butir 6 di bagian 3 - taruhannya sudah naik)
- Pasal 15: potongan hukuman disiplin (butuh feed dari OSDMA)
- Pengelompokan dashboard Pimpinan/PPABP per Eselon I (`strukturEselon.ts`
  sudah ada, baru dipakai di kop slip gaji)
- Generate PDF slip gaji (sekarang `window.print()`)
- Storage file bukti dukung banding (masih placeholder, kebijakan retensi
  dokumen belum ada)
- Halaman audit log generik (`canMonitorKepatuhanData` belum ada UI-nya)
