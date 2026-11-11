import { beforeEach, describe, expect, it, vi } from "vitest";

// Route logout, ganti-role, keluar, perpanjang.
const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  userUpdate: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("../../../../auth/getSessionAccount", () => ({ getSessionAccount: m.getSession }));
vi.mock("../../../../lib/prisma", () => ({
  prisma: { user: { update: m.userUpdate, findUnique: m.userFindUnique } },
}));

import { POST as logout } from "../logout/route";
import { POST as gantiRole } from "../ganti-role/route";
import { GET as keluar } from "../keluar/route";
import { POST as perpanjang } from "../perpanjang/route";
import { nilaiTokenSesi } from "../../../../auth/session";

const NIP = "199000000000000001"; // sensitive-ok
const MENIT = 60 * 1000;

const sesi = (o: Record<string, unknown> = {}) => ({
  userId: "u-1",
  nip: NIP,
  nama: "Pegawai Uji",
  role: "PPABP",
  satuanKerja: null,
  jabatan: "PPABP",
  v: 4,
  lp: Date.now() - 120 * MENIT,
  ak: Date.now() - 5 * MENIT,
  rolesTersedia: ["PPABP", "PEGAWAI"],
  ...o,
});

const ambilToken = (res: Response) => {
  const sc = res.headers.get("set-cookie") ?? "";
  return /gajihub_session=([^;]+)/.exec(sc)?.[1] ?? "";
};

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  vi.stubEnv("SESSION_SECRET", "rahasia-uji-palsu-untuk-test-saja-32"); // sensitive-ok
});

describe("POST /api/auth/logout", () => {
  it("menaikkan sesiVersi (increment 1) lalu menghapus cookie", async () => {
    m.getSession.mockResolvedValue(sesi());
    m.userUpdate.mockResolvedValue({ id: "u-1" });
    const res = await logout();
    expect(m.userUpdate).toHaveBeenCalledTimes(1);
    expect(m.userUpdate.mock.calls[0][0]).toMatchObject({
      where: { nip: NIP },
      data: { sesiVersi: { increment: 1 } },
    });
    expect(res.headers.get("set-cookie") ?? "").toContain("gajihub_session=;");
  });

  it("database gagal: cookie TETAP dihapus, log tanpa NIP", async () => {
    m.getSession.mockResolvedValue(sesi());
    m.userUpdate.mockRejectedValue(new Error("db mati " + NIP));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await logout();
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie") ?? "").toContain("gajihub_session=;");
    expect(JSON.stringify(err.mock.calls)).not.toContain(NIP);
    err.mockRestore();
  });

  it("tanpa sesi: tidak menyentuh database, cookie tetap dihapus", async () => {
    m.getSession.mockResolvedValue(null);
    const res = await logout();
    expect(m.userUpdate).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie") ?? "").toContain("gajihub_session=;");
  });
});

describe("POST /api/auth/ganti-role", () => {
  const kirim = (role: string) =>
    gantiRole(new Request("http://x/api/auth/ganti-role", { method: "POST", body: JSON.stringify({ role }) }) as never);

  it("versi token dari sesi berjalan, bukan dari query kedua yang sudah berubah", async () => {
    m.getSession.mockResolvedValue(sesi({ v: 4 }));
    // Sesi dicabut di antara dua query: baris User sudah versi 5.
    m.userFindUnique.mockResolvedValue({
      id: "u-1", nip: NIP, nama: "Pegawai Uji", role: "PPABP",
      rolesTambahan: ["PEGAWAI"], satuanKerja: null, aktif: true, sesiVersi: 5,
    });
    const res = await kirim("PEGAWAI");
    expect(res.status).toBe(200);
    const h = await nilaiTokenSesi(ambilToken(res));
    expect(h.payload).toMatchObject({ v: 4 });
  });

  it("mempertahankan lp (tidak mengulang 8 jam) dan versi; maxAge = sisa", async () => {
    const lp = Date.now() - 120 * MENIT;
    m.getSession.mockResolvedValue(sesi({ lp }));
    m.userFindUnique.mockResolvedValue({
      id: "u-1",
      nip: NIP,
      nama: "Pegawai Uji",
      role: "PPABP",
      rolesTambahan: ["PEGAWAI"],
      satuanKerja: null,
      aktif: true,
      sesiVersi: 4,
    });
    const res = await kirim("PEGAWAI");
    expect(res.status).toBe(200);
    expect((await res.json()).redirect).toBe("/saya");
    const h = await nilaiTokenSesi(ambilToken(res));
    expect(h.status).toBe("ok");
    expect(h.payload).toMatchObject({ role: "PEGAWAI", lp, v: 4 });
    const maxAge = Number(/Max-Age=(\d+)/i.exec(res.headers.get("set-cookie") ?? "")?.[1]);
    // sisa sekitar 6 jam, bukan 8 jam penuh
    expect(maxAge).toBeLessThanOrEqual(6 * 3600);
    expect(maxAge).toBeGreaterThan(6 * 3600 - 10);
  });
});

describe("GET /api/auth/keluar", () => {
  it.each(["dicabut", "nonaktif"])("alasan %s: cookie dibuang dan ke /login?sesi=", async (alasan) => {
    // NextRequest dibutuhkan untuk nextUrl
    const { NextRequest } = await import("next/server");
    const res = await keluar(new NextRequest(`http://localhost:3000/api/auth/keluar?alasan=${alasan}`));
    expect(new URL(res.headers.get("location") ?? "").searchParams.get("sesi")).toBe(alasan);
    expect(res.headers.get("set-cookie") ?? "").toContain("gajihub_session=;");
    expect(m.userUpdate).not.toHaveBeenCalled(); // versi tidak dinaikkan
  });

  it("alasan tak dikenal: tetap membuang cookie, tanpa parameter sesi", async () => {
    const { NextRequest } = await import("next/server");
    const res = await keluar(new NextRequest("http://localhost:3000/api/auth/keluar?alasan=<x>"));
    expect(new URL(res.headers.get("location") ?? "").searchParams.has("sesi")).toBe(false);
    expect(res.headers.get("set-cookie") ?? "").toContain("gajihub_session=;");
  });
});

describe("POST /api/auth/perpanjang", () => {
  it("sesi sah: 204 dan cookie baru dengan ak = sekarang, lp dipertahankan", async () => {
    const lp = Date.now() - 60 * MENIT;
    const { rolesTersedia: _r, ...payload } = sesi({ lp });
    m.getSession.mockResolvedValue({ ...payload, rolesTersedia: ["PPABP"] });
    const res = await perpanjang();
    expect(res.status).toBe(204);
    const h = await nilaiTokenSesi(ambilToken(res));
    expect(h.payload).toMatchObject({ lp, v: 4 });
    expect(Date.now() - (h.payload?.ak ?? 0)).toBeLessThan(5000);
  });

  it("sesi tidak sah (termasuk versi dicabut): 401 tanpa cookie", async () => {
    m.getSession.mockResolvedValue(null);
    const res = await perpanjang();
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
