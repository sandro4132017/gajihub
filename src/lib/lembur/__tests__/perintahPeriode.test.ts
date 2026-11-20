import { describe, expect, it } from "vitest";
import { SPKL_AKTIF } from "../gerbangSpkl";
import {
  hariTerakhirIso,
  jamDibayarHariSpkl,
  kelompokkanPerintah,
  kategoriDariStatusTersimpan,
  perintahUntukPegawai,
  rincianLemburSpkl,
  spklBerlakuDiPeriode,
} from "../perintahPeriode";

const PILOT = SPKL_AKTIF[0].satuanKerja;

describe("spklBerlakuDiPeriode", () => {
  it("satker pilot: berlaku di bulan berlakuMulai dan sesudahnya, tidak sebelumnya", () => {
    expect(spklBerlakuDiPeriode(PILOT, 12, 2026)).toBe(true);
    expect(spklBerlakuDiPeriode(PILOT, 1, 2027)).toBe(true);
    expect(spklBerlakuDiPeriode(PILOT, 11, 2026)).toBe(false);
  });
  it("non-pilot atau kosong: tidak berlaku", () => {
    expect(spklBerlakuDiPeriode("Biro Lain", 12, 2026)).toBe(false);
    expect(spklBerlakuDiPeriode(null, 12, 2026)).toBe(false);
  });
  it("hari terakhir bulan, termasuk Februari kabisat", () => {
    expect(hariTerakhirIso(2, 2028)).toBe("2028-02-29");
    expect(hariTerakhirIso(12, 2026)).toBe("2026-12-31");
  });
});

describe("perintahUntukPegawai", () => {
  const perintah = new Map([
    ["2026-12-03", 3],
    ["2026-11-30", 5], // sebelum gerbang - dibuang
    ["2027-01-05", 2], // bulan lain - dibuang
  ]);

  it("non-pilot -> null (SPKL tidak berlaku), walau ada perintah", () => {
    expect(perintahUntukPegawai("Biro Lain", perintah, 12, 2026)).toBeNull();
  });

  it("periode sebelum gerbang -> null", () => {
    expect(perintahUntukPegawai(PILOT, perintah, 11, 2026)).toBeNull();
  });

  it("pilot tanpa perintah -> Map kosong, BUKAN null", () => {
    const h = perintahUntukPegawai(PILOT, undefined, 12, 2026);
    expect(h).not.toBeNull();
    expect(h!.perintah.size).toBe(0);
  });

  it("hanya perintah di bulan itu dan di dalam gerbang", () => {
    const h = perintahUntukPegawai(PILOT, perintah, 12, 2026)!;
    expect([...h.perintah]).toEqual([["2026-12-03", 3]]);
    expect(h.berlaku("2026-12-01")).toBe(true);
    expect(h.berlaku("2026-11-30")).toBe(false);
  });
});

describe("kelompokkanPerintah", () => {
  it("mengelompokkan per pegawai; bila ganda, ambil jam yang lebih kecil", () => {
    const peta = kelompokkanPerintah([
      { pegawaiId: "a", tanggalIso: "2026-12-03", jamDiperintahkan: 4 },
      { pegawaiId: "a", tanggalIso: "2026-12-03", jamDiperintahkan: 2 },
      { pegawaiId: "b", tanggalIso: "2026-12-04", jamDiperintahkan: 1 },
    ]);
    expect(peta.get("a")!.get("2026-12-03")).toBe(2);
    expect(peta.get("b")!.get("2026-12-04")).toBe(1);
  });
});

describe("kategoriDariStatusTersimpan", () => {
  it("label lama HADIR/TERLAMBAT = WFO; WFH tetap bukan WFO", () => {
    expect(kategoriDariStatusTersimpan("HADIR")).toBe("WFO");
    expect(kategoriDariStatusTersimpan("TERLAMBAT")).toBe("WFO");
    expect(kategoriDariStatusTersimpan("WFH")).toBe("WFH");
    expect(kategoriDariStatusTersimpan("LEMBUR")).toBe("LEMBUR");
  });
});

describe("jamDibayarHariSpkl - satu primitif", () => {
  const dasar = { tanggalIso: "2026-12-03", statusKehadiran: "WFO", hariLibur: false };
  it("dibatasi perintah", () => {
    expect(jamDibayarHariSpkl({ ...dasar, jamNyata: 5, perintah: 3 }).dibayar).toBe(3);
  });
  it("tanpa perintah = 0 + catatan", () => {
    const h = jamDibayarHariSpkl({ ...dasar, jamNyata: 5, perintah: null });
    expect(h.dibayar).toBe(0);
    expect(h.catatan).toContain("tanpa perintah");
  });
  it("hari kerja WFH dibayar 0 MUTLAK walau ada perintah dan koreksi besar", () => {
    expect(jamDibayarHariSpkl({ ...dasar, statusKehadiran: "WFH", jamNyata: 8, perintah: 4 }).dibayar).toBe(0);
  });
  it("hari libur tidak butuh WFO", () => {
    expect(jamDibayarHariSpkl({ ...dasar, statusKehadiran: "WFH", hariLibur: true, jamNyata: 8, perintah: 4 }).dibayar).toBe(4);
  });
  it("baris LEMBUR berdiri sendiri tanpa syarat WFO", () => {
    expect(jamDibayarHariSpkl({ ...dasar, statusKehadiran: "LEMBUR", jamNyata: 2, perintah: 4 }).dibayar).toBe(2);
  });
});

describe("rincianLemburSpkl", () => {
  const spkl = perintahUntukPegawai(PILOT, new Map([["2026-12-03", 3]]), 12, 2026);
  const h = { tanggalIso: "2026-12-03", statusKehadiran: "WFO", hariLibur: false, jamLembur: 3, jamLemburNyata: 5 };

  it("diperintahkan / nyata / dibayar + catatan", () => {
    const r = rincianLemburSpkl(spkl, h)!;
    expect(r).toMatchObject({ perintah: 3, nyata: 5, dibayar: 3 });
    expect(r.catatan).toContain("dibatasi perintah");
  });
  it("null bila SPKL tidak berlaku, tanggal di luar gerbang, atau jam nyata belum tersimpan", () => {
    expect(rincianLemburSpkl(null, h)).toBeNull();
    expect(rincianLemburSpkl(spkl, { ...h, tanggalIso: "2026-11-30" })).toBeNull();
    expect(rincianLemburSpkl(spkl, { ...h, jamLemburNyata: null })).toBeNull();
  });
});
