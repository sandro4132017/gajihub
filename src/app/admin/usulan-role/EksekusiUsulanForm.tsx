"use client";

import { useActionState } from "react";
import { eksekusiUsulanRoleAction, type EksekusiUsulanFormState } from "./actions";
import { SearchableSelect } from "../../SearchableSelect";

const INITIAL_STATE: EksekusiUsulanFormState = {};

export function EksekusiUsulanForm({
  usulanId,
  butuhSatuanKerja,
  satuanKerjaList,
  satuanKerjaDefault,
}: {
  usulanId: string;
  /** true kalau role yang diusulkan KASUBAG_TU - unit akun WAJIB diisi. */
  butuhSatuanKerja: boolean;
  satuanKerjaList: string[];
  /** Prefill: unit akun sekarang, atau kalau kosong unit data pegawainya. */
  satuanKerjaDefault: string;
}) {
  const [state, formAction, pending] = useActionState(eksekusiUsulanRoleAction, INITIAL_STATE);

  if (state.success) {
    return <p className="mt-3 text-xs font-semibold text-green">{state.success}</p>;
  }

  return (
    <form action={formAction} className="mt-3 border-t border-line-2 pt-3">
      <input type="hidden" name="usulanId" value={usulanId} />

      {/* Ini yang dulu bikin akun "buta unit": eksekusi mengubah role jadi
          Kasubag TU tanpa pernah mengisi User.satuanKerja, jadi akunnya
          langsung tidak bisa lihat unit manapun. Sekarang unitnya diminta
          di sini juga (default: unit data pegawainya sendiri). */}
      {butuhSatuanKerja && (
        <div className="mb-3 max-w-md">
          <label className="field-label">Unit kerja untuk akun ini (wajib buat Kasubag TU)</label>
          <SearchableSelect
            name="satuanKerja"
            options={satuanKerjaList.map((s) => ({ value: s, label: s }))}
            defaultValue={satuanKerjaDefault}
            required
          />
          <p className="mt-1 text-[11px] text-muted">
            Tanpa unit, akun ber-role Kasubag TU tidak bisa melihat data apa pun.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" name="keputusan" value="EKSEKUSI" disabled={pending} className="btn btn-primary btn-sm">
          Eksekusi
        </button>
        <button type="submit" name="keputusan" value="TOLAK" disabled={pending} className="btn btn-danger btn-sm">
          Tolak
        </button>
        {state.error && <p className="text-sm font-medium text-red">{state.error}</p>}
      </div>
    </form>
  );
}
