import { describe, it, expect, vi, beforeEach } from "vitest";

// Jalur penulis jam lembur di Kalkulasi Unit untuk satker ber-SPKL: koreksi
// harian, cabut koreksi, sinkronisasi ulang rekap, dan total manual.

const m = vi.hoisted(() => ({
  getSessionAccount: vi.fn(),
  ambilUserSesi: vi.fn(),
  pegawaiFind: vi.fn(),
  pengirimanFind: vi.fn(),
  koreksiFindUnique: vi.fn(),
  presensiFindUnique: vi.fn(),
  auditFindFirstPrisma: vi.fn(),
  transaksi: vi.fn(),
  uangLemburUpsert: vi.fn(),
  // tx
  koreksiUpsert: vi.fn(),
  koreksiDelete: vi.fn(),
  koreksiUpdate: vi.fn(),
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
    auditTrail: { findFirst: m.auditFindFirstPrisma, create: m.auditCreate },
    uangLembur: { upsert: m.uangLemburUpsert, findUnique: m.uangLemburFindUnique },
    $transaction: m.transaksi,
  },
}));

import {
  koreksiJamLemburHarianAction,
  hapusKoreksiJamLemburHarianAction,
  koreksiUangLemburAction,
} from "../actions";
import { SPKL_AKTIF } from "../../../../lib/lembur/gerbangSpkl";

const PILOT = SPKL_AKTIF[0].satuanKerja;
const NON_PILOT = "Biro Contoh Lain";
const ALASAN = "SPL No. 123/TU/XII/2026"; // >= 15 karakter
const TGL = "2026-12-03"; // Kamis

function masuk(satuanKerja: string) {
  m.getSessionAccount.mockResolvedValue({ nip: "19850101", role: "KASUBAG_TU", satuanKerja, rolesTersedia: ["KASUBAG_TU"] });
  m.ambilUserSesi.mockResolvedValue({
    id: "u-1", nip: "19850101", nama: "Kasubag Uji", role: "KASUBAG_TU", satuanKerja, rolesTambahan: [], aktif: true,
  });
}

function pasangTx() {
  m.transaksi.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      koreksiPresensiHarian: { upsert: m.koreksiUpsert, delete: m.koreksiDelete, update: m.koreksiUpdate },
      presensiHarian: { update: m.presensiUpdate, findMany: m.presensiFindMany },
      auditTrail: { create: m.auditCreate, findFirst: m.auditFindFirstTx },
      perintahLemburAnggota: { findFirst: m.perintahFindFirst, findMany: m.perintahFindMany },
      rekapPresensiPeriode: { updateMany: m.rekapUpdateMany },
      uangLembur: {
        deleteMany: m.uangLemburDeleteMany,
        findUnique: m.uangLemburFindUnique,
        upsert: m.uangLemburUpsertTx,
      },
    })
  );
}

function pegawai(satuanKerja: string) {
  return { id: "p-1", nip: "19850102", nama: "Pegawai Uji", satuanKerja, golongan: "III/a" };
}

function formKoreksi(jamLembur: string) {
  const fd = new FormData();
  fd.append("pegawaiId", "p-1");
  fd.append("tanggalIso", TGL);
  fd.append("jamLembur", jamLembur);
  fd.append("alasan", ALASAN);
  fd.append("pernyataan", "1");
  return fd;
}

function formHapus() {
  const fd = new FormData();
  fd.append("koreksiId", "k-1");
  fd.append("pegawaiId", "p-1");
  fd.append("tanggalIso", TGL);
  return fd;
}

beforeEach(() => {
  vi.resetAllMocks();
  pasangTx();
  m.muatLibur.mockResolvedValue(new Map());
  m.pengirimanFind.mockResolvedValue(null);
  m.koreksiFindUnique.mockResolvedValue(null);
  m.presensiFindMany.mockResolvedValue([]);
  m.perintahFindMany.mockResolvedValue([]);
  m.perintahFindFirst.mockResolvedValue(null);
  m.auditFindFirstTx.mockResolvedValue(null);
  m.auditFindFirstPrisma.mockResolvedValue(null);
  m.uangLemburFindUnique.mockResolvedValue(null);
});

