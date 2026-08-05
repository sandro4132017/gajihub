"use client";

import { useActionState, useState } from "react";
import { SearchableSelect } from "../../SearchableSelect";
import { tambahPredikatAction, type KelolaPredikatFormState } from "./actionsKelola";
import { OPSI_PREDIKAT } from "./predikat";

const INITIAL: KelolaPredikatFormState = {};

/**
 * Tambah predikat SATU pegawai yang terlewat dari file rekap.
 *
 * Daftar pegawainya SENGAJA cuma berisi yang BELUM punya predikat di periode
 * terpilih (dihitung di page.tsx). Kalau semua pegawai unit ikut masuk
 * daftar, orang gampang memilih yang sudah ada lalu ditolak action dengan
 * pesan "sudah punya predikat" - lebih baik pilihannya memang tidak ada.
 */
export function TambahPredikatForm({
  periodeBulan,
  periodeTahun,
  namaPeriode,
  pegawaiBelumPunya,
  totalBelumPunya,
  perluPilihSatker,
}: {
  periodeBulan: number;
  periodeTahun: number;
  namaPeriode: string;
  pegawaiBelumPunya: { value: string; label: string; keterangan: string }[];
  totalBelumPunya: number;
  perluPilihSatker: boolean;
}) {
  const [buka, setBuka] = useState(false);
  const [state, formAction, pending] = useActionState(tambahPredikatAction, INITIAL);

  return (
    <div className="card mt-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-ink">Tambah predikat satuan</p>
          <p className="text-xs text-muted">
            Buat pegawai yang terlewat dari file rekap {namaPeriode}. Tersimpan sebagai input manual dan tercatat di
            audit trail.
          </p>
        </div>
        <button type="button" onClick={() => setBuka(!buka)} className="btn btn-ghost btn-sm shrink-0">
          {buka ? "Tutup" : "Tambah data"}
        </button>
      </div>

      {buka && (
        <>
          {perluPilihSatker ? (
            <p className="mt-3 rounded-lg bg-surface-2 p-3 text-xs text-muted">
              Pilih <strong>satuan kerja</strong> dulu di filter di atas. Tanpa itu daftar pegawainya mencakup seluruh
              kementerian (±5.000 orang) dan tidak praktis dipilih satu per satu.
            </p>
          ) : pegawaiBelumPunya.length === 0 ? (
            <p className="mt-3 rounded-lg bg-surface-2 p-3 text-xs text-muted">
              Semua pegawai pada filter ini sudah punya predikat untuk {namaPeriode} - tidak ada yang perlu ditambahkan.
            </p>
          ) : (
            <form action={formAction} className="mt-3 flex flex-wrap items-end gap-3">
              <input type="hidden" name="periodeBulan" value={periodeBulan} />
              <input type="hidden" name="periodeTahun" value={periodeTahun} />
              <div className="min-w-[260px] flex-1">
                <label className="field-label">Pegawai (belum punya predikat {namaPeriode})</label>
                <SearchableSelect
                  name="pegawaiId"
                  options={pegawaiBelumPunya}
                  required
                  className="w-full"
                  placeholder="Ketik nama atau NIP..."
                />
              </div>
              <div className="min-w-[200px]">
                <label className="field-label">Predikat</label>
                <SearchableSelect name="predikat" options={OPSI_PREDIKAT} required className="w-full" />
              </div>
              <div className="min-w-[180px] flex-1">
                <label className="field-label">Alasan (opsional)</label>
                <input
                  type="text"
                  name="alasan"
                  className="field-input"
                  placeholder="mis. menyusul dari e-Kinerja"
                />
              </div>
              <button type="submit" disabled={pending} className="btn btn-primary">
                {pending ? "Menyimpan..." : "Simpan"}
              </button>
            </form>
          )}

          {!perluPilihSatker && pegawaiBelumPunya.length > 0 && totalBelumPunya > pegawaiBelumPunya.length && (
            <p className="mt-2 text-xs text-muted">
              Menampilkan {pegawaiBelumPunya.length} dari {totalBelumPunya} pegawai yang belum punya predikat - persempit
              dengan pencarian nama/NIP di filter kalau yang kamu cari tidak ada di daftar.
            </p>
          )}

          {state.error && <p className="mt-2 text-sm font-medium text-red">{state.error}</p>}
          {state.success && <p className="mt-2 text-sm font-semibold text-green">{state.success}</p>}
          {state.peringatanHitungUlang && (
            <p className="mt-1 text-xs text-gold-deep">{state.peringatanHitungUlang}</p>
          )}
        </>
      )}
    </div>
  );
}
