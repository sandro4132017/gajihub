"use client";

import { useState } from "react";
import { FiAlertTriangle, FiCheckCircle, FiDownload, FiEdit3, FiEye, FiFileText } from "react-icons/fi";
import { ModalPassphraseTte } from "../../tte/ModalPassphraseTte";
import type { TteActionResult } from "../../tte/actions";

export interface SpklTertandatangani {
  id: string;
  nomorDokumen: string | null;
  /** Teks siap tampil, mis. "31 Desember 2026, 15.04 WIB". */
  ditandatanganiPada: string;
  penandatanganNama: string | null;
}

interface Props {
  periodeBulan: number;
  periodeTahun: number;
  /** Teks siap tampil, mis. "Desember 2026". */
  labelPeriode: string;
  satuanKerja: string;
  namaPenandatangan: string;
  /** Pemegang sesi berwenang menandatangani; false = lihat-saja. */
  boleh: boolean;
  /** Tidak ada perintah terkirim pada bulan itu. */
  kosong: boolean;
  /** Ringkasan satu baris untuk kotak rangkuman modal. */
  ringkasan: string;
  sudah: SpklTertandatangani | null;
  /** Perintah yang terkirim sesudah SPKL ditandatangani (tidak termuat di dalamnya). */
  perintahSesudahTtd: number;
}

const API = "/api/lembur/spkl";

async function panggilApi(badan: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(badan),
  });
  // Jawaban non-JSON (halaman galat proxy) dilempar ke pemanggil sebagai kegagalan jaringan.
  return (await r.json()) as Record<string, unknown>;
}

