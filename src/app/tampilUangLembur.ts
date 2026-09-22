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
// EMPAT SAKLAR, BUKAN SATU - dan pemisahannya hasil dua koreksi user.
// (2026-09-02) "side menu lembur masih ada, yang di-hide itu di tabel aja":
// satu saklar dulu mematikan SEMUANYA sekaligus, termasuk menu dan halaman
// pemantauan jamnya - jauh lebih luas dari yang diminta.
// (2026-09-18) rupiahnya boleh tampil DI HALAMAN PEMANTAUAN, tetap ditahan di
// tabel kalkulasi. Yang membedakan keduanya bukan selera tampilan melainkan
// siapa yang membaca dan ke mana angkanya mengalir - lihat
// TAMPILKAN_NOMINAL_LEMBUR_PEMANTAUAN di bawah.
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
 * RUPIAH lembur di tempat yang angkanya MENGALIR KELUAR: kolom di tabel
 * kalkulasi, kartu ringkasan dashboard, baris di slip gaji pegawai, dan total
 * belanja unit.
 *
 * TIDAK mencakup halaman pemantauan /uang-lembur - itu punya saklar sendiri
 * di bawah, dan sejak 2026-09-18 memang menyala.
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
 * Nominal di halaman pemantauan `/uang-lembur` saja - nama pegawai beserta
 * rupiah yang akan dia terima.
 *
 * KENAPA HALAMAN INI BOLEH, SEMENTARA TABEL KALKULASI TIDAK. Bukan karena
 * angkanya lebih matang di sini - angkanya sama persis, dari baris
 * `UangLembur` yang sama. Yang berbeda pembacanya dan ke mana angkanya pergi:
 *
 *   - Halaman ini dijaga `canViewApproverDashboard`; PEGAWAI ditolak masuk.
 *     Angkanya berhenti di petugas yang memang bertugas memeriksanya.
 *   - Tabel kalkulasi, slip gaji, dan kartu dashboard mengalirkan angka itu
 *     ke pegawai, ke total belanja unit, dan ke berkas yang disetorkan -
 *     tempat angka belum final berubah jadi janji pembayaran.
 *
 * Sisi baiknya justru ini yang membuat penundaannya berguna: tata caranya
 * sedang disusun, dan nominal yang tidak pernah terlihat siapa pun tidak bisa
 * dicek kewajarannya sebelum ditetapkan.
 *
 * Kartu peringatan di halaman itu TIDAK ikut dimatikan - selama tata caranya
 * belum turun, angkanya ditampilkan lengkap dengan alasan kenapa ia belum
 * boleh dikutip. Lihat CATATAN_UANG_LEMBUR_BELUM_FINAL.
 *
 * DIMATIKAN LAGI 2026-09-21 atas permintaan user: "di tabel halaman jam
 * lembur, tidak perlu dipakai nominal". Yang diperiksa di halaman itu
 * sekarang JAM-nya - hari kerja dan hari libur dipisah jadi kolom sendiri,
 * karena keduanya dihitung dengan cara yang berbeda dan di situlah
 * kekeliruan bisa terlihat. Rupiahnya turunan dari jam, jadi memeriksa jam
 * lebih dulu memang urutan yang benar.
 *
 * Saklarnya TIDAK dihapus - tata cara dari Bagian Keuangan belum turun, dan
 * begitu turun nominalnya tinggal dinyalakan lagi di sini.
 */
export const TAMPILKAN_NOMINAL_LEMBUR_PEMANTAUAN = false;

/**
 * Berkas ADK Uang Lembur - tombol unduhnya di /ppabp/adk dan route-nya.
 *
 * DIPISAH DARI TIGA SAKLAR DI ATAS karena taruhannya beda tingkat. Yang lain
 * soal angka yang salah dikutip orang; yang ini soal angka yang belum
 * disetujui MASUK ke Web Gaji lalu terbayar. Berkasnya memang cuma memuat
 * jam, tapi Web Gaji yang mengubahnya jadi rupiah - jadi ia tetap perintah
 * bayar.
 *
 * DIBUKA 2026-09-22 atas permintaan user. Dua sebab penutupannya sudah
 * hilang, dan keduanya soal isi, bukan soal tampilan:
 *
 *   - Jam lembur hari kerja SEKARANG ADA. Dulu Gajihub cuma membaca baris
 *     ber-status "Lembur" di e-Presensi, yang di lapangan hampir tidak pernah
 *     dipakai untuk hari kerja - berkas yang dihasilkan pasti jauh lebih
 *     sedikit dari yang diajukan. Sejak 2026-09-18 lembur hari kerja
 *     diturunkan dari ketukan.
 *   - Gerbang isinya sudah benar. Route-nya dulu masih memakai
 *     `status: "APPROVED"` yang sudah dihapus, jadi berkasnya selalu kosong;
 *     sekarang memakai gerbang PENGIRIMAN UNIT seperti dua ADK lainnya.
 *
 * YANG BELUM SELESAI dan sengaja TIDAK ditutup dengan saklar: berkas ini
 * memuat jam TERHITUNG, bukan hak bayar. Yang mengesahkan lembur adalah surat
 * perintah lembur, dan petugas yang mengadu berkas ini kepadanya sebelum
 * dibayarkan. Itu pembagian kerja yang memang diminta user, bukan kekurangan
 * yang harus disembunyikan - jadi tempatnya di peringatan di layar
 * /ppabp/adk, bukan di saklar ini.
 */
export const TAMPILKAN_ADK_LEMBUR = true;

/**
 * Kalimat yang ditampilkan di tempat angkanya biasanya berada. Disatukan di
 * sini supaya seluruh halaman menyebut alasan yang SAMA - alasan yang
 * berbeda-beda di tiap halaman terbaca sebagai kerusakan, bukan keputusan.
 */
export const ALASAN_UANG_LEMBUR_DISEMBUNYIKAN =
  "Uang lembur belum ditampilkan - hitungannya masih menunggu persetujuan atasan (batas jam per bulan, pengali hari libur, dan syarat jam kerja harian belum ditetapkan). Jam lemburnya tetap terekam dan nominalnya akan muncul begitu tata caranya turun.";

/**
 * Dipasang di tempat nominalnya DITAMPILKAN tapi belum final - beda peran
 * dengan ALASAN_UANG_LEMBUR_DISEMBUNYIKAN di atas, yang menjelaskan kenapa
 * angkanya TIDAK ADA.
 */
export const CATATAN_UANG_LEMBUR_BELUM_FINAL =
  "Angka di bawah masih menunggu tata cara final dari Bagian Keuangan dan perlu diperiksa sebelum dibayarkan.";
