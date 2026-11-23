/**
 * Sakelar tanda tangan elektronik (TTE BSrE) untuk jalur lembur.
 *
 * Keputusan user 2026-11-20: SEMENTARA lembur berjalan TANPA TTE. Kepala Tim
 * mengirim perintah tanpa passphrase, dan SPKL harian dibentuk otomatis lalu
 * terkunci tepat pukul 15.00 WIB (lihat `spklHarianTerkunci` di
 * business-logic/perintahLembur.ts). Seluruh kode TTE lembur (Surat Tugas,
 * SPKL bulanan, modal passphrase) TETAP ada di repo dan hanya dimatikan lewat
 * konstanta ini.
 *
 * Bila diaktifkan kembali, SPKL ber-TTE tidak boleh ditandatangani sebelum
 * batas 15.00 WIB: perintah masih bisa masuk sampai batas itu, jadi dokumen
 * yang ditandatangani lebih awal tidak memuat semuanya.
 *
 * TODO(confirm): kapan TTE lembur diaktifkan kembali.
 */
export const TTE_LEMBUR_AKTIF = false;
