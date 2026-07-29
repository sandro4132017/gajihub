import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockSiapAdapter } from "../../adapters/MockSiapAdapter";
import { MockPresensiAdapter } from "../../adapters/MockPresensiAdapter";
import { MockEKinerjaAdapter } from "../../adapters/MockEKinerjaAdapter";
import type { DataSourceBundle } from "../../adapters/DataSourceAdapter";
import {
  jalankanTukinPeriodeJob,
  type TukinJobPrisma,
} from "../hitungTukinPeriodeJob";

const NIP_SATU = "000000000000000001"; // kelasJabatan 8, kehadiran sempurna di mock
const NIP_DUA = "000000000000000003"; // kelasJabatan 7, sering terlambat di mock

function buatPrismaPalsu(): TukinJobPrisma {
  return {
    pegawai: {
      upsert: vi.fn(async ({ create }: any) => ({
        id: `pegawai-${create.nip}`,
        ...create,
      })),
    },
    tukinCalculation: {
      upsert: vi.fn(async ({ create }: any) => ({
        id: `calc-${create.pegawaiId}`,
        ...create,
      })),
    },
    auditTrail: {
      create: vi.fn(async () => ({})),
    },
  } as unknown as TukinJobPrisma;
}

function buatSumberData(): DataSourceBundle {
  const eKinerja = new MockEKinerjaAdapter();
  eKinerja.seed({
    pegawaiId: NIP_SATU,
    periodeBulan: 7,
    periodeTahun: 2026,
    nilaiCapaianKinerjaPersen: 90,
  });
  eKinerja.seed({
    pegawaiId: NIP_DUA,
    periodeBulan: 7,
    periodeTahun: 2026,
    nilaiCapaianKinerjaPersen: 85,
  });

  return {
    siap: new MockSiapAdapter(),
    presensi: new MockPresensiAdapter(),
    eKinerja,
  };
}

const TARIF_CONFIG = {
  periodeBulan: 7,
  periodeTahun: 2026,
  tukinPokokPerKelasJabatan: { 7: 4_500_000, 8: 5_000_000 },
};

describe("jalankanTukinPeriodeJob", () => {
  let prisma: TukinJobPrisma;

  beforeEach(() => {
    prisma = buatPrismaPalsu();
  });

  it("menghitung tukin untuk semua pegawai yang datanya lengkap", async () => {
    const ringkasan = await jalankanTukinPeriodeJob(
      prisma,
      buatSumberData(),
      TARIF_CONFIG
    );

    expect(ringkasan.totalPegawai).toBe(2);
    expect(ringkasan.dihitung).toBe(2);
    expect(ringkasan.dilewati).toBe(0);
    expect(prisma.pegawai.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.tukinCalculation.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.auditTrail.create).toHaveBeenCalledTimes(2);
  });

  it("selalu menyimpan dengan status DRAFT, bukan APPROVED", async () => {
    await jalankanTukinPeriodeJob(prisma, buatSumberData(), TARIF_CONFIG);

    const args = (prisma.tukinCalculation.upsert as any).mock.calls[0][0];
    expect(args.create.status).toBe("DRAFT");
    expect(args.update.status).toBe("DRAFT");
  });

  it("melewati pegawai kalau capaian kinerja belum tersedia", async () => {
    const sumberData = buatSumberData();
    // NIP_DUA sengaja tidak di-seed capaian kinerjanya
    const eKinerjaKosong = new MockEKinerjaAdapter();
    eKinerjaKosong.seed({
      pegawaiId: NIP_SATU,
      periodeBulan: 7,
      periodeTahun: 2026,
      nilaiCapaianKinerjaPersen: 90,
    });
    sumberData.eKinerja = eKinerjaKosong;

    const ringkasan = await jalankanTukinPeriodeJob(
      prisma,
      sumberData,
      TARIF_CONFIG
    );

    expect(ringkasan.dihitung).toBe(1);
    expect(ringkasan.dilewati).toBe(1);
    const dilewati = ringkasan.items.find((i) => i.nip === NIP_DUA);
    expect(dilewati?.status).toBe("DILEWATI");
    expect(dilewati?.alasanDilewati).toMatch(/capaian kinerja belum tersedia/i);
  });

  it("melewati pegawai kalau tarif kelas jabatan belum dikonfigurasi", async () => {
    const ringkasan = await jalankanTukinPeriodeJob(prisma, buatSumberData(), {
      ...TARIF_CONFIG,
      tukinPokokPerKelasJabatan: { 7: 4_500_000 }, // kelas 8 sengaja tidak diisi
    });

    const dilewati = ringkasan.items.find((i) => i.nip === NIP_SATU);
    expect(dilewati?.status).toBe("DILEWATI");
    expect(dilewati?.alasanDilewati).toMatch(/belum dikonfigurasi/i);
  });

  it("tetap LOLOS validasi kalau potongan kehadiran wajar (di bawah bobot 30%)", async () => {
    const ringkasan = await jalankanTukinPeriodeJob(
      prisma,
      buatSumberData(),
      TARIF_CONFIG
    );

    // NIP_DUA disimulasikan sering terlambat oleh MockPresensiAdapter, tapi
    // potongannya (1 tidak presensi + 45 menit terlambat) masih jauh di
    // bawah bobot kehadiran 30% - jadi tetap LOLOS, bukan PERLU_REVIEW.
    const item = ringkasan.items.find((i) => i.nip === NIP_DUA);
    expect(item?.validasi?.outcome).toBe("LOLOS");
    expect(item?.validasi?.anomali).toHaveLength(0);
  });

  it("menandai PERLU_REVIEW kalau override cuti Pasal 14 diterapkan", async () => {
    const presensiCuti = {
      async getRekapKehadiranPeriode(
        nip: string,
        periodeBulan: number,
        periodeTahun: number
      ) {
        return {
          pegawaiId: nip,
          periodeBulan,
          periodeTahun,
          jumlahHariAlpha: 0,
          jumlahTidakPresensi: 0,
          totalMenitTerlambat: 0,
        totalMenitPulangCepat: 0,
        totalMenitMeninggalkanKantor: 0,
          jumlahTidakIkutUpacara: 0,
          jumlahHariKerja: 22,
          jumlahHariHadir: 22,
          totalJamLembur: 0,
          cutiAktif: { jenis: "CUTI_BESAR" as const, bulanKeberapa: 2 },
        };
      },
    };
    const sumberData = { ...buatSumberData(), presensi: presensiCuti };

    const ringkasan = await jalankanTukinPeriodeJob(
      prisma,
      sumberData,
      TARIF_CONFIG
    );

    const item = ringkasan.items.find((i) => i.nip === NIP_SATU);
    expect(item?.validasi?.outcome).toBe("PERLU_REVIEW");
  });
});
