export type KeputusanApproval = "SETUJU" | "TOLAK" | "REVISI";

export interface ApprovalLogEntry {
  jenjang: number;
  keputusan: KeputusanApproval;
}

export type ApprovalOutcome =
  | "MENUNGGU_APPROVAL"
  | "APPROVED"
  | "PERLU_REVISI";

export interface ApprovalEvaluasi {
  outcome: ApprovalOutcome;
  /** Jenjang yang masih ditunggu keputusannya. null kalau outcome sudah final (APPROVED/PERLU_REVISI). */
  jenjangBerikutnya: number | null;
  alasan?: string;
}
