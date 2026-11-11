import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { findUnique, readFile, ambilUserSesi } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  readFile: vi.fn(),
  ambilUserSesi: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { koreksiPresensiHarian: { findUnique } },
}));
vi.mock("@/auth/getSessionAccount", () => ({ ambilUserSesi }));
vi.mock("fs/promises", () => ({
  default: { readFile, realpath: async (p: string) => p },
  readFile,
  realpath: async (p: string) => p,
}));

import { GET } from "../route";

const NIP_PEGAWAI = "199001010000000001"; // sensitive-ok
const NIP_LAIN = "199001010000000002"; // sensitive-ok
const UNIT = "Biro Umum";
const REF_KELUAR = "bukti-koreksi/Biro Umum/2026-08/2026-08-05_keluar_1700000000000_ef56ab78.png";
const REF_LEMBUR = "bukti-koreksi/Biro Umum/2026-08/2026-08-05_lembur_1700000000000_99aa00bb.pdf";
const REF = "bukti-koreksi/Biro Umum/2026-08/2026-08-05_1700000000000_ab12cd34.jpg";

const permintaan = (query = "") =>
  new NextRequest(`http://localhost/berkas/koreksi-presensi/abc${query}`, { method: "GET" });
const konteks = (id = "abc") => ({ params: Promise.resolve({ id }) });

const sesi = (o: Record<string, unknown> = {}) => ({
  nip: NIP_LAIN,
  role: "PEGAWAI",
  satuanKerja: UNIT,
  aktif: true,
  ...o,
});

const baris = (o: Record<string, unknown> = {}) => ({
  buktiRef: REF,
  buktiRefKeluar: REF_KELUAR,
  buktiRefLembur: REF_LEMBUR,
  tanggal: new Date(Date.UTC(2026, 7, 5)),
  pegawai: { nip: NIP_PEGAWAI, satuanKerja: UNIT },
  ...o,
});

beforeEach(() => {
  findUnique.mockReset();
  readFile.mockReset();
  ambilUserSesi.mockReset();
});

