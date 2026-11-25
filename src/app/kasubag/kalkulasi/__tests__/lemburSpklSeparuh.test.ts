import { describe, it, expect, vi, beforeEach } from "vitest";

// Sinkronisasi ulang (dipicu koreksi jam lembur harian) di bulan yang gerbang
// SPKL-nya jatuh di TENGAH bulan: hari sebelum berlakuMulai tidak boleh diubah.
// Gerbang diganti satker palsu dengan berlakuMulai 2026-12-15.

const m = vi.hoisted(() => ({
  getSessionAccount: vi.fn(),
  ambilUserSesi: vi.fn(),
  pegawaiFind: vi.fn(),
  pengirimanFind: vi.fn(),
  koreksiFindUnique: vi.fn(),
  presensiFindUnique: vi.fn(),
  auditFindFirstPrisma: vi.fn(),
  transaksi: vi.fn(),
  koreksiUpsert: vi.fn(),
  presensiUpdate: vi.fn(),
  presensiFindMany: vi.fn(),
  auditCreate: vi.fn(),
  auditFindFirstTx: vi.fn(),
  perintahFindFirst: vi.fn(),
  perintahFindMany: vi.fn(),
  rekapUpdateMany: vi.fn(),
  uangLemburDeleteMany: vi.fn(),
  uangLemburFindUnique: vi.fn(),
  uangLemburUpsertTx: vi.fn(),
  muatLibur: vi.fn(),
}));

vi.mock("../../../../lib/lembur/gerbangSpkl", () => {
  const SPKL_AKTIF = [{ satuanKerja: "Satker Uji Pilot", berlakuMulai: "2026-12-15" }];
  return {
    SPKL_AKTIF,
    spklAktifUntuk: (satker: string | null | undefined, iso: string) =>
      !!satker?.trim() &&
      /^\d{4}-\d{2}-\d{2}$/.test(iso) &&
      SPKL_AKTIF.some((a) => a.satuanKerja === satker.trim() && iso >= a.berlakuMulai),
  };
});
vi.mock("../../../../lib/hariLibur", () => ({ muatHariLiburPeriode: m.muatLibur }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth/getSessionAccount", () => ({
  getSessionAccount: m.getSessionAccount,
  ambilUserSesi: m.ambilUserSesi,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    pegawai: { findUnique: m.pegawaiFind },
    pengirimanUnit: { findUnique: m.pengirimanFind },
    koreksiPresensiHarian: { findUnique: m.koreksiFindUnique },
    presensiHarian: { findUnique: m.presensiFindUnique },
    auditTrail: { findFirst: m.auditFindFirstPrisma },
    $transaction: m.transaksi,
  },
}));

import { koreksiJamLemburHarianAction } from "../actions";

const SATKER = "Satker Uji Pilot";
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

beforeEach(() => {
  vi.resetAllMocks();
  m.transaksi.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      koreksiPresensiHarian: { upsert: m.koreksiUpsert },
      presensiHarian: { update: m.presensiUpdate, findMany: m.presensiFindMany },
      auditTrail: { create: m.auditCreate, findFirst: m.auditFindFirstTx },
      perintahLemburAnggota: { findFirst: m.perintahFindFirst, findMany: m.perintahFindMany },
      rekapPresensiPeriode: { updateMany: m.rekapUpdateMany },
      uangLembur: { deleteMany: m.uangLemburDeleteMany, findUnique: m.uangLemburFindUnique, upsert: m.uangLemburUpsertTx },
    })
  );
  m.muatLibur.mockResolvedValue(new Map());
  m.pengirimanFind.mockResolvedValue(null);
  m.koreksiFindUnique.mockResolvedValue(null);
  m.perintahFindMany.mockResolvedValue([]);
  m.perintahFindFirst.mockResolvedValue(null);
  m.auditFindFirstTx.mockResolvedValue(null);
  m.auditFindFirstPrisma.mockResolvedValue(null);
  m.uangLemburFindUnique.mockResolvedValue(null);
  m.getSessionAccount.mockResolvedValue({ nip: "19850101", role: "KASUBAG_TU", satuanKerja: SATKER, rolesTersedia: ["KASUBAG_TU"] }); // sensitive-ok
  m.ambilUserSesi.mockResolvedValue({
    id: "u-1", nip: "19850101", nama: "Kasubag Uji", role: "KASUBAG_TU", satuanKerja: SATKER, rolesTambahan: [], aktif: true, // sensitive-ok
  });
  m.pegawaiFind.mockResolvedValue({ id: "p-1", nip: "19850102", nama: "Pegawai Uji", satuanKerja: SATKER, golongan: "III/a" }); // sensitive-ok
});

describe("sinkronkanUangLemburPegawai di bulan separuh gerbang", () => {
  it("hari sebelum berlakuMulai tidak diubah; hari sesudahnya dibatasi perintah", async () => {
    m.presensiFindUnique.mockResolvedValue({
      id: "h-koreksi", jamMasuk: null, jamKeluar: null, jamLembur: 0, jamLemburNyata: 0, statusKehadiran: "WFO",
    });
    m.presensiFindMany.mockResolvedValue([
      { id: "h-sebelum", tanggal: utc("2026-12-10"), jamLembur: 4, jamLemburNyata: null, statusKehadiran: "WFO" },
      { id: "h-sesudah", tanggal: utc("2026-12-17"), jamLembur: 4, jamLemburNyata: null, statusKehadiran: "WFO" },
    ]);
    const fd = new FormData();
    fd.append("pegawaiId", "p-1");
    fd.append("tanggalIso", "2026-12-16");
    fd.append("jamLembur", "2");
    fd.append("alasan", "SPL No. 123/TU/XII/2026");
    fd.append("pernyataan", "1");
    const res = await koreksiJamLemburHarianAction({}, fd);

    expect(res.error).toBeUndefined();
    const idDiubah = m.presensiUpdate.mock.calls.map((c) => c[0].where.id);
    expect(idDiubah).not.toContain("h-sebelum");
    expect(m.presensiUpdate).toHaveBeenCalledWith({
      where: { id: "h-sesudah" },
      data: { jamLembur: 0, jamLemburNyata: 4 },
    });
    // hanya hari sesudah gerbang yang dihitung sebagai "hari lain dibetulkan"
    expect(res.success).toContain("1 hari lain");
    // hari sebelum gerbang tetap dihitung apa adanya (4 jam) ke rekap
    expect(m.rekapUpdateMany.mock.calls[0][0].data.totalJamLembur).toBe(4);
  });
});
