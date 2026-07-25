// ============================================================================
// VALIDATION GATE
// Menerima hasil dari business logic engine (src/business-logic/) dan
// memutuskan apakah boleh lanjut ke status APPROVED atau harus ditahan untuk
// review manual. Pure function - tidak ada I/O, konsisten dengan konvensi
// business logic engine (lihat CLAUDE.md).
//
// Aturan saat ini sengaja sederhana: kalau engine sudah menandai `anomali`
// (apa pun isinya - termasuk catatan override Pasal 14 cuti), gate menahan
// untuk PERLU_REVIEW. Ini konsisten dengan prinsip CLAUDE.md "jangan diam-diam
// mengasumsikan" - banyak kasus (cuti tengah periode, gugur kandungan >1 bulan,
// potongan kehadiran >30%) masih open policy decision, jadi default-nya aman
// (ditahan) bukan lolos otomatis.
// ============================================================================

import type {
  TukinResult,
  UangMakanResult,
  UangLemburResult,
} from "../types/index";
import type { ValidationResult, JenisKomponen } from "./types";

function buatValidationResult(
  jenis: JenisKomponen,
  common: { pegawaiId: string; periodeBulan: number; periodeTahun: number },
  anomali: string[]
): ValidationResult {
  return {
    pegawaiId: common.pegawaiId,
    periodeBulan: common.periodeBulan,
    periodeTahun: common.periodeTahun,
    jenis,
    outcome: anomali.length === 0 ? "LOLOS" : "PERLU_REVIEW",
    anomali,
  };
}

export function validasiTukin(result: TukinResult): ValidationResult {
  return buatValidationResult("TUKIN", result, result.anomali);
}

export function validasiUangMakan(result: UangMakanResult): ValidationResult {
  return buatValidationResult("UANG_MAKAN", result, result.anomali);
}

export function validasiUangLembur(result: UangLemburResult): ValidationResult {
  return buatValidationResult("UANG_LEMBUR", result, result.anomali);
}
