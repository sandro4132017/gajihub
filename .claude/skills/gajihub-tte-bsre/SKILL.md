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
| `public/uploads/tte/` | Penyimpanan berkas PDF draft dan signed di server lokal. |

## Model Data Prisma

- **`DokumenTte`**: Mencatat metadata dokumen (jenis `SPTJM_LEMBUR`, periode, satker, status `DRAFT`/`MENUNGGU_TTE`/`TERTANDATANGANI`/`GAGAL`, path berkas, ID Dokumen BSrE, waktu penandatanganan).
- **`LogGagalTte`**: Jejak audit kegagalan TTE untuk kepatuhan regulasi BSrE BSSN.

## Lingkungan Dev & Uji Coba

- **Endpoint**: `ESIGN_BASE_URL="http://192.168.221.11"`
- **Kredensial API Server**: Basic Auth `ESIGN_API_USER="temporary"`, `ESIGN_API_PASS="T3mp0reRy"`.
- **Akun Dummy Penandatangan**: NIK `0803202100007062`, Passphrase `Bsre2026.#!`.
- Jangan pernah hardcode kredensial produksi ke dalam git repository.

