"use client";

import { useActionState } from "react";
import { ajukanSanggahanAction, type AjukanSanggahanFormState } from "./actions";

const INITIAL_STATE: AjukanSanggahanFormState = {};

export function SanggahanForm({
  referensiTipe,
  referensiId,
}: {
  referensiTipe: "TUKIN" | "UANG_MAKAN" | "UANG_LEMBUR";
  referensiId: string;
}) {
  const [state, formAction, pending] = useActionState(ajukanSanggahanAction, INITIAL_STATE);

  if (state.success) {
    return <p className="mt-3 text-xs font-semibold text-green">{state.success}</p>;
  }

  return (
    <form action={formAction} className="mt-3 space-y-2 border-t border-line-2 pt-3">
      <input type="hidden" name="referensiTipe" value={referensiTipe} />
      <input type="hidden" name="referensiId" value={referensiId} />
      <textarea
        name="alasan"
        placeholder="Alasan sanggahan (misal: jumlah hari hadir tidak sesuai)"
        required
        rows={2}
        className="field-input"
      />
      <button type="submit" disabled={pending} className="btn btn-gold btn-sm">
        Ajukan sanggahan
      </button>
      {state.error && <p className="text-sm font-medium text-red">{state.error}</p>}
    </form>
  );
}
