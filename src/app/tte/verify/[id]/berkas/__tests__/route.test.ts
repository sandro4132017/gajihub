import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { findUnique, readFile } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { dokumenTte: { findUnique } },
}));

vi.mock("fs/promises", () => ({
  default: { readFile, realpath: async (p: string) => p },
  readFile,
  realpath: async (p: string) => p,
}));

import { GET } from "../route";

const permintaan = () =>
  new NextRequest("http://localhost/tte/verify/abc/berkas", { method: "GET" });
const konteks = (id = "abc") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  findUnique.mockReset();
  readFile.mockReset();
});

describe("GET /tte/verify/[id]/berkas", () => {
  it("menyajikan PDF untuk dokumen yang sudah ditandatangani", async () => {
    findUnique.mockResolvedValue({
      status: "TERTANDATANGANI",
      fileSignedPath: "/uploads/tte/abc/SPTJM%20Tukin.pdf",
    });
    readFile.mockResolvedValue(Buffer.from("%PDF-1.7 isi berkas"));

    const res = await GET(permintaan(), konteks());

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe(
      "%PDF-1.7 isi berkas"
    );
  });

  it("nama berkas yang ter-encode dipulihkan di Content-Disposition", async () => {
    findUnique.mockResolvedValue({
      status: "TERTANDATANGANI",
      fileSignedPath: "/uploads/tte/abc/SPTJM%20Tukin.pdf",
    });
    readFile.mockResolvedValue(Buffer.from("%PDF"));

    const res = await GET(permintaan(), konteks());
    const disposisi = res.headers.get("content-disposition") ?? "";

    expect(disposisi).toContain("inline");
    expect(decodeURIComponent(disposisi)).toContain("SPTJM Tukin.pdf");
  });

  it("dokumen penggajian tidak boleh mengendap di cache bersama", async () => {
    findUnique.mockResolvedValue({
      status: "TERTANDATANGANI",
      fileSignedPath: "/uploads/tte/abc/a.pdf",
    });
    readFile.mockResolvedValue(Buffer.from("%PDF"));

    const res = await GET(permintaan(), konteks());
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("dokumen tidak dikenal -> 404", async () => {
    findUnique.mockResolvedValue(null);
    const res = await GET(permintaan(), konteks("tidak-ada"));
    expect(res.status).toBe(404);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("DRAFT TIDAK disajikan - halaman verifikasi publik hanya untuk yang sudah ditandatangani", async () => {
    findUnique.mockResolvedValue({
      status: "DRAFT",
      fileSignedPath: null,
    });
    const res = await GET(permintaan(), konteks());
    expect(res.status).toBe(404);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("status tertandatangani tapi tanpa jalur berkas -> 404, bukan melempar", async () => {
    findUnique.mockResolvedValue({
      status: "TERTANDATANGANI",
      fileSignedPath: null,
    });
    const res = await GET(permintaan(), konteks());
    expect(res.status).toBe(404);
  });

  it("berkas hilang dari disk dijawab 404 yang menyebut sebabnya", async () => {
    findUnique.mockResolvedValue({
      status: "TERTANDATANGANI",
      fileSignedPath: "/uploads/tte/abc/a.pdf",
    });
    readFile.mockRejectedValue(new Error("ENOENT"));

    const res = await GET(permintaan(), konteks());
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toMatch(
      /lingkungan lain/i
    );
  });

  it("referensi berkas tak sah -> 404, disk tidak dibaca", async () => {
    findUnique.mockResolvedValue({
      status: "TERTANDATANGANI",
      fileSignedPath: "/uploads/tte/../bukti-dukung/a.pdf",
    });
    const res = await GET(permintaan(), konteks());
    expect(res.status).toBe(404);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("kunci baru berfolder unit+periode tetap terbuka untuk yang tertandatangani", async () => {
    findUnique.mockResolvedValue({
      status: "TERTANDATANGANI",
      fileSignedPath: "tte/Biro Umum/2026-08/abc/SPTJM - UM.pdf",
    });
    readFile.mockResolvedValue(Buffer.from("%PDF"));
    const res = await GET(permintaan(), konteks());
    expect(res.status).toBe(200);
  });

  it("database bermasalah tidak membuat rute melempar", async () => {
    findUnique.mockRejectedValue(new Error("koneksi putus"));
    const res = await GET(permintaan(), konteks());
    expect(res.status).toBe(404);
  });
});
