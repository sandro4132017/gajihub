import { prisma } from "../lib/prisma";
import { evaluasiApproval } from "../approval/approvalEngine";
import type { KeputusanApproval } from "../approval/types";

export type BarisKalkulasi = {
  id: string;
  nilai: number;
  status: string;
  calculatedAt: Date;
};

/**
 * Tally APPROVED/PERLU_REVISI(tertolak)/belum diajukan sama sekali per
 * domain - reuse evaluasiApproval yang sama dipakai dashboard Tukin/Uang
 * Makan/Uang Lembur, supaya konsisten (bukan heuristik nebak dari
 * catatanAnomali yang bisa kepakai buat alasan lain juga). Dipakai bareng
 * dashboard Kasubag TU (scope unit) dan PPABP (lintas unit) - sama
 * persis, cuma `rows` yang di-filter beda di pemanggilnya.
 */
export async function tallyApproval(rows: BarisKalkulasi[], referensiTipe: string, totalJenjang: number) {
  if (rows.length === 0) return { approved: 0, tertolak: 0, belumDiajukan: 0, prosesApproval: 0, total: 0 };
  const logs = await prisma.approvalLog.findMany({
    where: { referensiTipe, referensiId: { in: rows.map((r) => r.id) } },
  });
  let approved = 0;
  let tertolak = 0;
  let belumDiajukan = 0;
  let prosesApproval = 0;
  for (const row of rows) {
    const logSiklusIni = logs.filter((l) => l.referensiId === row.id && l.timestampAksi >= row.calculatedAt);
    if (logSiklusIni.length === 0) {
      belumDiajukan++;
      continue;
    }
    const evaluasi = evaluasiApproval(
      logSiklusIni.map((l) => ({ jenjang: l.jenjang, keputusan: l.keputusan as KeputusanApproval })),
      totalJenjang
    );
    if (evaluasi.outcome === "APPROVED") approved++;
    else if (evaluasi.outcome === "PERLU_REVISI") tertolak++;
    else prosesApproval++;
  }
  return { approved, tertolak, belumDiajukan, prosesApproval, total: rows.length };
}
