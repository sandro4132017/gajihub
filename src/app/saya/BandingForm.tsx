"use client";

import { useActionState } from "react";
import { ajukanBandingAction, type AjukanBandingFormState } from "./actions";

const INITIAL_STATE: AjukanBandingFormState = {};

export function BandingForm({
  referensiTipe,
  referensiId,
}: {
  referensiTipe: "TUKIN" | "UANG_MAKAN" | "UANG_LEMBUR";
  referensiId: string;
}) {
  const [state, formAction, pending] = useActionState(ajukanBandingAction, INITIAL_STATE);

  if (state.success) {
    return <p className="mt-3 text-xs font-semibold text-green">{state.success}</p>;
  }

  return (
    <form action={formAction} className="mt-3 space-y-2 border-t border-line-2 pt-3">
      <input type="hidden" name="referensiTipe" value={referensiTipe} />
      <input type="hidden" name="referensiId" value={referensiId} />
      <textarea
        name="alasan"
        placeholder="Alasan banding (misal: jumlah hari hadir tidak sesuai)"
        required
        rows={2}
        className="field-input"
      />
      <button type="submit" disabled={pending} className="btn btn-gold btn-sm">
        Ajukan banding
      </button>
      {state.error && <p className="text-sm font-medium text-red">{state.error}</p>}
    </form>
  );
}
