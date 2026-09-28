import { describe, it, expect } from "vitest";
import { config } from "../middleware";

const regexMatcher = new RegExp(`^${config.matcher[0]}$`);
const lewatMiddleware = (path: string) => regexMatcher.test(path);

describe("matcher middleware - berkas publik", () => {
  it.each([
    ["security.txt - alamat lapor celah keamanan (RFC 9116)", "/.well-known/security.txt"],
    ["acme-challenge - verifikasi domain Let's Encrypt", "/.well-known/acme-challenge/token123"],
    ["ilustrasi halaman login", "/ilustrasi/ilustrasi1.png"],
    ["favicon", "/favicon.ico"],
    ["ikon tab browser", "/icon.svg"],
    ["aset statis Next", "/_next/static/chunks/main.js"],
    ["font", "/fonts/jakarta.woff2"],
  ])("%s dikecualikan dari middleware", (_nama, path) => {
    expect(lewatMiddleware(path)).toBe(false);
  });
});

describe("matcher middleware - halaman yang WAJIB tetap terkunci", () => {
  // Sisi sebaliknya, dan ini yang lebih mahal kalau bocor: satu pelonggaran
  // yang terlalu luas membuka data gaji ribuan pegawai tanpa login.
  it.each([
    ["dashboard tukin", "/tukin"],
    ["rincian presensi per pegawai", "/tukin/presensi/199000100000000008"],
    ["slip gaji", "/saya/slip-gaji/7/2026"],
    ["export ADK (Route Handler, tanpa ekstensi)", "/ppabp/adk/tukin"],
    ["rekening pegawai", "/ppabp/rekening"],
    ["kelola role", "/admin/role-assignment"],
    ["akar situs", "/"],
    ["halaman login itu sendiri", "/login"],
  ])("%s tetap lewat middleware", (_nama, path) => {
    expect(lewatMiddleware(path)).toBe(true);
  });

  // Pengecualian `.well-known` sengaja SEMPIT. Ketiga bentuk di bawah pernah
  // jadi cara pelonggaran melebar tanpa disadari.
  it("tidak melebar ke path mirip yang bukan .well-known", () => {
    expect(lewatMiddleware("/well-known/rahasia")).toBe(true); // tanpa titik
    expect(lewatMiddleware("/a/.well-known/x")).toBe(true); // bersarang, bukan di akar
    expect(lewatMiddleware("/.wellknown/x")).toBe(true); // tanpa strip
  });

  // Pengecualian gambar berdasarkan EKSTENSI, bukan "apa pun yang bertitik" -
  // kalau tidak, rute berdata gaji yang kebetulan mengandung titik ikut lolos.
  it("tidak mengecualikan sembarang berkas bertitik", () => {
    expect(lewatMiddleware("/.gitignore")).toBe(true);
    expect(lewatMiddleware("/.env")).toBe(true);
    expect(lewatMiddleware("/laporan.gaji.rahasia")).toBe(true);
  });
});
