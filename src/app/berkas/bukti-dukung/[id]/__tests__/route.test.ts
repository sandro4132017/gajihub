import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { findUnique, readFile, ambilUserSesi } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  readFile: vi.fn(),
  ambilUserSesi: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { buktiDukung: { findUnique } },
}));
vi.mock("@/auth/getSessionAccount", () => ({ ambilUserSesi }));
vi.mock("fs/promises", () => ({
  default: { readFile, realpath: async (p: string) => p },
  readFile,
  realpath: async (p: string) => p,
}));

import { GET } from "../route";

const NIP_PENGAJU = "199001010000000001"; // sensitive-ok
const NIP_LAIN = "199001010000000002"; // sensitive-ok
const UNIT = "Biro Umum";

const permintaan = (query = "") =>
  new NextRequest(`http://localhost/berkas/bukti-dukung/abc${query}`, { method: "GET" });
const konteks = (id = "abc") => ({ params: Promise.resolve({ id }) });

const sesi = (o: Record<string, unknown> = {}) => ({
  nip: NIP_LAIN,
  role: "PEGAWAI",
  satuanKerja: UNIT,
  aktif: true,
  ...o,
});

const baris = (o: Record<string, unknown> = {}) => ({
  namaFile: "Surat Sakit é.pdf",
  fileUrl: "bukti-dukung/1700000000000_ab12cd34_Surat_Sakit.pdf",
  banding: {
    pengaju: { nip: NIP_PENGAJU },
    pegawai: { satuanKerja: UNIT },
  },
  ...o,
});

beforeEach(() => {
  findUnique.mockReset();
  readFile.mockReset();
  ambilUserSesi.mockReset();
});

describe("GET /berkas/bukti-dukung/[id]", () => {
  it("tanpa sesi -> 401, database tidak disentuh", async () => {
    ambilUserSesi.mockResolvedValue(null);
    const res = await GET(permintaan(), konteks());
    expect(res.status).toBe(401);
    expect(findUnique).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("baris tidak ada -> 404", async () => {
    ambilUserSesi.mockResolvedValue(sesi({ nip: NIP_PENGAJU }));
    findUnique.mockResolvedValue(null);
    const res = await GET(permintaan(), konteks("tidak-ada"));
    expect(res.status).toBe(404);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("pegawai lain -> 403 dan berkas tidak dibaca", async () => {
    ambilUserSesi.mockResolvedValue(sesi());
    findUnique.mockResolvedValue(baris());
    const res = await GET(permintaan(), konteks());
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(readFile).not.toHaveBeenCalled();
  });

  it("Kasubag TU unit lain -> 403", async () => {
    ambilUserSesi.mockResolvedValue(sesi({ role: "KASUBAG_TU", satuanKerja: "Sekretariat Jenderal" }));
    findUnique.mockResolvedValue(baris());
    const res = await GET(permintaan(), konteks());
    expect(res.status).toBe(403);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("pemilik -> 200 inline dengan header aman", async () => {
    ambilUserSesi.mockResolvedValue(sesi({ nip: NIP_PENGAJU }));
    findUnique.mockResolvedValue(baris());
    readFile.mockResolvedValue(Buffer.from("%PDF-1.7 isi"));

    const res = await GET(permintaan(), konteks());

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-length")).toBe(String("%PDF-1.7 isi".length));
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const disposisi = res.headers.get("content-disposition") ?? "";
    expect(disposisi.startsWith("inline;")).toBe(true);
    expect(disposisi).toContain("filename*=UTF-8''Surat%20Sakit%20%C3%A9.pdf");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("%PDF-1.7 isi");
  });

  it("?unduh=1 -> attachment", async () => {
    ambilUserSesi.mockResolvedValue(sesi({ nip: NIP_PENGAJU }));
    findUnique.mockResolvedValue(baris());
    readFile.mockResolvedValue(Buffer.from("%PDF-"));
    const res = await GET(permintaan("?unduh=1"), konteks());
    expect((res.headers.get("content-disposition") ?? "").startsWith("attachment;")).toBe(true);
  });

  it("OSDMA lintas unit boleh; format lama /uploads/... tetap terbaca", async () => {
    ambilUserSesi.mockResolvedValue(sesi({ role: "OSDMA", satuanKerja: null }));
    findUnique.mockResolvedValue(baris({ fileUrl: "/uploads/bukti-dukung/1700_ab_Surat_Sakit.pdf" }));
    readFile.mockResolvedValue(Buffer.from("%PDF-"));
    const res = await GET(permintaan(), konteks());
    expect(res.status).toBe(200);
    expect(String(readFile.mock.calls[0][0])).toMatch(/storage[\\/]uploads[\\/]bukti-dukung[\\/]1700_ab_Surat_Sakit\.pdf$/);
  });

  it.each([
    ["URL palsu dari seed", "https://placeholder.local/bukti/sk.pdf"],
    ["traversal", "bukti-dukung/../tte/x.pdf"],
    ["jenis lain", "tte/abc/a.pdf"],
    ["kosong", ""],
  ])("referensi tak sah (%s) -> 404 tanpa membaca disk", async (_n, fileUrl) => {
    ambilUserSesi.mockResolvedValue(sesi({ nip: NIP_PENGAJU }));
    findUnique.mockResolvedValue(baris({ fileUrl }));
    const res = await GET(permintaan(), konteks());
    expect(res.status).toBe(404);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("berkas hilang di disk -> 404", async () => {
    ambilUserSesi.mockResolvedValue(sesi({ nip: NIP_PENGAJU }));
    findUnique.mockResolvedValue(baris());
    readFile.mockRejectedValue(new Error("ENOENT"));
    const res = await GET(permintaan(), konteks());
    expect(res.status).toBe(404);
  });
});
