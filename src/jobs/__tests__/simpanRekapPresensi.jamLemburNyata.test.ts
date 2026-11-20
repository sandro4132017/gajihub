import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { simpanHasilPresensi, simpanHasilPresensiMassal } from "../simpanRekapPresensi";
import type { HasilRekapDariPdf } from "../../business-logic/presensiPdfKeRekap";

// Hanya bentuk yang dibaca penyimpan yang diisi; sisanya sengaja dibuang lewat cast.
function hasil(): HasilRekapDariPdf {
  const dasar = {
    menitTerlambat: 0, menitPulangCepat: 0, jamMasukMenit: 450, jamKeluarMenit: 1200,
    kategori: "WFO", statusTeks: "WFO", hariLibur: false, berhakMakanLembur: false,
  };
  return {
    rekap: {
      jumlahHariAlpha: 0, jumlahTidakPresensi: 0, totalMenitTerlambat: 0, totalMenitPulangCepat: 0,
      totalMenitMeninggalkanKantor: 0, jumlahTidakIkutUpacara: 0, jumlahHariKerja: 2, jumlahHariHadir: 2,
      jumlahHariWfo: 2, jumlahHariWfhWfa: 0, jumlahHariDiklat: 0, jumlahHariDinasLuar: 0,
      jumlahHariTugasBelajar: 0, jenisCutiAktif: null, jumlahHariCuti: 0, bulanCutiKeberapa: null,
      totalJamLembur: 2, totalJamLemburHariLibur: 0, jumlahHariMakanLembur: 1,
      jumlahHariMakanLemburHariLibur: 0, jumlahHariLemburHariKerja: 1,
    },
    hari: [
      // SPKL berlaku: dibayar 2 dari nyata 5
      { ...dasar, tanggalIso: "2026-12-03", jamLembur: 2, jamLemburNyata: 5, catatanLembur: "x" },
      // SPKL tidak berlaku (sebelum gerbang): null
      { ...dasar, tanggalIso: "2026-12-02", jamLembur: 1, jamLemburNyata: null, catatanLembur: null },
    ],
  } as unknown as HasilRekapDariPdf;
}

function prismaPalsu() {
  const createMany = vi.fn().mockResolvedValue({ count: 2 });
  const tx = {
    rekapPresensiPeriode: { upsert: vi.fn() },
    presensiHarian: { deleteMany: vi.fn(), createMany },
  };
  const prisma = {
    $transaction: vi.fn(async (arg: unknown) => (typeof arg === "function" ? (arg as (t: unknown) => unknown)(tx) : arg)),
    rekapPresensiPeriode: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    presensiHarian: { deleteMany: vi.fn(), createMany },
  } as unknown as PrismaClient;
  return { prisma, createMany };
}

describe("simpanRekapPresensi menulis jamLemburNyata", () => {
  it("jalur per pegawai: jam dibayar di jamLembur, jam nyata di jamLemburNyata, null bila SPKL tidak berlaku", async () => {
    const { prisma, createMany } = prismaPalsu();
    await simpanHasilPresensi(prisma, {
      pegawaiId: "p-1", periodeBulan: 12, periodeTahun: 2026, hasil: hasil(),
      diunggahOlehId: "u-1", sourceSystem: "TEST",
    });
    const data = createMany.mock.calls[0][0].data as { tanggal: Date; jamLembur: number; jamLemburNyata: number | null }[];
    const h3 = data.find((d) => d.tanggal.toISOString().startsWith("2026-12-03"))!;
    const h2 = data.find((d) => d.tanggal.toISOString().startsWith("2026-12-02"))!;
    expect(h3).toMatchObject({ jamLembur: 2, jamLemburNyata: 5 });
    expect(h2).toMatchObject({ jamLembur: 1, jamLemburNyata: null });
  });

  it("jalur massal: sama", async () => {
    const { prisma, createMany } = prismaPalsu();
    await simpanHasilPresensiMassal(prisma, [{ pegawaiId: "p-1", hasil: hasil() }], 12, 2026, "u-1", "TEST");
    const data = createMany.mock.calls[0][0].data as { tanggal: Date; jamLembur: number; jamLemburNyata: number | null }[];
    expect(data.map((d) => d.jamLemburNyata).sort()).toEqual([5, null].sort());
    expect(data.find((d) => d.jamLemburNyata === 5)!.jamLembur).toBe(2);
  });
});
