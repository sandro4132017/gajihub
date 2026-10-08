"use client";

import { useState, useActionState, useEffect } from "react";
import { signSptjmLemburAction, cekStatusTteAction, type TteActionResult } from "./actions";
import { Modal } from "@/app/Modal";
import { FiCheckCircle, FiLock, FiAlertCircle, FiDownload, FiFileText } from "react-icons/fi";

const INITIAL_STATE: TteActionResult = {};

interface ModalPassphraseTteProps {
  terbuka: boolean;
  onTutup: () => void;
  periodeBulan: number;
  periodeTahun: number;
  satuanKerja: string;
  defaultNik?: string;
  onSukses?: (result: TteActionResult) => void;
}

export function ModalPassphraseTte({
  terbuka,
  onTutup,
  periodeBulan,
  periodeTahun,
  satuanKerja,
  defaultNik = "0803202100007062",
  onSukses,
}: ModalPassphraseTteProps) {
  const [state, formAction, pending] = useActionState(signSptjmLemburAction, INITIAL_STATE);
  const [passphrase, setPassphrase] = useState("");
  const [nik, setNik] = useState(defaultNik);
  const [statusSertifikat, setStatusSertifikat] = useState<{
    loading: boolean;
    status?: string;
    pesan?: string;
  }>({ loading: false });

  // Pengecekan status sertifikat saat modal pertama kali dibuka
  useEffect(() => {
    if (terbuka && nik) {
      setStatusSertifikat({ loading: true });
      cekStatusTteAction(nik).then((res) => {
        if ("status" in res) {
          setStatusSertifikat({
            loading: false,
            status: res.status,
            pesan: res.message,
          });
        } else {
          setStatusSertifikat({
            loading: false,
            status: "ERROR",
            pesan: res.error || "Gagal memeriksa status.",
          });
        }
      });
    }
  }, [terbuka, nik]);

  // Efek ketika penandatanganan selesai / sukses
  useEffect(() => {
    if (state.success && onSukses) {
      onSukses(state);
    }
  }, [state, onSukses]);

  const handleTutup = () => {
    setPassphrase("");
    onTutup();
  };

  return (
    <Modal
      terbuka={terbuka}
      judul="Tanda Tangan Elektronik SPTJM"
      nada={state.success ? "sukses" : state.error ? "bahaya" : "netral"}
      onTutup={pending ? null : handleTutup}
      aksi={
        state.success ? (
          <div className="flex w-full items-center justify-between gap-2">
            <a
              href={state.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm flex items-center gap-1.5"
            >
              <FiDownload className="size-4" /> Unduh Dokumen SPTJM
            </a>
            <button type="button" onClick={handleTutup} className="btn btn-ghost btn-sm">
              Selesai
            </button>
          </div>
        ) : null
      }
    >
      {state.success ? (
        <div className="space-y-3 py-2">
          <div className="rounded-xl border border-green/30 bg-green/10 p-3.5 text-ink-2">
            <p className="flex items-center gap-2 text-sm font-bold text-green">
              <FiCheckCircle className="size-4 shrink-0" /> Dokumen Berhasil Ditandatangani
            </p>
            <p className="mt-1.5 text-xs">
              SPTJM Uang Lembur periode {periodeBulan}/{periodeTahun} telah berhasil ditandatangani
              secara digital melalui Balai Sertifikasi Elektronik (BSrE) BSSN.
            </p>
            <div className="mt-3 rounded-lg bg-surface p-2.5 font-mono text-[11px] text-muted">
              <div>ID Dokumen BSrE: <span className="font-bold text-ink">{state.idDokumenBsre}</span></div>
            </div>
          </div>
        </div>
      ) : (
        <form action={formAction} className="space-y-4 pt-1">
          <input type="hidden" name="bulan" value={periodeBulan} />
          <input type="hidden" name="tahun" value={periodeTahun} />

          {/* Rangkuman Dokumen yang akan ditandatangani */}
          <div className="rounded-xl border border-line-2 bg-surface-2 p-3 text-xs">
            <div className="flex items-start gap-2.5">
              <FiFileText className="mt-0.5 size-4 text-biru shrink-0" />
              <div>
                <span className="font-bold text-ink">Dokumen:</span> SPTJM Uang Lembur
                <p className="text-muted">Unit: {satuanKerja}</p>
                <p className="text-muted">Periode: {periodeBulan}/{periodeTahun}</p>
              </div>
            </div>
          </div>

          {/* Status Sertifikat BSrE */}
          {statusSertifikat.loading ? (
            <div className="text-[11px] text-muted italic">Memeriksa status sertifikat di server BSrE...</div>
          ) : statusSertifikat.status ? (
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="font-semibold text-muted">Status Sertifikat BSrE:</span>
              <span className={`font-mono font-bold ${statusSertifikat.status === "ISSUE" ? "text-green" : "text-gold-deep"}`}>
                {statusSertifikat.status} ({statusSertifikat.pesan})
              </span>
            </div>
          ) : null}

          {/* Form NIK Penandatangan (Default / Readonly untuk testing) */}
          <div>
            <label className="block text-xs font-semibold text-ink" htmlFor="tte-nik">
              NIK Penandatangan
            </label>
            <input
              id="tte-nik"
              type="text"
              name="nik"
              value={nik}
              onChange={(e) => setNik(e.target.value)}
              className="field-input mt-1 w-full font-mono text-xs"
              placeholder="16 digit NIK"
              required
            />
            <p className="mt-1 text-[10px] text-muted">
              *Dalam mode integrasi dev, menggunakan NIK dummy terverifikasi BSrE.
            </p>
          </div>

          {/* Form Passphrase (KRITERIA BSrE: autocomplete="off", type="password") */}
          <div>
            <label className="block text-xs font-semibold text-ink" htmlFor="tte-passphrase">
              Passphrase BSrE
            </label>
            <div className="relative mt-1">
              <input
                id="tte-passphrase"
                type="password"
                name="passphrase"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                autoComplete="off"
                placeholder="Masukkan passphrase sertifikat elektronik Anda"
                className="field-input w-full pr-8 text-xs"
                required
              />
              <FiLock className="absolute right-2.5 top-2.5 size-3.5 text-muted pointer-events-none" />
            </div>
            <p className="mt-1 text-[10px] text-muted">
              Passphrase dienkripsi dan diproses langsung ke server BSrE tanpa disimpan di database Gajihub.
            </p>
          </div>

          {/* Notifikasi Error dari BSrE */}
          {state.error && (
            <div className="rounded-lg border border-red/30 bg-red-tint p-2.5 text-xs text-red flex items-start gap-2">
              <FiAlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{state.error}</span>
            </div>
          )}

          {/* Tombol Eksekusi TTE */}
          <div className="mt-5 flex items-center justify-end gap-2 pt-2 border-t border-line-2">
            <button
              type="button"
              disabled={pending}
              onClick={handleTutup}
              className="btn btn-ghost btn-sm"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={pending || !passphrase}
              className="btn btn-primary btn-sm flex items-center gap-1.5"
            >
              {pending ? "Memproses Tanda Tangan..." : "Tanda Tangani Sekarang"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
