"use client";

import { useActionState, useState } from "react";
import { SearchableSelect } from "../../SearchableSelect";
import {
  ubahPredikatAction,
  hapusPredikatAction,
  type KelolaPredikatFormState,
} from "./actionsKelola";
import { LABEL_PREDIKAT, OPSI_PREDIKAT } from "./predikat";

const INITIAL: KelolaPredikatFormState = {};

/**
 * Tombol Ubah / Hapus untuk SATU baris predikat kinerja.
 *
 * Formnya sengaja inline (muncul di baris yang sama) daripada halaman edit
 * terpisah: yang diubah cuma satu field, dan Kasubag TU biasanya memperbaiki
 * beberapa orang sekaligus - bolak-balik halaman bakal lebih lambat.
 *
 * Hapus pakai konfirmasi dua langkah (klik Hapus -> muncul pertanyaan ->
 * klik Ya, hapus), BUKAN `confirm()` bawaan browser: dialog native tidak
 * bisa menampilkan konteks apa pun, sementara di sini penting terlihat nama
 * & periode mana yang akan hilang.
 */
export function AksiBarisPredikat({
  id,
  nama,
  periode,
  predikatSekarang,
  bolehUbah,
}: {
  id: string;
  nama: string;
  periode: string;
  predikatSekarang: string;
  bolehUbah: boolean;
}) {
  const [modeUbah, setModeUbah] = useState(false);
  const [modeHapus, setModeHapus] = useState(false);
  const [stateUbah, aksiUbah, sedangUbah] = useActionState(ubahPredikatAction, INITIAL);
  const [stateHapus, aksiHapus, sedangHapus] = useActionState(hapusPredikatAction, INITIAL);

  if (!bolehUbah) {
    return <span className="text-xs text-muted">Di luar kewenangan</span>;
  }

  return (
    <div className="min-w-[180px]">
      {!modeUbah && !modeHapus && (
        <div className="flex gap-2">
          <button type="button" onClick={() => setModeUbah(true)} className="btn btn-ghost btn-sm">
            Ubah
          </button>
          <button
            type="button"
            onClick={() => setModeHapus(true)}
            className="btn btn-ghost btn-sm text-red"
          >
            Hapus
          </button>
        </div>
      )}

      {modeUbah && (
        <form action={aksiUbah} className="space-y-2 rounded-lg border border-line bg-surface-2 p-2">
          <input type="hidden" name="id" value={id} />
          <div>
            <label className="field-label">Predikat baru</label>
            <SearchableSelect
              name="predikat"
              options={OPSI_PREDIKAT}
              defaultValue={predikatSekarang}
              required
              className="w-full"
            />
          </div>
          <div>
            <label className="field-label">Alasan koreksi (opsional)</label>
            <input
              type="text"
              name="alasan"
              className="field-input py-1 text-xs"
              placeholder="mis. salah baca file rekap"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={sedangUbah} className="btn btn-primary btn-sm">
              {sedangUbah ? "Menyimpan..." : "Simpan"}
            </button>
            <button type="button" onClick={() => setModeUbah(false)} className="btn btn-ghost btn-sm">
              Batal
            </button>
          </div>
        </form>
      )}

      {modeHapus && (
        <form action={aksiHapus} className="space-y-2 rounded-lg border border-line bg-surface-2 p-2">
          <input type="hidden" name="id" value={id} />
          <p className="text-xs text-ink-2">
            Hapus predikat <strong>{nama}</strong> periode {periode} (
            {LABEL_PREDIKAT[predikatSekarang] ?? predikatSekarang})?
          </p>
          <p className="text-xs text-muted">
            Setelah dihapus, pegawai ini akan dilewati saat kalkulasi Tukin periode tersebut.
          </p>
          <input
            type="text"
            name="alasan"
            className="field-input py-1 text-xs"
            placeholder="Alasan (opsional)"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={sedangHapus} className="btn btn-danger btn-sm">
              {sedangHapus ? "Menghapus..." : "Ya, hapus"}
            </button>
            <button type="button" onClick={() => setModeHapus(false)} className="btn btn-ghost btn-sm">
              Batal
            </button>
          </div>
        </form>
      )}

      {[stateUbah, stateHapus].map((s, i) =>
        s.error || s.success ? (
          <div key={i} className="mt-1 text-xs">
            {s.error && <p className="font-medium text-red">{s.error}</p>}
            {s.success && <p className="font-semibold text-green">{s.success}</p>}
            {s.peringatanHitungUlang && <p className="mt-0.5 text-gold-deep">{s.peringatanHitungUlang}</p>}
          </div>
        ) : null
      )}
    </div>
  );
}
