---
name: gajihub-akses-sso-deploy
description: Use whenever touching deployment, the VPS, pm2, nginx, prisma migrate deploy, environment variables, SSO Kemnaker (Naco / OAuth), src/auth/sso.ts, sesiCookie.ts, the login routes, security headers, or how the app is reached from outside the office network. Use before exposing the app more widely, before changing COOKIE_SECURE, and when answering how a demo participant connects.
---

# Gajihub - akses, SSO & deployment

> Diekstrak **verbatim** dari `CLAUDE.md` (baris 4277-4384, 4969-5076) saat
> pemecahan skill 2026-08-31.

**Garis yang tidak boleh dilompati: SSO.** Selama password = NIP untuk 5.077 akun
dan database menyimpan 9.944 baris rekening bank, membuka alamatnya ke luar sama
dengan menerbitkan data itu tanpa kunci.

**JANGAN pernah menaruh alamat SIAP/e-Presensi di `DATABASE_URL`** - itu database
PostgreSQL milik Gajihub sendiri.

## Tiga cara akses (status 2026-08-31)

| | Jalur | Status |
|---|---|---|
| **A** | `https://gajihub.kemnaker.go.id` lewat proxy Pusdatik | scan Tenable lolos (0 Critical / 0 High), publikasi **on proses** di Pusdatik |
| **B** | VPN FortiClient -> `http://192.168.221.44:3002` | dipakai untuk demo; gateway `103.87.196.249:9443` |
| **C** | `https://gajihub-demo.vercel.app` + data dummy (Neon) | cadangan; 3 fitur yang menyentuh SIAP/e-Presensi mati di sana |

`COOKIE_SECURE=true` akan **mematikan jalur B** (HTTP langsung ke IP) - jangan
diubah selama jalur itu masih dipakai.

---

### SSO Kemnaker (Naco) - OAuth 2.0 Authorization Code (2026-08-21)

Dokumentasi resmi: `https://codes.kemnaker.go.id/naker-api/naco-api`
(`README.md` + `AUTH_CODE_GRANT.md`). Endpoint:

| | |
|---|---|
| Otorisasi | `GET https://account.kemnaker.go.id/auth?response_type=code&client_id=..&redirect_uri=..&scope=basic email` |
| Token | `POST https://account.kemnaker.go.id/api/v1/tokens` (JSON, memuat client_secret) |
| Identitas | `GET https://account.kemnaker.go.id/api/v1/users/me` (`Authorization: Bearer`) |

**Yang berubah cuma CARA MEMBUKTIKAN IDENTITAS.** Setelah identitas terbukti,
login SSO dan login NIP bermuara ke fungsi yang sama (`buatTokenUntukUser` di
`src/auth/sesiCookie.ts`), dan seluruh lapisan di atasnya - peran, otorisasi
(`permissions.ts`), scope satuan kerja, multi-role - **tidak berubah sama
sekali**. Ini yang membuat perpindahannya kecil.

- **`src/auth/sesiCookie.ts` (BARU)** - `OPSI_COOKIE_SESI` +
  `buatTokenUntukUser()`, diekstrak dari `login/actions.ts` begitu Route
  Handler SSO ikut menerbitkan sesi. Dua salinan opsi cookie pasti berbeda
  cepat atau lambat, dan gejalanya "login berhasil tapi langsung logout lagi"
  yang sangat sulit ditelusuri.
- **`src/auth/sso.ts` (BARU, 16 unit test)** - klien Naco. Murni; tidak
  menyentuh database.
- **`/login/sso`** (Route Handler) memberangkatkan ke Naco;
  **`/login/sso/callback`** menukar kode, mengambil identitas, memetakan NIP,
  menerbitkan sesi. Keduanya GET biasa, jadi tombolnya tautan polos yang tetap
  jalan tanpa JavaScript.
- `src/middleware.ts` mengizinkan `/login/sso*` tanpa sesi - memang di situ
  sesinya dibuat.

