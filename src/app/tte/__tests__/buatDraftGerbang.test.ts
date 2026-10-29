import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  ambilUserSesi: vi.fn(),
  generateDraftSptjm: vi.fn(),
  findUniquePegawai: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth/getSessionAccount", () => ({ ambilUserSesi: m.ambilUserSesi }));
vi.mock("@/lib/prisma", () => ({ prisma: { pegawai: { findUnique: m.findUniquePegawai } } }));
vi.mock("@/lib/tte/esignClient", () => ({ checkUserStatus: vi.fn(), signPdf: vi.fn() }));
vi.mock("@/lib/tte/spesimenTte", () => ({ buatSpesimenQr: vi.fn(), ambilTemplateSpesimen: vi.fn() }));
vi.mock("@/lib/tte/sptjmPdf", async () => {
  const tipe = await import("@/lib/tte/sptjmTypes");
  return {
    generateDraftSptjm: m.generateDraftSptjm,
    generateNomorSptjmDefault: tipe.generateNomorSptjmDefault,
    generateNamaFileSptjm: tipe.generateNamaFileSptjm,
    terapkanStempelTteSimulasi: vi.fn(),
  };
});
vi.mock("fs/promises", () => ({
  default: { writeFile: m.writeFile, mkdir: m.mkdir },
  writeFile: m.writeFile,
  mkdir: m.mkdir,
}));

import { buatDraftSptjmAction } from "../actions";

const UNIT = "Biro Umum";
const sesi = (o: Record<string, unknown> = {}) => ({
  id: "u1",
  nip: "199001010000000001", // sensitive-ok
  role: "KASUBAG_TU",
  satuanKerja: UNIT,
  aktif: true,
  ...o,
});
const params = { jenis: "SPTJM_TUKIN" as const, bulan: 8, tahun: 2026 };

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.findUniquePegawai.mockResolvedValue({ nama: "Nama Palsu", nip: "199001010000000001", jabatan: "Kasubag TU", sidikNik: null }); // sensitive-ok
  m.generateDraftSptjm.mockResolvedValue(Buffer.from("%PDF-"));
});

describe("buatDraftSptjmAction - gerbang", () => {
  it("PEGAWAI se-unit DITOLAK dan draft tidak dibuat", async () => {
    m.ambilUserSesi.mockResolvedValue(sesi({ role: "PEGAWAI" }));
    const r = await buatDraftSptjmAction({ ...params, satuanKerja: UNIT });
    expect(r.error).toMatch(/tidak berwenang/i);
    expect(m.generateDraftSptjm).not.toHaveBeenCalled();
    expect(m.writeFile).not.toHaveBeenCalled();
  });

  it("PIMPINAN dan Kasubag TU unit lain DITOLAK", async () => {
    m.ambilUserSesi.mockResolvedValue(sesi({ role: "PIMPINAN" }));
    expect((await buatDraftSptjmAction({ ...params, satuanKerja: UNIT })).error).toBeTruthy();
    m.ambilUserSesi.mockResolvedValue(sesi({ satuanKerja: "Sekretariat Jenderal" }));
    expect((await buatDraftSptjmAction({ ...params, satuanKerja: UNIT })).error).toBeTruthy();
    expect(m.generateDraftSptjm).not.toHaveBeenCalled();
  });

  it("periode cacat ditolak sebelum menulis", async () => {
    m.ambilUserSesi.mockResolvedValue(sesi());
    const r = await buatDraftSptjmAction({ ...params, bulan: 13 });
    expect(r.error).toMatch(/periode/i);
    expect(m.writeFile).not.toHaveBeenCalled();
  });

  it("Kasubag TU unit itu: pratinjau ditulis di folder unit+periode, URL lewat rute berizin", async () => {
    m.ambilUserSesi.mockResolvedValue(sesi());
    const r = await buatDraftSptjmAction(params);
    expect(r.success).toBe(true);
    expect(String(m.writeFile.mock.calls[0][0])).toMatch(
      /tte[\\/]Biro Umum[\\/]2026-08[\\/]Draft - SPTJM - TUNKIN Agustus 2026 Biro Umum\.pdf$/
    );
    expect(r.downloadUrl).toMatch(/^\/berkas\/tte-pratinjau\?/);
    expect(r.downloadUrl).not.toContain("/uploads/");
  });
});
