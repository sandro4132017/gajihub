"use client";

import { useActionState } from "react";
import type { Role } from "@prisma/client";
import { usulkanPerubahanRoleAction, type UsulkanPerubahanRoleFormState } from "./actions";
import { LABEL_ROLE } from "../../../auth/roleLabel";
import { SearchableSelect } from "../../SearchableSelect";

const INITIAL_STATE: UsulkanPerubahanRoleFormState = {};
const SEMUA_ROLE: Role[] = ["PEGAWAI", "KASUBAG_TU", "OSDMA", "PPABP", "PIMPINAN", "ADMIN"];

export function UsulkanPerubahanRoleForm({ userList }: { userList: { id: string; nama: string; nip: string; role: Role }[] }) {
  const [state, formAction, pending] = useActionState(usulkanPerubahanRoleAction, INITIAL_STATE);

  return (
    <form action={formAction} className="card mt-4 grid gap-3 p-4 sm:grid-cols-2">
      <div>
        <label className="field-label">Akun</label>
        <SearchableSelect
          name="targetUserId"
          options={userList.map((u) => ({
            value: u.id,
            label: u.nama,
            keterangan: `NIP ${u.nip} - saat ini: ${LABEL_ROLE[u.role]}`,
          }))}
          placeholder="Cari nama atau NIP..."
          required
        />
      </div>
      <div>
        <label className="field-label">Role diusulkan</label>
        <SearchableSelect
          name="roleDiusulkan"
          options={SEMUA_ROLE.map((r) => ({ value: r, label: LABEL_ROLE[r] }))}
          placeholder="Pilih role..."
          required
        />
      </div>
      <div className="sm:col-span-2">
        <label className="field-label">Alasan (opsional)</label>
        <textarea name="alasan" rows={2} className="field-input" />
      </div>
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Mengusulkan..." : "Usulkan Perubahan Role"}
        </button>
        {state.success && <p className="mt-2 text-sm font-semibold text-green">{state.success}</p>}
        {state.error && <p className="mt-2 text-sm font-medium text-red">{state.error}</p>}
      </div>
    </form>
  );
}
