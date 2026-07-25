"use client";

import { useActionState } from "react";

export interface SetujuTolakFormState {
  error?: string;
  success?: string;
}

const INITIAL_STATE: SetujuTolakFormState = {};

/**
 * Approval jenjang tunggal/final (Setuju/Tolak, TANPA opsi "Minta revisi" -
 * beda dengan ApprovalForm.tsx yang dipakai Tukin/Uang Makan/Uang Lembur.
 * Banding jenjang final, SK KGB, dan SK Hukuman Disiplin cuma punya 2
 * keputusan di model-nya (DISETUJUI/DITOLAK), bukan siklus revisi.
 */
export function SetujuTolakForm({
  action,
  idFieldName,
  idValue,
}: {
  action: (state: SetujuTolakFormState, formData: FormData) => Promise<SetujuTolakFormState>;
  idFieldName: string;
  idValue: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  if (state.success) {
    return <p className="mt-3 text-xs font-semibold text-green">{state.success}</p>;
  }

  return (
    <form action={formAction} className="mt-3 space-y-2 border-t border-line-2 pt-3">
      <input type="hidden" name={idFieldName} value={idValue} />
      <input name="catatan" placeholder="Catatan (opsional)" className="field-input py-1.5" />
      <div className="flex items-center gap-2">
        <button type="submit" name="keputusan" value="SETUJU" disabled={pending} className="btn btn-primary btn-sm">
          Setuju
        </button>
        <button type="submit" name="keputusan" value="TOLAK" disabled={pending} className="btn btn-danger btn-sm">
          Tolak
        </button>
      </div>
      {state.error && <p className="text-sm font-medium text-red">{state.error}</p>}
    </form>
  );
}
