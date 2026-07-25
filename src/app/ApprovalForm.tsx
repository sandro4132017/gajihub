"use client";

import { useActionState } from "react";
import type { AjukanApprovalFormState } from "./actions";

const INITIAL_STATE: AjukanApprovalFormState = {};

/**
 * Tidak ada input NIP/nama/jabatan approver di sini - identitas approver
 * diambil dari session login di server (lihat actions.ts), bukan diisi
 * manual lewat form. Form ini cuma perlu tahu KEPUTUSAN dan CATATAN-nya.
 */
export function ApprovalForm({
  action,
  calculationId,
  jenjangBerikutnya,
}: {
  action: (
    state: AjukanApprovalFormState,
    formData: FormData
  ) => Promise<AjukanApprovalFormState>;
  calculationId: string;
  jenjangBerikutnya: number;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  return (
    <form action={formAction} className="mt-3 space-y-2 border-t border-line-2 pt-3">
      <input type="hidden" name="calculationId" value={calculationId} />
      <input type="hidden" name="jenjang" value={jenjangBerikutnya} />
      <p className="text-xs font-bold text-muted">Approval jenjang {jenjangBerikutnya}</p>
      <input name="catatan" placeholder="Catatan (opsional)" className="field-input py-1.5" />
      <div className="flex items-center gap-2">
        <button type="submit" name="keputusan" value="SETUJU" disabled={pending} className="btn btn-primary btn-sm">
          Setuju
        </button>
        <button type="submit" name="keputusan" value="REVISI" disabled={pending} className="btn btn-gold btn-sm">
          Minta revisi
        </button>
        <button type="submit" name="keputusan" value="TOLAK" disabled={pending} className="btn btn-danger btn-sm">
          Tolak
        </button>
      </div>
      {state.error && <p className="text-sm font-medium text-red">{state.error}</p>}
      {state.success && <p className="text-sm font-medium text-green">{state.success}</p>}
    </form>
  );
}
