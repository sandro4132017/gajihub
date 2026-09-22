"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { tglTampil } from "../../../tanggalTampil";
import {
  koreksiJamPresensiAction,
  hapusKoreksiJamAction,
  type KoreksiJamFormState,
} from "./actionsKoreksi";

const AWAL: KoreksiJamFormState = {};

function AjakanTerapkan({
  pesan,
  tanggalIso,
}: {
  pesan: string;
  tanggalIso: string;
}) {
  const tahun = tanggalIso.slice(0, 4);
  const bulan = Number(tanggalIso.slice(5, 7));
  return (
    <div className="mt-1.5 rounded-md border border-gold bg-gold-tint p-2">
      <p className="text-xs font-semibold text-ink">{pesan}</p>
      <a
        href={`/tukin/presensi?bulan=${bulan}&tahun=${tahun}`}
        className="btn btn-secondary btn-sm mt-1.5 text-xs"
      >
        Terapkan koreksi &rarr;
      </a>
    </div>
  );
}

export interface KoreksiTersimpan {
  id: string;
  jamMasuk: string | null;
  jamKeluar: string | null;
  alasan: string;
  olehNama: string;
}

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
  const [state, formAction, pending] = useActionState(
    koreksiJamPresensiAction,
    AWAL,
  );
  const [hapusState, hapusAction, hapusPending] = useActionState(
    hapusKoreksiJamAction,
    AWAL,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [buka, setBuka] = useState(false);

  useEffect(() => {
    if (!buka) return;
    const sebelumnya = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = sebelumnya;
    };
  }, [buka]);

  return (
    <div>
      {/* Di dalam sel cukup penanda sebaris. Rinciannya - jam, alasan, siapa
          yang mengoreksi - ada di dialognya, sekali klik. */}
      {koreksi && (
        <span
          className="mb-1 block text-[11px] font-semibold text-teal-deep"
          title={`Masuk ${koreksi.jamMasuk ?? "tetap"}, pulang ${koreksi.jamKeluar ?? "tetap"} - ${koreksi.alasan} (oleh ${koreksi.olehNama})`}
        >
          Dikoreksi manual
        </span>
      )}

      <button
        type="button"
        onClick={() => {
          dialogRef.current?.showModal();
          setBuka(true);
        }}
        className="link text-xs"
      >
        {koreksi ? "Ubah koreksi" : "Koreksi jam"}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setBuka(false)}
        className="fixed top-1/2 right-4 left-auto m-0 max-h-[85vh] w-[min(30rem,92vw)] -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-left shadow-[0_12px_40px_rgba(19,65,107,0.18)] backdrop:bg-navy/40"
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-3 border-b border-line-2 pb-3">
            <div>
              <h2 className="text-sm font-bold text-ink">
                Koreksi jam presensi
              </h2>
              <p className="text-xs text-muted">{tglTampil(tanggalIso)}</p>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Tutup"
              className="rounded-lg px-2 py-1 text-lg leading-none text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              &times;
            </button>
          </div>

          {koreksi && (
            <div className="mt-3 rounded-lg border border-teal-deep/30 bg-teal-tint px-3 py-2 text-xs text-ink-2">
              <p className="font-semibold text-ink">
                Koreksi tersimpan: masuk {koreksi.jamMasuk ?? "tetap"}, pulang{" "}
                {koreksi.jamKeluar ?? "tetap"}
              </p>
              <p className="mt-0.5">{koreksi.alasan}</p>
              <p className="mt-0.5 text-muted">oleh {koreksi.olehNama}</p>
              <form action={hapusAction} className="mt-1.5">
                <input type="hidden" name="id" value={koreksi.id} />
                <button
                  type="submit"
                  disabled={hapusPending}
                  className="link text-xs"
                >
                  {hapusPending ? "Menghapus..." : "Hapus koreksi"}
                </button>
              </form>
              {hapusState.error && (
                <p className="mt-1 font-medium text-red">{hapusState.error}</p>
              )}
              {hapusState.sukses && (
                <AjakanTerapkan
                  pesan={hapusState.sukses}
                  tanggalIso={tanggalIso}
                />
              )}
            </div>
          )}

          <form action={formAction} className="mt-3">
            <input type="hidden" name="nip" value={nip} />
            <input type="hidden" name="tanggal" value={tanggalIso} />
            <p className="text-xs text-muted">
              e-Presensi mencatat masuk <strong>{jamMasukAsli}</strong>, pulang{" "}
              <strong>{jamKeluarAsli}</strong>. Kosongkan kolom yang tidak perlu
              diubah.
            </p>
            <div className="mt-2 flex gap-2">
              <label className="flex-1">
                <span className="field-label">Jam masuk</span>
                <input
                  type="time"
                  name="jamMasuk"
                  defaultValue={koreksi?.jamMasuk ?? ""}
                  className="field-input w-full text-sm"
                />
              </label>
              <label className="flex-1">
                <span className="field-label">Jam pulang</span>
                <input
                  type="time"
                  name="jamKeluar"
                  defaultValue={koreksi?.jamKeluar ?? ""}
                  className="field-input w-full text-sm"
                />
              </label>
            </div>
            <label className="mt-2 block">
              <span className="field-label">Dasar koreksi (wajib)</span>
              <input
                type="text"
                name="alasan"
                required
                minLength={10}
                defaultValue={koreksi?.alasan ?? ""}
                placeholder="Link Google Drive"
                className="field-input w-full text-sm"
              />
            </label>
            <div className="mt-3 flex gap-2">
              <button
                type="submit"
                disabled={pending}
                className="btn btn-primary text-sm"
              >
                {pending ? "Menyimpan..." : "Simpan"}
              </button>
              {/* type="button", BUKAN formmethod="dialog": tombol submit apa pun
                  di dalam form ini ikut mengirimkannya. */}
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="btn btn-ghost text-sm"
              >
                Batal
              </button>
            </div>
            {state.error && (
              <p className="mt-2 text-xs font-medium text-red">{state.error}</p>
            )}
            {/* Dialognya SENGAJA tidak menutup sendiri sesudah tersimpan -
                ajakan "Terapkan koreksi" muncul di sini, dan menutup paksa
                berarti membuangnya sebelum sempat dibaca. */}
            {state.sukses && (
              <AjakanTerapkan pesan={state.sukses} tanggalIso={tanggalIso} />
            )}
          </form>
        </div>
      </dialog>
    </div>
  );
}
