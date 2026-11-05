import { describe, expect, it } from "vitest";
import { kunciPeriode, periodeDariParam, periodeTetangga, pilihPeriode, type PeriodeSaya } from "../saya/periodeSaya";

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

describe("periodeDariParam", () => {
  it("menerima bulan 1-12 dan tahun 4 digit; nol depan dibuang", () => {
    expect(periodeDariParam("8", "2026")).toEqual({ bulan: 8, tahun: 2026 });
    expect(periodeDariParam("08", "2026")).toEqual({ bulan: 8, tahun: 2026 });
    expect(periodeDariParam("12", "1000")).toEqual({ bulan: 12, tahun: 1000 });
  });

  it("menolak yang tidak sah", () => {
    expect(periodeDariParam("0", "2026")).toBeNull();
    expect(periodeDariParam("13", "2026")).toBeNull();
    expect(periodeDariParam("abc", "2026")).toBeNull();
    expect(periodeDariParam("8", "26")).toBeNull();
    expect(periodeDariParam("8", "99999")).toBeNull();
    expect(periodeDariParam("8.5", "2026")).toBeNull();
    expect(periodeDariParam("", "")).toBeNull();
  });
});

describe("periodeTetangga", () => {
  const sekarang = { bulan: 9, tahun: 2026 };

  it("menyeberang tahun di kedua arah", () => {
    expect(periodeTetangga({ bulan: 1, tahun: 2026 }, sekarang).sebelum).toEqual({ bulan: 12, tahun: 2025 });
    expect(periodeTetangga({ bulan: 12, tahun: 2025 }, sekarang).sesudah).toEqual({ bulan: 1, tahun: 2026 });
  });

  it("sesudah ada sampai bulan berjalan, lalu null", () => {
    expect(periodeTetangga({ bulan: 8, tahun: 2026 }, sekarang).sesudah).toEqual({ bulan: 9, tahun: 2026 });
    expect(periodeTetangga({ bulan: 9, tahun: 2026 }, sekarang).sesudah).toBeNull();
    expect(periodeTetangga({ bulan: 10, tahun: 2026 }, sekarang).sesudah).toBeNull();
  });
});
