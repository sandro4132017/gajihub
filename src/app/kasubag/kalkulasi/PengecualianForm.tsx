"use client";

import { useActionState, useState, type ReactNode } from "react";
import { RiCheckboxCircleLine, RiErrorWarningLine } from "react-icons/ri";
import {
  tandaiPengecualianAction,
  batalkanPengecualianAction,
  type PengecualianFormState,
} from "./actionsPengecualian";
import { ALASAN_PENGECUALIAN, KODE_LAINNYA } from "../../../business-logic/pengecualianPegawai";

const INITIAL_STATE: PengecualianFormState = {};

export interface KandidatLaci {
  id: string;
  nama: string;
  nip: string;
  /** Label temuan anomali (mis. "Predikat kinerja belum ada"). */
  temuan: readonly string[];
  /** Kalimat petunjuk dari data kehadiran - null kalau tidak ada yang menonjol. */
  petunjuk: string | null;
}

export interface DikecualikanLaci {
  pegawaiId: string;
  nama: string;
  nip: string;
  alasanKode: string;
  alasan: string;
  penjelasan: string | null;
}

const LABEL = "block text-xs font-medium text-ink-2";
const KOLOM = "field-input mt-1.5 w-full py-2 text-sm";
const TOMBOL_UTAMA =
  "inline-flex items-center justify-center rounded-lg bg-navy px-4 py-2.5 text-sm font-bold text-white transition hover:bg-navy-deep disabled:cursor-not-allowed disabled:opacity-45";
const TOMBOL_KEDUA =
  "inline-flex items-center justify-center rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-bold text-ink transition hover:border-muted disabled:cursor-not-allowed disabled:opacity-45";

function KepalaKartu({ nama, nip, coret, chip }: { nama: string; nip: string; coret?: boolean; chip: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className={`text-sm font-bold ${coret ? "text-muted line-through" : "text-ink"}`}>{nama}</p>
        <p className="mt-0.5 font-mono text-[11px] text-muted">{nip}</p>
      </div>
      {chip}
    </div>
  );
}

function Pesan({ state }: { state: PengecualianFormState }) {
  if (state.error) return <p className="mt-2 text-xs font-medium text-red">{state.error}</p>;
  if (state.success) return <p className="mt-2 text-xs font-semibold text-green">{state.success}</p>;
  return null;
}

/**
 * Kartu satu pegawai yang BELUM dikecualikan: temuan anomalinya, pilihan
 * alasan, dan tombol "Kecualikan Pegawai". Tersimpan begitu tombol ditekan.
 */
