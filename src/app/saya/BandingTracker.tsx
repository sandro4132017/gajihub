"use client";

import { useState } from "react";
import Link from "next/link";
import {
  formatNomorTiket,
  formatWaktuTracker,
  hitungTahapanStepper,
  bangunTimelineCheckpoints,
  type BandingItem,
  type ApprovalLogItem,
  type TrackerStep,
} from "./bandingTrackerLogic";
import { labelReferensiBanding, isReferensiData, JENIS_BANDING } from "../../business-logic/bandingData";
import { ModalPreviewBerkas, type BerkasLampiran } from "./ModalPreviewBerkas";

function CopyTicketButton({ ticketNumber }: { ticketNumber: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(ticketNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API not available
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Salin nomor tiket"
      className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-xs font-semibold text-ink transition hover:border-biru hover:text-biru"
    >
      <span>{ticketNumber}</span>
      {copied ? (
        <span className="text-[10px] font-bold text-green">Disalin!</span>
      ) : (
        <svg className="size-3 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

function StepIcon({ step }: { step: TrackerStep }) {
  if (step.state === "completed") {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-navy text-white shadow-sm ring-2 ring-navy/20 sm:size-9">
        <svg className="size-4 sm:size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  }

  if (step.state === "rejected") {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-red text-white shadow-sm ring-2 ring-red/20 sm:size-9">
        <svg className="size-4 sm:size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </span>
    );
  }

  if (step.state === "active") {
    return (
      <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-biru bg-white text-biru shadow-md ring-4 ring-biru/15 sm:size-9">
        <span className="absolute -top-1 -right-1 flex size-3">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-biru opacity-75"></span>
          <span className="relative inline-flex size-3 rounded-full bg-biru"></span>
        </span>
        <span className="text-xs font-black sm:text-sm">{step.nomor}</span>
      </span>
    );
  }

  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-xs font-bold text-muted sm:size-9 sm:text-sm">
      {step.nomor}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "DISETUJUI") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-tint px-3 py-1 text-xs font-extrabold text-green">
        <span className="size-2 rounded-full bg-green" />
        Disetujui Final
      </span>
    );
  }
  if (status === "DITOLAK") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-tint px-3 py-1 text-xs font-extrabold text-red">
        <span className="size-2 rounded-full bg-red" />
        Ditolak
      </span>
    );
  }
  if (status === "MENUNGGU_APPROVAL_FINAL") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-tint px-3 py-1 text-xs font-extrabold text-navy">
        <span className="size-2 animate-pulse rounded-full bg-biru" />
        Verifikasi OSDMA
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-tint px-3 py-1 text-xs font-extrabold text-gold-deep">
      <span className="size-2 animate-pulse rounded-full bg-gold" />
      Menunggu Kasubag TU
    </span>
  );
}

