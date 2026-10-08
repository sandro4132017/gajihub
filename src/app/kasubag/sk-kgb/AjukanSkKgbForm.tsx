"use client";

import { useActionState } from "react";
import { ajukanSkKgbAction, type AjukanSkKgbFormState } from "./actions";
import { SearchableSelect } from "../../SearchableSelect";
import { GrDocument } from "react-icons/gr";
import { FiCheckCircle, FiAlertCircle, FiSend } from "react-icons/fi";

const INITIAL_STATE: AjukanSkKgbFormState = {};

export function AjukanSkKgbForm({
  pegawaiList,
}: {
  pegawaiList: { id: string; nama: string; nip: string; golongan: string | null }[];
}) {
  const [state, formAction, pending] = useActionState(ajukanSkKgbAction, INITIAL_STATE);

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-[0_2px_12px_rgba(19,65,107,0.06)]">
      <div className="flex items-center gap-2.5 border-b border-line pb-4">
        <span className="flex size-9 items-center justify-center rounded-xl bg-teal-tint text-navy ring-1 ring-teal-200">
          <GrDocument className="size-4" />
        </span>
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink">
            Formulir Usulan SK KGB
          </h2>
          <p className="text-[11px] text-muted">
            Ajukan kenaikan gaji berkala pegawai untuk diverifikasi dan disahkan oleh Biro OSDMA
          </p>
        </div>
      </div>

      <form action={formAction} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="field-label">Pilih Pegawai *</label>
          <SearchableSelect
            name="pegawaiId"
            options={pegawaiList.map((p) => ({
              value: p.id,
              label: p.nama,
              keterangan: `NIP ${p.nip} - Golongan saat ini: ${p.golongan ?? "-"}`,
            }))}
            placeholder="Ketik nama atau NIP pegawai..."
            required
          />
        </div>

        <div>
          <label className="field-label">Nomor SK *</label>
          <input
            name="nomorSk"
            required
            className="field-input"
            placeholder="cth. 813/KGB/VII/2026"
            disabled={pending}
          />
        </div>

        <div>
          <label className="field-label">Tanggal Terbit SK *</label>
          <input
            type="date"
            name="tanggalSk"
            required
            className="field-input"
            disabled={pending}
          />
        </div>

        <div>
          <label className="field-label">TMT KGB (Tanggal Mulai Berlaku) *</label>
          <input
            type="date"
            name="tmtKgb"
            required
            className="field-input"
            disabled={pending}
          />
        </div>

        <div className="hidden sm:block" />

        <div>
          <label className="field-label">Golongan Lama *</label>
          <input
            name="golonganLama"
            required
            className="field-input"
            placeholder="cth. III/c"
            disabled={pending}
          />
        </div>

        <div>
          <label className="field-label">Golongan Baru *</label>
          <input
            name="golonganBaru"
            required
            className="field-input"
            placeholder="cth. III/d"
            disabled={pending}
          />
        </div>

        <div className="sm:col-span-2 pt-2 border-t border-line/60 flex flex-wrap items-center justify-between gap-3">
          <button
            type="submit"
            disabled={pending}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <FiSend className="size-4" />
            <span>{pending ? "Mengirim Usulan..." : "Ajukan SK KGB ke OSDMA"}</span>
          </button>

          {state.success && (
            <div className="flex items-center gap-2 rounded-xl bg-green-tint border border-green/30 px-3 py-2 text-xs font-bold text-green">
              <FiCheckCircle className="size-4 shrink-0" />
              <span>{state.success}</span>
            </div>
          )}

          {state.error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-tint border border-red/30 px-3 py-2 text-xs font-semibold text-red">
              <FiAlertCircle className="size-4 shrink-0" />
              <span>{state.error}</span>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
