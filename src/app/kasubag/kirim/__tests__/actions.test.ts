import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, ambilUserSesiMock, revalidatePathMock } = vi.hoisted(() => {
  const prismaMock: any = {
    pegawai: { count: vi.fn() },
    tukinCalculation: { count: vi.fn() },
    pengirimanUnit: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    verifikasiTabelUnit: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    auditTrail: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prismaMock, ambilUserSesiMock: vi.fn(), revalidatePathMock: vi.fn() };
});

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("../../../../lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("../../../../auth/getSessionAccount", () => ({ ambilUserSesi: ambilUserSesiMock }));

import {
  kembalikanRekapUnitAction,
  kirimRekapUnitAction,
  setVerifikasiTabelAction,
} from "../actions";
import { TABEL_WAJIB_DIVERIFIKASI } from "../../../../business-logic/pengirimanUnit";

const user = (o: Record<string, unknown> = {}) => ({
  id: "u1",
  nip: "000000000000000001", // sensitive-ok
  role: "KASUBAG_TU",
  satuanKerja: "Biro Contoh",
  aktif: true,
  ...o,
});

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
};

const PERIODE = { bulan: "9", tahun: "2026" };

function siapKirimLengkap() {
  prismaMock.pegawai.count.mockResolvedValue(2);
  prismaMock.tukinCalculation.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
  prismaMock.pengirimanUnit.findUnique.mockResolvedValue(null);
  prismaMock.verifikasiTabelUnit.findMany.mockResolvedValue(
    TABEL_WAJIB_DIVERIFIKASI.map((jenisTabel) => ({ jenisTabel })),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  ambilUserSesiMock.mockResolvedValue(user());
  prismaMock.pengirimanUnit.upsert.mockResolvedValue({});
  prismaMock.auditTrail.create.mockResolvedValue({});
  prismaMock.$transaction.mockResolvedValue([]);
});

describe("kirimRekapUnitAction", () => {
  it("menolak tanpa sesi", async () => {
    ambilUserSesiMock.mockResolvedValue(null);
    const r = await kirimRekapUnitAction({}, form({ ...PERIODE, pernyataan: "ya" }));
    expect(r.error).toMatch(/sesi/i);
    expect(prismaMock.pengirimanUnit.upsert).not.toHaveBeenCalled();
  });

  it("menolak role yang bukan Kasubag TU", async () => {
    ambilUserSesiMock.mockResolvedValue(user({ role: "PPABP" }));
    const r = await kirimRekapUnitAction({}, form({ ...PERIODE, pernyataan: "ya" }));
    expect(r.error).toMatch(/tidak berwenang/i);
    expect(prismaMock.pengirimanUnit.upsert).not.toHaveBeenCalled();
  });

  it("menolak tanpa pernyataan=ya walau semua syarat data terpenuhi", async () => {
    siapKirimLengkap();
    const r = await kirimRekapUnitAction({}, form({ ...PERIODE }));
    expect(r.error).toMatch(/pernyataan/i);
    expect(prismaMock.pengirimanUnit.upsert).not.toHaveBeenCalled();
  });

  it("menolak kirim saat periode sudah terkunci", async () => {
    prismaMock.pegawai.count.mockResolvedValue(2);
    prismaMock.tukinCalculation.count.mockResolvedValue(2);
    prismaMock.pengirimanUnit.findUnique.mockResolvedValue({ status: "TERKIRIM" });
    prismaMock.verifikasiTabelUnit.findMany.mockResolvedValue([]);
    const r = await kirimRekapUnitAction({}, form({ ...PERIODE, pernyataan: "ya" }));
    expect(r.error).toMatch(/dikunci|terkirim|dikirim/i);
    expect(prismaMock.pengirimanUnit.upsert).not.toHaveBeenCalled();
  });

  it("mengirim bila semua syarat terpenuhi, satuan kerja dari sesi", async () => {
    siapKirimLengkap();
    const r = await kirimRekapUnitAction(
      {},
      form({ ...PERIODE, pernyataan: "ya", satuanKerja: "Biro Lain" }),
    );
    expect(r.success).toBeTruthy();
    const arg = prismaMock.pengirimanUnit.upsert.mock.calls[0][0];
    expect(arg.create.satuanKerja).toBe("Biro Contoh");
  });
});

describe("kembalikanRekapUnitAction", () => {
  it("menolak role Kasubag TU", async () => {
    const r = await kembalikanRekapUnitAction(
      {},
      form({ ...PERIODE, satuanKerja: "Biro Contoh", alasan: "Angka lembur keliru semua" }),
    );
    expect(r.error).toMatch(/PPABP/);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("menolak alasan kurang dari 10 karakter", async () => {
    ambilUserSesiMock.mockResolvedValue(user({ role: "PPABP" }));
    const r = await kembalikanRekapUnitAction(
      {},
      form({ ...PERIODE, satuanKerja: "Biro Contoh", alasan: "salah" }),
    );
    expect(r.error).toMatch(/minimal 10/i);
    expect(prismaMock.pengirimanUnit.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("setVerifikasiTabelAction", () => {
  it("menolak mengubah centang saat periode sudah terkunci", async () => {
    prismaMock.pengirimanUnit.findUnique.mockResolvedValue({ status: "TERKIRIM" });
    const r = await setVerifikasiTabelAction(
      {},
      form({ ...PERIODE, jenisTabel: TABEL_WAJIB_DIVERIFIKASI[0], centang: "ya" }),
    );
    expect(r.error).toMatch(/terkunci/i);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("menolak jenis tabel yang tidak dikenal", async () => {
    const r = await setVerifikasiTabelAction({}, form({ ...PERIODE, jenisTabel: "ASING", centang: "ya" }));
    expect(r.error).toMatch(/tidak dikenali/i);
  });
});
