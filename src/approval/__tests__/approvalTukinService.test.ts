import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ajukanApprovalTukin,
  type ApprovalTukinPrisma,
} from "../approvalTukinService";

const CALC_ID = "calc-1";
const CALCULATED_AT = new Date("2026-07-01T00:00:00Z");

function buatPrismaPalsu(logAwal: any[] = []) {
  let log = [...logAwal];

  const prisma = {
    tukinCalculation: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: CALC_ID,
        calculatedAt: CALCULATED_AT,
        status: "DRAFT",
      })),
      update: vi.fn(async () => ({})),
    },
    approvalLog: {
      findMany: vi.fn(async () =>
        log.filter((l) => l.timestampAksi >= CALCULATED_AT)
      ),
      create: vi.fn(async ({ data }: any) => {
        const entry = { ...data, timestampAksi: new Date() };
        log.push(entry);
        return entry;
      }),
    },
  } as unknown as ApprovalTukinPrisma;

  return prisma;
}

describe("ajukanApprovalTukin", () => {
  it("MENUNGGU_APPROVAL setelah jenjang 1 SETUJU (butuh 2 jenjang)", async () => {
    const prisma = buatPrismaPalsu();

    const hasil = await ajukanApprovalTukin(prisma, {
      tukinCalculationId: CALC_ID,
      approverNip: "111",
      approverNama: "Atasan Langsung",
      approverJabatan: "Kasubbag",
      jenjang: 1,
      keputusan: "SETUJU",
    });

    expect(hasil.outcome).toBe("MENUNGGU_APPROVAL");
    expect(prisma.tukinCalculation.update).not.toHaveBeenCalled();
  });

  it("APPROVED setelah semua jenjang SETUJU, dan status tersimpan APPROVED", async () => {
    const prisma = buatPrismaPalsu();

    await ajukanApprovalTukin(prisma, {
      tukinCalculationId: CALC_ID,
      approverNip: "111",
      approverNama: "Atasan Langsung",
      approverJabatan: "Kasubbag",
      jenjang: 1,
      keputusan: "SETUJU",
    });

    const hasil = await ajukanApprovalTukin(prisma, {
      tukinCalculationId: CALC_ID,
      approverNip: "222",
      approverNama: "Pejabat Penetap",
      approverJabatan: "Kabag",
      jenjang: 2,
      keputusan: "SETUJU",
    });

    expect(hasil.outcome).toBe("APPROVED");
    expect(prisma.tukinCalculation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "APPROVED" }),
      })
    );
  });

  it("PERLU_REVISI kalau approver TOLAK, dan status balik ke DRAFT", async () => {
    const prisma = buatPrismaPalsu();

    const hasil = await ajukanApprovalTukin(prisma, {
      tukinCalculationId: CALC_ID,
      approverNip: "111",
      approverNama: "Atasan Langsung",
      approverJabatan: "Kasubbag",
      jenjang: 1,
      keputusan: "TOLAK",
      catatan: "Data kehadiran belum sesuai",
    });

    expect(hasil.outcome).toBe("PERLU_REVISI");
    expect(prisma.tukinCalculation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "DRAFT" }),
      })
    );
  });

  it("menolak pengajuan kalau jenjang tidak sesuai urutan yang ditunggu", async () => {
    const prisma = buatPrismaPalsu();

    await expect(
      ajukanApprovalTukin(prisma, {
        tukinCalculationId: CALC_ID,
        approverNip: "222",
        approverNama: "Pejabat Penetap",
        approverJabatan: "Kabag",
        jenjang: 2,
        keputusan: "SETUJU",
      })
    ).rejects.toThrow(/Jenjang approval yang ditunggu adalah 1/);
  });

  it("menolak pengajuan lanjutan kalau siklus sudah final (APPROVED)", async () => {
    const prisma = buatPrismaPalsu();

    await ajukanApprovalTukin(prisma, {
      tukinCalculationId: CALC_ID,
      approverNip: "111",
      approverNama: "A",
      approverJabatan: "Kasubbag",
      jenjang: 1,
      keputusan: "SETUJU",
    });
    await ajukanApprovalTukin(prisma, {
      tukinCalculationId: CALC_ID,
      approverNip: "222",
      approverNama: "B",
      approverJabatan: "Kabag",
      jenjang: 2,
      keputusan: "SETUJU",
    });

    await expect(
      ajukanApprovalTukin(prisma, {
        tukinCalculationId: CALC_ID,
        approverNip: "333",
        approverNama: "C",
        approverJabatan: "Sekjen",
        jenjang: 3,
        keputusan: "SETUJU",
      })
    ).rejects.toThrow(/sudah berstatus APPROVED/);
  });

  it("log approval dari siklus sebelum recalculation (timestampAksi < calculatedAt) diabaikan", async () => {
    const logLama = [
      {
        jenjang: 1,
        keputusan: "TOLAK",
        timestampAksi: new Date("2026-06-01T00:00:00Z"), // sebelum recalculation
      },
    ];
    const prisma = buatPrismaPalsu(logLama);

    const hasil = await ajukanApprovalTukin(prisma, {
      tukinCalculationId: CALC_ID,
      approverNip: "111",
      approverNama: "A",
      approverJabatan: "Kasubbag",
      jenjang: 1,
      keputusan: "SETUJU",
    });

    // Harus tetap dianggap jenjang 1 di siklus baru, bukan PERLU_REVISI
    // dari siklus lama.
    expect(hasil.outcome).toBe("MENUNGGU_APPROVAL");
  });
});
