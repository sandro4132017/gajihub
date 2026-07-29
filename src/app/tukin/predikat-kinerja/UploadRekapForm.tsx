"use client";

import Link from "next/link";
import { useActionState } from "react";
import { uploadRekapPredikatAction, type UploadRekapPredikatFormState } from "./actions";
import { NAMA_BULAN } from "../../bulan";

const INITIAL_STATE: UploadRekapPredikatFormState = {};

export function UploadRekapForm() {
  const [state, formAction, pending] = useActionState(uploadRekapPredikatAction, INITIAL_STATE);
  const r = state.ringkasan;

  return (
    <div className="card mt-4 p-4">
      <h2 className="text-sm font-bold text-ink">Upload Rekap Penilaian e-Kinerja BKN</h2>
      <p className="mt-1 text-sm text-muted">
        Unduh <span className="font-semibold">Rekap Penilaian</span> periode <span className="font-semibold">Bulanan</span>{" "}
        dari portal e-Kinerja BKN, lalu upload filenya di sini. Periode diambil dari isi file, jadi tidak perlu dipilih
        manual.
      </p>

      <form action={formAction} className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          required
          className="field-input py-1.5 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink-2"
        />
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Memproses..." : "Upload & proses"}
        </button>
      </form>

      <p className="mt-2 text-xs text-muted">
        File-nya sendiri TIDAK disimpan - yang masuk database cuma NIP, periode, dan predikatnya. Predikat yang labelnya
        tidak dikenali akan dilewati dan dilaporkan, bukan ditebak.
      </p>

      {state.error && <p className="mt-3 text-sm font-medium text-red">{state.error}</p>}
      {state.success && <p className="mt-3 text-sm font-semibold text-green">{state.success}</p>}

      {r && (
        <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3 text-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Ringkasan</p>
          <p className="mt-1.5 text-ink-2">
            Periode{" "}
            <span className="font-semibold text-ink">
              {NAMA_BULAN[r.periodeBulan - 1] ?? r.periodeBulan} {r.periodeTahun}
            </span>
            {r.unitPenilaian && <> - unit penilaian di file: {r.unitPenilaian}</>}
          </p>
          <ul className="mt-1.5 space-y-1 text-ink-2">
            {r.perSatuanKerja.map((s) => (
              <li key={s.satuanKerja}>
                {s.satuanKerja}: <span className="font-semibold">{s.jumlah} pegawai</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-ink-2">
            Sebaran predikat: {r.perPredikat.map((p) => `${p.predikat} (${p.jumlah})`).join(", ")}
          </p>
        </div>
      )}

      {state.dilewati && state.dilewati.length > 0 && (
        <div className="mt-3 rounded-lg bg-gold-tint px-3 py-2">
          <p className="text-xs font-bold uppercase tracking-wide text-gold-deep">Baris yang dilewati</p>
          <ul className="mt-1.5 space-y-1 text-sm text-ink-2">
            {state.dilewati.map((d) => (
              <li key={d.alasan}>
                <span className="font-semibold">{d.jumlah} baris</span> - {d.alasan}
                {d.contohNip.length > 0 && <span className="text-muted"> (mis. {d.contohNip.join(", ")})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.perluHitungUlang && (
        <div className="mt-3 rounded-lg bg-gold-tint px-3 py-2">
          <p className="text-xs font-bold uppercase tracking-wide text-gold-deep">Kalkulasi Tukin perlu dihitung ulang</p>
          <p className="mt-1.5 text-sm text-ink-2">
            Pegawai berikut sudah punya kalkulasi Tukin untuk periode ini, yang dibuat SEBELUM predikat barusan masuk -
            jadi komponen kinerja 70%-nya masih memakai nilai lama:
          </p>
          <ul className="mt-1.5 space-y-1 text-sm text-ink-2">
            {state.perluHitungUlang.map((s) => (
              <li key={s.satuanKerja}>
                {s.satuanKerja}: <span className="font-semibold">{s.jumlah} pegawai</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-muted">
            Hitung ulang lewat{" "}
            <Link href="/kasubag/kalkulasi" className="font-semibold text-teal-deep underline">
              Kalkulasi Unit
            </Link>
            . Ingat: menghitung ulang MERESET status approval yang sudah jalan ke DRAFT - lakukan kalau memang
            predikatnya berubah, bukan sebagai rutinitas.
          </p>
        </div>
      )}
    </div>
  );
}
