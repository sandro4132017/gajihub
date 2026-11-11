import { describe, expect, it } from "vitest";
import { halamanPublikTanpaSesi } from "../halamanPublik";

describe("halamanPublikTanpaSesi", () => {
  it("verifikasi TTE publik", () => {
    expect(halamanPublikTanpaSesi("/tte/verify/abc")).toBe(true);
    expect(halamanPublikTanpaSesi("/tte/verify/abc/berkas")).toBe(true);
  });
  it("halaman lain, kosong, dan awalan mirip tidak", () => {
    expect(halamanPublikTanpaSesi("/tukin")).toBe(false);
    expect(halamanPublikTanpaSesi("/tte/verifyx/abc")).toBe(false);
    expect(halamanPublikTanpaSesi("/tte")).toBe(false);
    expect(halamanPublikTanpaSesi(null)).toBe(false);
    expect(halamanPublikTanpaSesi("")).toBe(false);
  });
});
