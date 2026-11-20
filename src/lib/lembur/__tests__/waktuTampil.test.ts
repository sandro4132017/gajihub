import { describe, expect, it } from "vitest";
import { kunciPeriodeDariTanggal, tanggalIsoTeks, waktuWibTeks } from "../waktuTampil";

describe("waktuTampil", () => {
  it("tanggalIsoTeks", () => {
    expect(tanggalIsoTeks("2026-11-09")).toBe("9 November 2026");
    expect(tanggalIsoTeks("bukan-tanggal")).toBe("bukan-tanggal");
  });
  it("waktuWibTeks memakai WIB dan menyeberang tengah malam", () => {
    expect(waktuWibTeks(new Date("2026-11-19T07:05:00Z"))).toBe("19 November 2026, 14.05 WIB");
    expect(waktuWibTeks(new Date("2026-11-19T18:30:00Z"))).toBe("20 November 2026, 01.30 WIB");
  });
  it("kunciPeriodeDariTanggal", () => {
    expect(kunciPeriodeDariTanggal("2026-11-19")).toBe("2026-11");
  });
});
