import { describe, expect, it } from "vitest";
import { tinggiBatangPersen } from "../tinggiBatang";

describe("tinggiBatangPersen", () => {
  it("sebanding dengan batang tertinggi", () => {
    expect(tinggiBatangPersen(500, 1000)).toBe(50);
    expect(tinggiBatangPersen(250, 1000)).toBe(25);
    expect(tinggiBatangPersen(1000, 1000)).toBe(100);
  });

  it("bulan kecil TIDAK dinaikkan ke lantai minimum", () => {
    // Ini yang dulu salah: nilai 1% digambar 12%, sehingga bulan yang hampir
    // tidak ada belanjanya terlihat sebanding dengan bulan yang sungguhan.
    expect(tinggiBatangPersen(10, 1000)).toBe(1);
    expect(tinggiBatangPersen(1, 1000)).toBe(0);
  });

  it("bulan tanpa data bernilai 0, bukan batang kecil", () => {
    expect(tinggiBatangPersen(0, 1000)).toBe(0);
  });

  it("nilai yang melebihi maksimum dijepit di 100", () => {
    expect(tinggiBatangPersen(1500, 1000)).toBe(100);
  });

  it("maksimum nol atau tidak masuk akal tidak menghasilkan NaN/Infinity", () => {
    for (const maks of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(tinggiBatangPersen(500, maks)).toBe(0);
    }
  });

  it("nominal negatif atau bukan angka dianggap tidak ada", () => {
    for (const nominal of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(tinggiBatangPersen(nominal, 1000)).toBe(0);
    }
  });
});
