import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  ambilUserSesi: vi.fn(),
  checkUserStatus: vi.fn(),
  findFirst: vi.fn(),
  findUniquePegawai: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth/getSessionAccount", () => ({ ambilUserSesi: m.ambilUserSesi }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    pegawai: { findUnique: m.findUniquePegawai },
    dokumenTte: { findFirst: m.findFirst },
  },
}));
vi.mock("@/lib/tte/esignClient", () => ({ checkUserStatus: m.checkUserStatus, signPdf: vi.fn() }));
vi.mock("@/lib/tte/spesimenTte", () => ({ buatSpesimenQr: vi.fn(), ambilTemplateSpesimen: vi.fn() }));

import { ambilStatusSptjmAction, cekStatusTteAction } from "../actions";

const sesi = (o: Record<string, unknown> = {}) => ({
  id: "u1",
  nip: "199001010000000001", // sensitive-ok
  role: "KASUBAG_TU",
  satuanKerja: "Biro Umum",
  aktif: true,
  ...o,
});

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.checkUserStatus.mockResolvedValue({ success: true, statusCode: 1111, status: "ISSUE", message: "ok" });
  m.findFirst.mockResolvedValue(null);
  m.findUniquePegawai.mockResolvedValue(null);
});

describe("cekStatusTteAction - gerbang", () => {
  it("tanpa sesi ditolak", async () => {
    m.ambilUserSesi.mockResolvedValue(null);
    const r = await cekStatusTteAction("0000000000000001"); // sensitive-ok
    expect(r.success).toBe(false);
    expect(m.checkUserStatus).not.toHaveBeenCalled();
  });

  it.each(["PEGAWAI", "PPABP", "ADMIN"])("%s ditolak dan BSrE tidak dihubungi", async (role) => {
    m.ambilUserSesi.mockResolvedValue(sesi({ role }));
    const r = await cekStatusTteAction("0000000000000001"); // sensitive-ok
    expect(r.success).toBe(false);
    expect((r as { error?: string }).error).toMatch(/Kasubag TU/);
    expect(m.checkUserStatus).not.toHaveBeenCalled();
  });

  it("KASUBAG_TU tanpa satuan kerja ditolak", async () => {
    m.ambilUserSesi.mockResolvedValue(sesi({ satuanKerja: null }));
    const r = await cekStatusTteAction("0000000000000001"); // sensitive-ok
    expect(r.success).toBe(false);
    expect(m.checkUserStatus).not.toHaveBeenCalled();
  });

  it("KASUBAG_TU berunit diteruskan ke checkUserStatus", async () => {
    m.ambilUserSesi.mockResolvedValue(sesi());
    const r = await cekStatusTteAction("0000000000000001"); // sensitive-ok
    expect(r.success).toBe(true);
    expect(m.checkUserStatus).toHaveBeenCalledWith("0000000000000001"); // sensitive-ok
  });
});

describe("ambilStatusSptjmAction - gerbang", () => {
  it("PEGAWAI mendapat null tanpa query dokumen", async () => {
    m.ambilUserSesi.mockResolvedValue(sesi({ role: "PEGAWAI" }));
    expect(await ambilStatusSptjmAction("SPTJM_TUKIN", 8, 2026)).toBeNull();
    expect(m.findFirst).not.toHaveBeenCalled();
  });

  it("KASUBAG_TU unit lain mendapat null", async () => {
    m.ambilUserSesi.mockResolvedValue(sesi());
    expect(await ambilStatusSptjmAction("SPTJM_TUKIN", 8, 2026, "Biro Lain")).toBeNull();
    expect(m.findFirst).not.toHaveBeenCalled();
  });

  it("KASUBAG_TU unit sendiri lolos ke query", async () => {
    m.ambilUserSesi.mockResolvedValue(sesi());
    const r = await ambilStatusSptjmAction("SPTJM_TUKIN", 8, 2026);
    expect(m.findFirst).toHaveBeenCalled();
    expect(r).not.toBeNull();
  });
});
