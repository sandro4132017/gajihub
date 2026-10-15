"use client";

import { useState } from "react";
import { ModalPassphraseTte } from "@/app/tte/ModalPassphraseTte";
import { type JenisSptjm } from "@/lib/tte/sptjmTypes";
import { FiCheckCircle, FiFileText, FiDownload, FiEdit3 } from "react-icons/fi";

const CONFIG_JENIS: Record<
  JenisSptjm,
  { judul: string; label: string; deskripsiBelum: string }
> = {
  SPTJM_TUKIN: {
    judul: "TTE SPTJM Tunjangan Kinerja",
    label: "Tukin",
    deskripsiBelum:
      "SPTJM Tukin disahkan secara elektronik menggunakan sertifikat digital BSrE BSSN sebelum kirim rekap.",
  },
  SPTJM_UANG_MAKAN: {
    judul: "TTE SPTJM Uang Makan",
    label: "Uang Makan",
    deskripsiBelum:
      "SPTJM Uang Makan disahkan secara elektronik menggunakan sertifikat digital BSrE BSSN sebelum kirim rekap.",
  },
  SPTJM_LEMBUR: {
    judul: "TTE SPTJM Uang Lembur",
    label: "Uang Lembur",
    deskripsiBelum:
      "SPTJM Uang Lembur disahkan secara elektronik menggunakan sertifikat digital BSrE BSSN sebelum kirim rekap.",
  },
};

interface PanelTteSptjmProps {
  jenisDokumen?: JenisSptjm;
  periodeBulan: number;
  periodeTahun: number;
  satuanKerja: string;
  dokumenTteTerbaru?: {
    id: string;
    status: string;
    nomorDokumen: string | null;
    fileSignedPath: string | null;
    signedAt: string | null;
    penandatanganNama: string | null;
  } | null;
}

export function PanelTteSptjm({
  jenisDokumen = "SPTJM_TUKIN",
  periodeBulan,
  periodeTahun,
  satuanKerja,
  dokumenTteTerbaru,
}: PanelTteSptjmProps) {
  const [modalTerbuka, setModalTerbuka] = useState(false);
  const [dokumen, setDokumen] = useState(dokumenTteTerbaru);

  const isSudahTte = dokumen?.status === "TERTANDATANGANI";
  const cfg = CONFIG_JENIS[jenisDokumen] ?? {
    judul: `TTE ${jenisDokumen}`,
    label: jenisDokumen,
    deskripsiBelum:
      "SPTJM disahkan secara elektronik menggunakan sertifikat digital BSrE BSSN sebelum kirim rekap.",
  };

  return (
    <div className="rounded-xl border border-line-2 bg-surface-2 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-teal-tint p-2 text-navy">
            <FiFileText className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-ink">
                {cfg.judul}
              </h4>
              {isSudahTte ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green/10 px-2 py-0.5 text-[11px] font-bold text-green">
                  <FiCheckCircle className="size-3" /> Sudah Ditandatangani
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-gold-tint px-2 py-0.5 text-[11px] font-bold text-gold-deep">
                  Belum Ditandatangani
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {isSudahTte
                ? `Ditandatangani secara digital oleh ${dokumen?.penandatanganNama || "Kasubag TU"} via BSrE BSSN.`
                : cfg.deskripsiBelum}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isSudahTte && dokumen?.fileSignedPath ? (
            <a
              href={dokumen.fileSignedPath}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs"
            >
              <FiDownload className="size-3.5" /> Unduh PDF TTE
            </a>
          ) : null}

          <button
            type="button"
            onClick={() => setModalTerbuka(true)}
            className="btn btn-primary btn-sm flex items-center gap-1.5 text-xs"
          >
            <FiEdit3 className="size-3.5" />
            {isSudahTte ? "Tanda Tangani Ulang" : "Tanda Tangani SPTJM"}
          </button>
        </div>
      </div>

      <ModalPassphraseTte
        terbuka={modalTerbuka}
        onTutup={() => setModalTerbuka(false)}
        jenisDokumen={jenisDokumen}
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
              penandatanganNama: "Kasubag Tata Usaha",
            });
          }
        }}
      />
    </div>
  );
}