describe("koreksiJamLemburHarianAction - satker ber-SPKL", () => {
  beforeEach(() => {
    masuk(PILOT);
    m.pegawaiFind.mockResolvedValue(pegawai(PILOT));
  });

  it("koreksi 5 jam, perintah 3 jam, WFO: nyata = 5, dibayar = 3", async () => {
    m.presensiFindUnique.mockResolvedValue({
      id: "h-1", jamMasuk: null, jamKeluar: null, jamLembur: 2, jamLemburNyata: 2, statusKehadiran: "WFO",
    });
    m.perintahFindFirst.mockResolvedValue({ jamDiperintahkan: 3 });
    const res = await koreksiJamLemburHarianAction({}, formKoreksi("5"));
    expect(res.error).toBeUndefined();
    expect(m.presensiUpdate).toHaveBeenCalledWith({
      where: { id: "h-1" },
      data: { jamLembur: 3, jamLemburNyata: 5 },
    });
    expect(res.success).toContain("Dibayar 3 jam");
  });

  it("tanpa perintah terkirim tanggal itu: dibayar 0, nyata tetap dicatat", async () => {
    m.presensiFindUnique.mockResolvedValue({
      id: "h-1", jamMasuk: null, jamKeluar: null, jamLembur: 0, jamLemburNyata: 0, statusKehadiran: "WFO",
    });
    await koreksiJamLemburHarianAction({}, formKoreksi("4"));
    expect(m.presensiUpdate).toHaveBeenCalledWith({
      where: { id: "h-1" },
      data: { jamLembur: 0, jamLemburNyata: 4 },
    });
  });

  it("hari kerja WFH: dibayar 0 MUTLAK walau ada perintah dan koreksi petugas", async () => {
    m.presensiFindUnique.mockResolvedValue({
      id: "h-1", jamMasuk: null, jamKeluar: null, jamLembur: 0, jamLemburNyata: 0, statusKehadiran: "WFH",
    });
    m.perintahFindFirst.mockResolvedValue({ jamDiperintahkan: 6 });
    await koreksiJamLemburHarianAction({}, formKoreksi("6"));
    expect(m.presensiUpdate).toHaveBeenCalledWith({
      where: { id: "h-1" },
      data: { jamLembur: 0, jamLemburNyata: 6 },
    });
  });

  it("perintah dicari hanya yang TERKIRIM, untuk pegawai dan tanggal itu", async () => {
    m.presensiFindUnique.mockResolvedValue({
      id: "h-1", jamMasuk: null, jamKeluar: null, jamLembur: 0, jamLemburNyata: 0, statusKehadiran: "WFO",
    });
    await koreksiJamLemburHarianAction({}, formKoreksi("2"));
    expect(m.perintahFindFirst.mock.calls[0][0].where).toMatchObject({
      pegawaiId: "p-1",
      terkirim: true,
      perintahLembur: { status: "TERKIRIM" },
    });
  });

  it("audit menyimpan jam mesin sebelum koreksi (jamLemburNyata), bukan jam dibayar", async () => {
    m.presensiFindUnique.mockResolvedValue({
      id: "h-1", jamMasuk: null, jamKeluar: null, jamLembur: 1, jamLemburNyata: 7, statusKehadiran: "WFO",
    });
    m.perintahFindFirst.mockResolvedValue({ jamDiperintahkan: 1 });
    await koreksiJamLemburHarianAction({}, formKoreksi("3"));
    expect(m.auditCreate.mock.calls[0][0].data.dataSebelum.jamLemburMesin).toBe(7);
    expect(m.auditCreate.mock.calls[0][0].data.dataSesudah.jamLemburDibayar).toBe(1);
  });

  it("sinkronisasi rekap sesudahnya membetulkan baris lain yang tersimpan tanpa batas perintah", async () => {
    m.presensiFindUnique.mockResolvedValue({
      id: "h-1", jamMasuk: null, jamKeluar: null, jamLembur: 0, jamLemburNyata: 0, statusKehadiran: "WFO",
    });
    m.presensiFindMany.mockResolvedValue([
      // ditarik sebelum fitur SPKL: jam nyata belum tersimpan, jam 6 tanpa perintah
      { id: "h-9", tanggal: new Date("2026-12-04T00:00:00Z"), jamLembur: 6, jamLemburNyata: null, statusKehadiran: "WFO" },
    ]);
    await koreksiJamLemburHarianAction({}, formKoreksi("2"));
    expect(m.presensiUpdate).toHaveBeenCalledWith({
      where: { id: "h-9" },
      data: { jamLembur: 0, jamLemburNyata: 6 },
    });
    // tidak ada jam dibayar -> baris UangLembur dihapus, bukan dibuat dengan jam tanpa perintah
    expect(m.uangLemburDeleteMany).toHaveBeenCalled();
    expect(m.uangLemburUpsertTx).not.toHaveBeenCalled();
  });
});

describe("koreksiJamLemburHarianAction - satker non-SPKL tidak berubah", () => {
  it("menulis jamLembur apa adanya, tanpa query perintah", async () => {
    masuk(NON_PILOT);
    m.pegawaiFind.mockResolvedValue(pegawai(NON_PILOT));
    m.presensiFindUnique.mockResolvedValue({
      id: "h-1", jamMasuk: null, jamKeluar: null, jamLembur: 0, jamLemburNyata: null, statusKehadiran: "WFH",
    });
    const res = await koreksiJamLemburHarianAction({}, formKoreksi("5"));
    expect(res.error).toBeUndefined();
    expect(m.presensiUpdate).toHaveBeenCalledWith({ where: { id: "h-1" }, data: { jamLembur: 5 } });
    expect(m.perintahFindFirst).not.toHaveBeenCalled();
    expect(m.perintahFindMany).not.toHaveBeenCalled();
  });
});

