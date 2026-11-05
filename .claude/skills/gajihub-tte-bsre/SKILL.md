---
name: gajihub-tte-bsre
description: Use whenever working on Tanda Tangan Elektronik (TTE), BSrE BSSN integration, Esign Client Service, SPTJM signing, digital certificate status check, passphrase handling, PDF generation with visual coordinate tags, or document verification. Use before touching src/lib/tte/, src/app/tte/, DokumenTte, or LogGagalTte models, and whenever ensuring compliance with the 11 BSrE Integration Criteria.
---

# Gajihub - TTE BSrE & SPTJM

Panduan dan aturan baku integrasi Tanda Tangan Elektronik (TTE) dengan Balai Sertifikasi Elektronik (BSrE) Badan Siber dan Sandi Negara (BSSN) untuk dokumen Surat Pernyataan Tanggung Jawab Mutlak (SPTJM) di Gajihub.

## 11 Kriteria Integrasi BSrE (Kepatuhan Wajib)

Sistem Gajihub terhubung ke **Esign Client Service v2.2.2** (`http://192.168.221.11`). Seluruh implementasi TTE tunduk pada Kriteria Integrasi Sistem BSrE BSSN:

1. **Passphrase Tidak Pernah Disimpan (Kriteria V & VIII)**:
   - DILARANG KERAS menyimpan passphrase penandatangan di database, session, localStorage, cookies, file log, maupun URL.
   - Input field passphrase WAJIB memiliki atribut `type="password"` dan `autocomplete="off"`.
   - Passphrase hanya boleh berada di memori saat payload `FormData` dikirim ke endpoint `/api/sign/pdf`, kemudian langsung dibuang (`garbage collected`).
2. **Pencatatan Log Kegagalan Resmi (Kriteria IX)**:
   - Setiap kegagalan penandatanganan (passphrase salah, sertifikat expired, koneksi putus) WAJIB dicatat di tabel database `log_gagal_tte`.
   - Data yang dicatat: NIP penandatangan, `status_code`, `pesan_error` (respon resmi server BSrE), `kategori_error`, dan timestamp.
   - DILARANG mencatat passphrase yang gagal di tabel log ini.
3. **Klausul TTE Resmi pada Dokumen (Kriteria XI)**:
   - Setiap berkas PDF yang dihasilkan wajib mencantumkan footer resmi BSrE:
     *"Dokumen ini telah ditandatangani secara elektronik menggunakan sertifikat elektronik yang diterbitkan oleh Balai Sertifikasi Elektronik (BSrE), Badan Siber dan Sandi Negara."*
4. **Validasi Status Pengguna**:
   - Sebelum menandatangani, sistem memeriksa ketersediaan sertifikat melalui `GET /api/user/status/{nik}`. Status `ISSUE` menandakan sertifikat aktif dan siap menandatangani.

## Arsitektur & Peta Berkas TTE

| Berkas / Direktori | Tanggung Jawab |
|---|---|
| `src/lib/tte/esignClient.ts` | Adapter API Esign Client BSrE (`checkUserStatus`, `signPdf`, `verifyPdf`). Pure HTTP fetch layer dengan Basic Auth. |
| `src/lib/tte/sptjmPdf.ts` | Generator berkas PDF SPTJM A4 menggunakan `pdf-lib`. Menempatkan tag koordinat `#` untuk QR code dan footer resmi BSrE. |
| `src/app/tte/actions.ts` | Server Action untuk alur signing: agregasi nominal lembur satker, buat draft PDF, panggil Esign Client, simpan file ke storage, catat `DokumenTte` & `LogGagalTte`. |
| `src/app/tte/ModalPassphraseTte.tsx` | Dialog interaktif input passphrase bertopeng (`autocomplete="off"`), pengecekan status sertifikat, dan penanganan error BSrE. |
| `src/app/kasubag/kalkulasi/PanelTteSptjm.tsx` | Panel UI di halaman Kalkulasi Kasubag TU sebelum kirim rekap ke PPABP. |
| `storage/uploads/tte/<Nama Unit>/<tahun-bulan>/` | Penyimpanan PRIVAT berkas PDF draft dan signed (akar bisa ditimpa env `GAJIHUB_STORAGE_DIR`). Disajikan hanya lewat `/berkas/tte/[id]` dan `/berkas/tte-pratinjau` (izin `canLihatDokumenSptjm`); verifikasi publik lewat `/tte/verify/[id]/berkas`. Berkas lama tetap di struktur lama `tte/...` tanpa folder unit. Resolver: `src/lib/storage/berkasPrivat.ts`. |

## Model Data Prisma

- **`DokumenTte`**: Mencatat metadata dokumen (jenis `SPTJM_LEMBUR`, periode, satker, status `DRAFT`/`MENUNGGU_TTE`/`TERTANDATANGANI`/`GAGAL`, path berkas, ID Dokumen BSrE, waktu penandatanganan).
- **`LogGagalTte`**: Jejak audit kegagalan TTE untuk kepatuhan regulasi BSrE BSSN.

## Lingkungan Dev & Uji Coba

- **Endpoint**: `ESIGN_BASE_URL="http://192.168.221.11"`
- **Kredensial API Server**: Basic Auth `ESIGN_API_USER="temporary"`, `ESIGN_API_PASS="T3mp0reRy"`.
- **Akun Dummy Penandatangan**: NIK `0803202100007062`, Passphrase `Bsre2026.#!`.
- Jangan pernah hardcode kredensial produksi ke dalam git repository.


## Akun demo di kode - DISENGAJA selama pengembangan (keputusan user 2026-10-22)

