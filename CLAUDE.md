# Gajihub - Integration Layer Sentralisasi Belanja Pegawai

File ini **router**, bukan ensiklopedia. Detail per fitur hidup di
`.claude/skills/gajihub-*/SKILL.md` (dipecah 2026-08-31 dari CLAUDE.md yang
sudah 5.189 baris - **verbatim, nol baris hilang**, diverifikasi dengan diff).

## Protokol awal sesi

1. Baca `PROGRESS.md` - posisi terakhir, keputusan yang menunggu user, apa yang
   ditunggu dari pihak luar. **Periksa tanggal "Terakhir diperbarui" di
   dalamnya**; kalau jauh tertinggal dari `git log -1 --date=short`, jangan
   percaya isinya sebelum dicek.
2. Jalankan skill `hygiene-sweep` kalau medannya belum dikenal - dokumen basi
   yang dibaca di lima menit pertama menyetir seluruh sesi.
3. **Jangan mengutip angka status dari dokumen mana pun tanpa memverifikasinya.**
   Yang sudah pernah salah: jumlah test, path halaman, isi `.env`.

## Routing skill

| Situasi | Skill |
|---|---|
| Awal sesi, "apakah X sudah ada", open items, mau menulis komentar kode | `gajihub-orientasi` |
| `permissions.ts`, guard halaman, Server Action baru, scoping satker, multi-role, akun & seed | `gajihub-role-otorisasi` |
| Tukin, potongan Pasal 13/14, bobot 30/70, kelas jabatan, JPT, hukuman disiplin | `gajihub-tukin-potongan` |
| Presensi, sinkronisasi e-Presensi, PDF, kendala, koreksi jam, kalender libur | `gajihub-presensi-epresensi` |
| Uang makan, uang lembur, tarif SBM, golongan, lembur hari libur | `gajihub-uang-makan-lembur` |
| Export ADK, gaji induk, rekening & pemisahan bank, slip gaji | `gajihub-adk-gaji-rekening` |
| Predikat kinerja, upload e-Kinerja BKN, entri manual | `gajihub-predikat-kinerja` |
| Approval berjenjang, `ApprovalLog`, setujui semua, hitung ulang | `gajihub-approval-siklus` |
| Tabel, filter, dropdown, warna, sidebar, paginasi, periode default | `gajihub-ui-konvensi` |
| Menambah/mengubah apa pun yang DILIHAT orang: halaman, tabel, menu, peringatan, gerbang, konfirmasi | `gajihub-laws-of-ux` |
| TTE BSrE, tanda tangan digital, SPTJM, Esign Client, sertifikat elektronik | `gajihub-tte-bsre` |
| Deploy, VPS, pm2, nginx, migrasi, SSO Naco, cara akses dari luar | `gajihub-akses-sso-deploy` |
| Fitur baru / perubahan yang menyentuh lebih dari satu file | `feature-pipeline` |
| Mengubah `prisma/schema.prisma` (model, kolom, relasi, index) | `prisma-migration` |
| Membuat / mengubah job di `src/jobs/` (sync, import, cek TTE, hash) | `data-job` |

Skill lintas-proyek (`~/.claude/skills/`, isinya di `.claude/global-skills/`):
`task-graph` sebelum pekerjaan bercabang, `autonomous-decision` sebelum
bertanya atau sebelum aksi yang tidak bisa dibatalkan, `self-improve` tiap kali
dikoreksi atau salah dua kali, `hygiene-sweep` di awal & akhir sesi.

## Skill desain pihak ketiga (dipasang 2026-10-22)

Stack yang jadi sasarannya: Next.js 16 (App Router) · React 19 · Tailwind CSS v4 ·
TypeScript. Keempatnya ada di `.claude/skills/`, disalin dari sumber resminya
setelah dibaca (bukan lewat `npx`/plugin), jadi ikut tersimpan di repo.

| Skill | Sumber | Dipakai untuk |
|---|---|---|
| `frontend-design` | anthropics/skills, Apache-2.0 | arah visual saat membuat/merombak tampilan |
| `ui-ux-pro-max` | nextlevelbuilder, MIT | basis data gaya, palet, tipografi, aturan UX |
| `react-best-practices` | vercel-labs, MIT | kinerja React/Next.js saat menulis atau mereview komponen |
| `composition-patterns` | vercel-labs, MIT | arsitektur komponen (compound, context, varian) |

