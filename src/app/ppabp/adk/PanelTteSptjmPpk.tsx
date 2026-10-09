"use client";

import { useState } from "react";
import { ModalPassphraseTte } from "@/app/tte/ModalPassphraseTte";
import { type JenisSptjm } from "@/lib/tte/sptjmTypes";
import {
  FiFileText,
  FiCheckCircle,
  FiDownload,
  FiEdit3,
  FiShield,
  FiExternalLink,
} from "react-icons/fi";

interface PanelTteSptjmPpkProps {
  periodeBulan: number;
  periodeTahun: number;
  adkAktif: "tukin" | "uang-makan" | "uang-lembur";
  satuanKerja?: string;
  dokumenTteAwal?: {
    id: string;
    status: string;
    nomorDokumen: string | null;
    fileSignedPath: string | null;
    signedAt: string | null;
    penandatanganNama: string | null;
  } | null;
}

export function PanelTteSptjmPpk({
  periodeBulan,
  periodeTahun,
  adkAktif,
  satuanKerja = "Biro Keuangan dan BMN",
  dokumenTteAwal,
}: PanelTteSptjmPpkProps) {
  const [modalTerbuka, setModalTerbuka] = useState(false);
  const [dokumen, setDokumen] = useState(dokumenTteAwal);

  // Mapping jenis ADK ke JenisSptjm
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

  const isSudahTte = dokumen?.status === "TERTANDATANGANI";

  return (
    <div className="rounded-2xl border border-teal/20 bg-gradient-to-r from-teal-tint/40 via-surface-2 to-surface-2 p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Sisi Kiri: Informasi Dokumen & Status */}
        <div className="flex items-start gap-3.5">
          <div className="rounded-xl bg-teal-tint p-3 text-navy shadow-inner shrink-0">
            <FiShield className="size-6 text-biru" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-ink">
                SPTJM PPK untuk SAKTI ({labelJenis})
              </h3>
              {isSudahTte ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green/10 px-2.5 py-0.5 text-xs font-bold text-green border border-green/20">
                  <FiCheckCircle className="size-3.5" /> Sudah TTE BSrE
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-gold-tint px-2.5 py-0.5 text-xs font-bold text-gold-deep border border-gold-deep/20">
                  Belum Ditandatangani
                </span>
              )}
            </div>

            <p className="mt-1 text-xs text-muted leading-relaxed">
              {isSudahTte ? (
                <>
                  Telah disahkan oleh{" "}
                  <strong className="text-ink">
                    {dokumen?.penandatanganNama || "Alpha Sandro Adithyaswara, S.Sos., M.M. (PPK)"}
                  </strong>
                  . Nomor Dokumen:{" "}
                  <span className="font-mono font-semibold text-biru">
                    {dokumen?.nomorDokumen}
                  </span>
                  . Berkas ini siap dilampirkan bersama ADK ke aplikasi SAKTI.
                </>
              ) : (
                <>
                  Surat Pernyataan Tanggung Jawab Mutlak (SPTJM) resmi dari Pejabat Pembuat Komitmen
                  (PPK) sebagai lampiran wajib saat ADK diajukan ke SAKTI / KPPN.
                </>
              )}
            </p>
          </div>
        </div>

        {/* Sisi Kanan: Tombol Aksi */}
        <div className="flex flex-wrap items-center gap-2 shrink-0 self-start lg:self-center">
          {isSudahTte && dokumen?.fileSignedPath ? (
            <a
              href={dokumen.fileSignedPath}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm flex items-center gap-1.5 text-xs shadow-sm hover:shadow"
            >
              <FiDownload className="size-4" /> Unduh PDF SPTJM TTE
            </a>
          ) : null}

          <button
            type="button"
            onClick={() => setModalTerbuka(true)}
            className={`btn btn-sm flex items-center gap-1.5 text-xs ${
              isSudahTte ? "btn-secondary" : "btn-primary shadow-sm"
            }`}
          >
            <FiEdit3 className="size-3.5" />
            {isSudahTte ? "Tanda Tangani Ulang" : "Tanda Tangani SPTJM PPK"}
          </button>
        </div>
      </div>

      {/* Modal Interaktif Passphrase & Penomoran Opsi A */}
      <ModalPassphraseTte
        terbuka={modalTerbuka}
        onTutup={() => setModalTerbuka(false)}
        jenisDokumen={jenisSptjm}
        periodeBulan={periodeBulan}
        periodeTahun={periodeTahun}
        satuanKerja={satuanKerja}
        defaultNomorDokumen={dokumen?.nomorDokumen || undefined}
        onSukses={(res) => {
          if (res.downloadUrl) {
            setDokumen({
              id: res.dokumenId || "new",
              status: "TERTANDATANGANI",
              nomorDokumen: res.nomorDokumen || null,
              fileSignedPath: res.downloadUrl,
              signedAt: new Date().toISOString(),
              penandatanganNama: "Alpha Sandro Adithyaswara, S.Sos., M.M.",
            });
          }
        }}
      />
    </div>
  );
}

