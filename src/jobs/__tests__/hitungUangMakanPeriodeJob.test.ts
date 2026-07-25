import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockSiapAdapter } from "../../adapters/MockSiapAdapter";
import { MockPresensiAdapter } from "../../adapters/MockPresensiAdapter";
import { MockEKinerjaAdapter } from "../../adapters/MockEKinerjaAdapter";
import type { DataSourceBundle } from "../../adapters/DataSourceAdapter";
import {
  jalankanUangMakanPeriodeJob,
  type UangMakanJobPrisma,
} from "../hitungUangMakanPeriodeJob";

function buatPrismaPalsu(): UangMakanJobPrisma {
  return {
    pegawai: {
      upsert: vi.fn(async ({ create }: any) => ({
        id: `pegawai-${create.nip}`,
        ...create,
      })),
    },
    uangMakan: {
      upsert: vi.fn(async ({ create }: any) => ({
        id: `calc-${create.pegawaiId}`,
        ...create,
      })),
    },
    auditTrail: {
      create: vi.fn(async () => ({})),
    },
  } as unknown as UangMakanJobPrisma;
}

function buatSumberData(): DataSourceBundle {
  return {
    siap: new MockSiapAdapter(),
    presensi: new MockPresensiAdapter(),
    eKinerja: new MockEKinerjaAdapter(),
  };
}

const CONFIG = {
  periodeBulan: 7,
  periodeTahun: 2026,
  tarifHarianUangMakan: 35_000,
};

describe("jalankanUangMakanPeriodeJob", () => {
  let prisma: UangMakanJobPrisma;

  beforeEach(() => {
    prisma = buatPrismaPalsu();
  });

  it("menghitung uang makan untuk semua pegawai aktif", async () => {
    const ringkasan = await jalankanUangMakanPeriodeJob(
      prisma,
      buatSumberData(),
      CONFIG
    );

    expect(ringkasan.totalPegawai).toBe(2);
    expect(ringkasan.dihitung).toBe(2);
    expect(ringkasan.dilewati).toBe(0);
    expect(prisma.uangMakan.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.auditTrail.create).toHaveBeenCalledTimes(2);
  });

  it("selalu menyimpan dengan status DRAFT, bukan APPROVED", async () => {
    await jalankanUangMakanPeriodeJob(prisma, buatSumberData(), CONFIG);

    const args = (prisma.uangMakan.upsert as any).mock.calls[0][0];
    expect(args.create.status).toBe("DRAFT");
    expect(args.update.status).toBe("DRAFT");
  });

  it("total uang makan = hari hadir x tarif harian", async () => {
    await jalankanUangMakanPeriodeJob(prisma, buatSumberData(), CONFIG);

    // Pegawai pertama di mock: kehadiran sempurna 22 hari
    const args = (prisma.uangMakan.upsert as any).mock.calls.find(
      (c: any) => c[0].create.jumlahHariHadir === 22
    )[0];
    expect(args.create.totalUangMakan).toBe(22 * 35_000);
  });
});
