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
| Deploy, VPS, pm2, nginx, migrasi, SSO Naco, cara akses dari luar | `gajihub-akses-sso-deploy` |

Skill lintas-proyek (`~/.claude/skills/`, isinya di `.claude/global-skills/`):
`task-graph` sebelum pekerjaan bercabang, `autonomous-decision` sebelum
bertanya atau sebelum aksi yang tidak bisa dibatalkan, `self-improve` tiap kali
dikoreksi atau salah dua kali, `hygiene-sweep` di awal & akhir sesi.

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
| `src/validation/`, `src/approval/` | validation gate & approval berjenjang |
| `src/app/` | Next.js App Router - halaman, Server Action, Route Handler |
| `prisma/` | skema + migrasi (satu-satunya jalur perubahan database) |
| `docs/` | teks peraturan & dokumen kirim-ke-pihak-luar |

Stack: Next.js 16 (App Router, Turbopack) · React 19 · Prisma + PostgreSQL ·
`mssql` (SIAP) · `pg` (e-Presensi) · vitest · Tailwind v4.

Perintah: `npm test` · `npm run typecheck` · `npm run build` ·
`npm run sync:pegawai` · `npm run sync:presensi`

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
- Repo ini **PUBLIK** dan pemiliknya akun orang lain; user cuma kolaborator.
- Dari e-Presensi diambil **fakta** (tanggal, status, jam) - **tidak pernah**
  angka potongannya.

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