**`state` DITAMBAHKAN walau tidak disebut dokumentasi Naco.** Tanpa itu,
alamat callback bisa dipanggil siapa saja dengan kode milik orang lain (CSRF
login) dan korbannya berakhir masuk sebagai akun penyerang. Nilainya disimpan
di cookie httpOnly `gajihub_sso_state` lalu dicocokkan ulang. Ada test yang
menguncinya supaya tidak dihapus "karena tidak ada di dokumentasi".

#### Bentuk balasan `/users/me` - diukur, bukan dari dokumentasi

Dokumentasi Naco memberi contoh balasan untuk langkah token TAPI TIDAK untuk
langkah identitas, padahal di situlah satu-satunya hal yang dibutuhkan Gajihub:
**NIP**. Bentuknya akhirnya diketahui dari percobaan login sungguhan
(2026-08-24) memakai **akun publik**:

```
data.id           data.roles[0].id      data.status       meta.version
data.username     data.roles[0].name    data.email        meta.hostname
data.name         data.roles[0].label   data.updated_at   meta.client_ip
```

**TEMUAN YANG MENGUBAH CARA MEMBACANYA: Akun Kemnaker (SIAP ID) TERBUKA UNTUK
MASYARAKAT UMUM**, bukan cuma pegawai - dan akun publik **tidak memuat NIP sama
sekali**. Jadi "balasan tanpa NIP" di produksi hampir selalu berarti *bukan
pegawai*, BUKAN *konfigurasi salah*. Pesan di layar harus bicara soal itu.

Dua hal dari daftar di atas yang berguna untuk langkah berikutnya:
- **`data.roles[]` ada**, artinya Naco memang membedakan jenis akun. Belum
  diketahui nilai apa yang menandai akun pegawai.
- ~~**`data.username`** patut dicurigai sebagai NIP pada akun pegawai.~~
  **TERBANTAH 2026-08-31.** Akun pegawai SUNGGUHAN sudah dicoba dan tetap
  ditolak "Akun ini bukan akun pegawai Kemnaker". Karena `telusuri()` menyisir
  SELURUH balasan termasuk isi array dan objek bersarang, kegagalan itu
  berarti **tidak ada satu pun nilai berbentuk 18 digit polos** di sana -
  jadi `username` BUKAN NIP polos.

#### Yang sudah diperbaiki dari sisi Gajihub (2026-08-31)

`normalkanNip()` (baru) menggantikan pengecekan lama, menutup dua sebab yang
bisa diperbaiki tanpa bertanya ke siapa pun:

1. **NIP berpemisah diterima** - `"19730307 200501 1 001"`, titik, dan strip.
   Yang dibersihkan sengaja HANYA tiga karakter itu; membuang semua non-digit
   bisa menyambung dua angka tak berhubungan jadi 18 digit palsu.
2. **NIP bertipe ANGKA sekarang DITOLAK**, walau digitnya 18. Ini pengetatan,
   bukan pelonggaran, dan sebabnya terbukti sendiri di test lama mereka:
   `JSON.parse('{"nip": 197303072005011001}')` menghasilkan
   **`197303072005011000`** - tiga digit terakhir sudah jadi nol sebelum kode
   mana pun melihatnya (float64 aman cuma sampai 16 digit). Test lama justru
   mengunci nilai rusak itu sebagai sah. Jebakan yang SAMA dengan 46 baris
   ber-NIP `...000` di `basis data gaji_Kemnaker.xlsx`.

Log kegagalan sekarang memancarkan **satu baris VONIS** yang membedakan tiga
sebab, karena tindak lanjutnya beda-beda:

| Vonis di log | Artinya | Tindak lanjut |
|---|---|---|
| `NIP DIKIRIM SEBAGAI ANGKA` | ada field `tipe number` berdigit 18 | minta Naco mengubah field itu jadi **string** |
| `Ada field berisi 18 digit tapi berformat lain` | pemisahnya di luar spasi/titik/strip | longgarkan `normalkanNip()` sesuai pemisah yang terlihat |
| `TIDAK ADA field berisi 18 digit sama sekali` | NIP memang tidak dikirim | **pertanyaan ke Naco** - scope/endpoint mana yang memuat NIP. Tidak bisa diperbaiki dari sisi Gajihub |

