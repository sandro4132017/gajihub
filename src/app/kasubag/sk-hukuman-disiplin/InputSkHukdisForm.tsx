"use client";

import { useActionState } from "react";
import { inputSkHukdisAction, type InputSkHukdisFormState } from "./actions";

const INITIAL_STATE: InputSkHukdisFormState = {};

export function InputSkHukdisForm({ pegawaiList }: { pegawaiList: { id: string; nama: string; nip: string }[] }) {
  const [state, formAction, pending] = useActionState(inputSkHukdisAction, INITIAL_STATE);

  return (
    <form action={formAction} className="card mt-4 grid gap-3 p-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="field-label">Pegawai</label>
        <select name="pegawaiId" required className="field-input">
          <option value="">Pilih pegawai...</option>
          {pegawaiList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nama} - {p.nip}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label">Nomor SK</label>
        <input name="nomorSk" required className="field-input" placeholder="cth. 220/HD/VII/2026" />
      </div>
      <div>
        <label className="field-label">Tanggal SK</label>
        <input type="date" name="tanggalSk" required className="field-input" />
      </div>
      <div>
        <label className="field-label">Jenis hukuman</label>
        <input name="jenisHukuman" required className="field-input" placeholder="cth. Teguran tertulis (bebas isi - lihat catatan)" />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="field-label">Periode mulai (bulan)</label>
          <input type="number" name="periodeMulaiBulan" min="1" max="12" required className="field-input" />
        </div>
        <div className="flex-1">
          <label className="field-label">Periode mulai (tahun)</label>
          <input type="number" name="periodeMulaiTahun" required className="field-input" />
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className="field-label">Keterangan (opsional)</label>
        <textarea name="keterangan" rows={2} className="field-input" />
      </div>
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Menyimpan..." : "Input SK Hukuman Disiplin"}
        </button>
        {state.success && <p className="mt-2 text-sm font-semibold text-green">{state.success}</p>}
        {state.error && <p className="mt-2 text-sm font-medium text-red">{state.error}</p>}
      </div>
    </form>
  );
}
