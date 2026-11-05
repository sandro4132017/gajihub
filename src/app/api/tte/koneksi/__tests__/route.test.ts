import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  ambilUserSesi: vi.fn(),
  periksaKoneksiBsre: vi.fn(),
}));

vi.mock("@/auth/getSessionAccount", () => ({ ambilUserSesi: m.ambilUserSesi }));
vi.mock("@/lib/tte/koneksiBsre", () => ({ periksaKoneksiBsre: m.periksaKoneksiBsre }));

import { GET } from "../route";

const user = (o: Record<string, unknown> = {}) => ({
  id: "u1",
  nip: "199001010000000001", // sensitive-ok
  role: "KASUBAG_TU",
  satuanKerja: "Biro Umum",
  aktif: true,
  ...o,
});
const req = (q = "") => new NextRequest(`http://localhost/api/tte/koneksi${q}`);

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.periksaKoneksiBsre.mockResolvedValue({
    keadaan: "GANGGUAN",
    sebab: "BATAS_WAKTU",
    diperiksaPada: "2026-11-03T03:00:00.000Z",
    rahasia: "http://192.168.1.1",
  });
});

describe("GET /api/tte/koneksi", () => {
  it("401 tanpa sesi", async () => {
    m.ambilUserSesi.mockResolvedValue(null);
    const r = await GET(req());
    expect(r.status).toBe(401);
    expect(m.periksaKoneksiBsre).not.toHaveBeenCalled();
  });

  it.each([
    ["PEGAWAI", { role: "PEGAWAI" }],
    ["PPABP", { role: "PPABP" }],
    ["KASUBAG_TU tanpa satker", { satuanKerja: null }],
    ["akun nonaktif", { aktif: false }],
  ])("403 untuk %s", async (_n, o) => {
    m.ambilUserSesi.mockResolvedValue(user(o));
    const r = await GET(req());
    expect(r.status).toBe(403);
    expect(m.periksaKoneksiBsre).not.toHaveBeenCalled();
  });

  it.each([{}, { role: "ADMIN", satuanKerja: null }])("200 untuk %j", async (o) => {
    m.ambilUserSesi.mockResolvedValue(user(o));
    const r = await GET(req());
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("isi hanya keadaan, sebab, diperiksaPada", async () => {
    m.ambilUserSesi.mockResolvedValue(user());
    const body = await (await GET(req())).json();
    expect(Object.keys(body).sort()).toEqual(["diperiksaPada", "keadaan", "sebab"]);
    expect(JSON.stringify(body)).not.toContain("192.168");
  });

  it("?paksa=1 diteruskan; tanpa itu tidak", async () => {
    m.ambilUserSesi.mockResolvedValue(user());
    await GET(req("?paksa=1"));
    expect(m.periksaKoneksiBsre).toHaveBeenLastCalledWith({ paksa: true });
    await GET(req());
    expect(m.periksaKoneksiBsre).toHaveBeenLastCalledWith({ paksa: false });
  });

  it("galat tak terduga -> TIDAK_DIKETAHUI tanpa pesan galat", async () => {
    m.ambilUserSesi.mockResolvedValue(user());
    m.periksaKoneksiBsre.mockRejectedValue(new Error("rahasia internal"));
    const r = await GET(req());
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(body.keadaan).toBe("TIDAK_DIKETAHUI");
    expect(JSON.stringify(body)).not.toContain("rahasia");
  });
});
