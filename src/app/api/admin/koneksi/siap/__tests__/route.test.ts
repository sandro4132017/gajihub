import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  ambilUserSesi: vi.fn(),
  periksaKoneksiSiap: vi.fn(),
}));

vi.mock("@/auth/getSessionAccount", () => ({ ambilUserSesi: m.ambilUserSesi }));
vi.mock("@/lib/koneksiSiap", () => ({ periksaKoneksiSiap: m.periksaKoneksiSiap }));

import { GET } from "../route";

const user = (o: Record<string, unknown> = {}) => ({
  id: "u1",
  nip: "199001010000000001", // sensitive-ok
  role: "ADMIN",
  satuanKerja: null,
  aktif: true,
  ...o,
});
const req = (q = "") => new NextRequest(`http://localhost/api/admin/koneksi/siap${q}`);

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.periksaKoneksiSiap.mockResolvedValue({
    keadaan: "GANGGUAN",
    sebab: "BATAS_WAKTU",
    diperiksaPada: "2026-11-03T03:00:00.000Z",
    rahasia: "10.0.0.5",
  });
});

describe("GET /api/admin/koneksi/siap", () => {
  it("401 tanpa sesi, pemeriksa tidak dipanggil", async () => {
    m.ambilUserSesi.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
    expect(m.periksaKoneksiSiap).not.toHaveBeenCalled();
  });

  it.each([
    ["PEGAWAI", { role: "PEGAWAI" }],
    ["OSDMA", { role: "OSDMA" }],
    ["PIMPINAN", { role: "PIMPINAN" }],
    ["PPABP", { role: "PPABP" }],
    ["KASUBAG_TU", { role: "KASUBAG_TU", satuanKerja: "Biro Umum" }],
    ["ADMIN nonaktif", { aktif: false }],
  ])("403 untuk %s", async (_n, o) => {
    m.ambilUserSesi.mockResolvedValue(user(o));
    const r = await GET(req());
    expect(r.status).toBe(403);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(m.periksaKoneksiSiap).not.toHaveBeenCalled();
  });

  it("200 + no-store untuk ADMIN", async () => {
    m.ambilUserSesi.mockResolvedValue(user());
    const r = await GET(req());
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("isi hanya keadaan, sebab, diperiksaPada", async () => {
    m.ambilUserSesi.mockResolvedValue(user());
    const body = await (await GET(req())).json();
    expect(Object.keys(body).sort()).toEqual(["diperiksaPada", "keadaan", "sebab"]);
    expect(JSON.stringify(body)).not.toContain("10.0.0.5");
  });

  it("?paksa=1 diteruskan; tanpa itu tidak", async () => {
    m.ambilUserSesi.mockResolvedValue(user());
    await GET(req("?paksa=1"));
    expect(m.periksaKoneksiSiap).toHaveBeenLastCalledWith({ paksa: true });
    await GET(req());
    expect(m.periksaKoneksiSiap).toHaveBeenLastCalledWith({ paksa: false });
  });

  it("pemeriksa melempar -> 200 TIDAK_DIKETAHUI tanpa pesan galat", async () => {
    m.ambilUserSesi.mockResolvedValue(user());
    m.periksaKoneksiSiap.mockRejectedValue(new Error("rahasia internal"));
    const r = await GET(req());
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(body.keadaan).toBe("TIDAK_DIKETAHUI");
    expect(JSON.stringify(body)).not.toContain("rahasia");
  });
});