describe("hapusKoreksiJamLemburHarianAction - satker ber-SPKL", () => {
  beforeEach(() => {
    masuk(PILOT);
    m.pegawaiFind.mockResolvedValue(pegawai(PILOT));
    m.koreksiFindUnique.mockResolvedValue({
      id: "k-1", pegawaiId: "p-1", tanggal: new Date(`${TGL}T00:00:00Z`),
      jamMasuk: null, jamKeluar: null, jamLembur: 8, alasan: ALASAN, buktiRefLembur: null,
    });
    m.presensiFindUnique.mockResolvedValue({
      id: "h-1", jamMasuk: null, jamKeluar: null, jamLembur: 3, statusKehadiran: "WFO",
    });
  });

  it("memulihkan jam nyata mesin dari audit lalu membatasinya lagi dengan perintah", async () => {
    m.auditFindFirstTx.mockResolvedValue({ dataSebelum: { jamLemburMesin: 5 } });
    m.perintahFindFirst.mockResolvedValue({ jamDiperintahkan: 2 });
    const res = await hapusKoreksiJamLemburHarianAction({}, formHapus());
    expect(res.error).toBeUndefined();
    expect(m.presensiUpdate).toHaveBeenCalledWith({
      where: { id: "h-1" },
      data: { jamLembur: 2, jamLemburNyata: 5 },
    });
    // hanya baris audit CREATE/UPDATE yang dipercaya sebagai sumber jam mesin
    expect(m.auditFindFirstTx.mock.calls[0][0].where.aksi).toEqual({ in: ["CREATE", "UPDATE"] });
  });

  it("jam mesin tidak tercatat: dibayar 0 dan petugas diberi tahu, bukan ditebak dari batas 16:00", async () => {
    m.auditFindFirstTx.mockResolvedValue(null);
    m.perintahFindFirst.mockResolvedValue({ jamDiperintahkan: 4 });
    const res = await hapusKoreksiJamLemburHarianAction({}, formHapus());
    expect(m.presensiUpdate).toHaveBeenCalledWith({
      where: { id: "h-1" },
      data: { jamLembur: 0, jamLemburNyata: 0 },
    });
    expect(res.success).toContain("tidak tercatat");
  });

  it("hari kerja WFH: tetap 0 walau ada perintah", async () => {
    m.presensiFindUnique.mockResolvedValue({
      id: "h-1", jamMasuk: null, jamKeluar: null, jamLembur: 0, statusKehadiran: "WFH",
    });
    m.auditFindFirstTx.mockResolvedValue({ dataSebelum: { jamLemburMesin: 5 } });
    m.perintahFindFirst.mockResolvedValue({ jamDiperintahkan: 5 });
    await hapusKoreksiJamLemburHarianAction({}, formHapus());
    expect(m.presensiUpdate).toHaveBeenCalledWith({
      where: { id: "h-1" },
      data: { jamLembur: 0, jamLemburNyata: 5 },
    });
  });
});

