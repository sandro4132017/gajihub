import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { SPKL_AKTIF } from "../gerbangSpkl";
import { muatPerintahHari, muatPerintahLemburPeriode, muatPerintahPegawaiPeriode } from "../muatPerintahLembur";

const PILOT = SPKL_AKTIF[0].satuanKerja;
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

function prismaPalsu(anggota: { pegawaiId: string; tanggal: Date; jamDiperintahkan: number }[] = []) {
  const pegawaiFindMany = vi.fn().mockResolvedValue([
    { id: "p1", nip: "199000100000000031", satuanKerja: PILOT }, // sensitive-ok
    { id: "p2", nip: "199000100000000032", satuanKerja: PILOT }, // sensitive-ok
  ]);
  const anggotaFindMany = vi.fn().mockResolvedValue(anggota);
  const anggotaFindFirst = vi.fn().mockResolvedValue(null);
  const prisma = {
    pegawai: { findMany: pegawaiFindMany },
    perintahLemburAnggota: { findMany: anggotaFindMany, findFirst: anggotaFindFirst },
  } as unknown as PrismaClient;
  return { prisma, pegawaiFindMany, anggotaFindMany, anggotaFindFirst };
}

describe("muatPerintahLemburPeriode", () => {
  it("periode di luar gerbang: tidak ada query, semua null", async () => {
    const { prisma, pegawaiFindMany, anggotaFindMany } = prismaPalsu();
    const hasil = await muatPerintahLemburPeriode(prisma, 9, 2026);
    expect(pegawaiFindMany).not.toHaveBeenCalled();
    expect(anggotaFindMany).not.toHaveBeenCalled();
    expect(hasil.untukNip("199000100000000031")).toBeNull(); // sensitive-ok
  });

  it("satu query perintah per periode, hanya perintah TERKIRIM", async () => {
    const { prisma, anggotaFindMany } = prismaPalsu([{ pegawaiId: "p1", tanggal: utc("2026-12-03"), jamDiperintahkan: 3 }]);
    await muatPerintahLemburPeriode(prisma, 12, 2026);
    expect(anggotaFindMany).toHaveBeenCalledTimes(1);
    const where = anggotaFindMany.mock.calls[0][0].where;
    expect(where.terkirim).toBe(true);
    expect(where.perintahLembur).toEqual({ status: "TERKIRIM" });
    expect(where.tanggal.gte).toEqual(utc("2026-12-01"));
    expect(where.tanggal.lt).toEqual(utc("2027-01-01"));
  });

  it("pegawai pilot tanpa perintah = Map kosong; yang berperintah membawa jamnya; NIP tak dikenal = null", async () => {
    const { prisma } = prismaPalsu([{ pegawaiId: "p1", tanggal: utc("2026-12-03"), jamDiperintahkan: 3 }]);
    const hasil = await muatPerintahLemburPeriode(prisma, 12, 2026);
    expect(hasil.untukNip("199000100000000031")!.perintah.get("2026-12-03")).toBe(3); // sensitive-ok
    expect(hasil.untukNip("199000100000000032")!.perintah.size).toBe(0); // sensitive-ok
    expect(hasil.untukNip("199000100000000099")).toBeNull(); // sensitive-ok
    expect(hasil.jumlahPegawai).toBe(2);
    expect(hasil.jumlahPerintah).toBe(1);
  });
});

describe("muatPerintahLemburPeriode - satker berspasi & penyempitan", () => {
  it("nama satker berspasi di tepi tetap dikenali gerbang; satker serupa tapi beda disaring", async () => {
    const { prisma, pegawaiFindMany, anggotaFindMany } = prismaPalsu([
      { pegawaiId: "p1", tanggal: utc("2026-12-03"), jamDiperintahkan: 2 },
    ]);
    pegawaiFindMany.mockResolvedValue([
      { id: "p1", nip: "199000100000000031", satuanKerja: ` ${PILOT} ` }, // sensitive-ok
      { id: "p2", nip: "199000100000000032", satuanKerja: `${PILOT} Lainnya` }, // sensitive-ok
    ]);
    const hasil = await muatPerintahLemburPeriode(prisma, 12, 2026);
    expect(hasil.untukNip("199000100000000031")!.perintah.get("2026-12-03")).toBe(2); // sensitive-ok
    expect(hasil.untukNip("199000100000000032")).toBeNull(); // sensitive-ok
    expect(hasil.jumlahPegawai).toBe(1);
    // query pegawai memakai contains, bukan kesamaan persis
    expect(pegawaiFindMany.mock.calls[0][0].where.OR[0].satuanKerja).toEqual({ contains: PILOT });
    // query perintah dipersempit ke pegawai yang lolos gerbang, tetap satu kali
    expect(anggotaFindMany).toHaveBeenCalledTimes(1);
    expect(anggotaFindMany.mock.calls[0][0].where.pegawaiId).toEqual({ in: ["p1"] });
  });

  it("tidak ada pegawai lolos gerbang: tanpa query perintah", async () => {
    const { prisma, pegawaiFindMany, anggotaFindMany } = prismaPalsu();
    pegawaiFindMany.mockResolvedValue([]);
    const hasil = await muatPerintahLemburPeriode(prisma, 12, 2026);
    expect(hasil.jumlahPegawai).toBe(0);
    expect(anggotaFindMany).not.toHaveBeenCalled();
  });
});

describe("muatPerintahHari & muatPerintahPegawaiPeriode", () => {
  it("non-pilot: berlaku false, tanpa query", async () => {
    const { prisma, anggotaFindFirst } = prismaPalsu();
    const r = await muatPerintahHari(prisma, { id: "x", satuanKerja: "Biro Lain" }, "2026-12-03");
    expect(r).toEqual({ berlaku: false });
    expect(anggotaFindFirst).not.toHaveBeenCalled();
  });

  it("tanggal sebelum gerbang: berlaku false", async () => {
    const { prisma, anggotaFindFirst } = prismaPalsu();
    expect(await muatPerintahHari(prisma, { id: "p1", satuanKerja: PILOT }, "2026-11-30")).toEqual({ berlaku: false });
    expect(anggotaFindFirst).not.toHaveBeenCalled();
  });

  it("pilot tanpa perintah: berlaku true, jam null; dengan perintah: jamnya", async () => {
    const { prisma, anggotaFindFirst } = prismaPalsu();
    expect(await muatPerintahHari(prisma, { id: "p1", satuanKerja: PILOT }, "2026-12-03")).toEqual({
      berlaku: true,
      jamDiperintahkan: null,
    });
    anggotaFindFirst.mockResolvedValue({ jamDiperintahkan: 2 });
    expect(await muatPerintahHari(prisma, { id: "p1", satuanKerja: PILOT }, "2026-12-03")).toEqual({
      berlaku: true,
      jamDiperintahkan: 2,
    });
    expect(anggotaFindFirst.mock.calls[0][0].where).toMatchObject({ terkirim: true, perintahLembur: { status: "TERKIRIM" } });
  });

  it("muatPerintahPegawaiPeriode: non-pilot null tanpa query", async () => {
    const { prisma, anggotaFindMany } = prismaPalsu();
    expect(await muatPerintahPegawaiPeriode(prisma, { id: "x", satuanKerja: "Biro Lain" }, 12, 2026)).toBeNull();
    expect(anggotaFindMany).not.toHaveBeenCalled();
  });
});
