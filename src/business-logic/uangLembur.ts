// ============================================================================
// UANG LEMBUR CALCULATION
//
// Sama seperti uang makan, tarifPerJam & batasMaksimalJamLembur adalah input
// eksternal (mengikuti Standar Biaya Masukan PMK yang berlaku per tahun
// anggaran), BUKAN konstanta yang di-hardcode di engine ini.
// ============================================================================

import type { UangLemburInput, UangLemburResult } from "../types/index";

const BATAS_DEFAULT_JAM_LEMBUR_PER_BULAN = 40; // TODO(confirm): sesuaikan dengan aturan SBM terbaru

export function hitungUangLembur(input: UangLemburInput): UangLemburResult {
  const anomali: string[] = [];
  const batasMaksimal =
    input.batasMaksimalJamLembur ?? BATAS_DEFAULT_JAM_LEMBUR_PER_BULAN;

  if (input.totalJamLembur < 0) {
    anomali.push("totalJamLembur tidak boleh negatif.");
  }
  if (input.totalJamLembur > batasMaksimal) {
    anomali.push(
      `totalJamLembur (${input.totalJamLembur}) melebihi batas maksimal (${batasMaksimal} jam/bulan) - kelebihan jam tidak dibayarkan, perlu verifikasi ke atasan langsung.`
    );
  }
  if (input.tarifPerJam <= 0) {
    anomali.push("tarifPerJam harus lebih besar dari 0.");
  }

  const jamLemburDihitung = Math.max(0, Math.min(input.totalJamLembur, batasMaksimal));
  const totalUangLembur = jamLemburDihitung * input.tarifPerJam;

  return {
    pegawaiId: input.pegawaiId,
    periodeBulan: input.periodeBulan,
    periodeTahun: input.periodeTahun,
    jamLemburDihitung,
    totalUangLembur,
    anomali,
  };
}
