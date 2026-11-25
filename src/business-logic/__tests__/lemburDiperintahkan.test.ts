import { describe, it, expect } from "vitest";
import { jamLemburDibayarHarian, terapkanPerintahLembur } from "../lemburDiperintahkan";

// Data palsu (tanpa data pegawai) - sensitive-ok.
function hari(
  tanggalIso: string,
  jamLembur: number,
  o: Partial<{ kategori: string; hariLibur: boolean; berhakMakanLembur: boolean }> = {}
) {
  return {
    tanggalIso,
    kategori: o.kategori ?? "WFO",
    hariLibur: o.hariLibur ?? false,
    jamLembur,
    berhakMakanLembur: o.berhakMakanLembur ?? jamLembur >= 2,
  };
}

describe("jamLemburDibayarHarian", () => {
  it("perintah 2, nyata 4 -> 2 (dibatasi perintah, dengan catatan informatif)", () => {
    const r = jamLemburDibayarHarian(4, 2);
    expect(r.dibayar).toBe(2);
    expect(r.catatan).toBe("Presensi 4 jam, dibatasi perintah 2 jam");
  });
  it("perintah 3, nyata 1 -> 1 + catatan", () => {
    const r = jamLemburDibayarHarian(1, 3);
    expect(r.dibayar).toBe(1);
    expect(r.catatan).toBe("Diperintahkan 3 jam, presensi 1 jam");
  });
  it("tanpa perintah, nyata 3 -> 0 + catatan", () => {
    const r = jamLemburDibayarHarian(3, null);
    expect(r.dibayar).toBe(0);
    expect(r.catatan).toBe("Terbaca 3 jam lembur tanpa perintah lembur (SPKL)");
  });
  it("tanpa perintah dan tanpa lembur -> 0 tanpa catatan", () => {
    expect(jamLemburDibayarHarian(0, null)).toEqual({ dibayar: 0, catatan: null });
  });
  it("ada perintah tapi nyata 0 -> 0 + catatan", () => {
    const r = jamLemburDibayarHarian(0, 2);
    expect(r.dibayar).toBe(0);
    expect(r.catatan).toContain("Diperintahkan 2 jam");
  });
  it("nyata == perintah -> dibayar penuh, tanpa catatan", () => {
    expect(jamLemburDibayarHarian(2, 2)).toEqual({ dibayar: 2, catatan: null });
  });
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 2.5])(
    "perintah tidak sah (%s) dianggap tanpa perintah -> 0 + catatan",
    (perintah) => {
      const r = jamLemburDibayarHarian(4, perintah);
      expect(r.dibayar).toBe(0);
      expect(r.catatan).toContain("tanpa perintah lembur");
    },
  );
});

describe("terapkanPerintahLembur", () => {
  it("hari kerja perintah 2, nyata 4 -> 2 dan berhak makan lembur", () => {
    const { hari: h } = terapkanPerintahLembur([hari("2026-07-07", 4)], new Map([["2026-07-07", 2]]));
    expect(h[0].jamLembur).toBe(2);
    expect(h[0].jamLemburNyata).toBe(4);
    expect(h[0].berhakMakanLembur).toBe(true);
  });
  it("hari libur perintah 2, presensi 8 -> 2", () => {
    const { hari: h } = terapkanPerintahLembur(
      [hari("2026-07-11", 8, { hariLibur: true, kategori: "LEMBUR" })],
      new Map([["2026-07-11", 2]])
    );
    expect(h[0].jamLembur).toBe(2);
  });
  it("koreksi 5 + perintah 3 -> 3", () => {
    const { hari: h } = terapkanPerintahLembur([hari("2026-07-07", 5)], new Map([["2026-07-07", 3]]));
    expect(h[0].jamLembur).toBe(3);
  });
  it("makan lembur diturunkan dari jam DIBAYAR: perintah 1, nyata 5 -> tidak berhak", () => {
    const { hari: h } = terapkanPerintahLembur([hari("2026-07-07", 5)], new Map([["2026-07-07", 1]]));
    expect(h[0].jamLembur).toBe(1);
    expect(h[0].berhakMakanLembur).toBe(false);
  });
  it("mesin menilai tidak berhak (blok terpisah) -> tidak dinaikkan oleh perintah", () => {
    const { hari: h } = terapkanPerintahLembur(
      [hari("2026-07-07", 3, { berhakMakanLembur: false })],
      new Map([["2026-07-07", 3]])
    );
    expect(h[0].berhakMakanLembur).toBe(false);
  });
  it("tanpa perintah di tanggal itu -> 0 + catatan, makan lembur hilang", () => {
    const { hari: h } = terapkanPerintahLembur([hari("2026-07-07", 3)], new Map());
    expect(h[0].jamLembur).toBe(0);
    expect(h[0].berhakMakanLembur).toBe(false);
    expect(h[0].catatanLembur).toContain("tanpa perintah lembur (SPKL)");
  });
  it("WFH + perintah -> 0 + catatan WFO", () => {
    const { hari: h } = terapkanPerintahLembur(
      [hari("2026-07-07", 0, { kategori: "WFH_WFA" })],
      new Map([["2026-07-07", 3]])
    );
    expect(h[0].jamLembur).toBe(0);
    expect(h[0].catatanLembur).toContain("bukan WFO");
  });
  it("WFH + koreksi petugas 5 jam + perintah 3 -> tetap 0 (WFO mutlak), jam nyata disimpan", () => {
    const { hari: h } = terapkanPerintahLembur(
      [hari("2026-07-09", 5, { kategori: "WFH_WFA" })],
      new Map([["2026-07-09", 3]])
    );
    expect(h[0].jamLembur).toBe(0);
    expect(h[0].berhakMakanLembur).toBe(false);
    expect(h[0].jamLemburNyata).toBe(5);
    expect(h[0].catatanLembur).toContain("bukan WFO");
  });
  it("WFH + koreksi petugas tanpa perintah -> 0 + catatan bukan WFO", () => {
    const { hari: h } = terapkanPerintahLembur(
      [hari("2026-07-10", 2, { kategori: "WFH_WFA" })],
      new Map()
    );
    expect(h[0].jamLembur).toBe(0);
    expect(h[0].catatanLembur).toContain("bukan WFO");
  });
  it("baris Lembur berdiri sendiri di hari kerja tidak kena syarat WFO", () => {
    const { hari: h } = terapkanPerintahLembur(
      [hari("2026-07-13", 4, { kategori: "LEMBUR" })],
      new Map([["2026-07-13", 2]])
    );
    expect(h[0].jamLembur).toBe(2);
  });
  it("perintah di tanggal tanpa baris presensi -> dicatat, dibayar 0", () => {
    const r = terapkanPerintahLembur([], new Map([["2026-07-08", 2]]));
    expect(r.hari).toEqual([]);
    expect(r.catatanTanpaPresensi[0]).toContain("2026-07-08");
  });
});
