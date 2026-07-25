// ============================================================================
// VALIDATION GATE - types
// Lihat CLAUDE.md item roadmap #1: gate ini memanggil business logic engine
// lalu mengecek anomali sebelum data masuk status APPROVED.
// ============================================================================

export type JenisKomponen = "TUKIN" | "UANG_MAKAN" | "UANG_LEMBUR";

export type ValidationOutcome = "LOLOS" | "PERLU_REVIEW";

export interface ValidationResult {
  pegawaiId: string;
  periodeBulan: number;
  periodeTahun: number;
  jenis: JenisKomponen;
  /**
   * LOLOS = tidak ada anomali dari business logic engine, siap lanjut ke
   * status APPROVED. PERLU_REVIEW = ada minimal satu anomali, harus ditahan
   * untuk direview manual dulu (bukan otomatis ditolak).
   */
  outcome: ValidationOutcome;
  anomali: string[];
}