Membacanya di VPS: `pm2 logs gajihub --lines 200 | grep -A 20 "\[sso\]"`

Penanganannya: `cariNipDariInfo()` **MENCARI, bukan menebak** - menelusuri
seluruh balasan untuk nilai berbentuk NIP (**18 digit**, jadi NIK 16 digit &
nomor telepon tidak tertukar). Kalau tidak ketemu, login **DIHENTIKAN**.

**Nama field TIDAK LAGI ditampilkan ke pengunjung.** Halaman login terbuka dari
internet, dan daftar itu diagnosis pengembang - bukan keterangan yang berguna
bagi orang yang sekadar salah jenis akun. Sekarang ditulis ke log server
(`pm2 logs gajihub`), dan hanya ikut ke layar kalau `NACO_DEBUG="true"`
dinyalakan sengaja. Nilainya tidak pernah ikut, di jalur mana pun.

**Dua hal yang SENGAJA TIDAK dilakukan callback**: (1) **tidak membuat akun
baru** - NIP tanpa baris `User` ditolak, karena membuat akun otomatis berarti
siapa pun yang punya Akun Kemnaker langsung masuk ke sistem penggajian;
(2) **tidak menyimpan access/refresh token** - Gajihub tidak memanggil API
Naco lain setelahnya, jadi menyimpannya cuma menambah rahasia yang harus
dijaga tanpa ada yang memakainya.

**Login NIP TETAP ADA berdampingan** selama masa transisi (belum tentu semua
5.077 pegawai punya Akun Kemnaker aktif). TODO(confirm): begitu SSO terbukti
mencakup semua pengguna, **jalur NIP WAJIB DIMATIKAN** - selama masih ada,
seluruh alasan mengganti password = NIP belum tercapai.

**JEBAKAN saat menguji - `redirect_uri` menentukan DI MESIN MANA callback
mendarat.** Naco mengalihkan BROWSER ke alamat yang didaftarkan. Kalau
`NACO_REDIRECT_URI` menunjuk `gajihub.rokeubmn.id` (VPS) tapi pengujian
dimulai dari `localhost:3000`, callback-nya mendarat di VPS - sementara cookie
`state` tersimpan di localhost, jadi hasilnya selalu "state tidak cocok".
**Uji end-to-end di host yang sama dengan `redirect_uri`**, atau minta
pengelola Naco mendaftarkan redirect_uri kedua untuk localhost.

**Konfigurasi `.env`** (`NACO_BASE_URL`, `NACO_CLIENT_ID`,
`NACO_CLIENT_SECRET`, `NACO_REDIRECT_URI`, `NACO_SCOPE`, `NACO_FIELD_NIP`).
SSO **otomatis nonaktif** - tombolnya tidak dirender - selama client id/
secret/redirect uri belum lengkap, jadi aman ditinggal kosong di lingkungan
yang belum siap.

**Diverifikasi**: production build memuat `/login/sso` & `/login/sso/callback`;
`/login/sso` mengalihkan ke `account.kemnaker.go.id/auth` dengan seluruh
parameter + `state`; callback dengan state palsu ditolak dengan pesan yang
menyebut sebabnya. Jangkauan jaringan diuji **lewat Node (bukan curl)**:
`/auth` dan `/api/v1/users/me` membalas **401 Unauthenticated** - wajar tanpa
token, dan membuktikan jalur server-ke-server tembus. Catatan: `curl` di
Windows gagal ke host ini dengan `SEC_E_UNSUPPORTED_FUNCTION` (schannel),
**bukan** tanda jaringannya terblokir - Node memakai OpenSSL dan lolos.

## Deployment testing internal (VPS kantor)

