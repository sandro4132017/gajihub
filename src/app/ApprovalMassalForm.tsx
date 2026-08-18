"use client";

import { useActionState, useState } from "react";
import { approveMassalAction, type ApprovalMassalFormState, type JenisApprovalMassal } from "./actionsApprovalMassal";

const INITIAL_STATE: ApprovalMassalFormState = {};

/**
 * "Setujui semua" untuk satu periode.
 *
 * Konfirmasi DUA LANGKAH, dan sengaja bukan `confirm()` bawaan browser:
 * dialog itu tidak bisa menampilkan berapa baris yang kena dan periode mana -
 * padahal justru itu yang perlu dibaca sebelum menyetujui ratusan pembayaran
 * sekaligus. Pola yang sama dipakai tombol hapus predikat kinerja.
 *
 * Tanpa JavaScript tombolnya tidak muncul sama sekali (komponen klien) - itu
 * disengaja. Aksi satuan di halaman yang sama tetap jalan tanpa JS, jadi tidak
 * ada kemampuan yang hilang; yang hilang cuma jalan pintasnya.
 */
export function ApprovalMassalForm({
  jenis,
  label,
  bulan,
  tahun,
  satker,
  jumlahBelumApproved,
}: {
  jenis: JenisApprovalMassal;
  label: string;
  bulan: number;
  tahun: number;
  satker?: string;
  jumlahBelumApproved: number;
}) {
  const [state, formAction, pending] = useActionState(approveMassalAction, INITIAL_STATE);
  const [konfirmasi, setKonfirmasi] = useState(false);

  if (jumlahBelumApproved === 0 && !state.success && !state.error) return null;

  return (
    <div className="card mt-4 border-l-4 border-l-gold p-4">
      <p className="text-sm font-bold text-ink">Setujui semua ({label})</p>
      <p className="mt-1 text-sm text-muted">
        <strong>{jumlahBelumApproved}</strong> baris periode{" "}
        <strong>
          {bulan}/{tahun}
        </strong>
        {satker ? (
          <>
            {" "}
            di <strong>{satker}</strong>
          </>
        ) : (
          " di semua satuan kerja"
        )}{" "}
        belum disetujui. Tombol ini menjalankan approval yang sama dengan tombol per baris - jenjang, otorisasi, dan
        pencatatan di ApprovalLog tetap berlaku - hanya saja tanpa memeriksa rincian tiap pegawai. Pakai untuk
        pengujian, bukan untuk pembayaran sungguhan.
      </p>

      {!konfirmasi ? (
        <button type="button" onClick={() => setKonfirmasi(true)} className="btn btn-gold btn-sm mt-3">
          Setujui semua
        </button>
      ) : (
        <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="jenis" value={jenis} />
          <input type="hidden" name="bulan" value={bulan} />
          <input type="hidden" name="tahun" value={tahun} />
          {satker && <input type="hidden" name="satker" value={satker} />}
          <span className="text-sm font-semibold text-ink">
            Setujui {jumlahBelumApproved} baris {label} {bulan}/{tahun}?
          </span>
          <button type="submit" disabled={pending} className="btn btn-danger btn-sm">
            {pending ? "Memproses..." : "Ya, setujui semua"}
          </button>
          <button type="button" onClick={() => setKonfirmasi(false)} className="btn btn-ghost btn-sm">
            Batal
          </button>
        </form>
      )}

      {state.error && <p className="mt-2 text-sm font-semibold text-red">{state.error}</p>}
      {state.success && <p className="mt-2 text-sm font-semibold text-teal-deep">{state.success}</p>}
      {state.rincian && state.rincian.length > 0 && (
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted">
          {state.rincian.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
