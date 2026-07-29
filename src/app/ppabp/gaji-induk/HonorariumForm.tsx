"use client";

import { useActionState } from "react";
import { ubahHonorariumAction, type HonorariumFormState } from "./actions";

const INITIAL_STATE: HonorariumFormState = {};

/**
 * Edit honorarium per pegawai per periode. Honorarium TIDAK ikut ter-upload
 * dari file GPP (memang tidak ada kolomnya di sana) - form ini satu-satunya
 * cara mengisinya, dan angkanya langsung dipakai baris "Honorarium" di slip
 * gaji pegawai yang bersangkutan.
 */
export function HonorariumForm({ gajiIndukId, honorarium }: { gajiIndukId: string; honorarium: number }) {
  const [state, formAction, pending] = useActionState(ubahHonorariumAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="gajiIndukId" value={gajiIndukId} />
      <input
        type="number"
        name="honorarium"
        min="0"
        step="1000"
        defaultValue={honorarium}
        className="field-input w-32 py-1 text-right font-mono"
      />
      <button type="submit" disabled={pending} className="btn btn-ghost btn-sm">
        {pending ? "..." : "Simpan"}
      </button>
      {state.success && <span className="text-xs font-semibold text-green">{state.success}</span>}
      {state.error && <span className="text-xs font-medium text-red">{state.error}</span>}
    </form>
  );
}