describe("GET /berkas/koreksi-presensi/[id]", () => {
  it("tanpa sesi -> 401, database tidak disentuh", async () => {
    ambilUserSesi.mockResolvedValue(null);
    const res = await GET(permintaan(), konteks());
    expect(res.status).toBe(401);
    expect(findUnique).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("baris tidak ada -> 404", async () => {
    ambilUserSesi.mockResolvedValue(sesi({ nip: NIP_PEGAWAI }));
    findUnique.mockResolvedValue(null);
    expect((await GET(permintaan(), konteks("x"))).status).toBe(404);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("koreksi tanpa buktiRef (koreksi lama) -> 404", async () => {
    ambilUserSesi.mockResolvedValue(sesi({ nip: NIP_PEGAWAI }));
    findUnique.mockResolvedValue(baris({ buktiRef: null }));
    expect((await GET(permintaan(), konteks())).status).toBe(404);
    expect(readFile).not.toHaveBeenCalled();
  });

  it.each([
    ["jenis lain (bukti-dukung)", "bukti-dukung/Biro Umum/1_ab_SK.pdf"],
    ["jenis lain (tte)", "tte/abc/a.pdf"],
    ["traversal", "bukti-koreksi/../tte/x.pdf"],
    ["URL palsu", "https://placeholder.local/x.jpg"],
  ])("ref tak sah (%s) -> 404 tanpa membaca disk", async (_n, buktiRef) => {
    ambilUserSesi.mockResolvedValue(sesi({ nip: NIP_PEGAWAI }));
    findUnique.mockResolvedValue(baris({ buktiRef }));
    expect((await GET(permintaan(), konteks())).status).toBe(404);
    expect(readFile).not.toHaveBeenCalled();
  });

  it.each([
    ["pegawai lain", {}],
    ["Kasubag TU unit lain", { role: "KASUBAG_TU", satuanKerja: "Sekretariat Jenderal" }],
    ["OSDMA", { role: "OSDMA", satuanKerja: null }],
    ["PIMPINAN", { role: "PIMPINAN", satuanKerja: null }],
  ])("%s -> 403 dan berkas tidak dibaca", async (_n, o) => {
    ambilUserSesi.mockResolvedValue(sesi(o));
    findUnique.mockResolvedValue(baris());
    const res = await GET(permintaan(), konteks());
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(readFile).not.toHaveBeenCalled();
  });

  it.each([
    ["pegawai ybs", { nip: NIP_PEGAWAI }],
    ["Kasubag TU unit itu", { role: "KASUBAG_TU", satuanKerja: UNIT }],
    ["PPABP", { role: "PPABP", satuanKerja: null }],
    ["ADMIN", { role: "ADMIN", satuanKerja: null }],
  ])("%s -> 200 inline dengan header aman, nama unduhan tanpa NIP", async (_n, o) => {
    ambilUserSesi.mockResolvedValue(sesi(o));
    findUnique.mockResolvedValue(baris());
    readFile.mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));

    const res = await GET(permintaan(), konteks());

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const disposisi = res.headers.get("content-disposition") ?? "";
    expect(disposisi.startsWith("inline;")).toBe(true);
    expect(disposisi).toContain("bukti-koreksi-presensi-masuk-2026-08-05.jpg");
    expect(disposisi).not.toContain(NIP_PEGAWAI);
    expect(String(readFile.mock.calls[0][0])).toMatch(/storage[\\/]uploads[\\/]bukti-koreksi[\\/]Biro Umum[\\/]2026-08[\\/]/);
  });

  it.each([
    ["masuk", "?sisi=masuk", "image/jpeg", "bukti-koreksi-presensi-masuk-2026-08-05.jpg", "_ab12cd34.jpg"],
    ["keluar", "?sisi=keluar", "image/png", "bukti-koreksi-presensi-keluar-2026-08-05.png", "_ef56ab78.png"],
    ["lembur", "?sisi=lembur", "application/pdf", "bukti-koreksi-presensi-lembur-2026-08-05.pdf", "_99aa00bb.pdf"],
  ])("sisi %s -> berkas yang benar", async (_n, q, tipe, nama, akhiran) => {
    ambilUserSesi.mockResolvedValue(sesi({ nip: NIP_PEGAWAI }));
    findUnique.mockResolvedValue(baris());
    readFile.mockResolvedValue(Buffer.from([0x25, 0x50, 0x44, 0x46]));
    const res = await GET(permintaan(q), konteks());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(tipe);
    expect(res.headers.get("content-disposition") ?? "").toContain(nama);
    expect(String(readFile.mock.calls[0][0]).endsWith(akhiran)).toBe(true);
  });

  it("sisi tak dikenal -> 404 tanpa menyentuh database", async () => {
    ambilUserSesi.mockResolvedValue(sesi({ nip: NIP_PEGAWAI }));
    const res = await GET(permintaan("?sisi=samping"), konteks());
    expect(res.status).toBe(404);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it.each(["keluar", "lembur"])("sisi %s kosong -> 404", async (sisi) => {
    ambilUserSesi.mockResolvedValue(sesi({ nip: NIP_PEGAWAI }));
    findUnique.mockResolvedValue(baris({ buktiRefKeluar: null, buktiRefLembur: null }));
    expect((await GET(permintaan(`?sisi=${sisi}`), konteks())).status).toBe(404);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("?unduh=1 -> attachment", async () => {
    ambilUserSesi.mockResolvedValue(sesi({ nip: NIP_PEGAWAI }));
    findUnique.mockResolvedValue(baris());
    readFile.mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff]));
    const res = await GET(permintaan("?unduh=1"), konteks());
    expect((res.headers.get("content-disposition") ?? "").startsWith("attachment;")).toBe(true);
  });

  it("berkas hilang di disk -> 404", async () => {
    ambilUserSesi.mockResolvedValue(sesi({ nip: NIP_PEGAWAI }));
    findUnique.mockResolvedValue(baris());
    readFile.mockRejectedValue(new Error("ENOENT"));
    expect((await GET(permintaan(), konteks())).status).toBe(404);
  });
});
