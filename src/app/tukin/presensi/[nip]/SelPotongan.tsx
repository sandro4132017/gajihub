"use client";

import { useRef, useState } from "react";
import { RiFileList3Line } from "react-icons/ri";
import type { BagianPotonganHarian } from "../../../../business-logic/rincianJamKerjaHarian";

const persenTeks = (pecahan: number) =>
  `${(pecahan * 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;

/**
 * Angka % potongan satu hari. Uraiannya (satu baris per jenis potongan)
 * muncul di kotak gelap saat disorot / difokus - pola yang sama dengan
 * `SelJamKoreksi`, supaya tabel tidak penuh teks.
 *
 * Kotaknya `position: fixed` dari posisi angka, karena pembungkus tabel
 * ber-`overflow-x-auto` memotong apa pun yang keluar dari batasnya.
 */
export function SelPotongan({
  persen,
  bagian,
  tanggalLabel,
}: {
  /** Pecahan bobot kehadiran (0,016 = 1,6%). */
  persen: number;
  bagian: readonly BagianPotonganHarian[];
  /** Mis. "05/10 Senin". */
  tanggalLabel: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [posisi, setPosisi] = useState<{ x: number; y: number } | null>(null);

  if (persen <= 0) return <span className="text-muted">-</span>;

  const buka = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPosisi({ x: r.left + r.width / 2, y: r.top });
  };
  const tutup = () => setPosisi(null);
  const lebihDariSatu = bagian.length > 1;

  return (
    <>
      <span
        ref={ref}
        tabIndex={0}
        onMouseEnter={buka}
        onMouseLeave={tutup}
        onFocus={buka}
        onBlur={tutup}
        aria-label={`Potongan ${persenTeks(persen)}: ${bagian.map((b) => `${b.teks} ${persenTeks(b.persen)}`).join(", ")}`}
        className="inline-flex cursor-help items-center gap-1 rounded-full border border-red/30 bg-red-tint px-2.5 py-0.5 font-mono font-semibold text-red outline-none focus-visible:ring-2 focus-visible:ring-biru"
      >
        {persenTeks(persen)}
        {/* Penanda kecil: hari ini kena lebih dari satu jenis potongan. */}
        {lebihDariSatu && (
          <span className="rounded-full bg-red px-1 font-sans text-[10px] leading-4 text-white">{bagian.length}</span>
        )}
      </span>

      {posisi && (
        <span
          role="tooltip"
          className="pointer-events-none fixed z-50 block w-80 -translate-x-1/2 -translate-y-full rounded-xl bg-navy-deep p-3.5 text-left font-sans text-xs text-white shadow-lg"
          style={{ left: posisi.x, top: posisi.y - 8 }}
        >
          <span className="flex items-center justify-between gap-2 border-b border-white/15 pb-2">
            <span className="inline-flex items-center gap-1.5 font-bold text-gold">
              <RiFileList3Line aria-hidden="true" className="size-4" />
              Rincian potongan
            </span>
            <span className="font-mono text-[11px] text-white/60">{tanggalLabel}</span>
          </span>
          {bagian.map((b) => (
            <span key={b.teks} className="mt-1.5 flex justify-between gap-3">
              <span className="text-white/80">{b.teks}</span>
              <span className="font-mono font-bold text-red-tint">{persenTeks(b.persen)}</span>
            </span>
          ))}
          {lebihDariSatu && (
            <span className="mt-2 flex justify-between gap-3 border-t border-white/15 pt-2 font-bold">
              <span>Total hari ini</span>
              <span className="font-mono">{persenTeks(persen)}</span>
            </span>
          )}
        </span>
      )}
    </>
  );
}
