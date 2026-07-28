"use client";

import { useActionState, useState } from "react";
import type { Role } from "@prisma/client";
import { buatAkunBaruAction, type BuatAkunBaruFormState } from "./actions";
import { LABEL_ROLE } from "../../../auth/roleLabel";
import { SearchableSelect } from "../../SearchableSelect";

const INITIAL_STATE: BuatAkunBaruFormState = {};
const SEMUA_ROLE: Role[] = ["PEGAWAI", "KASUBAG_TU", "OSDMA", "PPABP", "PIMPINAN", "ADMIN"];

export function BuatAkunBaruForm({
  pegawai,
  satuanKerjaList,
}: {
  pegawai: { id: string; nama: string; nip: string; satuanKerja: string };
  satuanKerjaList: string[];
}) {
  const [state, formAction, pending] = useActionState(buatAkunBaruAction, INITIAL_STATE);
  const [role, setRole] = useState<Role>("PEGAWAI");

  if (state.success) {
    return <p className="card mt-4 p-4 text-sm font-semibold text-green">{state.success}</p>;
  }

  return (
    <form action={formAction} className="card mt-4 grid gap-3 p-4 sm:grid-cols-2">
      <input type="hidden" name="pegawaiId" value={pegawai.id} />
      <div className="sm:col-span-2">
        <label className="field-label">Role</label>
        <SearchableSelect
          name="role"
          options={SEMUA_ROLE.map((r) => ({ value: r, label: LABEL_ROLE[r] }))}
          defaultValue="PEGAWAI"
          onValueChange={(v) => setRole(v as Role)}
          required
        />
      </div>
      {role === "KASUBAG_TU" && (
        <div className="sm:col-span-2">
          <label className="field-label">Satuan kerja</label>
          <SearchableSelect
            name="satuanKerja"
            options={satuanKerjaList.map((s) => ({ value: s, label: s }))}
            defaultValue={pegawai.satuanKerja}
            required
          />
        </div>
      )}
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Membuat akun..." : `Buat Akun ${pegawai.nama}`}
        </button>
        {state.error && <p className="mt-2 text-sm font-medium text-red">{state.error}</p>}
      </div>
    </form>
  );
}
