"use client";

import { useActionState } from "react";
import { uploadRekeningAction, type UploadRekeningFormState } from "./actions";
import { SearchableSelect } from "../../SearchableSelect";

const INITIAL_STATE: UploadRekeningFormState = {};

export function UploadRekeningForm() {
  const [state, formAction, pending] = useActionState(uploadRekeningAction, INITIAL_STATE);
  const r = state.ringkasan;

  return (
    <div className="card mt-4 p-4">
      <h2 className="text-sm font-bold text-ink">Upload daftar rekening</h2>
      <p className="mt-1 text-sm text-muted">
        Untuk <strong>Tukin</strong>, file ADK tukin yang sudah kamu punya bisa dipakai langsung - kolom NIP, Kode Bank
        SPAN, Nama Bank, Nomor Rekening, dan Nama Rekening di file itu sudah cukup. Untuk <strong>Gaji</strong>, pakai
        file ADK gaji dari GPP.
      </p>

      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="field-label">Jenis pembayaran</label>
          <SearchableSelect
            name="jenisPembayaran"
            className="w-44"
            options={[
              { value: "TUKIN", label: "Tunjangan Kinerja" },
              { value: "GAJI", label: "Gaji" },
            ]}
            defaultValue="TUKIN"
            required
          />
        </div>
        <div className="min-w-[240px] flex-1">
          <label className="field-label">File daftar rekening</label>
          <input
            type="file"
            name="file"
            accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            required
            className="field-input py-1.5 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink-2"
          />
        </div>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Memproses..." : "Upload & proses"}
        </button>
      </form>

      <p className="mt-2 text-xs text-muted">
        Rekening disimpan TERPISAH per jenis pembayaran, karena tukin dan gaji memang lewat bank berbeda - upload Tukin
        tidak menimpa rekening Gaji, dan sebaliknya. File-nya sendiri tidak disimpan.
      </p>

      {state.error && <p className="mt-3 text-sm font-medium text-red">{state.error}</p>}
      {state.success && <p className="mt-3 text-sm font-semibold text-green">{state.success}</p>}

      {r && (
        <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3 text-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Sebaran bank ({r.jenisPembayaran})</p>
          <ul className="mt-1.5 space-y-1 text-ink-2">
            {r.perBank.map((b) => (
              <li key={b.kodeBankSpan}>
                {b.namaBank} <span className="font-mono text-xs text-muted">({b.kodeBankSpan})</span>:{" "}
                <span className="font-semibold">{b.jumlah} pegawai</span>
              </li>
            ))}
          </ul>
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
    </div>
  );
}
