// ============================================================================
// RINCIAN TUKIN DARI BARIS YANG SUDAH TERSIMPAN
//
// `TukinCalculation` cuma menyimpan HASIL AKHIR tiap komponen; nilai PENUH
// tiap bobot dan besar potongan Pasal 13-nya tidak ikut disimpan. Modul ini
// merekonstruksinya dari data yang ADA, supaya UI bisa menjawab "kenapa tukin
// saya segini" tanpa menghitung ulang seluruh kalkulasi.
//
// Bahan tambahan satu-satunya: TUKIN_POKOK_PER_KELAS_JABATAN. Dari situ:
//   bobot kehadiran penuh = 30% x tarif kelas    (Pasal 5 ayat (2) huruf b)
//   bobot kinerja penuh   = 70% x tarif kelas    (Pasal 5 ayat (2) huruf a)
//   potongan Pasal 13     = bobot kehadiran penuh - komponenKehadiran
//   potongan capaian      = bobot kinerja penuh - komponenKinerja
//
// INI REKONSTRUKSI, BUKAN SUMBER KEBENARAN. Kalau tarif kelas berubah SETELAH
// baris tukin dihitung, angkanya tidak lagi cocok dengan yang benar-benar
// dipakai - itu terdeteksi lewat `selisihAritmatika`, jangan diam-diam
// dianggap wajar.
//
// Kalau override cuti (Pasal 14) diterapkan, `hitungTukin` menimpa tukinPokok
// dan TIDAK menyentuh komponenKehadiran/komponenKinerja - jadi kehadiran +
// kinerja SENGAJA tidak sama dengan tukinPokok untuk baris seperti itu. Bukan
// kerusakan data, tapi juga tidak boleh ditampilkan seolah penjumlahan biasa.
// ============================================================================

const BOBOT_KEHADIRAN = 0.3; // Pasal 5 ayat (2) huruf b
const BOBOT_KINERJA = 0.7; // Pasal 5 ayat (2) huruf a

/** Toleransi pembulatan floating point (rupiah). Bukan toleransi kebijakan. */
const TOLERANSI_RUPIAH = 1;

/** Subset kolom TukinCalculation yang dipakai - sengaja bukan tipe Prisma
 *  supaya modul ini tetap pure dan gampang di-test tanpa database. */
export interface BarisTukinTersimpan {
  komponenKehadiran: number;
  komponenKinerja: number;
  tukinPokok: number;
  potonganPph: number;
  tukinBersih: number;
}

export interface RincianTukinTersimpan {
  /** 30% x tarif kelas jabatan. null kalau tarif kelasnya tidak diketahui. */
  bobotKehadiranPenuh: number | null;
  /** Potongan Pasal 13 dalam rupiah. null kalau tarif kelasnya tidak diketahui. */
  potonganKehadiran: number | null;
  komponenKehadiran: number;

  /** 70% x tarif kelas jabatan. null kalau tarif kelasnya tidak diketahui. */
  bobotKinerjaPenuh: number | null;
  /** Selisih akibat predikat di bawah 100%. null kalau tarif kelasnya tidak diketahui. */
  potonganKinerja: number | null;
  komponenKinerja: number;

  /** Nilai sebelum PPh (kolom `tukinPokok` di database - BUKAN tarif kelas jabatan). */
  tukinBruto: number;
  potonganPph: number;
  tukinBersih: number;

  /**
   * tukinPokok - (komponenKehadiran + komponenKinerja).
   * Nol untuk kalkulasi normal. Tidak nol berarti tukinPokok tidak berasal
   * dari penjumlahan kedua komponen - penyebab yang sudah diketahui adalah
   * override cuti Pasal 14; penyebab lain patut dicurigai sebagai data basi.
   */
  selisihAritmatika: number;
  /** true kalau selisihAritmatika di luar toleransi pembulatan. */
  adaSelisih: boolean;
}

/**
 * @param tarifKelasJabatan tukin pokok kelas jabatan pegawai (TUKIN_POKOK_PER_KELAS_JABATAN).
 *        Lewatkan null kalau kelas jabatannya tidak diketahui / tidak ada di
 *        tabel tarif - fungsi ini TIDAK menebak, bagian rinciannya dikembalikan
 *        null supaya UI menampilkan "tidak diketahui", bukan angka karangan.
 */
export function rincianTukinTersimpan(
  baris: BarisTukinTersimpan,
  tarifKelasJabatan: number | null
): RincianTukinTersimpan {
  const bobotKehadiranPenuh = tarifKelasJabatan === null ? null : tarifKelasJabatan * BOBOT_KEHADIRAN;
  const bobotKinerjaPenuh = tarifKelasJabatan === null ? null : tarifKelasJabatan * BOBOT_KINERJA;

  const selisihAritmatika = baris.tukinPokok - (baris.komponenKehadiran + baris.komponenKinerja);

  return {
    bobotKehadiranPenuh,
    potonganKehadiran: bobotKehadiranPenuh === null ? null : bobotKehadiranPenuh - baris.komponenKehadiran,
    komponenKehadiran: baris.komponenKehadiran,

    bobotKinerjaPenuh,
    potonganKinerja: bobotKinerjaPenuh === null ? null : bobotKinerjaPenuh - baris.komponenKinerja,
    komponenKinerja: baris.komponenKinerja,

    tukinBruto: baris.tukinPokok,
    potonganPph: baris.potonganPph,
    tukinBersih: baris.tukinBersih,

    selisihAritmatika,
    adaSelisih: Math.abs(selisihAritmatika) > TOLERANSI_RUPIAH,
  };
}
