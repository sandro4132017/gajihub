// ============================================================================
// APPROVAL DIGITAL - service untuk TukinCalculation
//
// Orchestrate: catat keputusan approver ke ApprovalLog -> evaluasi status
// berjenjang lewat approvalEngine (pure) -> update status TukinCalculation
// (APPROVED / balik ke DRAFT untuk revisi).
//
// CATATAN CAKUPAN: baru untuk TUKIN, konsisten dengan hitungTukinPeriodeJob.ts
// yang juga baru mencakup Tukin. Uang Makan/Uang Lembur belum punya job
// orchestration sama sekali (lihat catatan di hitungTukinPeriodeJob.ts),
// jadi belum ada approval service untuk keduanya juga.
//
// SIKLUS APPROVAL: kalkulasi bisa direcalculate (job scheduler jalan ulang
// untuk periode yang sama, misal setelah koreksi data presensi). Supaya
// approval log dari SEBELUM recalculation tidak dianggap masih berlaku,
// hanya log dengan timestampAksi >= calculatedAt milik kalkulasi saat ini
// yang dipakai untuk evaluasi. hitungTukinPeriodeJob.ts sudah di-update
// supaya me-refresh calculatedAt tiap kali recalculation terjadi.
// TODO(confirm): ini keputusan teknis sementara, bukan kebijakan resmi -
// perlu dikonfirmasi ke Biro OSDMA/Hukum apakah "siklus approval direset
// oleh recalculation" ini sesuai praktik yang diinginkan.
// ============================================================================

import type { PrismaClient } from "@prisma/client";
import { evaluasiApproval } from "./approvalEngine";
import type { KeputusanApproval, ApprovalOutcome } from "./types";

export type ApprovalTukinPrisma = Pick<
  PrismaClient,
  "approvalLog" | "tukinCalculation"
>;

/**
 * TODO(legal-confirm): jumlah jenjang approval resmi belum diputuskan -
 * lihat catatan di approvalEngine.ts. 2 dipakai sebagai default sementara
 * (starting point, bukan final) supaya pipeline bisa ditest end-to-end.
 */
export const DEFAULT_TOTAL_JENJANG_APPROVAL = 2;

export interface AjukanApprovalTukinInput {
  tukinCalculationId: string;
  approverNip: string;
  approverNama: string;
  approverJabatan: string;
  jenjang: number;
  keputusan: KeputusanApproval;
  catatan?: string;
  totalJenjangDibutuhkan?: number;
}

export interface AjukanApprovalTukinHasil {
  outcome: ApprovalOutcome;
  statusTersimpan: string;
}

export async function ajukanApprovalTukin(
  prisma: ApprovalTukinPrisma,
  input: AjukanApprovalTukinInput
): Promise<AjukanApprovalTukinHasil> {
  const totalJenjangDibutuhkan =
    input.totalJenjangDibutuhkan ?? DEFAULT_TOTAL_JENJANG_APPROVAL;

  const kalkulasi = await prisma.tukinCalculation.findUniqueOrThrow({
    where: { id: input.tukinCalculationId },
  });

  const logSiklusIni = await prisma.approvalLog.findMany({
    where: {
      referensiTipe: "TUKIN",
      referensiId: input.tukinCalculationId,
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
      referensiTipe: "TUKIN",
      referensiId: input.tukinCalculationId,
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
    await prisma.tukinCalculation.update({
      where: { id: input.tukinCalculationId },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedBy: input.approverNip,
      },
    });
    return { outcome: "APPROVED", statusTersimpan: "APPROVED" };
  }

  if (evaluasiBaru.outcome === "PERLU_REVISI") {
    await prisma.tukinCalculation.update({
      where: { id: input.tukinCalculationId },
      data: {
        status: "DRAFT",
        catatanAnomali: evaluasiBaru.alasan ?? null,
      },
    });
    return { outcome: "PERLU_REVISI", statusTersimpan: "DRAFT" };
  }

  return { outcome: "MENUNGGU_APPROVAL", statusTersimpan: "DRAFT" };
}
