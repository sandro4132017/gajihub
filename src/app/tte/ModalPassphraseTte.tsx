"use client";

import { useState, useActionState, useEffect, useTransition } from "react";
import {
  signSptjmPpkAction,
  cekStatusTteAction,
  buatDraftSptjmAction,
  type TteActionResult,
} from "./actions";
import { type JenisSptjm, generateNomorSptjmDefault } from "@/lib/tte/sptjmTypes";
import { Modal } from "@/app/Modal";
import {
  FiCheckCircle,
  FiLock,
  FiAlertCircle,
  FiDownload,
  FiFileText,
  FiEye,
  FiEdit2,
  FiInfo,
} from "react-icons/fi";

const INITIAL_STATE: TteActionResult = {};

interface ModalPassphraseTteProps {
  terbuka: boolean;
  onTutup: () => void;
  jenisDokumen?: JenisSptjm;
  periodeBulan: number;
  periodeTahun: number;
  satuanKerja?: string;
  defaultNomorDokumen?: string;
  defaultNik?: string;
  namaPenandatanganDefault?: string;
  nipPenandatanganDefault?: string;
  jabatanPenandatanganDefault?: string;
  onSukses?: (result: TteActionResult) => void;
}

export function ModalPassphraseTte({
  terbuka,
  onTutup,
  jenisDokumen = "SPTJM_TUKIN",
  periodeBulan,
  periodeTahun,
  satuanKerja = "Biro Keuangan dan BMN",
  defaultNomorDokumen,
  defaultNik = "0803202100007062",
  namaPenandatanganDefault = "Alpha Sandro Adithyaswara, S.Sos., M.M.",
  nipPenandatanganDefault = "19870323 201503 1 002",
  jabatanPenandatanganDefault = "Pejabat Pembuat Komitmen",
  onSukses,
}: ModalPassphraseTteProps) {
  const [state, formAction, pending] = useActionState(signSptjmPpkAction, INITIAL_STATE);
  const [passphrase, setPassphrase] = useState("");
  const [nik, setNik] = useState(defaultNik);

  // Penomoran Dokumen Opsi A: Default otomatis dari sistem & editable
  const nomorAwal =
    defaultNomorDokumen ||
    generateNomorSptjmDefault(jenisDokumen, periodeBulan, periodeTahun);
  const [nomorDokumen, setNomorDokumen] = useState(nomorAwal);

  const [statusSertifikat, setStatusSertifikat] = useState<{
    loading: boolean;
    status?: string;
    pesan?: string;
  }>({ loading: false });

  // State untuk pratinjau draft PDF
  const [draftPending, startDraftTransition] = useTransition();
  const [draftError, setDraftError] = useState<string | null>(null);

  // Perbarui nomor dokumen saat jenis/periode berubah
  useEffect(() => {
    if (terbuka) {
      setNomorDokumen(
        defaultNomorDokumen ||
          generateNomorSptjmDefault(jenisDokumen, periodeBulan, periodeTahun)
      );
    }
  }, [terbuka, jenisDokumen, periodeBulan, periodeTahun, defaultNomorDokumen]);

  // Cek status sertifikat saat modal pertama kali dibuka
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
            status: "OFFLINE",
            pesan: res.error || "Server BSrE sedang offline (mode simulasi aktif).",
          });
        }
      });
    }
  }, [terbuka, nik]);

  // Callback sukses
  useEffect(() => {
    if (state.success && onSukses) {
      onSukses(state);
    }
  }, [state, onSukses]);

  const handleTutup = () => {
    setPassphrase("");
    onTutup();
  };

  const labelJenis =
    jenisDokumen === "SPTJM_TUKIN"
      ? "Tunjangan Kinerja (Tukin)"
      : jenisDokumen === "SPTJM_UANG_MAKAN"
      ? "Uang Makan"
      : "Uang Lembur";

  const handlePratinjauDraft = () => {
    setDraftError(null);
    startDraftTransition(async () => {
      const res = await buatDraftSptjmAction({
        jenis: jenisDokumen,
        bulan: periodeBulan,
        tahun: periodeTahun,
        nomorDokumen,
        satuanKerja,
      });

      if (res.success && res.downloadUrl) {
        window.open(res.downloadUrl, "_blank");
      } else {
        setDraftError(res.error || "Gagal membuat draft PDF.");
      }
    });
  };

  return (
    <Modal
      terbuka={terbuka}
      judul={`Tanda Tangan Elektronik SPTJM PPK - ${labelJenis}`}
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
              <FiDownload className="size-4" /> Unduh PDF SPTJM TTE
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
              <FiCheckCircle className="size-4 shrink-0" /> SPTJM Berhasil Ditandatangani
            </p>
            <p className="mt-1.5 text-xs text-ink">
              Dokumen <strong>{labelJenis}</strong> periode {periodeBulan}/{periodeTahun}{" "}
              telah disahkan secara elektronik dengan nomor <strong>{nomorDokumen}</strong>.
            </p>
            {state.isSimulasi && (
              <p className="mt-1 text-[11px] text-muted italic">
                *Tanda tangan digital dibubuhkan dalam mode simulasi dev (siap masuk SAKTI).
              </p>
            )}
            <div className="mt-3 rounded-lg bg-surface p-2.5 font-mono text-[11px] text-muted">
              <div>
                ID Dokumen BSrE:{" "}
                <span className="font-bold text-ink">{state.idDokumenBsre}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <form action={formAction} className="space-y-4 pt-1">
          <input type="hidden" name="jenis" value={jenisDokumen} />
          <input type="hidden" name="bulan" value={periodeBulan} />
          <input type="hidden" name="tahun" value={periodeTahun} />
          <input type="hidden" name="satuanKerja" value={satuanKerja} />
          <input type="hidden" name="namaPenandatangan" value={namaPenandatanganDefault} />
          <input type="hidden" name="nipPenandatangan" value={nipPenandatanganDefault} />
          <input type="hidden" name="jabatanPenandatangan" value={jabatanPenandatanganDefault} />

          {/* Rangkuman Dokumen & Penandatangan PPK */}
          <div className="rounded-xl border border-line-2 bg-surface-2 p-3 text-xs space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <FiFileText className="mt-0.5 size-4 text-biru shrink-0" />
                <div>
                  <span className="font-bold text-ink">{labelJenis}</span>
                  <p className="text-muted">
                    Periode: Bulan {periodeBulan} / Tahun {periodeTahun}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handlePratinjauDraft}
                disabled={draftPending}
                className="btn btn-secondary btn-sm flex items-center gap-1 text-[11px] shrink-0"
              >
                <FiEye className="size-3" />
                {draftPending ? "Memuat Draft..." : "Pratinjau Draft"}
              </button>
            </div>

            <div className="border-t border-line-2 pt-1.5 text-[11px] text-muted flex items-center justify-between">
              <span>Penandatangan (PPK):</span>
              <span className="font-semibold text-ink">{namaPenandatanganDefault}</span>
            </div>
          </div>

          {draftError && (
            <div className="text-[11px] text-red">{draftError}</div>
          )}

          {/* OPSI A: Nomor Dokumen Editable */}
          <div>
            <div className="flex items-center justify-between">
              <label
                className="block text-xs font-semibold text-ink flex items-center gap-1"
                htmlFor="tte-nomor"
              >
                <FiEdit2 className="size-3 text-biru" /> Nomor Dokumen SPTJM (Opsi A)
              </label>
              <span className="text-[10px] text-muted">Dapat diedit sesuai register</span>
            </div>
            <input
              id="tte-nomor"
              type="text"
              name="nomorDokumen"
              value={nomorDokumen}
              onChange={(e) => setNomorDokumen(e.target.value)}
              className="field-input mt-1 w-full font-mono text-xs font-semibold"
              placeholder="Contoh: 1/3059/KU.02/X/2026"
              required
            />
          </div>

          {/* Status Sertifikat BSrE */}
          {statusSertifikat.loading ? (
            <div className="text-[11px] text-muted italic">
              Memeriksa sertifikat elektronik di server BSrE...
            </div>
          ) : statusSertifikat.status ? (
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="font-semibold text-muted">Sertifikat BSrE:</span>
              <span
                className={`font-mono font-bold ${
                  statusSertifikat.status === "ISSUE"
                    ? "text-green"
                    : statusSertifikat.status === "OFFLINE"
                    ? "text-blue-500"
                    : "text-gold-deep"
                }`}
              >
                {statusSertifikat.status} ({statusSertifikat.pesan})
              </span>
            </div>
          ) : null}

          {/* NIK Penandatangan BSrE */}
          <div>
            <label className="block text-xs font-semibold text-ink" htmlFor="tte-nik">
              NIK Penandatangan BSrE
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
            <p className="mt-0.5 text-[10px] text-muted">
              *Akun uji coba dev BSrE: <code>0803202100007062</code> (Passphrase: <code>Bsre2026.#!</code>)
            </p>
          </div>

          {/* Passphrase BSrE (Kriteria V & VIII: type="password", autocomplete="off") */}
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
              Passphrase tidak pernah disimpan di database Gajihub (Kriteria Kepatuhan BSrE BSSN).
            </p>
          </div>

          {/* Notifikasi Error */}
          {state.error && (
            <div className="rounded-lg border border-red/30 bg-red-tint p-2.5 text-xs text-red flex items-start gap-2">
              <FiAlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{state.error}</span>
            </div>
          )}

          {/* Tombol Aksi */}
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
              {pending ? "Memproses TTE BSrE..." : "Tanda Tangani Sekarang"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
