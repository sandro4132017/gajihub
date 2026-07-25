// ============================================================================
// UANG MAKAN CALCULATION
//
// CATATAN: Berbeda dari tukin.ts, tarif uang makan TIDAK dihardcode di sini
// karena besarannya diatur oleh Peraturan Menteri Keuangan (Standar Biaya
// Masukan) yang terbit tahunan dan bisa berubah - engine ini menerima tarif
// sebagai parameter input, bukan konstanta. Sumber tarif per tahun anggaran
// perlu dikonfirmasi ke Biro Keuangan/DJA saat setup awal.
// ============================================================================

import type { UangMakanInput, UangMakanResult } from "../types/index";

export function hitungUangMakan(input: UangMakanInput): UangMakanResult {
  const anomali: string[] = [];

  if (input.jumlahHariHadir > input.jumlahHariKerja) {
    anomali.push(
      `jumlahHariHadir (${input.jumlahHariHadir}) melebihi jumlahHariKerja (${input.jumlahHariKerja}) - kemungkinan data presensi tidak konsisten dengan kalender kerja.`
    );
  }
  if (input.tarifHarianUangMakan <= 0) {
    anomali.push("tarifHarianUangMakan harus lebih besar dari 0.");
  }

  const hariHadirValid = Math.min(input.jumlahHariHadir, input.jumlahHariKerja);
  const totalUangMakan = Math.max(0, hariHadirValid) * input.tarifHarianUangMakan;

  return {
    pegawaiId: input.pegawaiId,
    periodeBulan: input.periodeBulan,
    periodeTahun: input.periodeTahun,
    totalUangMakan,
    anomali,
  };
}
