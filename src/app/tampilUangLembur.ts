// ============================================================================
// SAKLAR TAMPILAN UANG LEMBUR - satu tempat, bukan tujuh tambalan.
//
// KENAPA ADA. Hitungan uang lembur BELUM disetujui atasan (keputusan user
// 2026-09-02). Tiga hal pokoknya masih menggantung dan ketiganya mengubah
// nominal, bukan sekadar tampilan:
//   - batas 40 jam/bulan  : tidak disebut di SBM 2026 sama sekali;
//   - pengali 2x hari libur : kata "libur" tidak muncul di SBM 2026;
//   - "tutup dulu jam kerja harian" sebelum lembur dihitung;
// semuanya menunggu dokumen tata cara dari Bagian Keuangan. Lihat
// TODO(confirm) di src/business-logic/uangLembur.ts.
//
// TIGA SAKLAR, BUKAN SATU - dan pemisahan ini hasil koreksi user
// (2026-09-02): "side menu lembur masih ada, yang di-hide itu di tabel aja".
// Satu saklar dulu mematikan SEMUANYA sekaligus, termasuk menu dan halaman
// pemantauan jamnya - jauh lebih luas dari yang diminta. Yang ditunda cuma
// ANGKA RUPIAHNYA dan berkas yang menyetorkannya ke Web Gaji; memantau jam
// lembur tidak pernah jadi masalah.
// ============================================================================

/**
 * Menu sidebar "Uang Lembur" dan halaman /uang-lembur.
 *
 * TETAP HIDUP. Halaman itu tempat memantau JAM lembur yang masuk, dan
 * pengumpulan jam harus jalan terus selama menunggu tata cara turun - kalau
 * ikut dimatikan, periode-periode ini akan kosong dan harus diisi ulang dari
 * kertas.
 */
export const TAMPILKAN_MENU_LEMBUR = true;

/**
 * Setiap RUPIAH yang berasal dari lembur: kolom di tabel kalkulasi, kartu
 * ringkasan dashboard, baris di slip gaji, dan total belanja unit.
 *
 * Mencakup uang lembur DAN uang makan lembur sekaligus - keduanya sudah
 * terwakili karena `UangLembur.totalUangLembur` = uangLembur + uangMakanLembur.
 *
 * KENAPA MENYEMBUNYIKAN LEBIH JELAS DARIPADA MENAMPILKAN DENGAN CATATAN.
 * Angka yang tampil akan dikutip - disalin ke notulen, dibacakan di rapat,
 * dijadikan dasar pertanyaan pegawai - dan peringatan di sebelahnya tidak
 * ikut tersalin. Yang tidak tampil tidak bisa dikutip.
 *
 * YANG TETAP JALAN: JAM. Kolom "Jam Lembur" tetap tampil, form "Koreksi jam
 * lembur" tetap bisa diisi, jam per hari tetap tercatat, dan perhitungannya
 * tetap berjalan di belakang layar.
 */
export const TAMPILKAN_NOMINAL_LEMBUR = false;

/**
 * Berkas ADK Uang Lembur - tombol unduhnya di /ppabp/adk dan route-nya.
 *
 * DIPISAH DARI DUA SAKLAR DI ATAS karena taruhannya beda tingkat. Yang lain
 * soal angka yang salah dikutip orang; yang ini soal angka yang belum
 * disetujui MASUK ke Web Gaji lalu terbayar. Berkasnya memang cuma memuat
 * jam, tapi Web Gaji yang mengubahnya jadi rupiah - jadi ia tetap perintah
 * bayar.
 */
export const TAMPILKAN_ADK_LEMBUR = false;

/**
 * Kalimat yang ditampilkan di tempat angkanya biasanya berada. Disatukan di
 * sini supaya seluruh halaman menyebut alasan yang SAMA - alasan yang
 * berbeda-beda di tiap halaman terbaca sebagai kerusakan, bukan keputusan.
 */
export const ALASAN_UANG_LEMBUR_DISEMBUNYIKAN =
  "Uang lembur belum ditampilkan - hitungannya masih menunggu persetujuan atasan (batas jam per bulan, pengali hari libur, dan syarat jam kerja harian belum ditetapkan). Jam lemburnya tetap terekam dan nominalnya akan muncul begitu tata caranya turun.";
