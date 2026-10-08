"use client";

import { useEffect } from "react";

export interface BerkasLampiran {
  id?: string;
  namaFile: string;
  fileUrl: string;
  ukuranByte?: number | null;
  tipeMime?: string | null;
}

interface ModalPreviewBerkasProps {
  berkas: BerkasLampiran | null;
  onClose: () => void;
}

function formatUkuran(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function ModalPreviewBerkas({ berkas, onClose }: ModalPreviewBerkasProps) {
  useEffect(() => {
    if (!berkas) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [berkas, onClose]);

  if (!berkas) return null;

  const isPdf =
    berkas.tipeMime?.toLowerCase().includes("pdf") ||
    berkas.fileUrl.toLowerCase().endsWith(".pdf") ||
    berkas.namaFile.toLowerCase().endsWith(".pdf");

  const isGambar =
    berkas.tipeMime?.toLowerCase().startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|svg)$/i.test(berkas.fileUrl) ||
    /\.(png|jpe?g|webp|gif|svg)$/i.test(berkas.namaFile);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-preview-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-navy/80 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex flex-col w-full max-w-4xl max-h-[92vh] rounded-2xl border border-line bg-surface shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* HEADER MODAL */}
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-2/80 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-teal-tint text-biru">
              {isPdf ? (
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              ) : isGambar ? (
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              ) : (
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              )}
            </span>
            <div className="min-w-0">
              <h3 id="modal-preview-title" className="text-xs sm:text-sm font-bold text-ink truncate" title={berkas.namaFile}>
                {berkas.namaFile}
              </h3>
              <div className="flex items-center gap-2 text-[10px] sm:text-[11px] text-muted">
                <span>{isPdf ? "Dokumen PDF" : isGambar ? "Berkas Gambar" : "Lampiran"}</span>
                {berkas.ukuranByte && (
                  <>
                    <span>&bull;</span>
                    <span>{formatUkuran(berkas.ukuranByte)}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* AKSI: BUKA TAB BARU & TUTUP */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <a
              href={berkas.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink-2 shadow-xs transition hover:border-biru hover:text-biru"
              title="Buka berkas di tab baru atau unduh"
            >
              <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              <span className="hidden sm:inline">Buka di Tab Baru</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              className="flex size-7 sm:size-8 items-center justify-center rounded-lg border border-transparent text-muted hover:bg-line hover:text-ink transition"
              title="Tutup (Esc)"
              aria-label="Tutup pratinjau berkas"
            >
              <svg className="size-4 sm:size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ISI MODAL: PREVIEW AREA */}
        <div className="relative flex-1 overflow-auto bg-surface-2 p-3 sm:p-5 flex items-center justify-center min-h-[300px]">
          {isPdf ? (
            <div className="w-full h-full flex flex-col">
              <iframe
                src={berkas.fileUrl}
                title={berkas.namaFile}
                className="w-full h-[65vh] sm:h-[72vh] rounded-xl border border-line bg-white shadow-xs"
              />
              <p className="mt-2 text-center text-[11px] text-muted">
                Jika dokumen PDF tidak muncul secara otomatis, Anda dapat{" "}
                <a
                  href={berkas.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-biru underline hover:text-biru-deep"
                >
                  klik di sini untuk membuka di tab peramban baru
                </a>.
              </p>
            </div>
          ) : isGambar ? (
            <div className="flex flex-col items-center justify-center max-w-full">
              <img
                src={berkas.fileUrl}
                alt={berkas.namaFile}
                className="max-h-[68vh] sm:max-h-[75vh] w-auto max-w-full rounded-xl object-contain border border-line bg-white shadow-md"
              />
            </div>
          ) : (
            <div className="p-8 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-teal-tint text-biru">
                <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h4 className="mt-3 text-sm font-bold text-ink">Format Berkas Khusus</h4>
              <p className="mt-1 text-xs text-muted">
                Pratinjau langsung tidak tersedia untuk tipe berkas ini.
              </p>
              <a
                href={berkas.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-biru px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-biru-deep transition"
              >
                Unduh Berkas Lampiran
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

