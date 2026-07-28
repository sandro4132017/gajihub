"use client";

import { useActionState } from "react";
import { uploadAnggaranRealisasiAction, type UploadAnggaranFormState } from "./actions";
import { SearchableSelect } from "../../SearchableSelect";

const INITIAL_STATE: UploadAnggaranFormState = {};

export function UploadAnggaranForm({ satuanKerjaList }: { satuanKerjaList: string[] }) {
  const [state, formAction, pending] = useActionState(uploadAnggaranRealisasiAction, INITIAL_STATE);

  return (
    <form action={formAction} className="card mt-4 grid gap-3 p-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="field-label">Satuan kerja</label>
        <SearchableSelect
          name="satuanKerja"
          options={satuanKerjaList.map((s) => ({ value: s, label: s }))}
          placeholder="Cari satuan kerja..."
          required
        />
      </div>
      <div>
        <label className="field-label">Bulan</label>
        <input type="number" name="periodeBulan" min="1" max="12" required className="field-input" />
      </div>
      <div>
        <label className="field-label">Tahun</label>
        <input type="number" name="periodeTahun" required className="field-input" />
      </div>
      <div>
        <label className="field-label">Pagu (Rp)</label>
        <input type="number" name="pagu" min="0" required className="field-input" />
      </div>
      <div>
        <label className="field-label">Realisasi (Rp)</label>
        <input type="number" name="realisasi" min="0" required className="field-input" />
      </div>
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Menyimpan..." : "Simpan"}
        </button>
        {state.success && <p className="mt-2 text-sm font-semibold text-green">{state.success}</p>}
        {state.error && <p className="mt-2 text-sm font-medium text-red">{state.error}</p>}
      </div>
    </form>
  );
}
