"use client";

import { useActionState } from "react";
import { uploadBasisDataGajiAction, type UploadBasisDataGajiFormState } from "./actions";

const INITIAL_STATE: UploadBasisDataGajiFormState = {};

export function UploadBasisDataGajiForm() {
  const [state, formAction, pending] = useActionState(uploadBasisDataGajiAction, INITIAL_STATE);
  const r = state.ringkasan;

  return (
    <div className="card mt-4 p-4">
      <h2 className="text-sm font-bold text-ink">Unggah basis data gaji</h2>
      <p className="mt-1 text-sm text-muted">
        Berkas dari Web Gaji Kemenkeu (mis. <em>basis data gaji_Kemnaker.xlsx</em>), berisi sheet{" "}
        <code className="font-mono text-xs">data_PNS</code> dan <code className="font-mono text-xs">data_P3K</code>.
        Satu unggahan mengisi <strong>nama untuk berkas ADK</strong> sekaligus <strong>rekening Gaji &amp; Tukin</strong>.
        Berkasnya sendiri tidak disimpan.
      </p>

      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-[260px] flex-1">
          <label className="field-label">Berkas basis data gaji (.xlsx)</label>
          <input
            type="file"
            name="file"
            accept=".xlsx,.xls"
            required
            className="field-input file:mr-3 file:rounded-lg file:border-0 file:bg-teal-tint file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-teal-deep"
          />
        </div>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Memproses..." : "Unggah"}
        </button>
      </form>

      {state.error && <p className="mt-3 text-sm font-medium text-red">{state.error}</p>}
      {state.success && <p className="mt-3 text-sm font-semibold text-green">{state.success}</p>}

      {r && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Baris terbaca" nilai={r.dibaca} />
          <Tile label="Identitas tersimpan" nilai={r.identitasTersimpan} />
          <Tile label="Rekening Tukin" nilai={r.rekeningTukin} />
          <Tile label="Rekening Gaji" nilai={r.rekeningGaji} />
        </div>
      )}

      {r && r.namaBerbedaDariSiap > 0 && (
        <div className="mt-4 rounded-xl border border-line bg-surface-2 p-3">
          <p className="text-sm font-bold text-ink">
            {r.namaBerbedaDariSiap} nama ditulis berbeda dari SIAP
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Ini yang diharapkan, bukan kesalahan - berkas ADK sekarang memakai penulisan Web Gaji.
          </p>
          <table className="mt-2 w-full text-xs">
            <thead>
              <tr className="text-muted">
                <th className="py-1 pr-3 font-semibold">NIP</th>
                <th className="col-nama py-1 pr-3 font-semibold">SIAP</th>
                <th className="col-nama py-1 font-semibold">Web Gaji (dipakai ADK)</th>
              </tr>
            </thead>
            <tbody>
              {r.contohBedaNama.map((c) => (
                <tr key={c.nip} className="border-t border-line-2">
                  <td className="py-1 pr-3 font-mono text-muted">{c.nip}</td>
                  <td className="col-nama py-1 pr-3 text-muted line-through">{c.siap}</td>
                  <td className="col-nama py-1 font-semibold text-ink">{c.webGaji}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {r && r.pegawaiAktifBelumTercakup > 0 && (
        <p className="mt-3 rounded-xl border border-line bg-gold-tint px-3 py-2.5 text-sm text-ink-2">
          <strong>{r.pegawaiAktifBelumTercakup} pegawai aktif</strong> belum punya nama versi Web Gaji. Untuk mereka,
          berkas ADK memakai nama dari SIAP sebagai cadangan - periksa penulisannya sebelum berkas dikirim.
        </p>
      )}

      {state.peringatan && state.peringatan.length > 0 && (
        <div className="mt-3 rounded-xl border border-gold/40 bg-gold-tint p-3">
          <p className="text-sm font-bold text-ink">Perlu diperiksa</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-2">
            {state.peringatan.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {state.dilewati && state.dilewati.length > 0 && (
        <div className="mt-3 rounded-xl border border-line bg-surface-2 p-3">
          <p className="text-sm font-bold text-ink">Baris yang dilewati</p>
          <ul className="mt-1 space-y-1.5 text-sm text-ink-2">
            {state.dilewati.map((d) => (
              <li key={d.alasan}>
                <strong>{d.jumlah}</strong> - {d.alasan}
                {d.contohNip.length > 0 && (
                  <span className="block font-mono text-xs text-muted">contoh NIP: {d.contohNip.join(", ")}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Tile({ label, nilai }: { label: string; nilai: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 font-mono text-xl font-bold text-ink">{nilai.toLocaleString("id-ID")}</p>
    </div>
  );
}
