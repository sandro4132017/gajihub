import { describe, it, expect, vi } from "vitest";
import {
  ajukanApprovalUangLembur,
  type ApprovalUangLemburPrisma,
} from "../approvalUangLemburService";

const CALC_ID = "calc-1";
const CALCULATED_AT = new Date("2026-07-01T00:00:00Z");

function buatPrismaPalsu() {
  let log: any[] = [];

  return {
    uangLembur: {
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
  } as unknown as ApprovalUangLemburPrisma;
}

describe("ajukanApprovalUangLembur", () => {
  it("APPROVED setelah semua jenjang SETUJU", async () => {
    const prisma = buatPrismaPalsu();

    await ajukanApprovalUangLembur(prisma, {
      uangLemburId: CALC_ID,
      approverNip: "111",
      approverNama: "A",
      approverJabatan: "Kasubbag",
      jenjang: 1,
      keputusan: "SETUJU",
    });
    const hasil = await ajukanApprovalUangLembur(prisma, {
      uangLemburId: CALC_ID,
      approverNip: "222",
      approverNama: "B",
      approverJabatan: "Kabag",
      jenjang: 2,
      keputusan: "SETUJU",
    });

    expect(hasil.outcome).toBe("APPROVED");
    expect(prisma.uangLembur.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "APPROVED" }),
      })
    );
  });

  it("PERLU_REVISI kalau REVISI diminta", async () => {
    const prisma = buatPrismaPalsu();

    const hasil = await ajukanApprovalUangLembur(prisma, {
      uangLemburId: CALC_ID,
      approverNip: "111",
      approverNama: "A",
      approverJabatan: "Kasubbag",
      jenjang: 1,
      keputusan: "REVISI",
      catatan: "Cek ulang jam lembur",
    });

    expect(hasil.outcome).toBe("PERLU_REVISI");
  });
});
