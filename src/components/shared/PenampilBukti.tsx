"use client";

import { useEffect, useState, type ReactNode } from "react";
import { RiCloseLine, RiDownloadLine, RiExternalLinkLine } from "react-icons/ri";

export type JenisBukti = "gambar" | "pdf";

/**
 * Pop up penampil berkas bukti (foto/PDF) - dipakai tautan bukti koreksi jam
 * presensi supaya tidak perlu membuka tab baru (permintaan user 2026-11-16).
 *
 * Berkasnya tetap dimuat dari rute berizin `/berkas/...`, yang memang boleh
 * dibingkai halaman Gajihub sendiri (X-Frame-Options SAMEORIGIN &
 * `frame-ancestors 'self'` di middleware). Tidak ada salinan berkas di klien.
 *
 * z-[60]: bisa terbuka di atas Modal lain (z-50), mis. dari dalam form koreksi.
 */
export function PenampilBukti({
  judul,
  href,
  jenis,
  onTutup,
}: {
  judul: string;
  href: string;
  jenis: JenisBukti;
  onTutup: () => void;
}) {
  useEffect(() => {
    const onTombol = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onTutup();
      }
    };
    document.addEventListener("keydown", onTombol, true);
    const gulungAsli = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onTombol, true);
      document.body.style.overflow = gulungAsli;
    };
  }, [onTutup]);

  const hrefUnduh = `${href}${href.includes("?") ? "&" : "?"}unduh=1`;

  return (
    <span
      className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-deep/60 p-4 text-left font-sans backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onTutup();
      }}
    >
      <span
        role="dialog"
        aria-modal="true"
        aria-label={judul}
        className="card flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden"
        style={{ animation: "gj-masuk 180ms ease-out both" }}
      >
        <span className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <span className="truncate text-sm font-bold text-ink">{judul}</span>
          <span className="flex shrink-0 items-center gap-1">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              title="Buka di tab baru"
              aria-label="Buka di tab baru"
              className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
            >
              <RiExternalLinkLine aria-hidden="true" className="size-4" />
            </a>
            <a
              href={hrefUnduh}
              title="Unduh"
              aria-label="Unduh"
              className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
            >
              <RiDownloadLine aria-hidden="true" className="size-4" />
            </a>
            <button
              type="button"
              onClick={onTutup}
              aria-label="Tutup"
              className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biru"
            >
              <RiCloseLine aria-hidden="true" className="size-5" />
            </button>
          </span>
        </span>
        <span className="flex min-h-0 flex-1 items-center justify-center bg-surface-2">
          {jenis === "pdf" ? (
            <iframe src={href} title={judul} className="h-[75vh] w-full border-0 bg-white" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={href} alt={judul} className="max-h-[78vh] max-w-full object-contain" />
          )}
        </span>
      </span>
    </span>
  );
}

/** Tombol tautan bukti yang membuka PenampilBukti, bukan tab baru. */
export function TombolBukti({
  label,
  href,
  jenis,
  judul,
  ikon,
  className = "link",
}: {
  label: string;
  /** Ikon opsional di depan label. */
  ikon?: ReactNode;
  href: string;
  jenis: JenisBukti;
  /** Judul pop up; bawaannya sama dengan label. */
  judul?: string;
  className?: string;
}) {
  const [buka, setBuka] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setBuka(true)} className={className}>
        {ikon}
        {label}
      </button>
      {buka && <PenampilBukti judul={judul ?? label} href={href} jenis={jenis} onTutup={() => setBuka(false)} />}
    </>
  );
}