Dua hal berikut ditandai pemindai `tools/check-sensitive.mjs` dan oleh review,
tapi **dipertahankan atas keputusan user**: fitur TTE masih dikembangkan dan
butuh akun demo BSrE untuk diuji.

1. `src/app/tte/ModalPassphraseTte.tsx` - NIK demo jadi nilai bawaan, dan
   passphrase demo terisi otomatis kalau NIK-nya NIK demo.
2. `src/app/tte/actions.ts` (dua tempat: `nikTarget || TEST_BSRE_NIK || <NIK demo>`)
   - NIK kosong jatuh ke akun demo.

Temuan 2026-11-05: passphrase demo tertanam di kode klien `src/app/tte/ModalPassphraseTte.tsx:159-160` sehingga ikut terkirim ke browser; keputusan user 2026-11-05 membiarkannya sampai TTE dipakai sungguhan.

**Jangan "dibereskan" atas inisiatif sendiri**, dan jangan dilaporkan ulang
sebagai temuan baru - keputusannya sudah diambil.

**WAJIB DICABUT SEBELUM TTE DIPAKAI MENANDATANGANI DOKUMEN SUNGGUHAN**
(paling lambat go-live 1 Januari 2027), karena keduanya bertentangan dengan
Kriteria BSrE V & VIII di atas:
- passphrase demo tidak boleh ada di bundle klien sama sekali;
- NIK kosong harus DITOLAK dengan pesan yang menyebut sebabnya, bukan
  dijatuhkan ke akun demo - kalau tidak, dokumen produksi bisa
  tertandatangani atas nama akun uji coba tanpa ada yang menyadarinya.

## Stempel simulasi

- Di production stempel simulasi TIDAK PERNAH diterbitkan; `TTE_SIMULASI` diabaikan.
- Di non-production hanya bila `TTE_SIMULASI="true"` (`bolehSimulasiTte()` di
  `src/lib/tte/simulasiTte.ts`). Mode jaringan INTERNAL/PUBLIC tidak berpengaruh.
- Tanpa itu, kegagalan BSrE = dokumen `GAGAL`, tidak diterbitkan, dan dicatat di
  `log_gagal_tte` (Kriteria IX) dengan `kategoriError`:
  - `PASSPHRASE_SALAH` - passphrase ditolak BSrE.
  - `NETWORK_TIMEOUT` - BSrE tidak terjangkau (timeout/koneksi), juga untuk pemeriksaan sertifikat.
  - `BSRE_ERROR` - BSrE membalas HTTP 5xx atau galat lain.
  - `SERTIFIKAT_BELUM_SIAP` - pemeriksaan sertifikat menolak (belum terdaftar/dicabut); `dokumenTteId` null.
  - `SIMULASI_DITERAPKAN` - stempel simulasi dibubuhkan (hanya non-production).
  - `SYSTEM_EXCEPTION` - galat tak terduga.
- `apakahHasilSimulasi()` adalah satu-satunya penentu apakah dokumen hasil simulasi.

## Indikator koneksi BSrE

- Route `GET /api/tte/koneksi` (`src/lib/tte/koneksiBsre.ts`, komponen `src/app/tte/StatusKoneksiBsre.tsx`).
  Hanya KASUBAG_TU yang satuan kerjanya terisi dan ADMIN (`canLihatStatusLayananTte`); tanpa sesi 401, selain itu 403.
  Isinya hanya `keadaan`, `sebab`, `diperiksaPada` - tidak pernah alamat server, NIK, atau pesan galat.
- Pemeriksaan = satu GET status ke Esign Client dengan NIK probe dari `ESIGN_PROBE_NIK`.
  Bawaannya sentinel `0000000000000000`. Bukan NIK asli (data pribadi) dan bukan NIK demo
  (fallback akun demo di `checkUserStatus` akan menyamarkan gangguan jadi "ISSUE"; ping sengaja
  tanpa fallback dan tanpa retry). Jawaban "tidak terdaftar" tetap berarti layanan hidup.
- Beban: cache 60 detik per proses, permintaan bersamaan digabung, "Periksa ulang" hanya menembus
  cache bila umurnya > 15 detik. Jadi maksimal sekitar 1 ping per 60 detik per proses (tanpa polling di klien).
- Sesi habis: middleware mengalihkan ke /login; komponen memperlakukan pengalihan seperti 401/403 dan menyembunyikan diri.

## Sakelar NIK demo BSrE (`TTE_IZINKAN_NIK_DEMO`, 2026-11-05)

Aturan dasar: NIK yang diketik saat menandatangani SPTJM harus milik pemegang
sesi (dicocokkan lewat `Pegawai.sidikNik`, `src/app/tte/actions.ts`). Akun tanpa
sidik NIK (mis. pegawai dummy Tim Pusdatik) tidak bisa dicocokkan, jadi lolos.

Pengecualian (keputusan user): NIK demo BSrE (`NIK_DEMO_BSRE` di
`src/lib/tte/simulasiTte.ts`) boleh dipakai akun mana pun bila
`TTE_IZINKAN_NIK_DEMO="true"` di `.env` (bawaan mati; perlu `pm2 restart`).
Selama hidup, SPTJM bisa mencetak nama pegawai yang login dengan tanda tangan
sertifikat demo - **matikan sebelum SPTJM dipakai sebagai dasar pembayaran**.
Pemakaiannya dicatat `console.warn` tanpa NIK/passphrase. NIK lain tetap
ditolak walau sakelar hidup (ada test di `signSptjmSimulasi.test.ts`).
