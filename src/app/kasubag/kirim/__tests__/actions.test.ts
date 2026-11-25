import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, ambilUserSesiMock, revalidatePathMock, flagLembur } = vi.hoisted(() => {
  const prismaMock: any = {
    pegawai: { count: vi.fn() },
    tukinCalculation: { count: vi.fn(), aggregate: vi.fn() },
    uangMakan: { aggregate: vi.fn() },
    uangLembur: { aggregate: vi.fn() },
    pengirimanUnit: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    verifikasiTabelUnit: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    auditTrail: { create: vi.fn() },
    dokumenTte: { findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    prismaMock,
    ambilUserSesiMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    flagLembur: { nilai: false },
  };
});

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("../../../../lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("../../../../auth/getSessionAccount", () => ({ ambilUserSesi: ambilUserSesiMock }));
// Getter, supaya test bisa menyalakan nominal lembur tanpa mengubah kode sumber.
vi.mock("../../../../lib/format/tampilUangLembur", () => ({
  get TAMPILKAN_NOMINAL_LEMBUR() {
    return flagLembur.nilai;
  },
}));

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

const T_TTE = new Date("2026-09-10T03:00:00Z");

/** Baris DokumenTte palsu yang sudah ber-TTE. */
const dokSah = (jenisDokumen: string, o: Record<string, unknown> = {}) => ({
  jenisDokumen,
  status: "TERTANDATANGANI",
  signedAt: T_TTE,
  createdAt: T_TTE,
  ...o,
});

const TTE_WAJIB_SAH = () => [dokSah("SPTJM_TUKIN"), dokSah("SPTJM_UANG_MAKAN")];

function siapKirimLengkap(dokumen: Record<string, unknown>[] = TTE_WAJIB_SAH()) {
  prismaMock.pegawai.count.mockResolvedValue(2);
  prismaMock.tukinCalculation.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
  prismaMock.pengirimanUnit.findUnique.mockResolvedValue(null);
  prismaMock.verifikasiTabelUnit.findMany.mockResolvedValue(
    TABEL_WAJIB_DIVERIFIKASI.map((jenisTabel) => ({ jenisTabel })),
  );
  prismaMock.dokumenTte.findMany.mockResolvedValue(dokumen);
}

beforeEach(() => {
  vi.resetAllMocks();
  flagLembur.nilai = false;
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
    prismaMock.dokumenTte.findMany.mockResolvedValue([]);
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

describe("kirimRekapUnitAction - gerbang TTE SPTJM", () => {
  const kirim = () => kirimRekapUnitAction({}, form({ ...PERIODE, pernyataan: "ya" }));

  it("menolak kirim tanpa satu pun SPTJM ber-TTE, dengan alasan yang terbaca", async () => {
    siapKirimLengkap([]);
    const r = await kirim();
    expect(r.error).toMatch(/SPTJM Tukin dan Uang Makan belum ditandatangani/);
    expect(prismaMock.pengirimanUnit.upsert).not.toHaveBeenCalled();
    expect(prismaMock.auditTrail.create).not.toHaveBeenCalled();
  });

  it("menolak bila hanya SPTJM Tukin yang ditandatangani", async () => {
    siapKirimLengkap([dokSah("SPTJM_TUKIN")]);
    const r = await kirim();
    expect(r.error).toMatch(/SPTJM Uang Makan belum ditandatangani/);
    expect(r.error).not.toMatch(/SPTJM Tukin/);
    expect(prismaMock.pengirimanUnit.upsert).not.toHaveBeenCalled();
  });

  it("dokumen yang masih DRAFT tidak dihitung sebagai tanda tangan", async () => {
    siapKirimLengkap([
      dokSah("SPTJM_TUKIN"),
      dokSah("SPTJM_UANG_MAKAN", { status: "DRAFT", signedAt: null }),
    ]);
    const r = await kirim();
    expect(r.error).toMatch(/SPTJM Uang Makan belum ditandatangani/);
    expect(prismaMock.pengirimanUnit.upsert).not.toHaveBeenCalled();
  });

  it("lolos bila SPTJM Tukin & Uang Makan ber-TTE; SPTJM Lembur tidak wajib selama nominal lembur ditahan", async () => {
    siapKirimLengkap();
    const r = await kirim();
    expect(r.success).toBeTruthy();
    expect(prismaMock.pengirimanUnit.upsert).toHaveBeenCalledTimes(1);
  });

  it("Tukin dihitung ulang SESUDAH SPTJM ditandatangani -> ditolak, perlu TTE ulang", async () => {
    siapKirimLengkap();
    prismaMock.tukinCalculation.aggregate.mockResolvedValue({
      _max: { calculatedAt: new Date(T_TTE.getTime() + 60_000) },
    });
    const r = await kirim();
    expect(r.error).toMatch(/SPTJM Tukin perlu ditandatangani ulang/);
    expect(prismaMock.pengirimanUnit.upsert).not.toHaveBeenCalled();
  });

  it("dihitung SEBELUM ditandatangani -> tetap lolos", async () => {
    siapKirimLengkap();
    prismaMock.tukinCalculation.aggregate.mockResolvedValue({
      _max: { calculatedAt: new Date(T_TTE.getTime() - 60_000) },
    });
    const r = await kirim();
    expect(r.success).toBeTruthy();
  });

  it("SPTJM Lembur WAJIB begitu nominal lembur berlaku", async () => {
    flagLembur.nilai = true;
    siapKirimLengkap();
    const r = await kirim();
    expect(r.error).toMatch(/SPTJM Uang Lembur belum ditandatangani/);
    expect(prismaMock.pengirimanUnit.upsert).not.toHaveBeenCalled();

    vi.clearAllMocks();
    flagLembur.nilai = true;
    ambilUserSesiMock.mockResolvedValue(user());
    prismaMock.pengirimanUnit.upsert.mockResolvedValue({});
    prismaMock.auditTrail.create.mockResolvedValue({});
    siapKirimLengkap([...TTE_WAJIB_SAH(), dokSah("SPTJM_LEMBUR")]);
    expect((await kirim()).success).toBeTruthy();
  });

  it("tanda tangan yang mendahului pengembalian PPABP tidak berlaku (harus TTE ulang)", async () => {
    siapKirimLengkap();
    prismaMock.pengirimanUnit.findUnique.mockResolvedValue({
      status: "DIKEMBALIKAN",
      alasanKembali: "Periksa ulang",
      dikirimPada: T_TTE,
      dikembalikanPada: new Date("2026-09-20T03:00:00Z"),
    });
    const r = await kirim();
    expect(r.error).toMatch(/perlu ditandatangani ulang/);
    expect(prismaMock.pengirimanUnit.upsert).not.toHaveBeenCalled();
  });

  it("dokumen terbaru per jenis yang menentukan, bukan yang pernah ditandatangani", async () => {
    siapKirimLengkap([
      // draft baru dibuat SESUDAH tanda tangan lama -> yang terbaca draft
      dokSah("SPTJM_TUKIN", { status: "DRAFT", signedAt: null, createdAt: new Date("2026-09-12T00:00:00Z") }),
      dokSah("SPTJM_TUKIN"),
      dokSah("SPTJM_UANG_MAKAN"),
    ]);
    const r = await kirim();
    expect(r.error).toMatch(/SPTJM Tukin belum ditandatangani/);
  });

  it("gagal membaca dokumen TTE = kirim gagal, bukan lolos diam-diam", async () => {
    siapKirimLengkap();
    prismaMock.dokumenTte.findMany.mockRejectedValue(new Error("db mati"));
    await expect(kirim()).rejects.toThrow("db mati");
    expect(prismaMock.pengirimanUnit.upsert).not.toHaveBeenCalled();
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
      form({ ...PERIODE, jenisTabel: "TUKIN", centang: "ya" }),
    );
    expect(r.error).toMatch(/terkunci/i);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("menolak jenis tabel yang tidak dikenal", async () => {
    const r = await setVerifikasiTabelAction({}, form({ ...PERIODE, jenisTabel: "ASING", centang: "ya" }));
    expect(r.error).toMatch(/tidak dikenali/i);
  });
});
