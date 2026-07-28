"use client";

import { useActionState } from "react";
import { ajukanSkKgbAction, type AjukanSkKgbFormState } from "./actions";
import { SearchableSelect } from "../../SearchableSelect";

const INITIAL_STATE: AjukanSkKgbFormState = {};

export function AjukanSkKgbForm({ pegawaiList }: { pegawaiList: { id: string; nama: string; nip: string; golongan: string | null }[] }) {
  const [state, formAction, pending] = useActionState(ajukanSkKgbAction, INITIAL_STATE);

  return (
    <form action={formAction} className="card mt-4 grid gap-3 p-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="field-label">Pegawai</label>
        <SearchableSelect
          name="pegawaiId"
          options={pegawaiList.map((p) => ({
            value: p.id,
            label: p.nama,
            keterangan: `NIP ${p.nip} - golongan saat ini: ${p.golongan ?? "-"}`,
          }))}
          placeholder="Cari nama atau NIP pegawai..."
          required
        />
      </div>
      <div>
        <label className="field-label">Nomor SK</label>
        <input name="nomorSk" required className="field-input" placeholder="cth. 813/KGB/VII/2026" />
      </div>
      <div>
        <label className="field-label">Tanggal SK</label>
        <input type="date" name="tanggalSk" required className="field-input" />
      </div>
      <div>
        <label className="field-label">TMT KGB</label>
        <input type="date" name="tmtKgb" required className="field-input" />
      </div>
      <div />
      <div>
        <label className="field-label">Golongan lama</label>
        <input name="golonganLama" required className="field-input" placeholder="cth. III/c" />
      </div>
      <div>
        <label className="field-label">Golongan baru</label>
        <input name="golonganBaru" required className="field-input" placeholder="cth. III/d" />
      </div>
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Mengajukan..." : "Ajukan SK KGB"}
        </button>
        {state.success && <p className="mt-2 text-sm font-semibold text-green">{state.success}</p>}
        {state.error && <p className="mt-2 text-sm font-medium text-red">{state.error}</p>}
      </div>
    </form>
  );
}
