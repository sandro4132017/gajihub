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
} from "../../saya/bandingTrackerLogic";
import { labelReferensiBanding, isReferensiData, JENIS_BANDING } from "../../../business-logic/bandingData";
import { ModalPreviewBerkas, type BerkasLampiran } from "../../saya/ModalPreviewBerkas";

export interface PegawaiBandingInfo {
  id: string;
  nip: string;
  nama: string;
  unitKerja: string;
  satuanKerja: string;
  jabatan: string | null;
  golongan: string | null;
  kelasJabatan: number | null;
}

export interface BandingPpabpItem extends BandingItem {
  pegawai: PegawaiBandingInfo;
}

export interface StatusKalkulasiPembayaran {
  jenis: string;
  status: string;
}

const STATUS_SUDAH_BERGERAK = new Set(["APPROVED", "DIKIRIM"]);

function CopyTicketButton({ ticketNumber }: { ticketNumber: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(ticketNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
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
        Disetujui OSDMA
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
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-tint px-3 py-1 text-xs font-extrabold text-gold-deep">
      <span className="size-2 animate-pulse rounded-full bg-gold" />
      Menunggu OSDMA
    </span>
  );
}

export function BandingPpabpCard({
  banding,
  logs,
  pembayaran,
  defaultOpen = false,
}: {
  banding: BandingPpabpItem;
  logs: ApprovalLogItem[];
  pembayaran: StatusKalkulasiPembayaran[];
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
    : "Gajihub";

  const sudahBergerak = pembayaran.filter((p) => STATUS_SUDAH_BERGERAK.has(p.status));
  const logKasubag = logs.find((l) => l.jenjang === 1);
  const logOsdma = logs.find((l) => l.jenjang === 2);

  return (
    <>
      <article className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_2px_12px_rgba(19,65,107,0.06)] transition-all hover:border-biru/40">
      {/* 1. KEPALA VERIFIKASI (COLLAPSIBLE HEADER): Hirarki Bersih (Utama, Sekunder, Status) */}
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
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Identitas Utama & Informasi Sekunder */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-teal-tint font-mono text-sm font-extrabold text-navy shadow-sm sm:size-12">
              {banding.pegawai.nama.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              {/* Utama: Nama Pegawai & Jabatan */}
              <h3 className="text-base font-extrabold tracking-tight text-ink sm:text-lg">
                {banding.pegawai.nama}
              </h3>
              {banding.pegawai.jabatan && (
                <p className="text-xs text-muted truncate sm:whitespace-normal">
                  {banding.pegawai.jabatan}
                </p>
              )}

              {/* Sekunder: Jenis Banding, Periode, Tiket & Waktu Diajukan */}
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="font-semibold text-ink-2">
                  {labelTipe} &bull; Periode {banding.periodeBulan}/{banding.periodeTahun}
                </span>
                <span>&bull;</span>
                <span>No. Tiket:</span>
                <CopyTicketButton ticketNumber={ticketNumber} />
                <span className="hidden sm:inline">&bull;</span>
                <span className="hidden sm:inline">Diajukan: {formatWaktuTracker(banding.createdAt)}</span>
              </div>
            </div>
          </div>

          {/* Status & Tombol Buka/Tutup */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {sudahBergerak.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gold-tint px-2.5 py-1 text-xs font-bold text-gold-deep ring-1 ring-gold/30">
                <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Perlu Perhatian PPABP
              </span>
            )}
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

      {/* ISI RINCIAN LENGKAP: HANYA DITAMPILKAN SAAT KARTU DIBUKA (EXPANDED) */}
      {isOpen && (
        <div className="animate-in fade-in duration-200">
          {/* PROFIL LENGKAP PEGAWAI (INFORMASI SEKUNDER DI DALAM BUKA DETAIL) */}
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2/60 px-4 py-2.5 text-xs sm:px-5">
            <span className="font-bold text-muted uppercase text-[10px]">Data Pegawai:</span>
            <span className="chip chip-navy font-mono text-xs">NIP {banding.pegawai.nip}</span>
            <span className="chip chip-ok text-xs">{banding.pegawai.satuanKerja}</span>
            {banding.pegawai.golongan && (
              <span className="chip chip-draft text-xs">Gol. {banding.pegawai.golongan}</span>
            )}
            {banding.pegawai.kelasJabatan !== null && (
              <span className="chip chip-draft text-xs">Kelas {banding.pegawai.kelasJabatan}</span>
            )}
          </div>

          {/* 2. STEPPER LANDSCAPE MENDATAR (HORIZONTAL STEPPER) */}
          <div className="border-b border-line bg-surface p-4 sm:p-5">
            <div className="rounded-xl border border-line-2 bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                  Alur Pemeriksaan Berjenjang
                </p>
                <span className="text-xs font-semibold text-muted">
                  Monitoring Tembusan Paralel PPABP
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-2">
                {steps.map((step, idx) => {
                  const isLast = idx === steps.length - 1;
                  return (
                    <div key={step.key} className="relative flex flex-col items-center text-center">
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

            {/* 3. BANNER INFORMASI SOP / JAMINAN KEPUTUSAN */}
            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-tint bg-teal-tint/60 px-4 py-2.5 text-xs text-navy">
              <div className="flex items-center gap-2">
                <svg className="size-4 shrink-0 text-biru" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  <strong>Peran PPABP:</strong> Halaman ini bersifat <em>read-only</em> tembusan pengawasan. PPABP memantau dampak pembayaran agar kalkulasi yang telah lolos/terkirim dapat direkonsiliasi.
                </span>
              </div>
              {sumber && (
                <span className="text-[11px] font-semibold text-ink-2">
                  Sistem Sumber: <span className="font-mono font-bold text-navy">{sumber}</span>
                </span>
              )}
            </div>
          </div>

          {/* 4. DUA KOLOM LANDSCAPE: Histori Pelacakan (Kiri) vs Klaim Pegawai & Konteks Pembayaran PPABP (Kanan) */}
          <div className="grid grid-cols-1 divide-y divide-line lg:grid-cols-12 lg:divide-x lg:divide-y-0">
            {/* KOLOM KIRI: Histori Perjalanan Banding (Tracking Timeline) */}
            <div className="p-5 lg:col-span-6">
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
                      {/* Waktu */}
                      <div className="w-24 shrink-0 pt-0.5 text-right font-mono text-[11px] font-semibold text-muted sm:w-28">
                        {formatWaktuTracker(cp.tanggal)}
                      </div>

                      {/* Garis & Titik Vertikal */}
                      <div className="relative flex flex-col items-center self-stretch">
                        {cp.isLatest ? (
                          <span className="relative z-10 flex size-4 items-center justify-center rounded-full bg-white ring-2 ring-biru">
                            <span className="size-2 rounded-full bg-biru" />
                          </span>
                        ) : (
                          <span className="relative z-10 size-2.5 rounded-full bg-line" />
                        )}
                        {!isLast && <div className="w-0.5 grow bg-line-2 my-1" />}
                      </div>

                      {/* Isi Peristiwa */}
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

            {/* KOLOM KANAN: Rincian Klaim & Konteks Pembayaran PPABP */}
            <div className="bg-surface-2/40 p-5 lg:col-span-6 flex flex-col justify-between">
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
                  Rincian Banding & Usulan
                </h4>

                {/* Telaah Kasubag TU Sebelumnya */}
                {logKasubag && (
                  <div className="rounded-xl border border-biru/30 bg-teal-tint/40 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-navy">
                      Hasil Verifikasi Satker ({logKasubag.approverJabatan})
                    </p>
                    <p className="mt-0.5 text-xs font-bold text-ink">
                      {logKasubag.approverNama} &bull; {formatWaktuTracker(logKasubag.timestampAksi)}
                    </p>
                    {logKasubag.catatan && (
                      <p className="mt-1 text-xs italic text-ink-2">&ldquo;{logKasubag.catatan}&rdquo;</p>
                    )}
                  </div>
                )}

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

                {/* Tombol Periksa Presensi Terkait */}
                {banding.referensiTipe === "PRESENSI" && (
                  <Link
                    href={`/tukin/presensi/${banding.pegawai.nip}?bulan=${banding.periodeBulan}&tahun=${banding.periodeTahun}`}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-bold text-ink-2 shadow-sm transition hover:border-biru hover:text-biru"
                  >
                    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Periksa Rincian Presensi {banding.pegawai.nama}
                  </Link>
                )}
              </div>

              {/* KONTEKS STATUS PEMBAYARAN & TINDAK LANJUT REKONSILIASI PPABP */}
              <div className="mt-4 pt-3 border-t border-line">
                <div
                  className={`rounded-xl border p-3.5 text-xs ${
                    sudahBergerak.length > 0
                      ? "border-gold/50 bg-gold-tint/40 shadow-xs"
                      : "border-line bg-surface"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-ink uppercase text-[10px] tracking-wider">
                      Status Pembayaran Periode {banding.periodeBulan}/{banding.periodeTahun}
                    </p>
                    {sudahBergerak.length > 0 && (
                      <span className="chip chip-warn text-[10px] font-bold">
                        ⚠️ Terkunci / Siap ADK
                      </span>
                    )}
                  </div>

                  {pembayaran.length === 0 ? (
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">
                      Belum ada baris kalkulasi untuk pegawai ini pada periode {banding.periodeBulan}/{banding.periodeTahun}.
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {pembayaran.map((p) => (
                        <span
                          key={p.jenis}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold ${
                            STATUS_SUDAH_BERGERAK.has(p.status)
                              ? "border-gold bg-white text-gold-deep shadow-2xs"
                              : "border-line bg-surface-2 text-ink-2"
                          }`}
                        >
                          <span>{p.jenis}:</span>
                          <span
                            className={
                              STATUS_SUDAH_BERGERAK.has(p.status)
                                ? "text-navy font-black"
                                : "text-muted"
                            }
                          >
                            {p.status}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}

                  {sudahBergerak.length > 0 ? (
                    <div className="mt-3 pt-2.5 border-t border-gold/30">
                      <p className="text-xs text-ink-2 leading-relaxed">
                        Data pembayaran sudah disahkan (<em>APPROVED</em>/<em>DIKIRIM</em>). Jika OSDMA menyetujui banding, tindak lanjut penyesuaian dana perlu melalui mekanisme tahan atau susulan.
                      </p>
                      <div className="mt-2 flex justify-end">
                        <Link
                          href="/ppabp/rekonsiliasi"
                          className="btn btn-warning btn-sm inline-flex items-center gap-1.5 font-bold"
                        >
                          Buka Menu Rekonsiliasi PPABP &rarr;
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-muted">
                      Kalkulasi belum dikirim ke ADK/Web Gaji. Penyesuaian data dapat langsung tercakup pada siklus kalkulasi berikutnya.
                    </p>
                  )}
                </div>
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

