import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// BATAS MENGANGGUR / ABSOLUT - perilaku middleware (src/middleware.ts).
// Header keamanan & matcher dijaga middlewareMatcher.test.ts.
// ============================================================================

describe("adalahAktivitas - apa yang memperpanjang batas menganggur", () => {
  const req = (path: string, metode = "GET", header: Record<string, string> = {}) => ({
    method: metode,
    headers: new Headers(header),
    nextUrl: { pathname: path },
  });

  it("navigasi dokumen dihitung", async () => {
    const { adalahAktivitas } = await import("../middleware");
    expect(adalahAktivitas(req("/tukin", "GET", { "sec-fetch-mode": "navigate" }))).toBe(true);
    expect(adalahAktivitas(req("/tukin", "GET", { accept: "text/html,application/xhtml+xml" }))).toBe(true);
  });

  it("navigasi RSC dihitung, prefetch RSC tidak", async () => {
    const { adalahAktivitas } = await import("../middleware");
    expect(adalahAktivitas(req("/tukin", "GET", { rsc: "1" }))).toBe(true);
    expect(adalahAktivitas(req("/tukin", "GET", { rsc: "1", "next-router-prefetch": "1" }))).toBe(false);
    expect(adalahAktivitas(req("/tukin", "GET", { rsc: "1", "next-router-segment-prefetch": "/tukin" }))).toBe(false);
  });

  it("Server Action dihitung", async () => {
    const { adalahAktivitas } = await import("../middleware");
    expect(adalahAktivitas(req("/kasubag", "POST", { "next-action": "abc" }))).toBe(true);
  });

  it("POST/PUT/PATCH/DELETE ke /api/* dihitung", async () => {
    const { adalahAktivitas } = await import("../middleware");
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(adalahAktivitas(req("/api/apa-saja", m))).toBe(true);
    }
  });

  it("GET /api/* (polling), /berkas/*, /api/auth/*, dan rute mesin TIDAK dihitung", async () => {
    const { adalahAktivitas, RUTE_MESIN } = await import("../middleware");
    expect(adalahAktivitas(req("/api/kabar", "GET", { accept: "application/json" }))).toBe(false);
    expect(adalahAktivitas(req("/api/kabar", "GET", { accept: "text/html" }))).toBe(false);
    expect(adalahAktivitas(req("/berkas/tte/abc", "GET", { "sec-fetch-mode": "navigate" }))).toBe(false);
    expect(adalahAktivitas(req("/api/auth/perpanjang", "POST"))).toBe(false);
    expect(adalahAktivitas(req("/api/auth/ganti-role", "POST"))).toBe(false);
    for (const r of RUTE_MESIN) expect(adalahAktivitas(req(r, "POST"))).toBe(false);
  });
});

