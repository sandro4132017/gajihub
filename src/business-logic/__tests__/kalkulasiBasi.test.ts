import { describe, it, expect } from "vitest";
import { sebabPerluHitungUlang } from "../kalkulasiBasi";

const hitung = new Date("2026-09-10T08:00:00Z");
const sebelum = new Date("2026-09-09T08:00:00Z");
const sesudah = new Date("2026-09-11T08:00:00Z");

const segar = {
  calculatedAt: hitung,
  rekapDiunggahPada: sebelum,
  predikatSyncedAt: sebelum,
  perubahanDataTerakhir: null,
};

describe("sebabPerluHitungUlang", () => {
  it("semua sumber segar -> tanpa sebab", () => {
    expect(sebabPerluHitungUlang(segar)).toEqual([]);
  });

  it("cap waktu persis sama dengan calculatedAt bukan basi", () => {
    expect(
      sebabPerluHitungUlang({ ...segar, rekapDiunggahPada: hitung, predikatSyncedAt: hitung, perubahanDataTerakhir: hitung })
    ).toEqual([]);
  });

  it("predikat dihapus", () => {
    expect(sebabPerluHitungUlang({ ...segar, predikatSyncedAt: null })).toEqual(["predikat kinerja dihapus"]);
  });

  it("rekap presensi dihapus", () => {
    expect(sebabPerluHitungUlang({ ...segar, rekapDiunggahPada: null })).toEqual(["rekap presensi dihapus"]);
  });

  it("presensi berubah sesudah kalkulasi", () => {
    expect(sebabPerluHitungUlang({ ...segar, rekapDiunggahPada: sesudah })).toEqual(["presensi berubah"]);
  });

  it("predikat berubah sesudah kalkulasi", () => {
    expect(sebabPerluHitungUlang({ ...segar, predikatSyncedAt: sesudah })).toEqual(["predikat kinerja berubah"]);
  });

  it("data kepegawaian berubah sesudah kalkulasi", () => {
    expect(sebabPerluHitungUlang({ ...segar, perubahanDataTerakhir: sesudah })).toEqual(["data kepegawaian berubah"]);
  });

  it("perubahan data sebelum kalkulasi tidak dihitung", () => {
    expect(sebabPerluHitungUlang({ ...segar, perubahanDataTerakhir: sebelum })).toEqual([]);
  });

  it("kombinasi: urutan tetap hilang -> presensi -> predikat -> data", () => {
    expect(
      sebabPerluHitungUlang({
        calculatedAt: hitung,
        rekapDiunggahPada: sesudah,
        predikatSyncedAt: sesudah,
        perubahanDataTerakhir: sesudah,
      })
    ).toEqual(["presensi berubah", "predikat kinerja berubah", "data kepegawaian berubah"]);
    expect(
      sebabPerluHitungUlang({ ...segar, predikatSyncedAt: null, rekapDiunggahPada: null, perubahanDataTerakhir: sesudah })
    ).toEqual(["predikat kinerja dihapus", "rekap presensi dihapus", "data kepegawaian berubah"]);
  });
});
