// ============================================================================
// UANG LEMBUR CALCULATION
//
// Pendapatan lembur terdiri dari DUA komponen terpisah (SBM 2026 halaman -13-):
//   1. Uang lembur       - item 23.1, satuan OJ (orang/JAM)
//   2. Uang makan lembur - item 23.2, satuan OH (orang/HARI)
//
// Satuannya BEDA, dan itu inti perhitungannya: uang lembur dikali JAM, uang
// makan lembur dikali HARI. Karena itu total jam sebulan saja TIDAK CUKUP
// buat menghitung uang makan lembur - harus tahu berapa HARI yang lemburnya
// memenuhi syarat.
//
// SYARAT UANG MAKAN LEMBUR (aturan dari user, ditegaskan 2026-07-29):
// lembur pada satu hari harus mencapai MINIMAL 2 JAM. Lembur 1 jam tetap
// dapat uang lembur (1 x tarif per jam), tapi tidak dapat uang makan lembur.
//
// Tarif tidak dihardcode di sini - lihat src/business-logic/tarifSbm.ts.
//
// TODO(confirm):
// - Batas maksimal jam lembur per bulan TIDAK disebut di SBM. Angka 40 jam
//   di bawah adalah asumsi lama yang MASIH belum dikonfirmasi ke Biro
//   Keuangan/DJA - jangan dianggap resmi.
// - Belum ada ketentuan berbeda untuk lembur di hari libur/akhir pekan.
//   SBM item 23 tidak membedakannya, jadi di sini juga tidak dibedakan.
// ============================================================================

import type { UangLemburInput, UangLemburResult } from "../types/index";

const BATAS_DEFAULT_JAM_LEMBUR_PER_BULAN = 40; // TODO(confirm): tidak diatur di SBM
const MINIMAL_JAM_LEMBUR_DAPAT_MAKAN = 2; // syarat uang makan lembur

/**
 * Hitung berapa HARI yang berhak uang makan lembur dari rincian jam lembur
 * per hari. Dipisah jadi fungsi sendiri supaya pemanggil yang PUNYA rincian
 * harian bisa menurunkannya sendiri, sementara pemanggil yang cuma punya
 * rekap bulanan mengisi `jumlahHariMakanLembur` langsung.
 *
 * Contoh: [1, 2, 3.5, 0.5] -> 2 hari (yang 2 jam dan yang 3,5 jam).
 */
export function hitungHariBerhakMakanLembur(rincianJamPerHari: number[]): number {
  return rincianJamPerHari.filter((jam) => jam >= MINIMAL_JAM_LEMBUR_DAPAT_MAKAN).length;
}

export function hitungUangLembur(input: UangLemburInput): UangLemburResult {
  const anomali: string[] = [];
  const batasMaksimal = input.batasMaksimalJamLembur ?? BATAS_DEFAULT_JAM_LEMBUR_PER_BULAN;

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

  // --- Komponen 1: uang lembur (per JAM) ---
  const uangLembur = jamLemburDihitung * input.tarifPerJam;

  // --- Komponen 2: uang makan lembur (per HARI, syarat >= 2 jam/hari) ---
  const hariMakanLembur = Math.max(0, input.jumlahHariMakanLembur ?? 0);
  const tarifMakanLembur = input.tarifMakanLemburPerHari ?? 0;

  if (hariMakanLembur > 0 && tarifMakanLembur <= 0) {
    anomali.push(
      "Ada hari yang berhak uang makan lembur tapi tarif uang makan lemburnya belum diisi - uang makan lembur dihitung 0."
    );
  }
  // Penjagaan konsistensi: n hari yang masing-masing >= 2 jam berarti total
  // jamnya minimal 2n. Kalau kurang, salah satu datanya keliru.
  if (hariMakanLembur * MINIMAL_JAM_LEMBUR_DAPAT_MAKAN > input.totalJamLembur) {
    anomali.push(
      `Jumlah hari berhak uang makan lembur (${hariMakanLembur} hari) tidak konsisten dengan total jam lembur (${input.totalJamLembur} jam) - ${hariMakanLembur} hari x minimal ${MINIMAL_JAM_LEMBUR_DAPAT_MAKAN} jam seharusnya minimal ${hariMakanLembur * MINIMAL_JAM_LEMBUR_DAPAT_MAKAN} jam.`
    );
  }

  const uangMakanLembur = hariMakanLembur * tarifMakanLembur;

  return {
    pegawaiId: input.pegawaiId,
    periodeBulan: input.periodeBulan,
    periodeTahun: input.periodeTahun,
    jamLemburDihitung,
    jumlahHariMakanLembur: hariMakanLembur,
    uangLembur,
    uangMakanLembur,
    totalUangLembur: uangLembur + uangMakanLembur,
    anomali,
  };
}
