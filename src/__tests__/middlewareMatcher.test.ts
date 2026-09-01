import { describe, it, expect } from "vitest";
import { config } from "../middleware";

/**
 * Gerbang untuk kekeliruan yang sudah TIGA KALI terjadi dengan sebab identik:
 * berkas yang HARUS bisa diambil tanpa login ikut tertangkap middleware, lalu
 * dibalas 307 ke /login.
 *
 *   1. `icon.svg`  - browser meminta favicon terlepas dari status login, jadi
 *                    tab-nya dapat HTML halaman login, bukan gambar.
 *   2. gambar `public/` - halaman login tidak bisa memuat ilustrasinya sendiri
 *                    karena gambarnya "harus login dulu".
 *   3. `.well-known/security.txt` (2026-08-31) - berkasnya ADA, tapi pemindai
 *                    keamanan Pusdatik tetap melaporkan "security.txt not
 *                    detected" karena yang diterimanya redirect ke /login.
 *
 * Dua kali pertama cuma dicatat sebagai komentar di `middleware.ts`, dan
 * komentar itu jelas tidak menahan yang ketiga. Karena itu aturannya sekarang
 * berupa TEST: siapa pun yang menambah berkas publik berikutnya akan melihat
 * daftar di bawah, dan siapa pun yang melonggarkan matcher-nya terlalu jauh
 * akan menjatuhkan blok kedua.
 *
 * TAMBAHKAN path baru ke daftar yang sesuai, JANGAN melonggarkan matcher tanpa
 * menambah penjaganya di sini.
 */

const regexMatcher = new RegExp(`^${config.matcher[0]}$`);
const lewatMiddleware = (path: string) => regexMatcher.test(path);

describe("matcher middleware - berkas publik", () => {
  // Harus terambil TANPA login. Kalau salah satu ini gagal, gejalanya di
  // lapangan bukan galat, tapi "berkasnya seolah tidak ada".
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
    ["rincian presensi per pegawai", "/tukin/presensi/197303072005011001"],
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
