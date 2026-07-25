"use client";

import { useActionState } from "react";
import { kalkulasiMassalTukinUangMakanAction, type KalkulasiMassalFormState } from "./actions";

const INITIAL_STATE: KalkulasiMassalFormState = {};

export function KalkulasiMassalForm({
  satuanKerja,
  periodeBulan,
  periodeTahun,
}: {
  satuanKerja: string;
  periodeBulan: number;
  periodeTahun: number;
}) {
  const [state, formAction, pending] = useActionState(kalkulasiMassalTukinUangMakanAction, INITIAL_STATE);

  return (
    <form action={formAction} className="card mt-4 p-4">
      <input type="hidden" name="satuanKerja" value={satuanKerja} />
      <input type="hidden" name="periodeBulan" value={periodeBulan} />
      <input type="hidden" name="periodeTahun" value={periodeTahun} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-ink">Ajukan kalkulasi Tukin + Uang Makan massal</p>
          <p className="text-xs text-muted">
            Periode {periodeBulan}/{periodeTahun} - dihitung dari presensi & predikat kinerja yang sudah tersedia. Pegawai
            tanpa presensi/predikat periode ini akan dilewati.
          </p>
        </div>
        <button type="submit" disabled={pending} className="btn btn-primary shrink-0">
          {pending ? "Menghitung..." : "Hitung sekarang"}
        </button>
      </div>

      {state.success && <p className="mt-3 text-sm font-semibold text-green">{state.success}</p>}
      {state.error && <p className="mt-3 text-sm font-medium text-red">{state.error}</p>}
      {state.ringkasan && state.ringkasan.dilewati > 0 && (
        <div className="mt-3 rounded-lg border border-line-2 bg-surface-2 p-3 text-xs text-muted">
          <p className="font-semibold text-ink-2">{state.ringkasan.dilewati} pegawai dilewati:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {state.ringkasan.detailDilewati.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
