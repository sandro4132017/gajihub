// ============================================================================
// TARIF TUKIN POKOK PER KELAS JABATAN
// Sumber: Lampiran Peraturan Menteri Ketenagakerjaan Nomor 15 Tahun 2024
// tentang Pemberian Tunjangan Kinerja Pegawai di Lingkungan Kementerian
// Ketenagakerjaan (halaman -12-), ditandatangani Menteri Ketenagakerjaan
// Yassierli. Dikonfirmasi identik dengan kolom "TUNJANGAN KINERJA PER KELAS
// JABATAN" di Lampiran Kepsekjen 82 Tahun 2025 (halaman -7-).
//
// Ini nilai RESMI, bukan lagi angka contoh - aman dipakai ke data production
// untuk komponen tukin pokok. (Yang MASIH belum resmi: tarif uang makan/
// lembur dari SBM PMK, dan jumlah jenjang approval - lihat TODO(confirm) di
// modul lain.)
// ============================================================================

export const TUKIN_POKOK_PER_KELAS_JABATAN: Record<number, number> = {
  1: 2_531_250,
  2: 2_708_250,
  3: 2_898_000,
  4: 2_985_000,
  5: 3_134_250,
  6: 3_510_400,
  7: 3_915_950,
  8: 4_595_150,
  9: 5_079_200,
  10: 5_979_200,
  11: 8_757_600,
  12: 9_896_000,
  13: 10_936_000,
  14: 17_064_000,
  15: 19_280_000,
  16: 27_577_500,
  17: 33_240_000,
};
