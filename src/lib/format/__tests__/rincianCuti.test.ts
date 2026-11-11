import { describe, expect, it } from "vitest";
import { JENIS_CUTI_TAK_DISEBUT, labelJenisCutiHarian, rincianCutiAtauNull, susunRincianCuti } from "../rincianCuti";

const tgl = (d: number) => new Date(Date.UTC(2026, 9, d));

describe("labelJenisCutiHarian", () => {
  it("membuang awalan 'Cuti - '", () => {
    expect(labelJenisCutiHarian("Cuti - Cuti Tahunan")).toBe("Cuti Tahunan");
    expect(labelJenisCutiHarian("Cuti - Cuti Sakit <1 bulan")).toBe("Cuti Sakit <1 bulan");
  });
  it("jenis tidak disebut / kosong", () => {
    expect(labelJenisCutiHarian("Cuti")).toBe(JENIS_CUTI_TAK_DISEBUT);
    expect(labelJenisCutiHarian(null)).toBe(JENIS_CUTI_TAK_DISEBUT);
  });
});

describe("susunRincianCuti", () => {
  it("2 hari cuti sakit + 1 hari cuti tahunan: dipisah per jenis, terbanyak dulu", () => {
    const hasil = susunRincianCuti([
      { tanggal: tgl(20), namaSistemKerja: "Cuti - Cuti Tahunan" },
      { tanggal: tgl(7), namaSistemKerja: "Cuti - Cuti Sakit <1 bulan" },
      { tanggal: tgl(6), namaSistemKerja: "Cuti - Cuti Sakit <1 bulan" },
    ]);
    expect(hasil).toEqual([
      { jenis: "Cuti Sakit <1 bulan", hari: 2, tanggal: [6, 7] },
      { jenis: "Cuti Tahunan", hari: 1, tanggal: [20] },
    ]);
  });
  it("seri: yang lebih dulu muncul di bulan itu di depan", () => {
    const hasil = susunRincianCuti([
      { tanggal: tgl(9), namaSistemKerja: "Cuti - Cuti Tahunan" },
      { tanggal: tgl(2), namaSistemKerja: "Cuti - Cuti Alasan Penting" },
    ]);
    expect(hasil.map((r) => r.jenis)).toEqual(["Cuti Alasan Penting", "Cuti Tahunan"]);
  });
  it("kosong -> daftar kosong", () => {
    expect(susunRincianCuti([])).toEqual([]);
  });
  it("tanggal ganda dalam satu jenis dihitung sekali", () => {
    const hasil = susunRincianCuti([
      { tanggal: tgl(3), namaSistemKerja: "Cuti - Cuti Tahunan" },
      { tanggal: tgl(3), namaSistemKerja: "Cuti - Cuti Tahunan" },
    ]);
    expect(hasil).toEqual([{ jenis: "Cuti Tahunan", hari: 1, tanggal: [3] }]);
  });
});

describe("rincianCutiAtauNull", () => {
  it("semua baris tanpa label jenis (data lama) -> null, bukan 'jenis tidak disebut'", () => {
    expect(rincianCutiAtauNull([{ tanggal: tgl(1), namaSistemKerja: null }, { tanggal: tgl(2), namaSistemKerja: "" }])).toBeNull();
    expect(rincianCutiAtauNull([])).toBeNull();
  });
  it("bulan campuran: baris tanpa label jadi 'jenis tidak disebut', sisanya per jenis", () => {
    const hasil = rincianCutiAtauNull([
      { tanggal: tgl(1), namaSistemKerja: "Cuti - Cuti Tahunan" },
      { tanggal: tgl(2), namaSistemKerja: null },
      { tanggal: tgl(5), namaSistemKerja: "Cuti" },
    ]);
    expect(hasil).toEqual([
      { jenis: JENIS_CUTI_TAK_DISEBUT, hari: 2, tanggal: [2, 5] },
      { jenis: "Cuti Tahunan", hari: 1, tanggal: [1] },
    ]);
  });
});