Di-deploy ke VPS kantor (`192.168.221.44`, hostname `AIhelpdeskRokeu`, cuma
bisa diakses lewat jaringan kantor/VPN) buat testing terbatas ke beberapa
pegawai SEBELUM dapat subdomain resmi dari Kemnaker - `gajihub.rokeubmn.id`
(domain pribadi user di Hostinger) dipakai sementara, DNS A record
mengarah ke IP privat itu (makanya cuma bisa diakses dari jaringan yang
bisa route ke sana). Server ini SHARED dengan aplikasi lain (`bot-siska`
di port 3000, `meeting-room-display-api` di port 3001 - JANGAN ganggu
keduanya kalau maintenance server ini lagi) - Gajihub jalan di port 3002
lewat pm2 (`pm2 start npm --name gajihub -- start -- -p 3002`, sudah
`pm2 save` + `pm2-support.service` systemd enabled, jadi otomatis restart
kalau server reboot), nginx reverse-proxy `gajihub.rokeubmn.id` -> port
3002 (config di `/etc/nginx/sites-available/gajihub`). HTTPS SENGAJA belum
dipasang - Let's Encrypt HTTP-01 tidak bisa validasi domain yang resolve ke
IP privat (server tidak bisa diakses publik), jadi jalan HTTP dulu sampai
subdomain resmi Kemnaker (yang publik) tersedia baru upgrade ke HTTPS.

**Bug yang ketemu waktu deploy pertama** (SUDAH DIPERBAIKI di
`prisma/migrations/20260725093725_role_matrix_lengkap_dan_model_baru/migration.sql`):
migrasi itu awalnya generate 2 baris `ALTER TABLE "usulan_perubahan_role"`
di dalam blok AlterEnum, PADAHAL tabel itu baru dibuat beberapa baris di
bawahnya (CREATE TABLE) - jadi `prisma migrate deploy` ke database fresh
(baru pertama kali dipakai, kayak di VPS ini) selalu gagal dengan error
"relation usulan_perubahan_role does not exist". Ini kelewatan sebelumnya
karena database dev lokal kebetulan sudah punya tabel itu (residual dari
percobaan migrasi yang gagal saat langkah 1 dulu), jadi generate-nya salah
tapi tidak ketahuan sampai dicoba di database yang benar-benar kosong.
Sudah dihapus baris yang salah itu dari file migrasi - migrasi ini SEKARANG
aman dijalankan dari database kosong (`prisma migrate deploy` langsung,
TANPA perlu workaround manual psql lagi seperti sebelumnya).

**Alur seed di VPS - SUDAH JAUH LEBIH SEDERHANA sejak sambungan langsung ke
SIAP ada.** Prosedur `pg_dump --data-only --table=pegawai` dari laptop dev ke
VPS **TIDAK DIPERLUKAN LAGI**; dulu itu satu-satunya cara karena file XLSX
sumbernya tidak ada di repo (data pribadi, sengaja). Sekarang cukup:

```bash
npm run sync:pegawai                 # tarik pegawai langsung dari SIAP
npx tsx src/auth/seedAkunPegawai.ts  # akun login buat NIP baru
npm run sync:presensi -- --oleh=<NIP>   # presensi bulan berjalan
```

`seedUsers.ts` & `seedSimulasi.ts` (akun demo + skenario simulasi) tetap butuh
baris Pegawai ada duluan, jadi jalankan SETELAH `sync:pegawai`.

Buat menjaganya tetap segar, jadwalkan dua perintah sync itu lewat cron
(harian sudah cukup - mutasi & pelantikan tidak terjadi tiap jam).

**YANG WAJIB DICEK SEBELUM DEPLOY**: VPS Gajihub (`192.168.221.44`) satu
segmen dengan e-Presensi (`192.168.221.96`) jadi hampir pasti terjangkau,
TAPI SIAP ada di segmen BERBEDA (`192.168.212.108`). Cek dari VPS:

```bash
nc -zv 192.168.221.96 4020    # e-Presensi
nc -zvu 192.168.212.108 1434  # SQL Server Browser - WAJIB buat named instance
```

