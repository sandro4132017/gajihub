"use client";

import { useActionState, useState } from "react";
import { hapusPredikatPeriodeAction, type KelolaPredikatFormState } from "./actionsKelola";

const INITIAL_STATE: KelolaPredikatFormState = {};

/**
 * Hapus seluruh predikat satu satuan kerja pada satu periode, buat mengganti
 * file rekap yang salah.
 *
 * Konfirmasi DUA LANGKAH dan menyebut angka & nama unitnya - bukan
 * `confirm()` bawaan browser, yang tidak bisa menampilkan konteks sebanyak ini
 * dan gampang di-klik refleks. Pola yang sama dipakai hapus per orang.
 */
export function HapusPeriodeForm({
  satuanKerja,
  periodeBulan,
  periodeTahun,
  namaPeriode,
  jumlahBaris,
}: {
  satuanKerja: string;
  periodeBulan: number;
  periodeTahun: number;
  namaPeriode: string;
  /** Jumlah yang sedang dilihat user - dikirim ulang & dicocokkan di server. */
  jumlahBaris: number;
}) {
  const [state, formAction, pending] = useActionState(hapusPredikatPeriodeAction, INITIAL_STATE);
  const [terbuka, setTerbuka] = useState(false);

  if (jumlahBaris === 0) return null;

  return (
    <div className="card mt-4 border-red-300 p-4 dark:border-red-900">
      <h2 className="text-sm font-bold text-ink">Ganti seluruh data periode ini</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Menghapus <span className="font-semibold text-ink-2">{jumlahBaris} predikat</span> milik{" "}
        <span className="font-semibold text-ink-2">{satuanKerja}</span> periode{" "}
        <span className="font-semibold text-ink-2">{namaPeriode}</span>, supaya bisa diupload ulang dari nol.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        <span className="font-semibold text-ink-2">Sering kali ini tidak perlu:</span> upload ulang otomatis menimpa
        nilai yang lama. Hapus dulu cuma kalau ada orang yang <em>hilang</em> dari file penggantinya - kalau tidak,
        baris lama mereka akan tertinggal dan ikut terhitung.
      </p>

      {!terbuka ? (
        <button
          type="button"
          onClick={() => setTerbuka(true)}
          className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
        >
          Hapus {jumlahBaris} predikat periode ini
        </button>
      ) : (
        <form action={formAction} className="mt-3 space-y-3">
          <input type="hidden" name="satuanKerja" value={satuanKerja} />
          <input type="hidden" name="periodeBulan" value={periodeBulan} />
          <input type="hidden" name="periodeTahun" value={periodeTahun} />
          <input type="hidden" name="jumlahDilihat" value={jumlahBaris} />

          <label className="flex items-start gap-2 rounded-lg bg-gold-tint p-3 text-xs text-ink-2">
            <input type="checkbox" name="konfirmasi" value="1" required className="mt-0.5 shrink-0" />
            <span>
              Saya paham <strong>{jumlahBaris} baris predikat {satuanKerja}</strong> periode{" "}
              <strong>{namaPeriode}</strong> akan dihapus. Kalkulasi Tukin yang sudah ada TIDAK ikut terhapus dan perlu
              dihitung ulang setelah file baru diupload.
            </span>
          </label>

          <input
            type="text"
            name="alasan"
            placeholder="Alasan (opsional, tercatat di audit trail)"
            className="field-input w-full text-sm"
          />

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className="btn btn-danger text-sm">
              {pending ? "Menghapus..." : `Ya, hapus ${jumlahBaris} predikat`}
            </button>
            <button
              type="button"
              onClick={() => setTerbuka(false)}
              className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm font-semibold text-ink-2"
            >
              Batal
            </button>
          </div>
        </form>
      )}

      {state.error && <p className="mt-3 text-sm font-medium text-red">{state.error}</p>}
      {state.success && <p className="mt-3 text-sm font-semibold text-green">{state.success}</p>}
    </div>
  );
}
