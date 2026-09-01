import { describe, expect, it } from "vitest";
import { kunciPeriode, pilihPeriode, type PeriodeSaya } from "../saya/periodeSaya";

const TERSEDIA: PeriodeSaya[] = [
  { bulan: 8, tahun: 2026 },
  { bulan: 7, tahun: 2026 },
  { bulan: 12, tahun: 2025 },
];

describe("kunciPeriode", () => {
  it("memadding bulan supaya urut sebagai teks", () => {
    expect(kunciPeriode({ bulan: 8, tahun: 2026 })).toBe("2026-08");
    expect(kunciPeriode({ bulan: 12, tahun: 2025 })).toBe("2025-12");
    // Tanpa padding, "2026-9" akan diurutkan SETELAH "2026-10".
    expect(kunciPeriode({ bulan: 9, tahun: 2026 }) < kunciPeriode({ bulan: 10, tahun: 2026 })).toBe(true);
  });
});

describe("pilihPeriode", () => {
  it("memakai periode yang diminta kalau memang ada datanya", () => {
    expect(pilihPeriode("2026-07", TERSEDIA)).toEqual({ bulan: 7, tahun: 2026 });
    expect(pilihPeriode("2025-12", TERSEDIA)).toEqual({ bulan: 12, tahun: 2025 });
  });

  it("tanpa ?periode= memakai yang pertama - pemanggil mengurutkan terbaru dulu", () => {
    expect(pilihPeriode(undefined, TERSEDIA)).toEqual({ bulan: 8, tahun: 2026 });
  });

  it("periode yang TIDAK punya data tidak pernah dipilih", () => {
    // Inilah yang dijaga: menerima bulan/tahun sembarang berarti halaman
    // kosong yang terbaca "presensi saya hilang".
    for (const asal of ["2024-03", "2026-13", "abc", "", "2026-8"]) {
      expect(pilihPeriode(asal, TERSEDIA), asal).toEqual({ bulan: 8, tahun: 2026 });
    }
  });

  it("daftar kosong menghasilkan null, bukan periode karangan", () => {
    expect(pilihPeriode("2026-08", [])).toBeNull();
    expect(pilihPeriode(undefined, [])).toBeNull();
  });
});
