"use client";

import { useActionState } from "react";
import { verifikasiBandingJenjang1Action, type VerifikasiBandingFormState } from "./actions";

const INITIAL_STATE: VerifikasiBandingFormState = {};

export function VerifikasiBandingForm({ bandingId }: { bandingId: string }) {
  const [state, formAction, pending] = useActionState(verifikasiBandingJenjang1Action, INITIAL_STATE);

  if (state.success) {
    return <p className="mt-3 text-xs font-semibold text-green">{state.success}</p>;
  }

  return (
    <form action={formAction} className="mt-3 space-y-2 border-t border-line-2 pt-3">
      <input type="hidden" name="bandingId" value={bandingId} />
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