describe("batas menganggur di middleware", () => {
  const MENIT = 60 * 1000;
  const PAYLOAD = {
    userId: "u-1",
    nip: "199000000000000001", // sensitive-ok
    nama: "Pegawai Uji",
    role: "PEGAWAI" as const,
    satuanKerja: null,
    jabatan: "Pegawai",
  };
  const navigasi = { "sec-fetch-mode": "navigate" };

  const jalankan = async (
    url: string,
    opsi: { token?: string; headers?: Record<string, string>; method?: string } = {}
  ) => {
    const { NextRequest } = await import("next/server");
    const { middleware } = await import("../middleware");
    const headers: Record<string, string> = { ...(opsi.headers ?? {}) };
    if (opsi.token) headers.cookie = `gajihub_session=${opsi.token}`;
    return middleware(new NextRequest(url, { method: opsi.method, headers }));
  };

  beforeEach(() => {
    vi.stubEnv("SESSION_SECRET", "rahasia-uji-palsu-untuk-test-saja-32"); // sensitive-ok
  });
  afterEach(() => vi.unstubAllEnvs());

  const tokenAktif = async (akMenitLalu: number, lpMenitLalu = akMenitLalu) => {
    const { buatTokenSesi } = await import("../auth/session");
    const now = Date.now();
    return buatTokenSesi({ ...PAYLOAD, v: 0, lp: now - lpMenitLalu * MENIT, ak: now - akMenitLalu * MENIT }, now);
  };

  it("menganggur: redirect /login?sesi=menganggur DAN cookie dihapus", async () => {
    const token = await tokenAktif(31);
    const res = await jalankan("http://localhost:3000/tukin", { token, headers: navigasi });
    expect(res.status).toBe(307);
    const lokasi = new URL(res.headers.get("location") ?? "");
    expect(lokasi.pathname).toBe("/login");
    expect(lokasi.searchParams.get("sesi")).toBe("menganggur");
    const sc = res.headers.get("set-cookie") ?? "";
    expect(sc).toContain("gajihub_session=;");
    expect(sc.toLowerCase()).toMatch(/max-age=0|expires=thu, 01 jan 1970/);
  });

  it("melewati 8 jam sejak login: sesi=kedaluwarsa", async () => {
    const token = await tokenAktif(1, 8 * 60 + 1);
    const res = await jalankan("http://localhost:3000/tukin", { token, headers: navigasi });
    expect(new URL(res.headers.get("location") ?? "").searchParams.get("sesi")).toBe("kedaluwarsa");
  });

  it("token format lama: sesi=format-lama dan cookie dihapus", async () => {
    const payloadB64 = Buffer.from(JSON.stringify({ ...PAYLOAD, exp: Date.now() + 3_600_000 })).toString("base64url");
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(process.env.SESSION_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
    const token = `${payloadB64}.${Buffer.from(sig).toString("base64url")}`; // sensitive-ok
    const res = await jalankan("http://localhost:3000/tukin", { token, headers: navigasi });
    expect(new URL(res.headers.get("location") ?? "").searchParams.get("sesi")).toBe("format-lama");
    expect(res.headers.get("set-cookie") ?? "").toContain("gajihub_session=;");
  });

  it("/login sendiri TIDAK dialihkan ke /login walau sesinya menganggur (tanpa loop)", async () => {
    const token = await tokenAktif(45);
    const res = await jalankan("http://localhost:3000/login?sesi=menganggur", { token, headers: navigasi });
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("aktivitas + jeda >= 60 dtk: cookie baru, maxAge = sisa sampai batas mutlak", async () => {
    const token = await tokenAktif(5, 60); // login 1 jam lalu
    const res = await jalankan("http://localhost:3000/tukin", { token, headers: navigasi });
    expect(res.status).toBe(200);
    const sc = res.headers.get("set-cookie") ?? "";
    expect(sc).toContain("gajihub_session=");
    const maxAge = Number(/Max-Age=(\d+)/i.exec(sc)?.[1]);
    expect(maxAge).toBeGreaterThan(7 * 3600 - 5);
    expect(maxAge).toBeLessThanOrEqual(7 * 3600);
    expect(sc).toContain("HttpOnly");
    expect(sc.toLowerCase()).toContain("samesite=lax");
  });

  it("jeda < 60 dtk tidak menerbitkan ulang", async () => {
    const { buatTokenSesi } = await import("../auth/session");
    const now = Date.now();
    const token = await buatTokenSesi({ ...PAYLOAD, v: 0, lp: now - 5000, ak: now - 5000 }, now);
    const res = await jalankan("http://localhost:3000/tukin", { token, headers: navigasi });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("tanpa aktivitas (prefetch, GET /api/*, /berkas/*) cookie TIDAK diperbarui", async () => {
    const token = await tokenAktif(10);
    const prefetch = await jalankan("http://localhost:3000/tukin", {
      token,
      headers: { rsc: "1", "next-router-prefetch": "1" },
    });
    expect(prefetch.headers.get("set-cookie")).toBeNull();
    const api = await jalankan("http://localhost:3000/api/kabar", { token });
    expect(api.headers.get("set-cookie")).toBeNull();
    const berkas = await jalankan("http://localhost:3000/berkas/tte/abc", { token, headers: navigasi });
    expect(berkas.headers.get("set-cookie")).toBeNull();
  });

  it("path dipasang sebagai header permintaan x-pathname untuk layout", async () => {
    const res = await jalankan("http://localhost:3000/tte/verify/abc", { headers: navigasi });
    expect(res.headers.get("x-middleware-request-x-pathname")).toBe("/tte/verify/abc");
  });

  it("Server Action juga memperpanjang", async () => {
    const token = await tokenAktif(10);
    const res = await jalankan("http://localhost:3000/kasubag", {
      token,
      method: "POST",
      headers: { "next-action": "abc", origin: "http://localhost:3000", host: "localhost:3000" },
    });
    expect(res.headers.get("set-cookie") ?? "").toContain("gajihub_session=");
  });

  it("tanpa Secure saat COOKIE_SECURE kosong (HTTP internal); Secure bila true", async () => {
    vi.stubEnv("COOKIE_SECURE", "");
    const token = await tokenAktif(10);
    const polos = await jalankan("http://localhost:3000/tukin", { token, headers: navigasi });
    expect((polos.headers.get("set-cookie") ?? "").toLowerCase()).not.toContain("secure");
    vi.stubEnv("COOKIE_SECURE", "true");
    const aman = await jalankan("http://localhost:3000/tukin", { token, headers: navigasi });
    expect((aman.headers.get("set-cookie") ?? "").toLowerCase()).toContain("secure");
  });
});
