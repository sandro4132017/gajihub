import { describe, expect, it } from "vitest";
import { formatSisaWaktu, sisaMenujuBatasMs, tanggalIsoWib } from "../perintahLembur";

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
