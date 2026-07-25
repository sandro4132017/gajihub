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
    <form action={formAction} className="mt-3 space-y-2 border-t border-gray-200 pt-3">
      <input type="hidden" name="calculationId" value={calculationId} />
      <input type="hidden" name="jenjang" value={jenjangBerikutnya} />
      <p className="text-xs font-medium text-gray-500">
        Approval jenjang {jenjangBerikutnya}
      </p>
      <input
        name="catatan"
        placeholder="Catatan (opsional)"
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          name="keputusan"
          value="SETUJU"
          disabled={pending}
          className="rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Setuju
        </button>
        <button
          type="submit"
          name="keputusan"
          value="REVISI"
          disabled={pending}
          className="rounded bg-amber-500 px-3 py-1 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
        >
          Minta revisi
        </button>
        <button
          type="submit"
          name="keputusan"
          value="TOLAK"
          disabled={pending}
          className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          Tolak
        </button>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-emerald-600">{state.success}</p>}
    </form>
  );
}
