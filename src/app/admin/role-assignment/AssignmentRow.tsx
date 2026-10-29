"use client";

import { useActionState, useState } from "react";
import type { Role, User } from "@prisma/client";
import { ubahAssignmentRoleAction, type UbahAssignmentRoleFormState } from "./actions";
import { LABEL_ROLE, labelRole } from "../../../auth/roleLabel";
import { SearchableSelect } from "../../../components/forms/SearchableSelect";

const INITIAL_STATE: UbahAssignmentRoleFormState = {};
const SEMUA_ROLE: Role[] = ["PEGAWAI", "KASUBAG_TU", "OSDMA", "PPABP", "PIMPINAN", "ADMIN"];

export function AssignmentRow({
  user,
  satuanKerjaList,
  satuanKerjaPegawai,
}: {
  user: User;
  satuanKerjaList: string[];
  /** Satuan kerja di data Pegawai - dipakai sebagai default kalau unit akunnya masih kosong. */
  satuanKerjaPegawai: string | null;
}) {
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
  const unitKosong = butuhSatuanKerja && !user.satuanKerja;
  const tambahanTerpilih = rolesTambahan.filter((r) => r !== role);
  const unitLabel = user.satuanKerja ?? satuanKerjaPegawai;

  return (
    <form action={formAction} className="p-4 sm:p-5">
      <input type="hidden" name="targetUserId" value={user.id} />

      {/* Identitas akun + keadaan role saat ini */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{user.nama}</p>
          <p className="font-mono text-xs text-muted">{user.nip}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="chip chip-navy text-[11px] font-semibold">{labelRole(user.role, user.satuanKerja)}</span>
          {(user.rolesTambahan ?? []).map((r) => (
            <span key={r} className="chip chip-draft text-[11px]">
              + {labelRole(r, user.satuanKerja)}
            </span>
          ))}
          {!user.aktif && <span className="chip chip-danger text-[11px]">Nonaktif</span>}
        </div>
      </div>

      {/* Ubah */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-44">
          <label className="field-label">Role utama</label>
          <SearchableSelect
            name="role"
            options={SEMUA_ROLE.map((r) => ({ value: r, label: LABEL_ROLE[r] }))}
            defaultValue={user.role}
            onValueChange={(v) => setRole(v as Role)}
            required
          />
        </div>
        {butuhSatuanKerja && (
          <div className="w-full sm:w-72">
            <label className="field-label">Satuan kerja</label>
            <SearchableSelect
              name="satuanKerja"
              options={satuanKerjaList.map((s) => ({ value: s, label: s }))}
              // Kalau unit akun masih kosong, prefill dari satuan kerja data
              // pegawainya - tebakan paling masuk akal, tetap bisa diganti.
              defaultValue={user.satuanKerja ?? satuanKerjaPegawai ?? ""}
              placeholder="Pilih satuan kerja..."
              required
            />
          </div>
        )}
        <label className="flex h-10 items-center gap-2 text-sm font-semibold text-ink-2">
          <input type="checkbox" name="aktif" defaultChecked={user.aktif} className="size-4" />
          Akun aktif
        </label>
        <button type="submit" disabled={pending} className="btn btn-primary h-10 py-0 sm:ml-auto">
          {pending ? "Menyimpan..." : "Simpan"}
        </button>
      </div>

      {unitKosong && (
        <p className="mt-3 border-l-2 border-gold bg-gold-tint/40 py-1.5 pl-3 pr-2 text-xs font-semibold text-gold-deep">
          Kasubag TU tanpa unit - semua halaman unit tampil kosong untuknya. Pilih satuan kerja lalu Simpan.
        </p>
      )}

      {/* Role tambahan dilipat: jarang diubah, dan delapan centang terbuka di
          tiap baris membuat daftar sulit disapu. Centangnya tetap di DOM, jadi
          ikut terkirim walau terlipat. */}
      <details className="group mt-3 rounded-xl bg-surface-2 px-3 py-2">
        <summary className="cursor-pointer list-none text-xs font-semibold text-ink-2 marker:hidden [&::-webkit-details-marker]:hidden">
          <span className="mr-1 inline-block transition group-open:rotate-90">›</span>
          Role tambahan
          {tambahanTerpilih.length > 0 ? (
            <span className="ml-1 font-mono text-muted">({tambahanTerpilih.length} dipilih)</span>
          ) : (
            <span className="ml-1 text-muted">(tidak ada)</span>
          )}
        </summary>
        <p className="mt-2 text-[11px] text-muted">
          Pemilik akun bisa berpindah sudut pandang lewat tombol akun di sidebar tanpa logout. Role utama tetap jadi
          bawaan saat login.
        </p>
        <div className="mt-2 flex flex-wrap gap-2 pb-1">
          {SEMUA_ROLE.filter((r) => r !== role).map((r) => {
            const dipilih = rolesTambahan.includes(r);
            return (
              <label
                key={r}
                className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-biru ${
                  dipilih ? "border-navy bg-navy text-white" : "border-line bg-surface text-ink-2 hover:border-biru"
                }`}
              >
                <input
                  type="checkbox"
                  name="rolesTambahan"
                  value={r}
                  checked={dipilih}
                  onChange={() => toggleRoleTambahan(r)}
                  className="sr-only"
                />
                {labelRole(r, unitLabel)}
              </label>
            );
          })}
        </div>
      </details>

      {state.success && <p className="mt-3 text-xs font-semibold text-green">{state.success}</p>}
      {state.error && <p className="mt-3 text-xs font-medium text-red">{state.error}</p>}
    </form>
  );
}
