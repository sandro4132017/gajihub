import { describe, it, expect } from "vitest";
import { hitungUangMakan } from "../uangMakan";
import { hitungUangLembur } from "../uangLembur";

describe("hitungUangMakan", () => {
  it("mengalikan hari hadir dengan tarif harian", () => {
    const result = hitungUangMakan({
      pegawaiId: "p1",
      periodeBulan: 7,
      periodeTahun: 2026,
      jumlahHariKerja: 22,
      jumlahHariHadir: 20,
      tarifHarianUangMakan: 35000,
    });
    expect(result.totalUangMakan).toBe(700000);
    expect(result.anomali).toHaveLength(0);
  });

  it("flag anomali jika hari hadir melebihi hari kerja", () => {
    const result = hitungUangMakan({
      pegawaiId: "p1",
      periodeBulan: 7,
      periodeTahun: 2026,
      jumlahHariKerja: 20,
      jumlahHariHadir: 25,
      tarifHarianUangMakan: 35000,
    });
    expect(result.anomali.length).toBeGreaterThan(0);
    // tetap di-cap ke jumlahHariKerja, tidak membayar lebih dari itu
    expect(result.totalUangMakan).toBe(20 * 35000);
  });
});

describe("hitungUangLembur", () => {
  it("mengalikan jam lembur dengan tarif per jam", () => {
    const result = hitungUangLembur({
      pegawaiId: "p1",
      periodeBulan: 7,
      periodeTahun: 2026,
      totalJamLembur: 10,
      tarifPerJam: 25000,
    });
    expect(result.totalUangLembur).toBe(250000);
    expect(result.anomali).toHaveLength(0);
  });

  it("meng-cap jam lembur ke batas maksimal dan flag anomali", () => {
    const result = hitungUangLembur({
      pegawaiId: "p1",
      periodeBulan: 7,
      periodeTahun: 2026,
      totalJamLembur: 50,
      tarifPerJam: 25000,
      batasMaksimalJamLembur: 40,
    });
    expect(result.jamLemburDihitung).toBe(40);
    expect(result.totalUangLembur).toBe(40 * 25000);
    expect(result.anomali.some((a) => a.includes("melebihi batas maksimal"))).toBe(true);
  });
});
