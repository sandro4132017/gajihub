import { describe, expect, it } from "vitest";
import { alasanSesiSah, layakDiingat, tujuanKembaliSah } from "../tujuanKembali";

describe("tujuanKembaliSah - hanya alamat di dalam Gajihub", () => {
  it("path + query halaman diterima apa adanya", () => {
    expect(tujuanKembaliSah("/kasubag/kalkulasi?bulan=8&tahun=2026&satker=Biro%20Keuangan")).toBe(
      "/kasubag/kalkulasi?bulan=8&tahun=2026&satker=Biro%20Keuangan"
    );
    expect(tujuanKembaliSah("/tukin")).toBe("/tukin");
  });

  it("parameter _rsc dibuang", () => {
    expect(tujuanKembaliSah("/tukin?bulan=8&_rsc=abc")).toBe("/tukin?bulan=8");
    expect(tujuanKembaliSah("/tukin?_rsc=abc")).toBe("/tukin");
  });

  it("open redirect ditolak: situs lain, protokol, garis miring ganda/terbalik", () => {
    for (const jahat of [
      "https://jahat.example/login",
      "//jahat.example",
      "/\\jahat.example",
      "javascript:alert(1)",
      "jahat",
      "/tukin\nSet-Cookie: x=1",
    ]) {
      expect(tujuanKembaliSah(jahat), jahat).toBeNull();
    }
  });

  it("bukan halaman: login, api, berkas, aset, dan akar", () => {
    for (const p of ["/login", "/login/sso", "/api/tte", "/berkas/tte/1", "/_next/static/x.js", "/"]) {
      expect(tujuanKembaliSah(p), p).toBeNull();
    }
    // awalan mirip tapi halaman lain tetap boleh
    expect(tujuanKembaliSah("/loginx")).toBe("/loginx");
  });

  it("kosong / terlalu panjang -> null", () => {
    expect(tujuanKembaliSah(undefined)).toBeNull();
    expect(tujuanKembaliSah("")).toBeNull();
    expect(tujuanKembaliSah(`/tukin?q=${"a".repeat(1200)}`)).toBeNull();
  });
});

describe("alasanSesiSah", () => {
  it("hanya kode yang dikenal", () => {
    expect(alasanSesiSah("menganggur")).toBe("menganggur");
    expect(alasanSesiSah("dicabut")).toBe("dicabut");
    expect(alasanSesiSah("<script>")).toBeNull();
    expect(alasanSesiSah(undefined)).toBeNull();
  });
});

describe("layakDiingat - hanya navigasi halaman", () => {
  const req = (path: string, h: Record<string, string>, method = "GET") => ({
    method,
    headers: new Headers(h),
    nextUrl: { pathname: path },
  });

  it("navigasi dokumen & RSC biasa diingat", () => {
    expect(layakDiingat(req("/tukin", { "sec-fetch-mode": "navigate" }))).toBe(true);
    expect(layakDiingat(req("/tukin", { accept: "text/html" }))).toBe(true);
    expect(layakDiingat(req("/tukin", { rsc: "1" }))).toBe(true);
  });

  it("prefetch, Server Action, POST, API, berkas tidak diingat", () => {
    expect(layakDiingat(req("/tukin", { rsc: "1", "next-router-prefetch": "1" }))).toBe(false);
    expect(layakDiingat(req("/tukin", { "next-action": "x", accept: "text/html" }))).toBe(false);
    expect(layakDiingat(req("/tukin", { accept: "text/html" }, "POST"))).toBe(false);
    expect(layakDiingat(req("/api/kabar", { accept: "text/html" }))).toBe(false);
    expect(layakDiingat(req("/berkas/tte/1", { "sec-fetch-mode": "navigate" }))).toBe(false);
  });
});
