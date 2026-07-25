"use client";

import { useActionState } from "react";
import { eksekusiUsulanRoleAction, type EksekusiUsulanFormState } from "./actions";

const INITIAL_STATE: EksekusiUsulanFormState = {};

export function EksekusiUsulanForm({ usulanId }: { usulanId: string }) {
  const [state, formAction, pending] = useActionState(eksekusiUsulanRoleAction, INITIAL_STATE);

  if (state.success) {
    return <p className="mt-3 text-xs font-semibold text-green">{state.success}</p>;
  }

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-2 pt-3">
      <input type="hidden" name="usulanId" value={usulanId} />
      <button type="submit" name="keputusan" value="EKSEKUSI" disabled={pending} className="btn btn-primary btn-sm">
        Eksekusi
      </button>
      <button type="submit" name="keputusan" value="TOLAK" disabled={pending} className="btn btn-danger btn-sm">
        Tolak
      </button>
      {state.error && <p className="text-sm font-medium text-red">{state.error}</p>}
    </form>
  );
}
