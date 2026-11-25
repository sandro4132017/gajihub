"use client";

import { useState } from "react";
import { RiArrowGoBackLine, RiCloseLine } from "react-icons/ri";

/**
 * Spanduk merah di puncak halaman Kalkulasi saat rekap DIKEMBALIKAN PPABP:
 * catatan PPABP dibaca SEBELUM orang mulai memperbaiki, bukan ditemukan di
 * Tahap 4 sesudahnya.
 *
 * Tombol tutup hanya menyembunyikan untuk kunjungan ini (state klien) -
 * memuat ulang halaman memunculkannya lagi selama rekap masih dikembalikan.
 * Chip "Dikembalikan dari PPABP" di kepala halaman tetap ada walau ditutup.
 */
export function SpandukPengembalian({ alasan }: { alasan: string }) {
  const [tampil, setTampil] = useState(true);
  if (!tampil) return null;

  return (
    <div
      id="kirim-catatan"
      role="note"
      aria-label="Catatan pengembalian dari PPABP"
      className="mt-4 flex items-start gap-3 rounded-2xl border border-red/30 bg-red-tint px-4 py-3.5"
    >
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-red/10 text-red">
        <RiArrowGoBackLine className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-extrabold uppercase tracking-wide text-red">Catatan pengembalian dari PPABP:</p>
        <p className="mt-0.5 text-sm text-red">&ldquo;{alasan}&rdquo;</p>
      </div>
      <button
        type="button"
        onClick={() => setTampil(false)}
        aria-label="Tutup catatan pengembalian"
        className="grid size-7 shrink-0 place-items-center rounded-lg text-red hover:bg-red/10"
      >
        <RiCloseLine className="size-5" />
      </button>
    </div>
  );
}
