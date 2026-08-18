import type { ApprovalLogEntry, ApprovalEvaluasi } from "./types";

export function evaluasiApproval(
  log: ApprovalLogEntry[],
  totalJenjangDibutuhkan: number
): ApprovalEvaluasi {
  const terurut = [...log].sort((a, b) => a.jenjang - b.jenjang);

  for (let jenjang = 1; jenjang <= totalJenjangDibutuhkan; jenjang++) {
    const entri = terurut.find((e) => e.jenjang === jenjang);

    if (!entri) {
      return { outcome: "MENUNGGU_APPROVAL", jenjangBerikutnya: jenjang };
    }
    if (entri.keputusan !== "SETUJU") {
      return {
        outcome: "PERLU_REVISI",
        jenjangBerikutnya: null,
        alasan: `Jenjang ${jenjang} memberikan keputusan ${entri.keputusan}.`,
      };
    }
  }

  return { outcome: "APPROVED", jenjangBerikutnya: null };
}