**Untuk pekerjaan UI baru, pakai `frontend-design` dan `ui-ux-pro-max`** -
TAPI SESUDAH `gajihub-ui-konvensi` dan `gajihub-laws-of-ux`, bukan sebagai
penggantinya.

**Sebelum menyatakan pekerjaan UI selesai**, jalankan dua daftar periksa:
`gajihub-laws-of-ux` bagian 6, lalu pre-delivery checklist di
`.claude/skills/ui-ux-pro-max/references/pro-rules.md`. Kalau keduanya
bertabrakan, urutan di bawah yang berlaku.

**URUTAN KALAU BERTABRAKAN - yang di atas menang:**

1. Keputusan user yang tercatat (di skill `gajihub-*`, komentar kode, atau
   permintaan langsung).
2. `gajihub-ui-konvensi`, `gajihub-laws-of-ux`, token di `src/app/globals.css`.
3. Skill pihak ketiga di tabel atas.

Tabrakan yang SUDAH DIKETAHUI, semuanya dimenangkan proyek ini:
`frontend-design` menyebut font monospace untuk angka, label huruf kapital,
meta berpemisah titik tengah, panah `->` di tautan, dan deret kartu membulat
seragam sebagai "ciri desain generik" - padahal di sini **angka SELALU
`font-mono`** (keputusan user) dan bentuk kartu dashboard dipilih user sendiri
dari rujukan EasyHR. Skill itu sendiri menulis *"the brief's own words always
win"*; di proyek ini, brief-nya adalah skill `gajihub-*`.

**Dua larangan khusus:**
- `ui-ux-pro-max --persist` DILARANG - ia menulis `design-system/MASTER.md`,
  sumber kebenaran kedua yang bersaing dengan `globals.css`.
- Saran font dari skill mana pun TIDAK boleh dimuat dari `fonts.googleapis.com`:
  VPS cuma terjangkau lewat jaringan kantor, dan browser yang tidak tembus
  internet jatuh diam-diam ke Segoe UI. Font baru di-host sendiri di
  `public/fonts/` (lihat `gajihub-laws-of-ux`).

**SENGAJA TIDAK DIPASANG: `web-design-guidelines` (Vercel) - keputusan user
2026-10-22.** Isinya tidak
memuat satu aturan pun - tiap kali dipakai ia menyuruh mengambil instruksi dari
`raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`
lalu mengikutinya. Instruksi yang diambil dari cabang `main` saat dijalankan
bisa berubah kapan saja tanpa lewat pemeriksaan siapa pun.

## Konteks proyek

Sistem ini dibangun untuk Kementerian Ketenagakerjaan RI, sebagai bagian dari
Rancangan Aksi Perubahan PKP (Pelatihan Kepemimpinan Pengawas) Angkatan XXXVII.
Tujuannya: mengintegrasikan 5 aplikasi eksisting (SIAP, e-Presensi, e-Kinerja
BKN, Web Gaji Kemenkeu, SAKTI) TANPA membangun aplikasi baru yang
menggantikannya - prinsip "don't replace, integrate".

- Target pilot: Satker Sekretariat Jenderal, September 2026
- Target go-live penuh: 1 Januari 2027
- Cakupan: ±5.000 pegawai di seluruh Eselon I

## Arsitektur inti

```
SIAP ──┐
e-Presensi ──┼──> Data Aggregator ──> Business Logic Engine ──> Validation Gate
e-Kinerja BKN ┘                                                        │
                                                                        v
                                              Web Gaji Connector <── Approval Digital
                                                    │
                                                    v
                                              SAKTI (SPP/SP2D)
```

Semua komponen di atas WAJIB pakai adapter pattern (lihat `src/adapters/`)
supaya bisa jalan pakai mock data sekarang, lalu di-swap ke API asli begitu
akses resmi tersedia - tanpa refactor besar.

## Peta proyek

