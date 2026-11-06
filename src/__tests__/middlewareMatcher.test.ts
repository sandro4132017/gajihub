import { describe, it, expect } from "vitest";
import { RUTE_MESIN, config } from "../middleware";

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
    ["bukti dukung banding (berkas privat)", "/berkas/bukti-dukung/3f2b8c1e-5d4a-4e7b-9c1d-0a1b2c3d4e5f"],
    ["PDF SPTJM (berkas privat)", "/berkas/tte/3f2b8c1e-5d4a-4e7b-9c1d-0a1b2c3d4e5f"],
    ["pratinjau draft SPTJM", "/berkas/tte-pratinjau"],
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

describe("RUTE_MESIN - jalur yang lolos sesi karena diautentikasi header rahasia", () => {
  it("memuat pengingat absen, dan CUMA itu", () => {
    // Daftar ini yang paling berbahaya kalau melebar: tiap tambahan berarti
    // satu jalur yang bisa diakses tanpa login, dan izinnya HARUS diperiksa di
    // handler-nya sendiri.
    expect([...RUTE_MESIN]).toEqual(["/api/pengingat-absen"]);
  });

  it("/api/kabar TIDAK ikut - isinya aktivitas per unit dan wajib bersesi", () => {
    expect((RUTE_MESIN as readonly string[]).includes("/api/kabar")).toBe(false);
  });

  it("dicocokkan PERSIS, bukan awalan - tidak ada wildcard maupun tanda akhir", () => {
    // `/api/` sebagai awalan akan membuka route API baru yang lupa memeriksa
    // izinnya. Bentuk di bawah menahan daftar ini tetap berupa path utuh.
    for (const r of RUTE_MESIN) {
      expect(r.startsWith("/")).toBe(true);
      expect(r).not.toContain("*");
      expect(r.endsWith("/")).toBe(false);
    }
  });

  it("tetap DILEWATKAN middleware - pengecualiannya di dalam fungsi, bukan di matcher", () => {
    // Kalau matcher yang dilonggarkan, handler-nya tidak akan pernah dipanggil
    // middleware dan pemeriksaan rahasianya jadi satu-satunya penjaga tanpa
    // jaring pengaman. Jadi route ini HARUS tetap cocok matcher.
    for (const r of RUTE_MESIN) expect(lewatMiddleware(r)).toBe(true);
  });
});

describe("header keamanan middleware", () => {
  it("menetapkan HSTS, X-Frame-Options, nosniff, Referrer-Policy, dan Permissions-Policy pada redirect", async () => {
    const { NextRequest } = await import("next/server");
    const { middleware } = await import("../middleware");
    const req = new NextRequest("http://localhost:3000/");
    const res = await middleware(req);
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("Permissions-Policy")).toContain("camera=()");
  });

  it("menetapkan header keamanan pada blokir payload fuzzing/bad request", async () => {
    const { NextRequest } = await import("next/server");
    const { middleware } = await import("../middleware");
    const req = new NextRequest("http://localhost:3000/?test=%3Cscript%3Ealert(1)%3C/script%3E");
    const res = await middleware(req);
    expect(res.status).toBe(400);
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});

describe("X-Frame-Options per jalur", () => {
  it("berkas privat SAMEORIGIN (pratinjau iframe di halaman sendiri), selain itu DENY", async () => {
    const { nilaiXFrameOptions } = await import("../middleware");
    expect(nilaiXFrameOptions("/berkas/tte/abc")).toBe("SAMEORIGIN");
    expect(nilaiXFrameOptions("/berkas/bukti-dukung/abc")).toBe("SAMEORIGIN");
    expect(nilaiXFrameOptions("/")).toBe("DENY");
    expect(nilaiXFrameOptions("/kasubag/kalkulasi")).toBe("DENY");
    expect(nilaiXFrameOptions("/berkasku")).toBe("DENY");
    expect(nilaiXFrameOptions("/tte/verify/abc/berkas")).toBe("DENY");
  });

  it("next.config: rule DENY tidak berlaku untuk /berkas/, rule SAMEORIGIN hanya untuk /berkas/", async () => {
    const konfig = (await import("../../next.config.mjs")).default as {
      headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]>;
    };
    const aturan = await konfig.headers();
    const xfo = aturan.filter((a) => a.headers.some((h) => h.key === "X-Frame-Options"));
    expect(xfo).toHaveLength(2);
    const deny = xfo.find((a) => a.headers[0].value === "DENY")!;
    const same = xfo.find((a) => a.headers[0].value === "SAMEORIGIN")!;
    expect(same.source).toBe("/berkas/:path*");
    // Pola Next "/((?!berkas/).*)" - diuji sebagai regex padanan.
    const re = new RegExp("^/((?!berkas/).*)$");
    expect(deny.source).toBe("/((?!berkas/).*)");
    expect(re.test("/")).toBe(true);
    expect(re.test("/kasubag")).toBe(true);
    expect(re.test("/berkas/tte/x")).toBe(false);
  });
});

