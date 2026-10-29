"use client";

import { useState, useEffect } from "react";
import {
  type JenisSptjm,
  NAMA_BULAN,
  generateNamaFileSptjm,
} from "@/lib/tte/sptjmTypes";
import {
  FiFileText,
  FiCheckCircle,
  FiDownload,
  FiShield,
  FiEye,
  FiExternalLink,
  FiX,
} from "react-icons/fi";

export interface ItemDokumenSptjm {
  id: string;
  status: string;
  nomorDokumen: string | null;
  satuanKerja?: string;
  fileDraftPath?: string | null;
  fileSignedPath: string | null;
  signedAt: string | null;
  penandatanganNama: string | null;
}

interface PanelTteSptjmPpkProps {
  periodeBulan: number;
  periodeTahun: number;
  adkAktif: "tukin" | "uang-makan" | "uang-lembur";
  satuanKerja?: string;
  dokumenTteAwal?: ItemDokumenSptjm | null;
  daftarSptjmUnit?: ItemDokumenSptjm[];
}

export function PanelTteSptjmPpk({
  periodeBulan,
  periodeTahun,
  adkAktif,
  satuanKerja = "",
  dokumenTteAwal,
  daftarSptjmUnit = [],
}: PanelTteSptjmPpkProps) {
  const [dokumen, setDokumen] = useState<ItemDokumenSptjm | null | undefined>(dokumenTteAwal);

  useEffect(() => {
    setDokumen(dokumenTteAwal);
  }, [dokumenTteAwal]);

  // State untuk PDF Viewer Modal
  const [viewerTerbuka, setViewerTerbuka] = useState(false);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [viewerData, setViewerData] = useState<{
    url: string;
    namaFile: string;
    judul: string;
    nomorDokumen?: string | null;
    satuanKerja: string;
    isDraft?: boolean;
  } | null>(null);

  const jenisSptjm: JenisSptjm =
    adkAktif === "tukin"
      ? "SPTJM_TUKIN"
      : adkAktif === "uang-makan"
      ? "SPTJM_UANG_MAKAN"
      : "SPTJM_LEMBUR";

  const labelJenis =
    adkAktif === "tukin"
      ? "Tunjangan Kinerja (Tukin)"
      : adkAktif === "uang-makan"
      ? "Uang Makan"
      : "Uang Lembur";

  const labelBerkasSingkat =
    adkAktif === "tukin"
      ? "SPTJM – Tunjangan Kinerja"
      : adkAktif === "uang-makan"
      ? "SPTJM – Uang Makan"
      : "SPTJM – Uang Lembur";

  const namaBulan =
    NAMA_BULAN[Math.max(0, Math.min(11, periodeBulan - 1))] || `Bulan ${periodeBulan}`;
  const satkerUtama = dokumen?.satuanKerja || satuanKerja;
  const isSudahTte = dokumen?.status === "TERTANDATANGANI";
  const namaFileUtama = generateNamaFileSptjm(
    jenisSptjm,
    periodeBulan,
    periodeTahun,
    satkerUtama
  );

  // Buka PDF Viewer untuk dokumen yang sudah ada URL-nya, atau buat pratinjau draft otomatis
  const handleBukaViewerUtama = async () => {
    setViewerError(null);
    // Berkas dibuka lewat rute berizin; kolom path hanya penanda "sudah ada".
    const existingUrl =
      dokumen?.id && (dokumen.fileSignedPath || dokumen.fileDraftPath)
        ? `/berkas/tte/${dokumen.id}`
        : null;
    if (existingUrl) {
      setViewerData({
        url: existingUrl,
        namaFile: namaFileUtama,
        judul: `SPTJM PPK – ${labelJenis}`,
        nomorDokumen: dokumen?.nomorDokumen,
        satuanKerja: satkerUtama,
        isDraft: !dokumen?.fileSignedPath,
      });
      setViewerTerbuka(true);
      return;
    }

    setViewerLoading(true);
    setViewerTerbuka(true);
    try {
      const r = await fetch("/api/tte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "draft",
          jenis: jenisSptjm,
          bulan: periodeBulan,
          tahun: periodeTahun,
          satuanKerja: satkerUtama,
        }),
      });
      const res = await r.json();
      if (res.success && res.downloadUrl) {
        setViewerData({
          url: res.downloadUrl,
          namaFile: namaFileUtama,
          judul: `Draft SPTJM PPK – ${labelJenis}`,
          nomorDokumen: res.nomorDokumen,
          satuanKerja: satkerUtama,
          isDraft: true,
        });
      } else {
        setViewerError(res.error || "Gagal memuat berkas PDF SPTJM.");
      }
    } catch {
      setViewerError("Gagal menghubungi server untuk memuat pratinjau PDF SPTJM.");
    } finally {
      setViewerLoading(false);
    }
  };

  const handleBukaViewerItem = (item: ItemDokumenSptjm) => {
    if (!(item.fileSignedPath || item.fileDraftPath)) return;
    const url = `/berkas/tte/${item.id}`;
    const satkerItem = item.satuanKerja || satuanKerja;
    setViewerError(null);
    setViewerLoading(false);
    setViewerData({
      url,
      namaFile: generateNamaFileSptjm(jenisSptjm, periodeBulan, periodeTahun, satkerItem),
      judul: `SPTJM PPK – ${labelJenis}`,
      nomorDokumen: item.nomorDokumen,
      satuanKerja: satkerItem,
      isDraft: item.status !== "TERTANDATANGANI",
    });
    setViewerTerbuka(true);
  };

  const tampilTabelMultiBerkas = daftarSptjmUnit.length > 1;

  return (
    <div className="rounded-2xl border border-teal/20 bg-gradient-to-r from-teal-tint/40 via-surface-2 to-surface-2 p-4 sm:p-5 shadow-sm space-y-3.5">
      {/* Tingkat 1: Identitas Dokumen, Status TTE Utama, Penandatangan, & No. Dokumen */}
      <div className="flex items-start gap-3.5">
        <div className="rounded-xl bg-teal-tint p-3 text-navy shadow-inner shrink-0">
          <FiShield className="size-6 text-biru" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-ink">
              SPTJM PPK &ndash; {labelJenis}
            </h3>
            {isSudahTte ? (
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-green/10 px-2.5 py-0.5 text-xs font-bold text-green border border-green/20">
                  <FiCheckCircle className="size-3.5" /> TTE Sah
                </span>
                <span className="text-xs font-medium text-muted">
                  BSrE &middot; {namaBulan} {periodeTahun}
                </span>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-gold-tint px-2.5 py-0.5 text-xs font-bold text-gold-deep border border-gold-deep/20">
                  Belum Ditandatangani
                </span>
                <span className="text-xs font-medium text-muted">
                  {namaBulan} {periodeTahun}
                </span>
              </>
            )}
          </div>

          {isSudahTte ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
              <span>
                Penandatangan:{" "}
                <strong className="font-semibold text-ink">
                  {dokumen?.penandatanganNama || "Kasubag TU unit ini"}
                </strong>
              </span>
              {dokumen?.nomorDokumen && (
                <span>
                  No. Dokumen:{" "}
                  <span className="font-mono font-semibold text-biru">
                    {dokumen.nomorDokumen}
                  </span>
                </span>
              )}
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted leading-relaxed">
              Lampiran wajib Pejabat Pembuat Komitmen (PPK) saat pengajuan ADK ke SAKTI / KPPN.
            </p>
          )}
        </div>
      </div>

      {/* Tingkat 2: Informasi Berkas & Satu Lokasi Aksi Utama */}
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="rounded-lg bg-surface-2 p-2 text-biru shrink-0">
            <FiFileText className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                Berkas
              </span>
              <span className="text-xs font-bold text-ink truncate">
                {labelBerkasSingkat}
              </span>
            </div>
            <p className="text-xs text-muted truncate">{satkerUtama}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* TIDAK ADA TOMBOL TTE DI SINI, dan itu disengaja.

              Keputusan user 2026-10-20: role PPABP TIDAK berwenang
              menandatangani SPTJM - hanya Kasubag TU unit itu sendiri.
              Gerbangnya ditegakkan di canTandatanganiSptjmUnit, jadi tombol
              di sini hanya akan selalu membalas "tidak berwenang": jalan
              buntu yang lebih baik tidak dirender sama sekali.

              Yang tetap tersedia bagi PPABP: melihat dan mengunduh SPTJM
              yang sudah ditandatangani unit. */}
          <span className="chip chip-draft text-[11px] font-semibold">
            TTE oleh Kasubag TU unit
          </span>

          <button
            type="button"
            onClick={handleBukaViewerUtama}
            className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs font-semibold"
          >
            <FiEye className="size-3.5 text-biru" />
            <span>{isSudahTte ? "Lihat PDF" : "Lihat Draft"}</span>
          </button>

          {isSudahTte && dokumen?.fileSignedPath ? (
            <a
              href={`/berkas/tte/${dokumen.id}?unduh=1`}
              download={namaFileUtama}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm flex items-center gap-1.5 text-xs shadow-2xs"
            >
              <FiDownload className="size-3.5" />
              <span>Unduh PDF</span>
            </a>
          ) : null}
        </div>
      </div>

      {/* Tabel hanya ditampilkan jika terdapat lebih dari 1 berkas (lintas unit) */}
      {tampilTabelMultiBerkas && (
        <details className="group rounded-xl border border-line bg-surface p-3.5 shadow-2xs">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-bold text-ink">
            <span className="flex items-center gap-2">
              <FiFileText className="size-4 text-biru" />
              <span>
                Berkas SPTJM &middot; {namaBulan} {periodeTahun} ({daftarSptjmUnit.length})
              </span>
            </span>
            <span className="text-[11px] font-semibold text-biru underline">
              <span className="group-open:hidden">Tampilkan daftar</span>
              <span className="hidden group-open:inline">Sembunyikan</span>
            </span>
          </summary>

          <div className="mt-3 overflow-x-auto border-t border-line-2 pt-2.5">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-[11px] font-bold uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 text-left">Nama Berkas</th>
                  <th className="px-3 py-2 text-left">No. Dokumen</th>
                  <th className="px-3 py-2 text-left">Penandatangan</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {daftarSptjmUnit.map((item) => {
                  const satkerItem = item.satuanKerja || satuanKerja;
                  const namaFileItem = generateNamaFileSptjm(
                    jenisSptjm,
                    periodeBulan,
                    periodeTahun,
                    satkerItem
                  );
                  const urlItem = item.fileSignedPath || item.fileDraftPath ? `/berkas/tte/${item.id}?unduh=1` : null;
                  const sudahTteItem = item.status === "TERTANDATANGANI";

                  return (
                    <tr key={item.id} className="border-b border-line-2 hover:bg-surface-2/60">
                      <td className="px-3 py-2">
                        <span className="font-semibold text-ink block">{labelBerkasSingkat}</span>
                        <span className="text-[11px] text-muted">{satkerItem}</span>
                      </td>
                      <td className="px-3 py-2 font-mono text-ink-2">
                        {item.nomorDokumen || "-"}
                      </td>
                      <td className="px-3 py-2 text-ink-2">
                        {item.penandatanganNama || "-"}
                      </td>
                      <td className="px-3 py-2">
                        {sudahTteItem ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green/10 px-2 py-0.5 text-[10px] font-bold text-green">
                            <FiCheckCircle className="size-3" /> TTE Sah
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gold-tint px-2 py-0.5 text-[10px] font-bold text-gold-deep">
                            Belum TTE
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {urlItem && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleBukaViewerItem(item)}
                                className="btn btn-secondary btn-sm px-2.5 py-1 text-[11px] inline-flex items-center gap-1"
                              >
                                <FiEye className="size-3 text-biru" /> Lihat PDF
                              </button>
                              <a
                                href={urlItem}
                                download={namaFileItem}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-ghost btn-sm px-2.5 py-1 text-[11px] inline-flex items-center gap-1"
                              >
                                <FiDownload className="size-3" /> Unduh PDF
                              </a>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* Modal PDF / File Viewer SPTJM untuk PPABP */}
      {viewerTerbuka && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Penampil Dokumen PDF SPTJM"
          onClick={() => setViewerTerbuka(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 p-3 sm:p-6 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-[90vh] w-[min(68rem,96vw)] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_24px_64px_rgba(19,65,107,0.32)]"
          >
            {/* Header Bar PDF Viewer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <FiFileText className="size-4 text-biru shrink-0" />
                  <h4 className="truncate text-sm font-extrabold text-navy">
                    {viewerData?.namaFile || `SPTJM ${labelJenis}`}
                  </h4>
                  {viewerData?.isDraft ? (
                    <span className="rounded-full bg-gold-tint px-2 py-0.5 text-[10px] font-bold text-gold-deep">
                      Pratinjau Draft
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green/10 px-2 py-0.5 text-[10px] font-bold text-green">
                      <FiCheckCircle className="size-3" /> Tertandatangani
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted">
                  Unit: <strong className="text-ink">{viewerData?.satuanKerja || satuanKerja}</strong>
                  {viewerData?.nomorDokumen ? (
                    <>
                      {" "}
                      &middot; Nomor:{" "}
                      <span className="font-mono font-semibold text-ink">
                        {viewerData.nomorDokumen}
                      </span>
                    </>
                  ) : null}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {viewerData?.url && (
                  <>
                    <a
                      href={viewerData.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary btn-sm inline-flex items-center gap-1.5 text-xs"
                      title="Buka di tab baru browser"
                    >
                      <FiExternalLink className="size-3.5" />
                      <span className="hidden sm:inline">Tab Baru</span>
                    </a>
                    <a
                      href={viewerData.url}
                      download={viewerData.namaFile}
                      className="btn btn-primary btn-sm inline-flex items-center gap-1.5 text-xs"
                    >
                      <FiDownload className="size-3.5" />
                      <span>Unduh PDF</span>
                    </a>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setViewerTerbuka(false)}
                  aria-label="Tutup penampil PDF"
                  className="rounded-lg p-1.5 text-muted transition hover:bg-line/50 hover:text-ink"
                >
                  <FiX className="size-5" />
                </button>
              </div>
            </div>

            {/* Area Isi PDF Viewer */}
            <div className="relative flex-1 bg-navy/5">
              {viewerLoading ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted">
                  <div className="size-7 animate-spin rounded-full border-2 border-biru border-t-transparent" />
                  <span>Menyiapkan berkas PDF SPTJM...</span>
                </div>
              ) : viewerError ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <p className="text-sm font-bold text-red">{viewerError}</p>
                  <button
                    type="button"
                    onClick={handleBukaViewerUtama}
                    className="btn btn-secondary btn-sm text-xs"
                  >
                    Coba Lagi
                  </button>
                </div>
              ) : viewerData?.url ? (
                <iframe
                  src={`${viewerData.url}#toolbar=1&navpanes=0&view=FitH`}
                  title={viewerData.namaFile}
                  className="h-full w-full border-0"
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
