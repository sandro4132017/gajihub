import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { readFile, ambilUserSesi } = vi.hoisted(() => ({
  readFile: vi.fn(),
  ambilUserSesi: vi.fn(),
}));

vi.mock("@/auth/getSessionAccount", () => ({ ambilUserSesi }));
vi.mock("fs/promises", () => ({ default: { readFile, realpath: async (p: string) => p }, readFile, realpath: async (p: string) => p }));

import { GET } from "../route";

const UNIT = "Biro Umum";
const sesi = (o: Record<string, unknown> = {}) => ({
  nip: "199001010000000001", // sensitive-ok
  role: "KASUBAG_TU",
  satuanKerja: UNIT,
  aktif: true,
  ...o,
});
const q = (o: Record<string, string> = {}) =>
  new NextRequest(
    "http://localhost/berkas/tte-pratinjau?" +
      new URLSearchParams({
        jenis: "SPTJM_TUKIN",
        bulan: "8",
        tahun: "2026",
        satker: UNIT,
        ...o,
      }).toString()
  );

beforeEach(() => {
  readFile.mockReset();
  ambilUserSesi.mockReset();
});

describe("GET /berkas/tte-pratinjau", () => {
  it("tanpa sesi -> 401", async () => {
    ambilUserSesi.mockResolvedValue(null);
    expect((await GET(q())).status).toBe(401);
  });

  it("PEGAWAI se-unit dan Kasubag TU unit lain -> 403", async () => {
    ambilUserSesi.mockResolvedValue(sesi({ role: "PEGAWAI" }));
    expect((await GET(q())).status).toBe(403);
    ambilUserSesi.mockResolvedValue(sesi({ satuanKerja: "Sekretariat Jenderal" }));
    expect((await GET(q())).status).toBe(403);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("jenis di luar daftar / periode cacat / satker kosong -> 400 tanpa membaca disk", async () => {
    ambilUserSesi.mockResolvedValue(sesi());
    expect((await GET(q({ jenis: "../../x" }))).status).toBe(400);
    expect((await GET(q({ bulan: "13" }))).status).toBe(400);
    expect((await GET(q({ satker: "" }))).status).toBe(400);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("nama berkas dihitung di server: letak = folder unit + periode + nama resmi", async () => {
    ambilUserSesi.mockResolvedValue(sesi());
    readFile.mockResolvedValue(Buffer.from("%PDF-"));
    const res = await GET(q());
    expect(res.status).toBe(200);
    const jalur = String(readFile.mock.calls[0][0]);
    expect(jalur).toMatch(/tte[\\/]Biro Umum[\\/]2026-08[\\/]Draft - SPTJM - TUNKIN Agustus 2026 Biro Umum\.pdf$/);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("berkas belum ada -> 404", async () => {
    ambilUserSesi.mockResolvedValue(sesi());
    readFile.mockRejectedValue(new Error("ENOENT"));
    expect((await GET(q())).status).toBe(404);
  });

  it("nama unit berisi traversal tidak keluar dari folder tte (PPABP)", async () => {
    ambilUserSesi.mockResolvedValue(sesi({ role: "PPABP", satuanKerja: null }));
    readFile.mockResolvedValue(Buffer.from("%PDF-"));
    await GET(q({ satker: "../../etc" }));
    const jalur = String(readFile.mock.calls[0]?.[0] ?? "");
    expect(jalur).not.toMatch(/\.\.[\\/]/);
  });
});
