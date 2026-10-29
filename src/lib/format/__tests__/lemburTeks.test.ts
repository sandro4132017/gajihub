import { describe, expect, it } from "vitest";
import { lemburTeks } from "../presensiTampilan";

/**
 * Jam lembur disimpan sebagai jam DESIMAL. Yang ditampilkan jam BULAT KE BAWAH,
 * mengikuti aturan pembayarannya - sisa menit yang tidak genap satu jam tidak
 * dibayar. Test ini mengunci pembacaannya, bukan perhitungan pembayarannya
 * (itu di business-logic/uangLembur.ts).
 */
describe("lemburTeks", () => {
  it("membuang sisa menit, tidak membulatkan ke terdekat", () => {
    expect(lemburTeks(8.33)).toBe("8 jam");
    // 8,7 jam = 8 jam 42 menit. Ke terdekat jadi 9 - satu jam yang tidak
    // pernah dibayarkan, dan justru selisih itu yang harus dijelaskan.
    expect(lemburTeks(8.7)).toBe("8 jam");
    expect(lemburTeks(14.3)).toBe("14 jam");
  });

  it("jam bulat tetap apa adanya", () => {
    expect(lemburTeks(3)).toBe("3 jam");
  });

  it("lembur di bawah satu jam jadi '0 jam', BUKAN '-'", () => {
    // Harinya tetap punya baris lembur di e-Presensi; "-" akan berbunyi
    // "hari itu tidak lembur" dan itu keliru.
    expect(lemburTeks(0.02)).toBe("0 jam");
    expect(lemburTeks(0.99)).toBe("0 jam");
  });

  it("nol dan nilai tak wajar jadi tanda hubung", () => {
    expect(lemburTeks(0)).toBe("-");
    expect(lemburTeks(-1)).toBe("-");
    expect(lemburTeks(Number.NaN)).toBe("-");
  });
});
