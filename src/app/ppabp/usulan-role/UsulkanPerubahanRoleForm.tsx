"use client";

import { useActionState } from "react";
import type { Role } from "@prisma/client";
import { usulkanPerubahanRoleAction, type UsulkanPerubahanRoleFormState } from "./actions";
import { LABEL_ROLE } from "../../../auth/roleLabel";

const INITIAL_STATE: UsulkanPerubahanRoleFormState = {};
const SEMUA_ROLE: Role[] = ["PEGAWAI", "KASUBAG_TU", "OSDMA", "PPABP", "PIMPINAN", "ADMIN"];

export function UsulkanPerubahanRoleForm({ userList }: { userList: { id: string; nama: string; nip: string; role: Role }[] }) {
  const [state, formAction, pending] = useActionState(usulkanPerubahanRoleAction, INITIAL_STATE);

  return (
    <form action={formAction} className="card mt-4 grid gap-3 p-4 sm:grid-cols-2">
      <div>
        <label className="field-label">Akun</label>
        <select name="targetUserId" required className="field-input">
          <option value="">Pilih akun...</option>
          {userList.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nama} - {u.nip} (saat ini: {LABEL_ROLE[u.role]})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label">Role diusulkan</label>
        <select name="roleDiusulkan" required className="field-input">
          <option value="">Pilih role...</option>
          {SEMUA_ROLE.map((r) => (
            <option key={r} value={r}>
              {LABEL_ROLE[r]}
            </option>
          ))}
        </select>
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
