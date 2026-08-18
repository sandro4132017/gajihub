"use client";

import { useActionState, useState } from "react";
import {
  koreksiJamPresensiAction,
  hapusKoreksiJamAction,
  type KoreksiJamFormState,
} from "./actionsKoreksi";

const AWAL: KoreksiJamFormState = {};

export interface KoreksiTersimpan {
  id: string;
  jamMasuk: string | null;
  jamKeluar: string | null;
  alasan: string;
  olehNama: string;
}

/**
 * Form koreksi jam untuk SATU hari, dilipat di dalam sel tabel.
 *
 * Sengaja per-baris dan tertutup secara bawaan: koreksi jam adalah
 * pengecualian, bukan cara kerja sehari-hari, jadi tidak boleh terlihat
 * seperti kolom isian biasa.
 */
export function KoreksiJamForm({
  nip,
  tanggalIso,
  jamMasukAsli,
  jamKeluarAsli,
  koreksi,
}: {
  nip: string;
  tanggalIso: string;
  jamMasukAsli: string;
  jamKeluarAsli: string;
  koreksi: KoreksiTersimpan | null;
}) {
  const [state, formAction, pending] = useActionState(koreksiJamPresensiAction, AWAL);
  const [hapusState, hapusAction, hapusPending] = useActionState(hapusKoreksiJamAction, AWAL);
  const [buka, setBuka] = useState(false);

  return (
    <div>
      {koreksi && (
        <div className="mb-1.5 rounded-md border border-teal-deep/30 bg-teal-tint px-2 py-1.5 text-xs text-ink-2">
          <p className="font-semibold text-ink">
            Dikoreksi manual: masuk {koreksi.jamMasuk ?? "tetap"}, pulang {koreksi.jamKeluar ?? "tetap"}
          </p>
          <p className="mt-0.5">{koreksi.alasan}</p>
          <p className="mt-0.5 text-muted">oleh {koreksi.olehNama}</p>
          <form action={hapusAction} className="mt-1">
            <input type="hidden" name="id" value={koreksi.id} />
            <button type="submit" disabled={hapusPending} className="link text-xs">
              {hapusPending ? "Menghapus..." : "Hapus koreksi"}
            </button>
          </form>
          {hapusState.error && <p className="mt-1 font-medium text-red">{hapusState.error}</p>}
          {hapusState.sukses && <p className="mt-1 font-semibold text-green">{hapusState.sukses}</p>}
        </div>
      )}

      {!buka ? (
        <button type="button" onClick={() => setBuka(true)} className="link text-xs">
          {koreksi ? "Ubah koreksi" : "Koreksi jam"}
        </button>
      ) : (
        <form action={formAction} className="rounded-md border border-line bg-surface-2 p-2">
          <input type="hidden" name="nip" value={nip} />
          <input type="hidden" name="tanggal" value={tanggalIso} />
          <p className="text-xs text-muted">
            e-Presensi mencatat masuk <strong>{jamMasukAsli}</strong>, pulang <strong>{jamKeluarAsli}</strong>.
            Kosongkan kolom yang tidak perlu diubah.
          </p>
          <div className="mt-1.5 flex gap-2">
            <label className="flex-1">
              <span className="field-label">Jam masuk</span>
              <input
                type="time"
                name="jamMasuk"
                defaultValue={koreksi?.jamMasuk ?? ""}
                className="field-input w-full text-xs"
              />
            </label>
            <label className="flex-1">
              <span className="field-label">Jam pulang</span>
              <input
                type="time"
                name="jamKeluar"
                defaultValue={koreksi?.jamKeluar ?? ""}
                className="field-input w-full text-xs"
              />
            </label>
          </div>
          <label className="mt-1.5 block">
            <span className="field-label">Dasar koreksi (wajib)</span>
            <input
              type="text"
              name="alasan"
              required
              minLength={10}
              defaultValue={koreksi?.alasan ?? ""}
              placeholder="Lapor via WhatsApp + foto bergeotag pukul 07.15"
              className="field-input w-full text-xs"
            />
          </label>
          <div className="mt-1.5 flex gap-2">
            <button type="submit" disabled={pending} className="btn btn-primary text-xs">
              {pending ? "Menyimpan..." : "Simpan"}
            </button>
            <button type="button" onClick={() => setBuka(false)} className="btn btn-ghost text-xs">
              Batal
            </button>
          </div>
          {state.error && <p className="mt-1.5 text-xs font-medium text-red">{state.error}</p>}
          {state.sukses && <p className="mt-1.5 text-xs font-semibold text-green">{state.sukses}</p>}
        </form>
      )}
    </div>
  );
}
