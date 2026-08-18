import type { PrismaClient } from "@prisma/client";
import { evaluasiApproval } from "./approvalEngine";
import type { KeputusanApproval, ApprovalOutcome } from "./types";

export type ApprovalUangLemburPrisma = Pick<
  PrismaClient,
  "approvalLog" | "uangLembur"
>;

/** TODO(legal-confirm): sama seperti Tukin - jumlah jenjang approval resmi belum diputuskan. */
export const DEFAULT_TOTAL_JENJANG_APPROVAL_UANG_LEMBUR = 2;

export interface AjukanApprovalUangLemburInput {
  uangLemburId: string;
  approverNip: string;
  approverNama: string;
  approverJabatan: string;
  jenjang: number;
  keputusan: KeputusanApproval;
  catatan?: string;
  totalJenjangDibutuhkan?: number;
}

export interface AjukanApprovalUangLemburHasil {
  outcome: ApprovalOutcome;
  statusTersimpan: string;
}

export async function ajukanApprovalUangLembur(
  prisma: ApprovalUangLemburPrisma,
  input: AjukanApprovalUangLemburInput
): Promise<AjukanApprovalUangLemburHasil> {
  const totalJenjangDibutuhkan =
    input.totalJenjangDibutuhkan ?? DEFAULT_TOTAL_JENJANG_APPROVAL_UANG_LEMBUR;

  const kalkulasi = await prisma.uangLembur.findUniqueOrThrow({
    where: { id: input.uangLemburId },
  });

  const logSiklusIni = await prisma.approvalLog.findMany({
    where: {
      referensiTipe: "UANG_LEMBUR",
      referensiId: input.uangLemburId,
      timestampAksi: { gte: kalkulasi.calculatedAt },
    },
  });

  const evaluasiSaatIni = evaluasiApproval(
    logSiklusIni.map((l) => ({
      jenjang: l.jenjang,
      keputusan: l.keputusan as KeputusanApproval,
    })),
    totalJenjangDibutuhkan
  );

  if (evaluasiSaatIni.outcome !== "MENUNGGU_APPROVAL") {
    throw new Error(
      `Kalkulasi ini sudah berstatus ${evaluasiSaatIni.outcome} untuk siklus approval saat ini - tidak bisa diajukan approval lagi tanpa recalculation baru.`
    );
  }
  if (input.jenjang !== evaluasiSaatIni.jenjangBerikutnya) {
    throw new Error(
      `Jenjang approval yang ditunggu adalah ${evaluasiSaatIni.jenjangBerikutnya}, bukan ${input.jenjang}.`
    );
  }

  await prisma.approvalLog.create({
    data: {
      referensiTipe: "UANG_LEMBUR",
      referensiId: input.uangLemburId,
      approverNip: input.approverNip,
      approverNama: input.approverNama,
      approverJabatan: input.approverJabatan,
      jenjang: input.jenjang,
      keputusan: input.keputusan,
      catatan: input.catatan,
    },
  });

  const evaluasiBaru = evaluasiApproval(
    [
      ...logSiklusIni.map((l) => ({
        jenjang: l.jenjang,
        keputusan: l.keputusan as KeputusanApproval,
      })),
      { jenjang: input.jenjang, keputusan: input.keputusan },
    ],
    totalJenjangDibutuhkan
  );

  if (evaluasiBaru.outcome === "APPROVED") {
    await prisma.uangLembur.update({
      where: { id: input.uangLemburId },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedBy: input.approverNip,
      },
    });
    return { outcome: "APPROVED", statusTersimpan: "APPROVED" };
  }

  if (evaluasiBaru.outcome === "PERLU_REVISI") {
    await prisma.uangLembur.update({
      where: { id: input.uangLemburId },
      data: {
        status: "DRAFT",
        catatanAnomali: evaluasiBaru.alasan ?? null,
      },
    });
    return { outcome: "PERLU_REVISI", statusTersimpan: "DRAFT" };
  }

  return { outcome: "MENUNGGU_APPROVAL", statusTersimpan: "DRAFT" };
}
