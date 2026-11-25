import { describe, expect, it } from "vitest";
import {
  TENGGANG_SIAP_MS,
  batasKirimPerintah,
  formatSisaWaktu,
  sisaMenujuBatasMs,
  spklHarianSiap,
  spklHarianTerkunci,
  tanggalIsoWib,
} from "../perintahLembur";

describe("tanggalIsoWib", () => {
  it("memakai tanggal WIB, bukan UTC", () => {
    expect(tanggalIsoWib(new Date("2026-12-09T17:00:00Z"))).toBe("2026-12-10"); // 00:00 WIB
    expect(tanggalIsoWib(new Date("2026-12-09T16:59:59Z"))).toBe("2026-12-09");
  });
});

describe("sisaMenujuBatasMs", () => {
  it("dihitung menuju 15.00 WIB (= 08.00 UTC)", () => {
    expect(sisaMenujuBatasMs("2026-12-10", new Date("2026-12-10T03:00:00Z"))).toBe(5 * 3600_000);
    expect(sisaMenujuBatasMs("2026-12-10", new Date("2026-12-10T08:00:00Z"))).toBe(0);
    expect(sisaMenujuBatasMs("2026-12-10", new Date("2026-12-10T08:00:01Z"))).toBe(-1000);
  });
  it("tanggal tidak sah: null", () => {
    expect(sisaMenujuBatasMs("10-12-2026", new Date())).toBeNull();
  });
});

describe("formatSisaWaktu", () => {
  it.each([
    [5 * 3600_000 + 5 * 60_000, "5 jam 05 menit"],
    [4 * 60_000 + 9_000, "4 menit 09 detik"],
    [45_000, "45 detik"],
    [0, "0 detik"],
    [-5000, "0 detik"],
    [50 * 3600_000, "2 hari 2 jam"],
  ])("%d ms -> %s", (ms, teks) => {
    expect(formatSisaWaktu(ms)).toBe(teks);
  });
});

describe("spklHarianTerkunci", () => {
  it("terbuka sampai 15:00:00.000 WIB, terkunci mulai 15:00:00.001", () => {
    expect(spklHarianTerkunci("2026-12-10", new Date("2026-12-10T07:59:59.999Z"))).toBe(false); // 14:59:59.999
    expect(spklHarianTerkunci("2026-12-10", new Date("2026-12-10T08:00:00.000Z"))).toBe(false); // 15:00:00.000
    expect(spklHarianTerkunci("2026-12-10", new Date("2026-12-10T08:00:00.001Z"))).toBe(true); // 15:00:00.001
  });
  it("tanggal di depan tidak terkunci; tanggal lampau terkunci", () => {
    expect(spklHarianTerkunci("2026-12-11", new Date("2026-12-10T20:00:00Z"))).toBe(false);
    expect(spklHarianTerkunci("2026-12-09", new Date("2026-12-10T01:00:00Z"))).toBe(true);
  });
  it("tanggal tidak sah: tidak terkunci", () => {
    expect(spklHarianTerkunci("10-12-2026", new Date())).toBe(false);
  });
  it("kebalikan persis batasKirimPerintah", () => {
    for (const iso of ["2026-12-10T07:59:59.999Z", "2026-12-10T08:00:00.000Z", "2026-12-10T08:00:00.001Z"]) {
      const t = new Date(iso);
      expect(spklHarianTerkunci("2026-12-10", t)).toBe(!batasKirimPerintah("2026-12-10", t).boleh);
    }
  });
});

describe("spklHarianSiap", () => {
  it("siap hanya sesudah terkunci + tenggang", () => {
    const batas = Date.parse("2026-12-10T08:00:00.000Z");
    expect(spklHarianSiap("2026-12-10", new Date(batas + 1))).toBe(false);
    expect(spklHarianSiap("2026-12-10", new Date(batas + TENGGANG_SIAP_MS))).toBe(false);
    expect(spklHarianSiap("2026-12-10", new Date(batas + TENGGANG_SIAP_MS + 1))).toBe(true);
  });
  it("tenggang 60 detik, tanggal depan dan tanggal tidak sah tidak siap", () => {
    expect(TENGGANG_SIAP_MS).toBe(60_000);
    expect(spklHarianSiap("bukan-tanggal", new Date())).toBe(false);
    expect(spklHarianSiap("2026-12-11", new Date("2026-12-10T20:00:00Z"))).toBe(false);
  });
});
