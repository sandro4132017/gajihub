"use client";

import { useActionState } from "react";
import { updateSkStrukturalAction, type UpdateSkStrukturalFormState } from "./actions";

const INITIAL_STATE: UpdateSkStrukturalFormState = {};

export function UpdateSkForm({
  pegawai,
}: {
  pegawai: { id: string; nama: string; nip: string; jabatan: string | null; golongan: string | null; kelasJabatan: number | null };
}) {
  const [state, formAction, pending] = useActionState(updateSkStrukturalAction, INITIAL_STATE);

  return (
    <form action={formAction} className="card mt-4 grid gap-3 p-4 sm:grid-cols-2">
      <input type="hidden" name="pegawaiId" value={pegawai.id} />
      <div className="sm:col-span-2">
        <label className="field-label">Jabatan baru</label>
        <input name="jabatan" required defaultValue={pegawai.jabatan ?? ""} className="field-input" />
      </div>
      <div>
        <label className="field-label">Golongan baru</label>
        <input name="golongan" required defaultValue={pegawai.golongan ?? ""} className="field-input" />
      </div>
      <div>
        <label className="field-label">Kelas jabatan baru (opsional)</label>
        <input type="number" name="kelasJabatan" defaultValue={pegawai.kelasJabatan ?? ""} className="field-input" />
      </div>
      <div>
        <label className="field-label">TMT SK (opsional)</label>
        <input type="date" name="tmtSkTerakhir" className="field-input" />
      </div>
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Menyimpan..." : "Update SK"}
        </button>
        {state.error && <p className="mt-2 text-sm font-medium text-red">{state.error}</p>}
      </div>
    </form>
  );
}
