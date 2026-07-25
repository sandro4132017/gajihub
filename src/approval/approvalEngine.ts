// ============================================================================
// APPROVAL DIGITAL - evaluasi status approval berjenjang
//
// TODO(legal-confirm): jumlah jenjang approval, siapa yang berwenang approve
// di tiap jenjang (berdasarkan jabatan), dan apakah approval WAJIB sekuensial
// atau boleh paralel - BELUM ada keputusan resmi dari Biro OSDMA/Hukum.
// Engine ini didesain generik (jumlah jenjang jadi parameter, bukan hardcode)
// supaya gampang disesuaikan begitu aturan resminya didapat.
//
// Aturan default yang dipakai di bawah (starting point supaya pipeline bisa
// jalan dan ditest, BUKAN keputusan final):
// - Approval sekuensial: jenjang N+1 tidak bisa diproses sebelum jenjang N
//   memberi keputusan SETUJU.
// - TOLAK atau REVISI di jenjang manapun langsung menghentikan proses
//   (PERLU_REVISI) - tidak lanjut ke jenjang berikutnya.
// - APPROVED hanya kalau SEMUA jenjang yang dikonfigurasi sudah SETUJU.
//
// Pure function - tidak ada I/O, konsisten dengan konvensi business logic
// engine (lihat CLAUDE.md). Pemanggilan Prisma ada di approvalTukinService.ts.
// ============================================================================

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
