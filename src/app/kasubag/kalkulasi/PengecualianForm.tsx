"use client";

import { useActionState, useState } from "react";
import {
  tandaiPengecualianAction,
  batalkanPengecualianAction,
  type PengecualianFormState,
} from "./actionsPengecualian";
import { ALASAN_PENGECUALIAN, KODE_LAINNYA } from "../../../business-logic/pengecualianPegawai";

const INITIAL_STATE: PengecualianFormState = {};

/**
 * Menandai satu pegawai tidak ikut dihitung pada periode ini.
 *
 * Tersembunyi di balik <details>: sebagian besar pegawai tidak perlu ini, dan
 * tombol "kecualikan" yang selalu terbuka di sebelah tiap nama mengundang
 * dipakai sebagai jalan pintas menghilangkan orang yang datanya cuma belum
 * lengkap.
 */
export function PengecualianForm({
  pegawaiId,
  nama,
  periodeBulan,
  periodeTahun,
  petunjuk,
}: {
  pegawaiId: string;
  nama: string;
  periodeBulan: number;
  periodeTahun: number;
  /** Kalimat petunjuk dari data kehadiran - null kalau tidak ada yang menonjol. */
  petunjuk: string | null;
}) {
  const [state, formAction, pending] = useActionState(tandaiPengecualianAction, INITIAL_STATE);
  const [kode, setKode] = useState("");

  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-[11px] font-semibold text-biru hover:underline">
        Kecualikan {nama} dari periode ini
      </summary>

      {petunjuk && <p className="mt-1.5 text-[11px] font-medium text-gold-deep">{petunjuk}</p>}

      <form action={formAction} className="mt-1.5 space-y-2">
        <input type="hidden" name="pegawaiId" value={pegawaiId} />
        <input type="hidden" name="periodeBulan" value={periodeBulan} />
        <input type="hidden" name="periodeTahun" value={periodeTahun} />

        <select
          name="alasanKode"
          required
          value={kode}
          onChange={(e) => setKode(e.target.value)}
          className="field-input w-full max-w-md py-1 text-xs"
        >
          <option value="">- pilih alasan -</option>
          {ALASAN_PENGECUALIAN.map((a) => (
            <option key={a.kode} value={a.kode}>
              {a.label}
            </option>
          ))}
        </select>

        {kode !== "" && (
          <p className="text-[11px] text-muted">
            {ALASAN_PENGECUALIAN.find((a) => a.kode === kode)?.keterangan}
          </p>
        )}

        {/* Kolom penjelasan HANYA muncul untuk "Lainnya" - kalau selalu ada,
            orang mengetik "sudah pindah" di sebelah pilihan yang sudah
            berbunyi "Mutasi keluar", dan isinya berhenti dibaca justru waktu
            ia benar-benar penting. */}
        {kode === KODE_LAINNYA && (
          <input
            name="penjelasan"
            required
            minLength={10}
            placeholder="Jelaskan alasannya"
            className="field-input w-full max-w-md py-1 text-xs"
          />
        )}

        <button type="submit" disabled={pending || kode === ""} className="btn btn-ghost btn-sm">
          {pending ? "Menyimpan..." : "Kecualikan"}
        </button>
        <p className="text-[11px] text-muted">
          Kalkulasi yang sudah ada untuk periode ini ikut dihapus.
        </p>
      </form>

      {state.success && <p className="mt-1 text-[11px] font-semibold text-green">{state.success}</p>}
      {state.error && <p className="mt-1 text-[11px] font-medium text-red">{state.error}</p>}
    </details>
  );
}

/** Membatalkan pengecualian - dipakai di daftar orang yang sedang dikecualikan. */
export function BatalPengecualianForm({
  pegawaiId,
  periodeBulan,
  periodeTahun,
}: {
  pegawaiId: string;
  periodeBulan: number;
  periodeTahun: number;
}) {
  const [state, formAction, pending] = useActionState(batalkanPengecualianAction, INITIAL_STATE);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="pegawaiId" value={pegawaiId} />
      <input type="hidden" name="periodeBulan" value={periodeBulan} />
      <input type="hidden" name="periodeTahun" value={periodeTahun} />
      <button type="submit" disabled={pending} className="text-[11px] font-semibold text-biru hover:underline">
        {pending ? "..." : "Batalkan"}
      </button>
      {state.error && <span className="ml-2 text-[11px] font-medium text-red">{state.error}</span>}
    </form>
  );
}