describe("Content-Security-Policy (pentest F-07)", () => {
  it("halaman biasa: frame-ancestors 'none', object-src 'none', tanpa unsafe-eval di produksi", async () => {
    const { kebijakanCsp } = await import("../middleware");
    const csp = kebijakanCsp("/kasubag/kalkulasi", false);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self' https://account.kemnaker.go.id");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("/berkas/ boleh dibingkai halaman sendiri", async () => {
    const { kebijakanCsp } = await import("../middleware");
    expect(kebijakanCsp("/berkas/tte/abc", false)).toContain("frame-ancestors 'self'");
    expect(kebijakanCsp("/berkasku", false)).toContain("frame-ancestors 'none'");
    expect(kebijakanCsp("/berkas/tte/abc", false)).toContain("object-src 'self'");
    expect(kebijakanCsp("/berkasku", false)).toContain("object-src 'none'");
  });

  it("development menambah unsafe-eval dan websocket", async () => {
    const { kebijakanCsp } = await import("../middleware");
    const csp = kebijakanCsp("/", true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("ws:");
  });

  it("terpasang di respons middleware", async () => {
    const { NextRequest } = await import("next/server");
    const { middleware } = await import("../middleware");
    const res = await middleware(new NextRequest("http://localhost:3000/"));
    expect(res.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });
});

describe("penahan CSRF lapis kedua (pentest F-05)", () => {
  const buat = async (url: string, init: { method?: string; headers?: Record<string, string> }) => {
    const { NextRequest } = await import("next/server");
    const { middleware } = await import("../middleware");
    return middleware(new NextRequest(url, init));
  };

  it("POST API ber-Origin asing ditolak 403", async () => {
    const res = await buat("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { origin: "https://evil.example", host: "localhost:3000" },
    });
    expect(res.status).toBe(403);
  });

  it("Server Action ber-Origin asing ditolak 403", async () => {
    const res = await buat("http://localhost:3000/admin", {
      method: "POST",
      headers: { origin: "https://evil.example", host: "localhost:3000", "next-action": "abc" },
    });
    expect(res.status).toBe(403);
  });

  it("Origin 'null' ditolak", async () => {
    const res = await buat("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { origin: "null", host: "localhost:3000" },
    });
    expect(res.status).toBe(403);
  });

  it("Origin resmi, Origin sama host, dan tanpa Origin lolos", async () => {
    const resmi = await buat("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { origin: "https://gajihub.kemnaker.go.id", host: "localhost:3000" },
    });
    expect(resmi.status).not.toBe(403);
    const samaHost = await buat("http://10.9.9.9:8080/api/auth/login", {
      method: "POST",
      headers: { origin: "http://10.9.9.9:8080", host: "10.9.9.9:8080" },
    });
    expect(samaHost.status).not.toBe(403);
    const tanpa = await buat("http://localhost:3000/api/auth/login", { method: "POST" });
    expect(tanpa.status).not.toBe(403);
  });

  it("GET ber-Origin asing tidak disentuh", async () => {
    const res = await buat("http://localhost:3000/login", {
      headers: { origin: "https://evil.example" },
    });
    expect(res.status).not.toBe(403);
  });
});

describe("robots.txt", () => {
  it("tidak dialihkan ke login", async () => {
    const { NextRequest } = await import("next/server");
    const { middleware } = await import("../middleware");
    const res = await middleware(new NextRequest("http://localhost:3000/robots.txt"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
  it("robots.ts melarang semua", async () => {
    const robots = (await import("../app/robots")).default;
    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
  });
});

describe("pengalihan login tidak memantulkan Host asing (pentest F-03)", () => {
  it("GET / dengan Host evil.com dialihkan ke domain resmi", async () => {
    const { NextRequest } = await import("next/server");
    const { middleware } = await import("../middleware");
    const res = await middleware(
      new NextRequest("http://evil.com/", { headers: { host: "evil.com" } })
    );
    const lokasi = res.headers.get("location") ?? "";
    expect(lokasi).not.toContain("evil.com");
    expect(lokasi.startsWith("https://gajihub.kemnaker.go.id/login")).toBe(true);
  });
});