**Port 1433 TIDAK cukup lagi.** Sejak pindah ke named instance `MSSQLDEV`,
portnya dinamis dan ditemukan lewat **SQL Server Browser di UDP 1434**. Kalau
tim jaringan cuma membuka TCP 1433, yang terjangkau justru instance
`SQLEXPRESS2014` yang datanya lama - dan itu akan "berhasil" tanpa error.
Minta dibuka: **UDP 1434** dan rentang port dinamis SQL Server (atau minta
DBA menetapkan port statis untuk MSSQLDEV, lalu isi `SIAP_PORT` dan kosongkan
`SIAP_INSTANCE`).

Kalau SIAP tidak terjangkau, minta pembukaan rute/firewall ke tim jaringan -
JANGAN kembali ke pola dump-restore manual, itu langkah mundur.

**`.env` VPS perlu tiga baris tambahan** yang belum ada di sana:
`SIAP_INSTANCE="MSSQLDEV"`, `SIAP_ENCRYPT="false"`, dan kredensial instance itu
(`SIAP_PORT` harus DIKOSONGKAN). Tanpa itu VPS tetap menarik data lama tanpa
memberi tanda apa pun.

**JANGAN taruh alamat SIAP/e-Presensi di `DATABASE_URL` VPS.** `DATABASE_URL`
di VPS tetap PostgreSQL milik Gajihub sendiri di server itu; sumber eksternal
lewat `SIAP_*` dan `EPRESENSI_*`.

**Catatan lain**: tabel-tabel baru dari migrasi role-matrix (`banding`,
`bukti_dukung`, `sk_kgb`, `sk_hukuman_disiplin`, `anggaran_realisasi`,
`bukti_potong_pajak`, `usulan_perubahan_role`) sempat ke-`OWNER`-kan ke
`postgres` karena migrasi dijalankan manual lewat `sudo -u postgres psql`
(bukan lewat koneksi `DATABASE_URL` biasa) - sudah di-`ALTER TABLE ...
OWNER TO gajihub_app` semua supaya user aplikasi punya privilege yang
benar. Kalau deploy ke server baru lagi dan migrasi butuh dijalankan manual
lagi (lihat alasan di atas), jangan lupa langkah re-owner ini.

**Deploy fitur riwayat gaji/gaji induk ke VPS**: sama seperti multi-role di
bawah, butuh migrasi (`20260729000000_tambah_gaji_induk`, satu `CREATE
TABLE` + 2 foreign key, non-destruktif - tidak menyentuh tabel yang sudah
ada): `git pull origin main && npx prisma migrate deploy && npm run build &&
pm2 restart gajihub`. Data gaji induk-nya sendiri TIDAK ikut deploy (bukan
seed) - PPABP tinggal upload file ADK GPP lewat `/ppabp/gaji-induk` di
server itu. Kalau migrasi terpaksa dijalankan manual lewat `sudo -u postgres
psql`, jangan lupa `ALTER TABLE gaji_induk OWNER TO gajihub_app` (masalah
owner yang sama seperti tabel-tabel role matrix).

**Deploy fitur multi-role ke VPS**: butuh migrasi database, jadi urutannya
`git pull origin main && npx prisma migrate deploy && npm run build && pm2
restart gajihub` (bukan cuma pull-build-restart seperti biasa). Migrasinya
satu `ALTER TABLE ... ADD COLUMN` yang aman & non-destruktif - semua akun
yang sudah ada tetap single-role sampai Admin menambahkan role tambahan
lewat UI. Kalau mau akun demo ADMIN di VPS langsung punya semua role,
jalankan ulang `npx tsx src/auth/seedUsers.ts` (idempotent, upsert) - TAPI
ingat itu juga akan mengembalikan role 12 akun demo lain ke nilai seed, jadi
kalau ada assignment manual di VPS yang mau dipertahankan, lebih aman
tambahkan role tambahannya lewat halaman "Kelola Assignment Role" saja.