describe("koreksiUangLemburAction (total bulanan manual)", () => {
  function formTotal(bulan: string, tahun: string) {
    const fd = new FormData();
    fd.append("pegawaiId", "p-1");
    fd.append("periodeBulan", bulan);
    fd.append("periodeTahun", tahun);
    fd.append("totalJamLembur", "20");
    fd.append("tarifPerJam", "30000");
    return fd;
  }

  it.each([
    ["0", "2026"],
    ["13", "2026"],
    ["2.5", "2026"],
    ["12", "1999"],
    ["12", "2101"],
    ["12", "2026.5"],
  ])("periode tidak valid (%s/%s) ditolak sebelum menyentuh database", async (bulan, tahun) => {
    masuk(NON_PILOT);
    m.pegawaiFind.mockResolvedValue(pegawai(NON_PILOT));
    const res = await koreksiUangLemburAction({}, formTotal(bulan, tahun));
    expect(res.error).toMatch(/periode tidak valid/i);
    expect(m.pegawaiFind).not.toHaveBeenCalled();
    expect(m.uangLemburUpsert).not.toHaveBeenCalled();
  });

  it("ditolak untuk pegawai satker ber-SPKL di periode berlaku, dengan sebab", async () => {
    masuk(PILOT);
    m.pegawaiFind.mockResolvedValue(pegawai(PILOT));
    const res = await koreksiUangLemburAction({}, formTotal("12", "2026"));
    expect(res.error).toMatch(/perintah lembur \(SPKL\)/);
    expect(m.uangLemburUpsert).not.toHaveBeenCalled();
  });

  it("satker pilot di periode SEBELUM gerbang tetap jalan", async () => {
    masuk(PILOT);
    m.pegawaiFind.mockResolvedValue(pegawai(PILOT));
    const res = await koreksiUangLemburAction({}, formTotal("11", "2026"));
    expect(res.error).toBeUndefined();
    expect(m.uangLemburUpsert).toHaveBeenCalled();
  });

  it("satker non-SPKL tetap jalan di periode yang sama", async () => {
    masuk(NON_PILOT);
    m.pegawaiFind.mockResolvedValue(pegawai(NON_PILOT));
    const res = await koreksiUangLemburAction({}, formTotal("12", "2026"));
    expect(res.error).toBeUndefined();
    expect(m.uangLemburUpsert).toHaveBeenCalled();
  });

  // Tarif dari form bisa diubah di browser - server menurunkannya dari golongan.
  it("tarif dari form DIABAIKAN, dipakai tarif SBM golongan pegawai", async () => {
    masuk(NON_PILOT);
    m.pegawaiFind.mockResolvedValue(pegawai(NON_PILOT));
    const fd = formTotal("12", "2026");
    fd.set("tarifPerJam", "9999999");
    const res = await koreksiUangLemburAction({}, fd);
    expect(res.error).toBeUndefined();
    const arg = m.uangLemburUpsert.mock.calls.at(-1)?.[0];
    expect(arg.create.tarifPerJam).not.toBe(9999999);
    expect(m.auditCreate).toHaveBeenCalled();
  });

  it.each(["-5", "745", "1.3"])("jam lembur di luar rentang (%s) ditolak", async (jam) => {
    masuk(NON_PILOT);
    m.pegawaiFind.mockResolvedValue(pegawai(NON_PILOT));
    const fd = formTotal("12", "2026");
    fd.set("totalJamLembur", jam);
    const res = await koreksiUangLemburAction({}, fd);
    expect(res.error).toMatch(/antara 0 dan/);
    expect(m.uangLemburUpsert).not.toHaveBeenCalled();
  });

  it("rekap yang sudah dikirim ke PPABP terkunci - koreksi ditolak", async () => {
    masuk(NON_PILOT);
    m.pegawaiFind.mockResolvedValue(pegawai(NON_PILOT));
    m.pengirimanFind.mockResolvedValue({ status: "TERKIRIM", dikirimPada: new Date() });
    const res = await koreksiUangLemburAction({}, formTotal("12", "2026"));
    expect(res.error).toMatch(/terkunci/);
    expect(m.uangLemburUpsert).not.toHaveBeenCalled();
  });
});

describe("jumlah hari lain yang ikut dibetulkan sinkronisasi", () => {
  beforeEach(() => {
    masuk(PILOT);
    m.pegawaiFind.mockResolvedValue(pegawai(PILOT));
    m.presensiFindUnique.mockResolvedValue({
      id: "h-1", jamMasuk: null, jamKeluar: null, jamLembur: 0, jamLemburNyata: 0, statusKehadiran: "WFO",
    });
  });
  const barisLama = (id: string, iso: string) => ({
    id, tanggal: new Date(`${iso}T00:00:00Z`), jamLembur: 6, jamLemburNyata: null, statusKehadiran: "WFO",
  });

  it("koreksi: pesan menyebut jumlah hari lain yang dibetulkan", async () => {
    m.presensiFindMany.mockResolvedValue([barisLama("h-8", "2026-12-04"), barisLama("h-9", "2026-12-07")]);
    const res = await koreksiJamLemburHarianAction({}, formKoreksi("2"));
    expect(res.success).toContain("2 hari lain");
  });

  it("koreksi: tanpa hari lain yang dibetulkan, pesan tidak menyebutnya", async () => {
    const res = await koreksiJamLemburHarianAction({}, formKoreksi("2"));
    expect(res.success).not.toContain("hari lain");
  });

  it("cabut koreksi: pesan menyebut jumlah hari lain yang dibetulkan", async () => {
    m.koreksiFindUnique.mockResolvedValue({
      id: "k-1", pegawaiId: "p-1", tanggal: new Date(`${TGL}T00:00:00Z`),
      jamMasuk: null, jamKeluar: null, jamLembur: 8, alasan: ALASAN, buktiRefLembur: null,
    });
    m.presensiFindUnique.mockResolvedValue({
      id: "h-1", jamMasuk: null, jamKeluar: null, jamLembur: 3, statusKehadiran: "WFO",
    });
    m.presensiFindMany.mockResolvedValue([barisLama("h-8", "2026-12-04")]);
    const res = await hapusKoreksiJamLemburHarianAction({}, formHapus());
    expect(res.success).toContain("1 hari lain");
  });
});
