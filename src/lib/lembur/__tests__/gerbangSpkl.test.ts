import { describe, expect, it } from "vitest";
import { SPKL_AKTIF, spklAktifUntuk } from "../gerbangSpkl";

const PILOT = SPKL_AKTIF[0].satuanKerja;
const MULAI = SPKL_AKTIF[0].berlakuMulai;

describe("spklAktifUntuk", () => {
  it("satker pilot pada hari berlaku dan sesudahnya: aktif", () => {
    expect(spklAktifUntuk(PILOT, MULAI)).toBe(true);
    expect(spklAktifUntuk(PILOT, "2099-01-01")).toBe(true);
  });

  it("sehari sebelum berlaku: tidak aktif", () => {
    expect(spklAktifUntuk(PILOT, "2026-11-30")).toBe(false);
  });

  it("satker lain atau pencocokan sebagian: tidak aktif", () => {
    expect(spklAktifUntuk("Biro Umum", "2099-01-01")).toBe(false);
    expect(spklAktifUntuk("Biro Keuangan", "2099-01-01")).toBe(false);
  });

  it("satker kosong/null/spasi: tidak aktif", () => {
    expect(spklAktifUntuk("", "2099-01-01")).toBe(false);
    expect(spklAktifUntuk("   ", "2099-01-01")).toBe(false);
    expect(spklAktifUntuk(null, "2099-01-01")).toBe(false);
    expect(spklAktifUntuk(undefined, "2099-01-01")).toBe(false);
  });

  it("spasi di tepi nama satker dimaklumi", () => {
    expect(spklAktifUntuk(` ${PILOT} `, "2099-01-01")).toBe(true);
  });

  it("tanggal bukan format ISO: tidak aktif", () => {
    expect(spklAktifUntuk(PILOT, "01-12-2026")).toBe(false);
    expect(spklAktifUntuk(PILOT, "")).toBe(false);
    expect(spklAktifUntuk(PILOT, "2026-12-01T00:00:00Z")).toBe(false);
  });
});

describe("unit uji akun penguji", () => {
  it("unit uji aktif sebelum pilot", async () => {
    const { SATKER_DUMMY } = await import("../../dataUji");
    expect(spklAktifUntuk(SATKER_DUMMY, "2026-11-19")).toBe(true);
    expect(spklAktifUntuk(PILOT, "2026-11-19")).toBe(false);
  });
});
