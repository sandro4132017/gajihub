"use client";

import { useActionState, useState } from "react";
import type { Role, User } from "@prisma/client";
import { ubahAssignmentRoleAction, type UbahAssignmentRoleFormState } from "./actions";
import { LABEL_ROLE } from "../../../auth/roleLabel";

const INITIAL_STATE: UbahAssignmentRoleFormState = {};
const SEMUA_ROLE: Role[] = ["PEGAWAI", "KASUBAG_TU", "OSDMA", "PPABP", "PIMPINAN", "ADMIN"];

export function AssignmentRow({ user }: { user: User }) {
  const [state, formAction, pending] = useActionState(ubahAssignmentRoleAction, INITIAL_STATE);
  const [role, setRole] = useState<Role>(user.role);

  return (
    <form action={formAction} className="border-b border-line-2 p-4">
      <input type="hidden" name="targetUserId" value={user.id} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[180px] flex-1">
          <p className="font-semibold text-ink">{user.nama}</p>
          <p className="text-xs text-muted">NIP {user.nip}</p>
        </div>
        <select
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="field-input w-auto py-1.5"
        >
          {SEMUA_ROLE.map((r) => (
            <option key={r} value={r}>
              {LABEL_ROLE[r]}
            </option>
          ))}
        </select>
        {role === "KASUBAG_TU" && (
          <input name="satuanKerja" defaultValue={user.satuanKerja ?? ""} placeholder="Satuan kerja" className="field-input w-auto py-1.5" />
        )}
        <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
          <input type="checkbox" name="aktif" defaultChecked={user.aktif} className="size-4" />
          Aktif
        </label>
        <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
          {pending ? "..." : "Simpan"}
        </button>
      </div>
      {state.success && <p className="mt-2 text-xs font-semibold text-green">{state.success}</p>}
      {state.error && <p className="mt-2 text-xs font-medium text-red">{state.error}</p>}
    </form>
  );
}