| Path | Isi |
|---|---|
| `src/business-logic/` | engine perhitungan - **pure**, nol I/O |
| `src/adapters/` | sambungan ke sistem luar (SIAP, e-Presensi, e-Kinerja) |
| `src/auth/` | sesi, SSO, `permissions.ts` |
| `src/jobs/` | importer & job scheduler (dijalankan lewat `tsx`, bukan Next) |
| `src/validation/` | validation gate. (`src/approval/` DIHAPUS 2026-10-28 - sisa alur approval berjenjang yang sudah diganti "kirim rekap ke PPABP", lihat `gajihub-approval-siklus`) |
| `src/app/` | Next.js App Router - halaman, Server Action, Route Handler. Komponen yang dipakai SATU halaman tinggal di folder halamannya |
| `src/components/` | komponen UI yang dipakai lintas role: `layout/` (AppShell, AccountMenu), `forms/` (FilterBar, SearchableSelect), `feedback/` (Modal, AksesDitolak), `tables/`, `charts/`, `shared/`, `dashboard/` |
| `src/lib/format/` | format tampilan murni (bulan, tanggal, presensi, lembur) - tanpa prisma |
| `src/lib/storage/` | penyimpanan berkas privat (`storage/uploads/`, di luar `public/`); unduhan lewat `src/app/berkas/` yang berizin - jangan taruh berkas pegawai di `public/` |
| `prisma/` | skema + migrasi (satu-satunya jalur perubahan database) |
| `docs/` | teks peraturan & dokumen kirim-ke-pihak-luar |
| `docs/ai-log.md` | catatan perubahan yang dikerjakan lewat AI - diisi agent `archivist` |
| `tools/` | `verify.mjs` (patokan "selesai"), `check-sensitive.mjs` (pemindai data sensitif) |
| `.claude/agents/` | agent per peran: `planner`, `implementer`, `reviewer`, `archivist` |

Stack: Next.js 16 (App Router, Turbopack) · React 19 · Prisma + PostgreSQL ·
`mssql` (SIAP) · `pg` (e-Presensi) · vitest · Tailwind v4.

Perintah: `npm test` · `npm run typecheck` · `npm run build` ·
`npm run sync:pegawai` · `npm run sync:presensi` ·
**`node tools/verify.mjs`** (typecheck + test + pemindai data sensitif - wajib
sebelum menyatakan selesai)

## Invarian - berlaku tiap giliran, tanpa kecuali

- **Database SIAP & e-Presensi READ-ONLY.** Semua query `SELECT` saja. Keduanya
  sistem produksi yang sedang melayani pegawai. Menambah index pun **bukan**
  pilihan.
- **`DATABASE_URL` adalah PostgreSQL milik Gajihub sendiri.** Jangan pernah
  diisi alamat SIAP/e-Presensi - `prisma migrate deploy` akan membuat tabel
  Gajihub di dalam database mereka.
- **Jangan pernah mencetak isi `.env`, kredensial, atau client secret Naco** ke
  layar, log, commit, maupun percakapan.
- **Jangan mengarang angka yang menyentuh pembayaran** - predikat kinerja, jam
  presensi, kelas jabatan, tarif. Yang tidak diketahui dilewati dengan alasan
  eksplisit, bukan ditebak.
- **Kalau kode dan dokumen di `docs/` berbeda, yang benar DOKUMEN ITU.**
  Perbaiki kodenya, jangan menyesuaikan kutipannya supaya cocok.
- **JANGAN `npm run build` selagi `npm run dev` jalan** - keduanya menulis ke
  `.next` yang sama, dan hasilnya **404 pada route yang file-nya jelas ada**.
- **Passphrase TTE BSrE DILARANG disimpan** di database, sesi, localStorage, cookie, maupun file log. Form wajib `autocomplete="off"`, passphrase hanya di memori saat fetch, kegagalan dicatat ke `log_gagal_tte` tanpa passphrase (Kriteria BSrE V, VIII, IX).
- Repo ini **PUBLIK** dan pemiliknya akun orang lain; user cuma kolaborator.
- Dari e-Presensi diambil **fakta** (tanggal, status, jam) - **tidak pernah**
  angka potongannya.

## Alur kerja agent & verifikasi (ditambahkan 2026-10-22)

Dari paket `gajihub-claude-tambahan`. Berlaku BERSAMA invarian di atas,
bukan menggantikannya.