export function SingleBandingTrackerCard({
  banding,
  logs,
  defaultOpen = true,
}: {
  banding: BandingItem;
  logs: ApprovalLogItem[];
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [previewBerkas, setPreviewBerkas] = useState<BerkasLampiran | null>(null);
  const steps = hitungTahapanStepper(banding, logs);
  const checkpoints = bangunTimelineCheckpoints(banding, logs);
  const ticketNumber = formatNomorTiket(banding);
  const labelTipe = labelReferensiBanding(banding.referensiTipe);
  const sumber = isReferensiData(banding.referensiTipe)
    ? JENIS_BANDING[banding.referensiTipe].sistemSumber
    : null;

  return (
    <>
      <article className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_2px_12px_rgba(19,65,107,0.06)] transition-all hover:border-biru/40">
      {/* 1. KEPALA TRACKER: Jenis Banding, Nomor Tiket & Status */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsOpen((prev) => !prev);
          }
        }}
        className={`cursor-pointer bg-gradient-to-r from-surface to-surface-2 p-4 transition-colors hover:bg-surface-2/80 select-none sm:p-5 ${
          isOpen ? "border-b border-line" : ""
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-tint text-navy sm:size-11">
              <svg className="size-5 sm:size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-extrabold tracking-tight text-ink sm:text-lg">
                  {labelTipe}
                </h3>
                <span className="text-xs font-semibold text-muted">
                  &bull; Periode {banding.periodeBulan}/{banding.periodeTahun}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>No. Tiket:</span>
                <CopyTicketButton ticketNumber={ticketNumber} />
                <span className="hidden sm:inline">&bull;</span>
                <span className="hidden sm:inline">Diajukan: {formatWaktuTracker(banding.createdAt)}</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <StatusPill status={banding.status} />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen((prev) => !prev);
              }}
              aria-expanded={isOpen}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink shadow-xs transition hover:border-biru hover:text-biru"
            >
              <span>{isOpen ? "Tutup Detail" : "Buka Detail"}</span>
              <svg
                className={`size-4 text-muted transition-transform duration-200 ${
                  isOpen ? "rotate-180 text-biru" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ISI TRACKER LENGKAP */}
      {isOpen && (
        <div className="animate-in fade-in duration-200">
          {/* 2. STEPPER LANDSCAPE MENDATAR (HORIZONTAL STEPPER) */}
          <div className="border-b border-line bg-surface p-4 sm:p-5">
            <div className="rounded-xl border border-line-2 bg-white p-4 sm:p-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Alur Pemeriksaan Berjenjang
              </p>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-2">
                {steps.map((step, idx) => {
                  const isLast = idx === steps.length - 1;
                  return (
                    <div key={step.key} className="relative flex flex-col items-center text-center">
                      {/* Garis penghubung antar-step (hanya di tablet/desktop landscape) */}
                      {!isLast && (
                        <div
                          className={`absolute top-4 left-[50%] -z-0 hidden h-0.5 w-full sm:block ${
                            step.state === "completed" ? "bg-navy" : "bg-line"
                          }`}
                        />
                      )}
                      <div className="relative z-10">
                        <StepIcon step={step} />
                      </div>
                      <p
                        className={`mt-2 text-xs font-extrabold ${
                          step.state === "active"
                            ? "text-biru"
                            : step.state === "completed"
                            ? "text-ink"
                            : step.state === "rejected"
                            ? "text-red"
                            : "text-muted"
                        }`}
                      >
                        {step.label}
                      </p>
                      <p className="text-[11px] text-muted">{step.sublabel}</p>
                      {step.keterangan && (
                        <span
                          className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            step.state === "active"
                              ? "bg-biru/10 text-biru"
                              : step.state === "completed"
                              ? "bg-green-tint text-green"
                              : step.state === "rejected"
                              ? "bg-red-tint text-red"
                              : "bg-surface-2 text-muted"
                          }`}
                        >
                          {step.keterangan}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. BANNER JAMINAN LAYANAN & ESTIMASI (Mirip Card Garansi SPX) */}
            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-tint bg-teal-tint/60 px-4 py-2.5 text-xs text-navy">
              <div className="flex items-center gap-2">
                <svg className="size-4 shrink-0 text-biru" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  <strong className="font-bold">Estimasi proses: 1–3 hari kerja.</strong> Banding diperiksa secara berjenjang oleh Kasubag TU dan Biro OSDMA.
                </span>
              </div>
              {sumber && (
                <span className="text-[11px] font-semibold text-ink-2">
                  Sistem Sumber: <span className="font-mono font-bold text-navy">{sumber}</span>
                </span>
              )}
            </div>
          </div>

      {/* 4. DUA KOLOM LANDSCAPE: Histori Pelacakan (Kiri) vs Rincian Banding (Kanan) */}
      <div className="grid grid-cols-1 divide-y divide-line lg:grid-cols-12 lg:divide-x lg:divide-y-0">
        {/* KOLOM KIRI: Feed Timeline Checkpoints (Gaya SPX Tracking) */}
        <div className="p-5 lg:col-span-7">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">
              <span className="size-2 rounded-full bg-biru" />
              Riwayat Banding
            </h4>
            <span className="text-[11px] text-muted">{checkpoints.length} aktivitas</span>
          </div>

          <div className="mt-4 space-y-0">
            {checkpoints.map((cp, idx) => {
              const isLast = idx === checkpoints.length - 1;
              return (
                <div key={cp.id} className="relative flex items-start gap-3 sm:gap-4">
                  {/* Kolom Waktu (Kiri) */}
                  <div className="w-24 shrink-0 pt-0.5 text-right font-mono text-[11px] font-semibold text-muted sm:w-28">
                    {formatWaktuTracker(cp.tanggal)}
                  </div>

                  {/* Garis & Titik Vertikal (Tengah) */}
                  <div className="relative flex flex-col items-center self-stretch">
                    {/* Titik indikator */}
                    {cp.isLatest ? (
                      <span className="relative z-10 flex size-4 items-center justify-center rounded-full bg-white ring-2 ring-biru">
                        <span className="size-2 rounded-full bg-biru" />
                      </span>
                    ) : (
                      <span className="relative z-10 size-2.5 rounded-full bg-line" />
                    )}
                    {/* Garis vertikal menyambung ke item berikutnya */}
                    {!isLast && <div className="w-0.5 grow bg-line-2 my-1" />}
                  </div>

                  {/* Uraian Peristiwa (Kanan) */}
                  <div className={`min-w-0 grow pb-5 ${cp.isLatest ? "text-ink" : "text-ink-2"}`}>
                    <p
                      className={`text-xs ${
                        cp.isLatest
                          ? "font-extrabold text-biru-deep sm:text-sm"
                          : "font-bold text-ink"
                      } ${cp.isDanger ? "!text-red" : ""}`}
                    >
                      {cp.judul}
                    </p>
                    <p className={`mt-0.5 text-xs leading-relaxed ${cp.isLatest ? "text-ink-2" : "text-muted"}`}>
                      {cp.uraian}
                    </p>
                    {/* Catatan verifikator jika ada */}
                    {cp.catatan && (
                      <div className="mt-2 rounded-lg border border-line bg-surface-2 p-2.5 text-xs">
                        <p className="font-bold text-muted uppercase text-[10px]">Catatan Verifikator:</p>
                        <p className="mt-0.5 italic text-ink">&ldquo;{cp.catatan}&rdquo;</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* KOLOM KANAN: Rincian Berkas & Usulan */}
        <div className="bg-surface-2/40 p-5 lg:col-span-5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
              Rincian Banding & Usulan
            </h4>
          </div>

          <div className="mt-3 space-y-3">
            {banding.bagianData && (
              <div className="rounded-xl border border-line bg-surface p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Bagian Data yang Dipermasalahkan</p>
                <p className="mt-0.5 text-xs font-bold text-ink sm:text-sm">{banding.bagianData}</p>
                {sumber && (
                  <p className="mt-1 text-[11px] text-muted">
                    Pemutakhiran pada sistem <strong className="text-ink-2">{sumber}</strong>
                  </p>
                )}
              </div>
            )}

            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Alasan Banding</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-2">{banding.alasan}</p>
            </div>

            {banding.usulanPerbaikan && (
              <div className="rounded-xl border border-teal-tint bg-teal-tint/40 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-biru">
                  Usulan Perbaikan
                </p>
                <p className="mt-0.5 text-xs font-bold text-ink sm:text-sm">
                  {banding.usulanPerbaikan}
                </p>
              </div>
            )}

            {/* Bukti Dokumen */}
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Bukti Pendukung</p>
              {banding.buktiDukung && banding.buktiDukung.length > 0 ? (
                <ul className="mt-1.5 space-y-1">
                  {banding.buktiDukung.map((dok) => (
                    <li key={dok.id} className="flex items-center justify-between text-xs">
                      <span className="truncate text-ink font-medium">{dok.namaFile}</span>
                      <button
                        type="button"
                        onClick={() => setPreviewBerkas(dok)}
                        className="inline-flex items-center gap-1 text-biru font-semibold hover:underline shrink-0 ml-2 cursor-pointer"
                        title="Buka pratinjau berkas"
                      >
                        <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Lihat Berkas
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[11px] text-muted italic">
                  Tidak ada berkas lampiran tambahan.
                </p>
              )}
            </div>

            {/* Link Cepat ke Presensi jika banding presensi */}
            {banding.referensiTipe === "PRESENSI" && (
              <div className="pt-1">
                <Link
                  href={`/saya/presensi/${banding.periodeBulan}/${banding.periodeTahun}`}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-bold text-ink-2 shadow-sm transition hover:border-biru hover:text-biru"
                >
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Periksa Presensi Periode Ini
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )}
</article>
<ModalPreviewBerkas berkas={previewBerkas} onClose={() => setPreviewBerkas(null)} />
</>
  );
}

export function BandingTracker({
  bandings,
  approvalLogs,
}: {
  bandings: BandingItem[];
  approvalLogs: ApprovalLogItem[];
}) {
  if (bandings.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface-2 p-8 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-line-2 text-muted">
          <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="mt-3 text-sm font-bold text-ink">Belum ada banding yang diajukan</h3>
        <p className="mt-1 text-xs text-muted">
          Jika terdapat data kehadiran, predikat kinerja, atau tunjangan yang tidak sesuai, ajukan melalui formulir di atas.
        </p>
      </div>
    );
  }

  // Petakan approvalLogs per bandingId
  const logsByBandingId = new Map<string, ApprovalLogItem[]>();
  for (const log of approvalLogs) {
    const arr = logsByBandingId.get(log.referensiId) ?? [];
    arr.push(log);
    logsByBandingId.set(log.referensiId, arr);
  }

  return (
    <div className="space-y-6">
      {bandings.map((b) => (
        <SingleBandingTrackerCard
          key={b.id}
          banding={b}
          logs={logsByBandingId.get(b.id) ?? []}
        />
      ))}
    </div>
  );
}

