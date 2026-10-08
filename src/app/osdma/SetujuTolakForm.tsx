"use client";

import { useActionState } from "react";
import { FiCheck, FiX, FiCheckCircle, FiAlertCircle } from "react-icons/fi";

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
    return (
      <div className="mt-3.5 flex items-center gap-2 rounded-xl bg-green-tint/80 border border-green/30 p-2.5 text-xs font-bold text-green">
        <FiCheckCircle className="size-4 shrink-0" />
        <span>{state.success}</span>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-3.5 space-y-2.5 border-t border-line/70 pt-3.5">
      <input type="hidden" name={idFieldName} value={idValue} />
      <div>
        <input
          name="catatan"
          placeholder="Tulis catatan pertimbangan OSDMA (opsional)..."
          className="field-input py-2 text-xs"
          disabled={pending}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-muted">
          Keputusan Approval Biro OSDMA:
        </span>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            name="keputusan"
            value="SETUJU"
            disabled={pending}
            className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
          >
            <FiCheck className="size-3.5" />
            <span>{pending ? "Memproses..." : "Setujui"}</span>
          </button>
          <button
            type="submit"
            name="keputusan"
            value="TOLAK"
            disabled={pending}
            className="btn btn-danger btn-sm inline-flex items-center gap-1.5"
          >
            <FiX className="size-3.5" />
            <span>{pending ? "Memproses..." : "Tolak"}</span>
          </button>
        </div>
      </div>
      {state.error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-tint/80 border border-red/30 p-2 text-xs font-semibold text-red">
          <FiAlertCircle className="size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}
    </form>
  );
}
