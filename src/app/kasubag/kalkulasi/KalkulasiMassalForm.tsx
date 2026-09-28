"use client";

import { useActionState, useState } from "react";
import { kalkulasiMassalTukinUangMakanAction, type KalkulasiMassalFormState } from "./actions";

const INITIAL_STATE: KalkulasiMassalFormState = {};

export function KalkulasiMassalForm({
  satuanKerja,
  periodeBulan,
  periodeTahun,
  jumlahBelumPunyaPredikat,
  namaBulan,
}: {
  satuanKerja: string;
  periodeBulan: number;
  periodeTahun: number;
  jumlahBelumPunyaPredikat: number;
  namaBulan: string;
}) {
  const [state, formAction, pending] = useActionState(kalkulasiMassalTukinUangMakanAction, INITIAL_STATE);
  const belumLengkap = jumlahBelumPunyaPredikat > 0;
  const sudahHitung = Boolean(state.success);

  return (
    <form action={formAction} className="card mt-4 p-4">
      <input type="hidden" name="satuanKerja" value={satuanKerja} />
      <input type="hidden" name="periodeBulan" value={periodeBulan} />
      <input type="hidden" name="periodeTahun" value={periodeTahun} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-ink">Ajukan kalkulasi Tukin + Uang Makan + Uang Lembur</p>
          <p className="text-xs text-muted">
            Periode {periodeBulan}/{periodeTahun} - pegawai tanpa presensi/predikat dilewati.
          </p>
        </div>
        <button
          type="submit"
          disabled={pending}
          className={`btn shrink-0 ${sudahHitung ? "btn-ghost" : "btn-primary"}`}
        >
          {pending ? "Menghitung..." : sudahHitung ? "Hitung ulang" : "Hitung sekarang"}
        </button>
      </div>

      {belumLengkap && !sudahHitung && (
        <label className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-gold-tint p-3 text-xs text-ink-2 dark:border-amber-800">
          <input type="checkbox" name="lanjutkanTanpaLengkap" value="1" className="mt-0.5 shrink-0" />
          <span>
            <strong>{jumlahBelumPunyaPredikat} pegawai belum punya predikat kinerja.</strong> Centang untuk tetap
            menghitung - mereka dilewati <em>sekali ini saja</em>, dan tetap terhitung sebagai anggota unit.
            <span className="mt-1 block text-muted">
              Kalau orangnya memang sudah tidak seharusnya dihitung di unit ini, pakai{" "}
              <strong>Kecualikan pegawai dari perhitungan</strong> di atas - itu berlaku untuk seluruh periode dan
              alasannya tercatat.
            </span>
          </span>
        </label>
      )}

      {state.success && <p className="mt-3 text-sm font-semibold text-green">{state.success}</p>}
      {state.peringatan && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-gold-tint p-3 text-sm font-medium text-ink-2 dark:border-amber-800">
          {state.peringatan}
        </p>
      )}
      {state.error && <p className="mt-3 text-sm font-medium text-red">{state.error}</p>}
      {state.ringkasan && state.ringkasan.detailSebagian.length > 0 && (
        <div className="mt-3 rounded-lg bg-gold-tint p-3 text-xs text-ink-2">
          <p className="font-semibold">
            {state.ringkasan.detailSebagian.length} pegawai terhitung SEBAGIAN (Tukin tersimpan, uang makan/lembur
            tidak):
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {state.ringkasan.detailSebagian.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}

      {state.ringkasan && state.ringkasan.dilewatiPredikat > 0 && (
        <p className="mt-3 text-xs text-muted">
          {state.ringkasan.dilewatiPredikat} pegawai dilewati sesuai persetujuan di atas (predikat kinerja belum ada).
        </p>
      )}
      {state.ringkasan && state.ringkasan.detailDilewati.length > 0 && (
        <div className="mt-3 rounded-lg border border-line-2 bg-surface-2 p-3 text-xs text-muted">
          <p className="font-semibold text-ink-2">
            {state.ringkasan.detailDilewati.length} pegawai dilewati sepenuhnya (tidak ada yang tersimpan):
          </p>
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
