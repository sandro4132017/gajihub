"use client";

import { useActionState, useState } from "react";
import { Modal } from "../../Modal";
import { putuskanPembayaranAction, type PutuskanPembayaranFormState } from "./actions";
import {
  CATATAN_ADK_BELUM_MENAHAN,
  KEPUTUSAN_PEMBAYARAN,
  type NilaiKeputusanPembayaran,
} from "./keputusanPembayaran";

const INITIAL_STATE: PutuskanPembayaranFormState = {};

/**
 * Form keputusan pembayaran satu pasangan (pegawai, periode).
 *
 * Konfirmasi: keputusan TIDAK bisa diubah PPABP sesudah dicatat (baris pindah
 * ke riwayat; hanya banding baru yang membukanya lagi) dan menyangkut uang
 * yang akan dibayarkan. Karena itu satu dialog konfirmasi dipasang - sejalan
 * dengan "Flow dilanggar di titik tak-bisa-dibatalkan" di gajihub-laws-of-ux.
 * Form lama (rekonsiliasi) tidak punya konfirmasi; ini penyimpangan sadar.
 *
 * Modal tidak memakai portal, jadi tombol submit di dalamnya tetap bagian
 * dari <form> ini.
 */
export function KeputusanPembayaranForm({ reconId }: { reconId: string }) {
  const [state, formAction, pending] = useActionState(putuskanPembayaranAction, INITIAL_STATE);
  const [pilihan, setPilihan] = useState<NilaiKeputusanPembayaran | null>(null);
  const [galatDitutup, setGalatDitutup] = useState<PutuskanPembayaranFormState | null>(null);

  const terpilih = KEPUTUSAN_PEMBAYARAN.find((k) => k.nilai === pilihan) ?? null;
  const galatTampil = state.error && state !== galatDitutup ? state.error : null;

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={reconId} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => setPilihan("HOLD_PEMBAYARAN")}
          className="btn btn-danger btn-sm"
        >
          {KEPUTUSAN_PEMBAYARAN[0].label}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setPilihan("KOREKSI_SIKLUS_BERIKUTNYA")}
          className="btn btn-gold btn-sm"
        >
          {KEPUTUSAN_PEMBAYARAN[1].label}
        </button>
      </div>
      <p className="text-xs leading-relaxed text-muted">{CATATAN_ADK_BELUM_MENAHAN}</p>

      <Modal
        terbuka={terpilih !== null && !state.success && !galatTampil}
        judul="Catat keputusan pembayaran?"
        onTutup={pending ? null : () => setPilihan(null)}
        aksi={
          <>
            <button type="button" disabled={pending} onClick={() => setPilihan(null)} className="btn btn-ghost btn-sm">
              Batal
            </button>
            <button
              type="submit"
              name="keputusan"
              value={terpilih?.nilai ?? ""}
              disabled={pending}
              className="btn btn-primary btn-sm"
            >
              {pending ? "Mencatat..." : "Ya, catat keputusan"}
            </button>
          </>
        }
      >
        <p className="font-semibold text-ink">{terpilih?.label}</p>
        <p className="mt-2">
          Keputusan tidak bisa diubah dari sini setelah dicatat. {CATATAN_ADK_BELUM_MENAHAN}
        </p>
      </Modal>

      <Modal
        terbuka={!!state.success}
        judul="Keputusan tercatat"
        nada="sukses"
        onTutup={() => setPilihan(null)}
        aksi={
          <button type="button" onClick={() => setPilihan(null)} className="btn btn-primary btn-sm">
            Tutup
          </button>
        }
      >
        {state.success}
      </Modal>

      <Modal
        terbuka={!!galatTampil}
        judul="Keputusan gagal dicatat"
        nada="bahaya"
        onTutup={() => {
          setGalatDitutup(state);
          setPilihan(null);
        }}
        aksi={
          <button
            type="button"
            onClick={() => {
              setGalatDitutup(state);
              setPilihan(null);
            }}
            className="btn btn-primary btn-sm"
          >
            Tutup
          </button>
        }
      >
        {galatTampil}
      </Modal>
    </form>
  );
}
