import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockSiapAdapter } from "../../adapters/MockSiapAdapter";
import { MockPresensiAdapter } from "../../adapters/MockPresensiAdapter";
import { MockEKinerjaAdapter } from "../../adapters/MockEKinerjaAdapter";
import type { DataSourceBundle } from "../../adapters/DataSourceAdapter";
import {
  jalankanUangLemburPeriodeJob,
  type UangLemburJobPrisma,
} from "../hitungUangLemburPeriodeJob";

function buatPrismaPalsu(): UangLemburJobPrisma {
  return {
    pegawai: {
      upsert: vi.fn(async ({ create }: any) => ({
        id: `pegawai-${create.nip}`,
        ...create,
      })),
    },
    uangLembur: {
      upsert: vi.fn(async ({ create }: any) => ({
        id: `calc-${create.pegawaiId}`,
        ...create,
      })),
    },
    auditTrail: {
      create: vi.fn(async () => ({})),
    },
  } as unknown as UangLemburJobPrisma;
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
  tarifPerJam: 25_000,
};

describe("jalankanUangLemburPeriodeJob", () => {
  let prisma: UangLemburJobPrisma;

  beforeEach(() => {
    prisma = buatPrismaPalsu();
  });

  it("menghitung uang lembur untuk semua pegawai aktif", async () => {
    const ringkasan = await jalankanUangLemburPeriodeJob(
      prisma,
      buatSumberData(),
      CONFIG
    );

    expect(ringkasan.totalPegawai).toBe(2);
    expect(ringkasan.dihitung).toBe(2);
    expect(prisma.uangLembur.upsert).toHaveBeenCalledTimes(2);
  });

  it("selalu menyimpan dengan status DRAFT, bukan APPROVED", async () => {
    await jalankanUangLemburPeriodeJob(prisma, buatSumberData(), CONFIG);

    const args = (prisma.uangLembur.upsert as any).mock.calls[0][0];
    expect(args.create.status).toBe("DRAFT");
  });

  it("total uang lembur = jam lembur x tarif per jam (di bawah batas default)", async () => {
    await jalankanUangLemburPeriodeJob(prisma, buatSumberData(), CONFIG);

    // Pegawai pertama di mock: 6 jam lembur
    const args = (prisma.uangLembur.upsert as any).mock.calls.find(
      (c: any) => c[0].create.totalJamLembur === 6
    )[0];
    expect(args.create.totalUangLembur).toBe(6 * 25_000);
  });
});
