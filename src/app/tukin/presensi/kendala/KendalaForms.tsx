"use client";

import { useActionState, useState } from "react";
import { SearchableSelect } from "../../../SearchableSelect";
import { tandaiKendalaAction, cabutKendalaAction, type KendalaFormState } from "./actions";

const AWAL: KendalaFormState = {};

export function TandaiKendalaForm({
  daftarSatker,
  tanggalDisarankan,
}: {
  daftarSatker: string[];
  /** Tanggal hasil deteksi - dipakai sebagai isian awal supaya tidak perlu diketik ulang. */
  tanggalDisarankan?: string;
}) {
  const [state, formAction, pending] = useActionState(tandaiKendalaAction, AWAL);

  return (
    <form action={formAction} className="card p-4">
      <p className="text-sm font-bold text-ink">Tandai tanggal kendala e-Presensi</p>
      <p className="mt-0.5 text-xs text-muted">
        Dasar: Pasal 10 ayat (2) Permenaker 15/2024. Potongan &quot;tidak melakukan presensi&quot; (Pasal 13 ayat 2) di
        tanggal ini tidak akan diterapkan. Keterlambatan dan ketidakhadiran <strong>tetap</strong> dihitung.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">Tanggal</span>
          <input
            type="date"
            name="tanggal"
            required
            defaultValue={tanggalDisarankan}
            className="field-input w-full"
          />
        </label>
        <label className="block">
          <span className="field-label">Cakupan</span>
          <SearchableSelect
            name="satuanKerja"
            options={[
              { value: "", label: "Seluruh kementerian", keterangan: "dipakai kalau e-Presensi mati untuk semua" },
              ...daftarSatker.map((s) => ({ value: s, label: s })),
            ]}
            defaultValue=""
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="field-label">Alasan (wajib)</span>
        <textarea
          name="alasan"
          required
          minLength={10}
          rows={2}
          placeholder="Contoh: web e-Presensi tidak bisa diakses sejak siang, pegawai melapor ke PPABP dengan foto bergeotag."
          className="field-input w-full"
        />
        <span className="mt-1 block text-xs text-muted">
          Ini yang dibaca kalau suatu saat ditanya kenapa potongan sehari hilang untuk banyak orang.
        </span>
      </label>

      <button type="submit" disabled={pending} className="btn btn-primary mt-3">
        {pending ? "Menyimpan..." : "Tandai tanggal ini"}
      </button>

      {state.error && <p className="mt-3 text-sm font-medium text-red">{state.error}</p>}
      {state.sukses && <p className="mt-3 text-sm font-semibold text-green">{state.sukses}</p>}
    </form>
  );
}

export function CabutKendalaForm({ id, tanggal }: { id: string; tanggal: string }) {
  const [state, formAction, pending] = useActionState(cabutKendalaAction, AWAL);
  // Konfirmasi dua langkah, bukan confirm() bawaan browser - dialog itu tidak
  // bisa menyebut tanggal mana yang dicabut, padahal justru itu yang perlu
  // dibaca sebelum menekan.
  const [yakin, setYakin] = useState(false);

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="id" value={id} />
      {!yakin ? (
        <button type="button" onClick={() => setYakin(true)} className="btn btn-ghost text-xs">
          Cabut
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-xs text-ink-2">Cabut penanda {tanggal}?</span>
          <button type="submit" disabled={pending} className="btn btn-danger text-xs">
            {pending ? "..." : "Ya, cabut"}
          </button>
          <button type="button" onClick={() => setYakin(false)} className="btn btn-ghost text-xs">
            Batal
          </button>
        </span>
      )}
      {state.error && <span className="ml-2 text-xs font-medium text-red">{state.error}</span>}
      {state.sukses && <span className="ml-2 text-xs font-semibold text-green">{state.sukses}</span>}
    </form>
  );
}