export function KartuKandidat({
  kandidat,
  periodeBulan,
  periodeTahun,
}: {
  kandidat: KandidatLaci;
  periodeBulan: number;
  periodeTahun: number;
}) {
  const [state, formAction, pending] = useActionState(tandaiPengecualianAction, INITIAL_STATE);
  const [kode, setKode] = useState("");
  const lainnya = kode === KODE_LAINNYA;

  const tombol = (
    <button type="submit" disabled={pending || kode === ""} className={TOMBOL_UTAMA}>
      {pending ? "Menyimpan..." : "Kecualikan Pegawai"}
    </button>
  );

  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <KepalaKartu
        nama={kandidat.nama}
        nip={kandidat.nip}
        chip={
          <span className="shrink-0 rounded-full bg-gold-tint px-2.5 py-1 text-[11px] font-semibold text-gold-deep">
            Belum Dikecualikan
          </span>
        }
      />

      {kandidat.temuan.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {kandidat.temuan.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red/25 bg-red-tint px-2.5 py-1 text-xs font-medium text-red"
            >
              <RiErrorWarningLine aria-hidden className="size-3.5 shrink-0" />
              {t}
            </span>
          ))}
        </div>
      )}
      {kandidat.petunjuk && <p className="mt-2 text-[11px] font-medium text-gold-deep">{kandidat.petunjuk}</p>}

      <form action={formAction} className="mt-4">
        <input type="hidden" name="pegawaiId" value={kandidat.id} />
        <input type="hidden" name="periodeBulan" value={periodeBulan} />
        <input type="hidden" name="periodeTahun" value={periodeTahun} />

        <div className="grid items-end gap-3 sm:grid-cols-2">
          <label className={LABEL}>
            Alasan Pengecualian:
            <select
              name="alasanKode"
              required
              value={kode}
              onChange={(e) => setKode(e.target.value)}
              className={KOLOM}
            >
              <option value="">- pilih alasan -</option>
              {ALASAN_PENGECUALIAN.map((a) => (
                <option key={a.kode} value={a.kode}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>

          {/* Keterangan HANYA untuk "Lainnya" - kalau selalu ada, orang mengetik
              "sudah pindah" di sebelah pilihan "Mutasi keluar", dan isinya
              berhenti dibaca justru waktu ia benar-benar penting. */}
          {lainnya ? (
            <label className={LABEL}>
              Keterangan Tambahan (WAJIB DIISI):
              <input
                name="penjelasan"
                required
                minLength={10}
                placeholder="Jelaskan alasannya"
                autoComplete="off"
                className={KOLOM}
              />
            </label>
          ) : (
            <div className="flex sm:justify-end">{tombol}</div>
          )}
        </div>
        {lainnya && <div className="mt-3 flex justify-end">{tombol}</div>}

        {kode !== "" && (
          <p className="mt-2 text-[11px] text-muted">{ALASAN_PENGECUALIAN.find((a) => a.kode === kode)?.keterangan}</p>
        )}
      </form>
      <Pesan state={state} />
    </li>
  );
}

/**
 * Kartu satu pegawai yang SUDAH dikecualikan: alasannya ditampilkan apa adanya
 * (terkunci), dengan tombol "Batalkan Pengecualian".
 */
export function KartuDikecualikan({
  item,
  periodeBulan,
  periodeTahun,
}: {
  item: DikecualikanLaci;
  periodeBulan: number;
  periodeTahun: number;
}) {
  const [state, formAction, pending] = useActionState(batalkanPengecualianAction, INITIAL_STATE);
  const lainnya = item.alasanKode === KODE_LAINNYA || item.penjelasan;

  const tombol = (
    <button type="submit" disabled={pending} className={TOMBOL_KEDUA}>
      {pending ? "Membatalkan..." : "Batalkan Pengecualian"}
    </button>
  );

  return (
    <li className="rounded-xl border border-green/30 bg-green-tint/40 p-4">
      <KepalaKartu
        nama={item.nama}
        nip={item.nip}
        coret
        chip={
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-tint px-2.5 py-1 text-[11px] font-semibold text-green">
            <RiCheckboxCircleLine aria-hidden className="size-3.5" />
            Dikecualikan ({item.alasan})
          </span>
        }
      />

      <form action={formAction} className="mt-4">
        <input type="hidden" name="pegawaiId" value={item.pegawaiId} />
        <input type="hidden" name="periodeBulan" value={periodeBulan} />
        <input type="hidden" name="periodeTahun" value={periodeTahun} />

        <div className="grid items-end gap-3 sm:grid-cols-2">
          <label className={LABEL}>
            Alasan Pengecualian:
            <select disabled value={item.alasanKode} className={`${KOLOM} bg-surface`}>
              <option value={item.alasanKode}>{item.alasan}</option>
            </select>
          </label>
          {lainnya ? (
            <label className={LABEL}>
              Keterangan Tambahan:
              <input disabled value={item.penjelasan ?? ""} title={item.penjelasan ?? ""} className={`${KOLOM} bg-surface`} />
            </label>
          ) : (
            <div className="flex sm:justify-end">{tombol}</div>
          )}
        </div>
        {lainnya && <div className="mt-3 flex justify-end">{tombol}</div>}
      </form>
      <Pesan state={state} />
    </li>
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