1. **Fitur baru / perubahan lebih dari satu file -> skill `feature-pipeline`**:
   rencana (`planner`) -> implementasi (`implementer`) -> review
   (`reviewer`) -> catat (`archivist`), dan **berhenti menunggu "oke" user
   di tiap gerbang**. Untuk pekerjaan yang masuk pipeline, gerbang ini
   MENGALAHKAN "putuskan sendiri dan lanjut" di bagian Mode operasi.
2. **Perubahan skema -> skill `prisma-migration`.** Jangan pernah
   `migrate reset` atau `db push` tanpa izin.
3. **Job sinkronisasi / import -> skill `data-job`.** AI hanya boleh
   menjalankan job dengan `--dry-run`; job sungguhan dijalankan user sendiri.
4. **"Selesai" = `node tools/verify.mjs` lulus.** Klaim tanpa output
   verifikasi tidak dihitung. `verify.mjs --build` ikut menjalankan
   `npm run build` - **jangan dipakai selagi `npm run dev` jalan** (lihat
   invarian di atas).
5. **Data pegawai (NIP, NIK, gaji, rekening) sensitif**: jangan di-log, jangan
   di-hardcode, jangan masuk fixture test sebagai data asli. Nilai contoh
   yang memang palsu ditandai `// sensitive-ok` supaya pemindai tidak
   menandainya.
6. Jangan sentuh `.env*`, kredensial MSSQL/Postgres, atau dokumen TTE asli.
7. Tanya dulu sebelum menambah dependency baru.

**KODE YANG SUDAH ADA BELUM SEMUA MEMATUHI ATURAN BARU INI** - itu keadaan
yang diwarisi, BUKAN pola untuk ditiru:
- `src/jobs/importPegawaiSiap.ts`, `importPresensiEpresensi.ts`,
  `hapusPegawaiDummySiap.ts` mencetak nama & NIP ke log (bertentangan dengan
  `data-job`).
- `isi:hash-tte` memakai `--terapkan` (bawaan = uji kering), bukan
  `--dry-run`. Polanya setara, namanya beda.
- Kolom uang di skema memakai `Float`; `prisma-migration` menyarankan
  `Decimal` untuk kolom uang BARU. Mengubah kolom yang sudah ada adalah
  migrasi data nyata - eskalasi dulu.

## Konvensi kode

- Business logic engine = pure functions, tidak boleh ada I/O (database,
  network) di dalamnya. Semua data eksternal masuk lewat parameter.
- Setiap keputusan regulasi yang diimplementasi WAJIB dikomentari dengan
  nomor Pasal yang jadi acuan - supaya gampang diverifikasi ulang dan
  gampang dijelaskan ke Itjen/auditor kalau ditanya. Nomor Pasal itu
  merujuk ke `docs/permenaker-15-2024-tunjangan-kinerja.md`.
- Kalau ada asumsi yang belum dikonfirmasi ke pihak terkait (OSDMA, Biro
  Hukum, DJA, dst), tandai eksplisit dengan komentar `TODO(legal-confirm)`
  atau `TODO(confirm)` - jangan diam-diam mengasumsikan sesuatu sebagai final.
- Komentar menyebut **aturan dan dasarnya**, bukan riwayat bagaimana aturan itu
  ditemukan. Riwayatnya tempatnya di skill, bukan di kode.

## Mode operasi

Putuskan sendiri dan lanjut, sesuai `autonomous-decision` - **dengan satu
pengecualian yang mengalahkan skill itu maupun `task-graph`:**

> **Git dipegang user.** Jangan `commit`, `push`, `checkout`, `rebase`, atau
> membuka PR atas inisiatif sendiri, dan jangan menawarkannya lebih awal. User
> menahan commit sampai dia sendiri menilai fiturnya aman, dan dia mengetik
> perintah git-nya sendiri. Yang saya lakukan: siapkan perubahannya, sebutkan
> file apa saja yang tersentuh, lalu berhenti.

Selebihnya berlaku: audit dulu (buka file-nya, sebut `file:line`), eskalasi
untuk penghapusan / produksi / migrasi data nyata / kredensial, laporkan hasil
apa adanya termasuk test yang gagal.

Bahasa: Indonesia, sesuai bahasa user.