function unduhPdf(base64: string, nama: string) {
  const biner = atob(base64);
  const bita = new Uint8Array(biner.length);
  for (let i = 0; i < biner.length; i++) bita[i] = biner.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bita], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function PanelSpklBulanan({
  periodeBulan,
  periodeTahun,
  labelPeriode,
  satuanKerja,
  namaPenandatangan,
  boleh,
  kosong,
  ringkasan,
  sudah: sudahDariServer,
  perintahSesudahTtd,
}: Props) {
  const [modalTerbuka, setModalTerbuka] = useState(false);
  const [pratinjauMemuat, setPratinjauMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  // Modal TETAP dirender sesudah berhasil: router.refresh() mengubah `sudah`
  // dan kalau modalnya ikut dilepas, popup hasil hilang sebelum terbaca.
  const [baruDitandatangani, setBaruDitandatangani] = useState<SpklTertandatangani | null>(null);
  const sudah = sudahDariServer ?? baruDitandatangani;

  async function pratinjau() {
    setGalat(null);
    setPratinjauMemuat(true);
    try {
      const res = await panggilApi({ action: "spkl-bulanan-pratinjau", bulan: periodeBulan, tahun: periodeTahun });
      if (res.success === true && typeof res.pdfBase64 === "string") {
        unduhPdf(res.pdfBase64, String(res.namaBerkas ?? "Pratinjau SPKL.pdf"));
      } else {
        setGalat(typeof res.error === "string" ? res.error : "Pratinjau gagal dibuat.");
      }
    } catch {
      setGalat("Tidak bisa menghubungi server untuk pratinjau. Periksa koneksi lalu coba lagi.");
    } finally {
      setPratinjauMemuat(false);
    }
  }

  async function kirimTandaTangan(nik: string, passphrase: string): Promise<TteActionResult> {
    try {
      const res = await panggilApi({ action: "spkl-bulanan-kirim", bulan: periodeBulan, tahun: periodeTahun, nik, passphrase });
      if (res.success === true) return res as TteActionResult;
      return { error: typeof res.error === "string" ? res.error : "SPKL gagal ditandatangani." };
    } catch {
      return { error: "Gagal menghubungi server TTE. Periksa koneksi lalu coba lagi." };
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {sudah ? (
          <>
            <a
              href={`/berkas/tte/${sudah.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary flex items-center gap-1.5"
            >
              <FiEye className="size-4 text-biru" aria-hidden="true" /> Lihat PDF
            </a>
            <a
              href={`/berkas/tte/${sudah.id}?unduh=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary flex items-center gap-1.5"
            >
              <FiDownload className="size-4" aria-hidden="true" /> Unduh PDF
            </a>
          </>
        ) : boleh ? (
          <>
            <button
              type="button"
              onClick={pratinjau}
              disabled={kosong || pratinjauMemuat}
              className="btn btn-secondary flex items-center gap-1.5 disabled:opacity-60"
            >
              <FiFileText className="size-4" aria-hidden="true" />
              {pratinjauMemuat ? "Menyiapkan pratinjau..." : "Pratinjau PDF"}
            </button>
            <button
              type="button"
              onClick={() => setModalTerbuka(true)}
              disabled={kosong}
              title={kosong ? "Belum ada perintah lembur terkirim pada bulan ini." : undefined}
              className="btn btn-primary flex items-center gap-1.5 disabled:opacity-60"
            >
              <FiEdit3 className="size-4" aria-hidden="true" />
              Tandatangani SPKL
            </button>
          </>
        ) : (
          <p className="text-xs text-muted">
            Anda melihat rekap ini saja. SPKL bulanan ditandatangani oleh Kasubag TU unit yang bersangkutan.
          </p>
        )}
      </div>

      {sudah && (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1 font-semibold text-green">
            <FiCheckCircle className="size-3.5" aria-hidden="true" /> Sudah ditandatangani
          </span>
          <span>
            {sudah.ditandatanganiPada}
            {sudah.penandatanganNama ? <> oleh <strong className="font-semibold text-ink">{sudah.penandatanganNama}</strong></> : null}
          </span>
          {sudah.nomorDokumen && <span className="font-mono text-ink-2">NOMOR {sudah.nomorDokumen}</span>}
        </p>
      )}

      {sudah && perintahSesudahTtd > 0 && (
        // TODO(confirm): SPKL susulan/revisi belum diputuskan; sementara tanda tangan ulang ditolak server.
        <div className="mt-3 flex items-start gap-2 border-l-4 border-l-gold bg-gold-tint px-3 py-2.5 text-xs text-ink-2" role="status">
          <FiAlertTriangle className="mt-0.5 size-4 shrink-0 text-gold-deep" aria-hidden="true" />
          <span>
            <strong className="font-bold text-ink">
              <span className="font-mono">{perintahSesudahTtd}</span> perintah terkirim sesudah SPKL ini ditandatangani
            </strong>{" "}
            dan tidak termuat di dalamnya. Tanda tangan ulang belum tersedia; hubungi PPABP bila SPKL susulan diperlukan.
          </span>
        </div>
      )}

      {galat && (
        <p className="mt-3 border-l-4 border-l-red bg-red-tint px-3 py-2 text-xs text-red" role="alert">
          {galat}
        </p>
      )}

      {/* Di luar alur tombol: modal membawa form-nya sendiri. */}
      <ModalPassphraseTte
        terbuka={modalTerbuka}
        onTutup={() => setModalTerbuka(false)}
        periodeBulan={periodeBulan}
        periodeTahun={periodeTahun}
        satuanKerja={satuanKerja}
        defaultNik=""
        namaPenandatanganDefault={namaPenandatangan}
        kirimTandaTangan={kirimTandaTangan}
        onSukses={(r) =>
          setBaruDitandatangani({
            id: r.dokumenId ?? "",
            nomorDokumen: r.nomorDokumen ?? null,
            ditandatanganiPada: "Baru saja",
            penandatanganNama: r.penandatanganNama ?? null,
          })
        }
        labelDokumen="SPKL Bulanan"
        ringkasan={`${labelPeriode} - ${ringkasan}`}
      />
    </>
  );
}
