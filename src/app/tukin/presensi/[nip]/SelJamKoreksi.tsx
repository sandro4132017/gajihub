"use client";

import { useRef, useState } from "react";
import { RiHistoryLine } from "react-icons/ri";
import { PenampilBukti } from "../../../../components/shared/PenampilBukti";
import type { TautanBukti } from "../../../../components/shared/TautanBuktiKoreksi";

/** Nama event untuk membuka form koreksi tanggal tertentu dari luar sel Koreksi. */
export const EVENT_BUKA_KOREKSI = "gajihub:buka-koreksi";

/**
 * Sel jam (masuk/pulang) di tabel Rincian harian.
 *
 * Jam yang dikoreksi tampil sebagai PIL KUNING. Saat disorot (atau difokus
 * lewat keyboard) muncul kotak gelap "Rincian koreksi" berisi jam awal
 * e-Presensi, jam koreksi, pengoreksi, tautan bukti, dan "Ubah koreksi"
 * (desain user 2026-11-16).
 *
 * Kotaknya ber-`position: fixed` yang dihitung dari posisi pil, karena
 * pembungkus tabel ber-`overflow-x-auto` memotong apa pun yang keluar dari
 * batasnya - termasuk tooltip di baris paling atas.
 */
export function SelJamKoreksi({
  asli,
  koreksi,
  sisi,
  tanggalLabel,
  oleh,
  belumDiterapkan,
  tautanBukti,
  tanggalIso,
  bolehUbah,
}: {
  asli: string;
  koreksi: string | null;
  sisi: "masuk" | "pulang";
  /** Mis. "05/10 Senin". */
  tanggalLabel: string;
  oleh: string | null;
  belumDiterapkan: boolean;
  tautanBukti: TautanBukti[];
  tanggalIso: string;
  bolehUbah: boolean;
}) {
  const pilRef = useRef<HTMLSpanElement>(null);
  const tutupRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [posisi, setPosisi] = useState<{ x: number; y: number } | null>(null);
  const [lihat, setLihat] = useState<TautanBukti | null>(null);

  if (!koreksi) return <td className="px-3 py-2 font-mono text-ink-2">{asli}</td>;

  const buka = () => {
    if (tutupRef.current) clearTimeout(tutupRef.current);
    const r = pilRef.current?.getBoundingClientRect();
    if (r) setPosisi({ x: r.left + r.width / 2, y: r.top });
  };
  // Jeda kecil supaya kursor sempat berpindah dari pil ke kotaknya (tautan
  // bukti di dalamnya harus bisa diklik).
  const tutup = () => {
    tutupRef.current = setTimeout(() => setPosisi(null), 150);
  };

  return (
    <td className="px-3 py-2 font-mono">
      <span
        ref={pilRef}
        tabIndex={0}
        onMouseEnter={buka}
        onMouseLeave={tutup}
        onFocus={buka}
        onBlur={tutup}
        aria-label={`Jam ${sisi} dikoreksi jadi ${koreksi}, sebelumnya ${asli === "-" ? "tanpa ketukan" : asli}`}
        className={`inline-block cursor-help rounded-full px-2.5 py-0.5 font-semibold text-gold-deep outline-none focus-visible:ring-2 focus-visible:ring-biru ${
          belumDiterapkan ? "border border-dashed border-gold bg-gold-tint" : "border border-gold/40 bg-gold-tint"
        }`}
      >
        {koreksi}
      </span>

      {posisi && (
        <span
          role="tooltip"
          onMouseEnter={buka}
          onMouseLeave={tutup}
          className="fixed z-50 block w-72 -translate-x-1/2 -translate-y-full rounded-xl bg-navy-deep p-3.5 text-left font-sans text-xs text-white shadow-lg"
          style={{ left: posisi.x, top: posisi.y - 8 }}
        >
          <span className="flex items-center justify-between gap-2 border-b border-white/15 pb-2">
            <span className="inline-flex items-center gap-1.5 font-bold text-gold">
              <RiHistoryLine aria-hidden="true" className="size-4" />
              Rincian koreksi {sisi}
            </span>
            <span className="font-mono text-[11px] text-white/60">{tanggalLabel}</span>
          </span>
          <span className="mt-2 flex justify-between gap-2">
            <span className="text-white/70">Jam sebelumnya (awal):</span>
            <span className="font-mono font-bold text-red-tint">{asli === "-" ? "tanpa ketukan" : asli}</span>
          </span>
          <span className="mt-1 flex justify-between gap-2">
            <span className="text-white/70">Jam dikoreksi (terbaru):</span>
            <span className="font-mono font-bold text-green-tint">{koreksi}</span>
          </span>
          {oleh && (
            <span className="mt-1 flex justify-between gap-2">
              <span className="text-white/70">Dikoreksi oleh:</span>
              <span className="truncate font-semibold">{oleh}</span>
            </span>
          )}
          {belumDiterapkan && (
            <span className="mt-2 block rounded-md bg-white/10 px-2 py-1 text-[11px] text-white/80">
              Belum diterapkan - tarik ulang presensi periode ini supaya ikut menghitung.
            </span>
          )}
          {(tautanBukti.length > 0 || bolehUbah) && (
            <span className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/15 pt-2">
              {tautanBukti.map((t, i) => (
                <span key={t.sisi} className="inline-flex items-center gap-2">
                  {i > 0 && <span className="text-white/30">&middot;</span>}
                  <button
                    type="button"
                    onClick={() => {
                      setPosisi(null);
                      setLihat(t);
                    }}
                    className="text-white underline underline-offset-2 hover:text-gold"
                  >
                    {t.label}
                  </button>
                </span>
              ))}
              {bolehUbah && (
                <>
                  {tautanBukti.length > 0 && <span className="text-white/30">&middot;</span>}
                  <button
                    type="button"
                    onClick={() => {
                      setPosisi(null);
                      window.dispatchEvent(new CustomEvent(EVENT_BUKA_KOREKSI, { detail: tanggalIso }));
                    }}
                    className="font-semibold text-gold underline underline-offset-2 hover:text-white"
                  >
                    Ubah koreksi
                  </button>
                </>
              )}
            </span>
          )}
        </span>
      )}
      {lihat && (
        <PenampilBukti
          judul={`${lihat.label} - ${tanggalLabel}`}
          href={lihat.href}
          jenis={lihat.jenis}
          onTutup={() => setLihat(null)}
        />
      )}
    </td>
  );
}
