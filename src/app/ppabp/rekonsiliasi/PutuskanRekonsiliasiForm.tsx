"use client";

import { useActionState } from "react";
import { putuskanRekonsiliasiAction, type PutuskanRekonsiliasiFormState } from "./actions";

const INITIAL_STATE: PutuskanRekonsiliasiFormState = {};

export function PutuskanRekonsiliasiForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(putuskanRekonsiliasiAction, INITIAL_STATE);

  if (state.success) {
    return <p className="mt-3 text-xs font-semibold text-green">{state.success}</p>;
  }

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-2 pt-3">
      <input type="hidden" name="id" value={id} />
      <button type="submit" name="keputusan" value="HOLD_PEMBAYARAN" disabled={pending} className="btn btn-danger btn-sm">
        Tahan pembayaran
      </button>
      <button type="submit" name="keputusan" value="KOREKSI_SIKLUS_BERIKUTNYA" disabled={pending} className="btn btn-gold btn-sm">
        Koreksi siklus berikutnya
      </button>
      {state.error && <p className="text-sm font-medium text-red">{state.error}</p>}
    </form>
  );
}
