"use client";

import { useActionState } from "react";
import { koreksiUangLemburAction, type KoreksiLemburFormState } from "./actions";

const INITIAL_STATE: KoreksiLemburFormState = {};

export function KoreksiLemburForm({
  pegawaiId,
  periodeBulan,
  periodeTahun,
  totalJamLemburSaatIni,
  tarifPerJam,
}: {
  pegawaiId: string;
  periodeBulan: number;
  periodeTahun: number;
  totalJamLemburSaatIni: number;
  tarifPerJam: number;
}) {
  const [state, formAction, pending] = useActionState(koreksiUangLemburAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="pegawaiId" value={pegawaiId} />
      <input type="hidden" name="periodeBulan" value={periodeBulan} />
      <input type="hidden" name="periodeTahun" value={periodeTahun} />
      <input type="hidden" name="tarifPerJam" value={tarifPerJam} />
      <input
        type="number"
        step="0.5"
        min="0"
        name="totalJamLembur"
        defaultValue={totalJamLemburSaatIni}
        className="field-input w-24 py-1"
      />
      <button type="submit" disabled={pending} className="btn btn-ghost btn-sm">
        {pending ? "..." : "Koreksi"}
      </button>
      {state.success && <span className="text-xs font-semibold text-green">Tersimpan</span>}
      {state.error && <span className="text-xs font-medium text-red">{state.error}</span>}
    </form>
  );
}
