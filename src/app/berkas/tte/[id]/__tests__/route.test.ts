import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { findUnique, readFile, ambilUserSesi } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  readFile: vi.fn(),
  ambilUserSesi: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { dokumenTte: { findUnique } } }));
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
const permintaan = (q = "") => new NextRequest(`http://localhost/berkas/tte/abc${q}`);
const konteks = { params: Promise.resolve({ id: "abc" }) };

const dok = (o: Record<string, unknown> = {}) => ({
  status: "TERTANDATANGANI",
  satuanKerja: UNIT,
  fileDraftPath: "tte/Biro Umum/2026-08/draft_abc.pdf",
  fileSignedPath: "tte/Biro Umum/2026-08/abc/SPTJM - TUNKIN Agustus 2026 Biro Umum.pdf",
  ...o,
});

beforeEach(() => {
  findUnique.mockReset();
  readFile.mockReset();
  ambilUserSesi.mockReset();
});

describe("GET /berkas/tte/[id]", () => {
  it("tanpa sesi -> 401", async () => {
    ambilUserSesi.mockResolvedValue(null);
    expect((await GET(permintaan(), konteks)).status).toBe(401);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("dokumen tidak ada -> 404", async () => {
    ambilUserSesi.mockResolvedValue(sesi());
    findUnique.mockResolvedValue(null);
    expect((await GET(permintaan(), konteks)).status).toBe(404);
  });

  it.each([
    ["PEGAWAI se-unit", { role: "PEGAWAI" }],
    ["PIMPINAN", { role: "PIMPINAN" }],
    ["Kasubag TU unit lain", { satuanKerja: "Sekretariat Jenderal" }],
    ["akun nonaktif", { aktif: false }],
  ])("%s -> 403 tanpa membaca disk", async (_n, o) => {
    ambilUserSesi.mockResolvedValue(sesi(o));
    findUnique.mockResolvedValue(dok());
    expect((await GET(permintaan(), konteks)).status).toBe(403);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("Kasubag TU unit itu: berkas bertanda tangan, header aman, nama dengan spasi utuh", async () => {
    ambilUserSesi.mockResolvedValue(sesi());
    findUnique.mockResolvedValue(dok());
    readFile.mockResolvedValue(Buffer.from("%PDF-1.7"));

    const res = await GET(permintaan(), konteks);

    expect(res.status).toBe(200);
    expect(String(readFile.mock.calls[0][0])).toContain("SPTJM - TUNKIN Agustus 2026 Biro Umum.pdf");
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-disposition")).toContain("inline;");
  });

  it("PPABP lintas unit boleh; ?unduh=1 -> attachment", async () => {
    ambilUserSesi.mockResolvedValue(sesi({ role: "PPABP", satuanKerja: null }));
    findUnique.mockResolvedValue(dok());
    readFile.mockResolvedValue(Buffer.from("%PDF-"));
    const res = await GET(permintaan("?unduh=1"), konteks);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment;");
  });

  it("belum tertandatangani -> menyajikan draft", async () => {
    ambilUserSesi.mockResolvedValue(sesi());
    findUnique.mockResolvedValue(dok({ status: "MENUNGGU_TTE", fileSignedPath: null }));
    readFile.mockResolvedValue(Buffer.from("%PDF-"));
    await GET(permintaan(), konteks);
    expect(String(readFile.mock.calls[0][0])).toContain("draft_abc.pdf");
  });

  it("format lama /uploads/tte/... tetap terbaca", async () => {
    ambilUserSesi.mockResolvedValue(sesi());
    findUnique.mockResolvedValue(dok({ fileSignedPath: "/uploads/tte/abc/SPTJM%20A.pdf" }));
    readFile.mockResolvedValue(Buffer.from("%PDF-"));
    expect((await GET(permintaan(), konteks)).status).toBe(200);
    expect(String(readFile.mock.calls[0][0])).toContain("SPTJM A.pdf");
  });

  it("tanpa jalur berkas / referensi tak sah / berkas hilang -> 404", async () => {
    ambilUserSesi.mockResolvedValue(sesi());
    findUnique.mockResolvedValue(dok({ status: "MENUNGGU_TTE", fileSignedPath: null, fileDraftPath: null }));
    expect((await GET(permintaan(), konteks)).status).toBe(404);

    findUnique.mockResolvedValue(dok({ fileSignedPath: "tte/../../x.pdf" }));
    expect((await GET(permintaan(), konteks)).status).toBe(404);
    expect(readFile).not.toHaveBeenCalled();

    findUnique.mockResolvedValue(dok());
    readFile.mockRejectedValue(new Error("ENOENT"));
    expect((await GET(permintaan(), konteks)).status).toBe(404);
  });
});
