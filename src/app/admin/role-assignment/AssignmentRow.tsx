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
  // Role TAMBAHAN - akun bisa ganti-ganti sudut pandang lewat menu di tombol
  // akun (sidebar). Disimpan di state supaya field "Satuan kerja" bisa ikut
  // muncul begitu Kasubag TU dicentang sebagai role tambahan.
  const [rolesTambahan, setRolesTambahan] = useState<Role[]>(user.rolesTambahan ?? []);

  const toggleRoleTambahan = (r: Role) =>
    setRolesTambahan((sebelum) => (sebelum.includes(r) ? sebelum.filter((x) => x !== r) : [...sebelum, r]));

  // Satu akun cuma punya SATU satuanKerja (lihat model User) - jadi field ini
  // relevan begitu KASUBAG_TU ada di role utama ATAU role tambahan.
  const butuhSatuanKerja = role === "KASUBAG_TU" || rolesTambahan.includes("KASUBAG_TU");

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
        {butuhSatuanKerja && (
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

      <div className="mt-3 rounded-lg bg-surface-2 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
          Role tambahan (buat testing)
        </p>
        <p className="mt-0.5 text-[11px] text-muted">
          Akun bisa ganti sudut pandang sendiri lewat tombol akun di sidebar - tanpa logout. Role utama di atas tetap
          jadi role default waktu login.
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
          {SEMUA_ROLE.filter((r) => r !== role).map((r) => (
            <label key={r} className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
              <input
                type="checkbox"
                name="rolesTambahan"
                value={r}
                checked={rolesTambahan.includes(r)}
                onChange={() => toggleRoleTambahan(r)}
                className="size-4"
              />
              {LABEL_ROLE[r]}
            </label>
          ))}
        </div>
      </div>

      {state.success && <p className="mt-2 text-xs font-semibold text-green">{state.success}</p>}
      {state.error && <p className="mt-2 text-xs font-medium text-red">{state.error}</p>}
    </form>
  );
}
