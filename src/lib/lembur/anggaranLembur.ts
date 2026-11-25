// Konstanta anggaran yang dicetak di SPKL (butir Dasar dan Pembiayaan). Murni -
// tanpa I/O. Satu baris per tahun anggaran; tahun yang belum terdaftar TIDAK
// ditebak dari tahun lain, dicetak sebagai penanda.

export interface AnggaranLembur {
  /** Nomor DIPA tanpa awalan "SP", mis. "DIPA-xxx/2026". */
  nomorDipa: string;
  /** Tanggal DIPA, teks panjang. */
  tanggalDipa: string;
  /** Kode akun belanja lembur. */
  akun: string;
}

export const BELUM_DIKONFIRMASI = "[belum dikonfirmasi]";

// Sumber 2026: docs/lembur/SPKL_Bulan Oktober 2026.pdf (butir Dasar 5 dan Pembiayaan).
export const ANGGARAN_LEMBUR: Readonly<Record<number, AnggaranLembur>> = {
  2026: {
    nomorDipa: "DIPA-026.01.1.450938/2026",
    tanggalDipa: "1 Desember 2025",
    akun: "026.01.WA.2158.EBA.994.001.A.512211",
  },
};

/**
 * Anggaran untuk tahun itu. Tahun yang belum terdaftar mengembalikan penanda
 * "[belum dikonfirmasi]" di tiap isian (angka pembayaran tidak boleh ditebak).
 * TODO(confirm): isi DIPA dan akun tahun 2027 begitu DIPA-nya terbit.
 */
export function anggaranUntukTahun(tahun: number): AnggaranLembur & { terdaftar: boolean } {
  const a = ANGGARAN_LEMBUR[tahun];
  if (a) return { ...a, terdaftar: true };
  return { nomorDipa: BELUM_DIKONFIRMASI, tanggalDipa: BELUM_DIKONFIRMASI, akun: BELUM_DIKONFIRMASI, terdaftar: false };
}
