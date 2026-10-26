import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock, ambilUserSesiMock, revalidatePathMock } = vi.hoisted(() => {
  const prismaMock: any = {
    reconciliationStatus: { findUnique: vi.fn(), updateMany: vi.fn() },
    pegawai: { findUnique: vi.fn() },
    auditTrail: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  prismaMock.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prismaMock));
  return { prismaMock, ambilUserSesiMock: vi.fn(), revalidatePathMock: vi.fn() };
});

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("../../../../lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("../../../../auth/getSessionAccount", () => ({ ambilUserSesi: ambilUserSesiMock }));

import { putuskanPembayaranAction } from "../actions";

const userPpabp = (o: Record<string, unknown> = {}) => ({
  id: "u1",
  nip: "000000000000000001", // sensitive-ok
  role: "PPABP",
  satuanKerja: "Biro Contoh",
  aktif: true,
  ...o,
});

const form = (id: string, keputusan: string) => {
  const f = new FormData();
  f.append("id", id);
  f.append("keputusan", keputusan);
  return f;
};

const reconSanggah = {
  id: "r1",
  pegawaiId: "p1",
  periodeBulan: 6,
  periodeTahun: 2026,
  status: "SANGGAH",
  keputusanAkhir: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prismaMock));
  ambilUserSesiMock.mockResolvedValue(userPpabp());
  prismaMock.reconciliationStatus.findUnique.mockResolvedValue(reconSanggah);
  prismaMock.pegawai.findUnique.mockResolvedValue({ satuanKerja: "Biro Contoh" });
  prismaMock.reconciliationStatus.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.auditTrail.create.mockResolvedValue({});
});

describe("putuskanPembayaranAction", () => {
  it("menolak tanpa sesi", async () => {
    ambilUserSesiMock.mockResolvedValue(null);
    const r = await putuskanPembayaranAction({}, form("r1", "HOLD_PEMBAYARAN"));
    expect(r.error).toMatch(/sesi/i);
    expect(prismaMock.reconciliationStatus.updateMany).not.toHaveBeenCalled();
  });

  it("menolak role bukan PPABP", async () => {
    ambilUserSesiMock.mockResolvedValue(userPpabp({ role: "KASUBAG_TU" }));
    const r = await putuskanPembayaranAction({}, form("r1", "HOLD_PEMBAYARAN"));
    expect(r.error).toMatch(/tidak berwenang/i);
    expect(prismaMock.reconciliationStatus.updateMany).not.toHaveBeenCalled();
  });

  it("menolak akun nonaktif", async () => {
    ambilUserSesiMock.mockResolvedValue(userPpabp({ aktif: false }));
    const r = await putuskanPembayaranAction({}, form("r1", "HOLD_PEMBAYARAN"));
    expect(r.error).toBeTruthy();
    expect(prismaMock.reconciliationStatus.updateMany).not.toHaveBeenCalled();
  });

  it("menolak keputusan di luar whitelist", async () => {
    const r = await putuskanPembayaranAction({}, form("r1", "BATALKAN"));
    expect(r.error).toMatch(/tidak valid/i);
    expect(prismaMock.reconciliationStatus.updateMany).not.toHaveBeenCalled();
  });

  it("menolak bila baris tidak ditemukan", async () => {
    prismaMock.reconciliationStatus.findUnique.mockResolvedValue(null);
    const r = await putuskanPembayaranAction({}, form("zz", "HOLD_PEMBAYARAN"));
    expect(r.error).toMatch(/tidak ditemukan/i);
    expect(prismaMock.reconciliationStatus.updateMany).not.toHaveBeenCalled();
  });

  it("count 0 (sudah diputuskan / race) -> error dan tanpa audit maupun revalidate", async () => {
    prismaMock.reconciliationStatus.updateMany.mockResolvedValue({ count: 0 });
    const r = await putuskanPembayaranAction({}, form("r1", "HOLD_PEMBAYARAN"));
    expect(r.error).toMatch(/sudah diputuskan/i);
    expect(prismaMock.auditTrail.create).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("sukses: updateMany bersyarat status, audit tanpa NIP, revalidate", async () => {
    const r = await putuskanPembayaranAction({}, form("r1", "HOLD_PEMBAYARAN"));
    expect(r.error).toBeUndefined();
    expect(r.success).toMatch(/ADK/);

    const arg = prismaMock.reconciliationStatus.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "r1", status: { in: ["SANGGAH", "SELISIH"] } });
    expect(arg.data).toEqual({ status: "DIPUTUSKAN", keputusanAkhir: "HOLD_PEMBAYARAN" });

    const audit = prismaMock.auditTrail.create.mock.calls[0][0].data;
    expect(audit.entitas).toBe("reconciliation_status");
    expect(audit.satuanKerja).toBe("Biro Contoh");
    expect(audit.dataSesudah).toEqual({ status: "DIPUTUSKAN", keputusanAkhir: "HOLD_PEMBAYARAN" });
    expect(JSON.stringify([audit.dataSebelum, audit.dataSesudah])).not.toContain("000000000000000001");

    const paths = revalidatePathMock.mock.calls.map((c) => c[0]);
    expect(paths).toEqual(expect.arrayContaining(["/ppabp/banding", "/ppabp", "/ppabp/rekonsiliasi"]));
  });

  it("koreksi siklus berikutnya tidak menyebut ADK menahan", async () => {
    const r = await putuskanPembayaranAction({}, form("r1", "KOREKSI_SIKLUS_BERIKUTNYA"));
    expect(r.success).toMatch(/siklus berikutnya/i);
  });
});
