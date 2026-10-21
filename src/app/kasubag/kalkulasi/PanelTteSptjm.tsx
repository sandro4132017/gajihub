"use client";

import { useState, useEffect } from "react";
import { ModalPassphraseTte } from "@/app/tte/ModalPassphraseTte";
import { type JenisSptjm, generateNamaFileSptjm } from "@/lib/tte/sptjmTypes";
import {
  FiCheckCircle,
  FiFileText,
  FiDownload,
  FiEdit3,
  FiEye,
  FiX,
  FiTrash2,
  FiAlertTriangle,
} from "react-icons/fi";

const CONFIG_JENIS: Record<
  JenisSptjm,
  { judul: string; label: string; deskripsiBelum: string }
> = {
  SPTJM_TUKIN: {
    judul: "SPTJM PPK – Tunjangan Kinerja (Tukin)",
    label: "Tukin",
    deskripsiBelum:
      "SPTJM Tukin disahkan secara elektronik menggunakan sertifikat BSrE sebelum kirim rekap.",
  },
  SPTJM_UANG_MAKAN: {
    judul: "SPTJM PPK – Uang Makan",
    label: "Uang Makan",
    deskripsiBelum:
      "SPTJM Uang Makan disahkan secara elektronik menggunakan sertifikat BSrE sebelum kirim rekap.",
  },
  SPTJM_LEMBUR: {
    judul: "SPTJM PPK – Uang Lembur",
    label: "Uang Lembur",
    deskripsiBelum:
      "SPTJM Uang Lembur disahkan secara elektronik menggunakan sertifikat BSrE sebelum kirim rekap.",
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
  /**
   * Kapan rekap periode ini dikembalikan PPABP, ISO string. null = tidak
   * sedang dikembalikan.
   */
  dikembalikanPada?: string | null;
}

export function PanelTteSptjm({
  jenisDokumen = "SPTJM_TUKIN",
  periodeBulan,
  periodeTahun,
  satuanKerja,
  dokumenTteTerbaru,
  dikembalikanPada = null,
}: PanelTteSptjmProps) {
  const [modalTerbuka, setModalTerbuka] = useState(false);
  const [dokumen, setDokumen] = useState(dokumenTteTerbaru);
  const [notifSukses, setNotifSukses] = useState<string | null>(null);
  const [errorHapus, setErrorHapus] = useState<string | null>(null);
  // KONFIRMASI DUA LANGKAH, bukan window.confirm. Menghapus draft membuang
  // nomor surat yang sudah dipakai, jadi pantas diberi jeda sadar - dan
  // dialog bawaan peramban tidak bisa menjelaskan apa yang hilang.
  const [mintaKonfirmasi, setMintaKonfirmasi] = useState(false);
  const [sedangHapus, setSedangHapus] = useState(false);

  async function hapusDraft() {
    setSedangHapus(true);
    setErrorHapus(null);
    try {
      const r = await fetch("/api/tte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "hapus-draft",
          jenis: jenisDokumen,
          bulan: periodeBulan,
          tahun: periodeTahun,
        }),
      });
      const hasil = await r.json().catch(() => ({}));
      if (hasil?.error) {
        setErrorHapus(String(hasil.error));
        return;
      }
      setDokumen(null);
      setNotifSukses(hasil?.pesan || "Draft SPTJM dihapus.");
    } catch (e) {
      setErrorHapus(e instanceof Error ? e.message : "Gagal menghubungi layanan TTE.");
    } finally {
      setSedangHapus(false);
      setMintaKonfirmasi(false);
    }
  }

  useEffect(() => {
    setDokumen(dokumenTteTerbaru);
  }, [dokumenTteTerbaru]);

  const isSudahTte = dokumen?.status === "TERTANDATANGANI";

  // SPTJM YANG DITANDATANGANI SEBELUM REKAPNYA DIKEMBALIKAN SUDAH BASI.
  //
  // SPTJM menyatakan hitungan periode ini sudah benar. Begitu PPABP
  // menemukan anomali dan mengembalikannya, angkanya akan berubah - jadi
  // tanda tangan yang lama membenarkan angka yang sudah tidak berlaku.
  // Dokumennya TIDAK dihapus (itu bukti sah atas apa yang dinyatakan saat
  // itu), tapi tidak boleh lagi tampil sebagai "TTE Sah" untuk angka baru.
  //
  // Diturunkan dari perbandingan waktu, bukan kolom baru - tidak perlu
  // migrasi, dan tidak bisa lupa diperbarui.
  const perluTteUlang =
    isSudahTte &&
    Boolean(dikembalikanPada) &&
    Boolean(dokumen?.signedAt) &&
    new Date(dokumen!.signedAt as string).getTime() <
      new Date(dikembalikanPada as string).getTime();
  const cfg = CONFIG_JENIS[jenisDokumen] ?? {
    judul: `SPTJM PPK – ${jenisDokumen}`,
    label: jenisDokumen,
    deskripsiBelum:
      "SPTJM disahkan secara elektronik menggunakan sertifikat BSrE sebelum kirim rekap.",
  };
  const namaFileResmi = generateNamaFileSptjm(
    jenisDokumen,
    periodeBulan,
    periodeTahun,
    satuanKerja
  );

  return (
    <div className="rounded-xl border border-line-2 bg-surface-2 p-4 space-y-2.5">
      {notifSukses && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-green/30 bg-green/10 px-3 py-2 text-xs text-green">
          <span className="flex items-center gap-1.5 font-semibold">
            <FiCheckCircle className="size-4 shrink-0" />
            {notifSukses}
          </span>
          <button
            type="button"
            onClick={() => setNotifSukses(null)}
            aria-label="Tutup notifikasi"
            className="rounded p-0.5 text-green hover:bg-green/20"
          >
            <FiX className="size-3.5" />
          </button>
        </div>
      )}

      {errorHapus && (
        <div className="flex items-start gap-2 rounded-lg border border-red/30 bg-red-tint px-3 py-2 text-xs text-red">
          <FiAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{errorHapus}</span>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-teal-tint p-2 text-navy">
            <FiFileText className="size-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-bold text-ink">{cfg.judul}</h4>
              {perluTteUlang ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-gold-tint px-2 py-0.5 text-[11px] font-bold text-gold-deep">
                  <FiAlertTriangle className="size-3" /> Perlu TTE Ulang
                </span>
              ) : isSudahTte ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green/10 px-2 py-0.5 text-[11px] font-bold text-green">
                  <FiCheckCircle className="size-3" /> TTE Sah
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-gold-tint px-2 py-0.5 text-[11px] font-bold text-gold-deep">
                  Belum Ditandatangani
                </span>
              )}
            </div>
            {isSudahTte ? (
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-muted">
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
              <p className="mt-0.5 text-xs text-muted">{cfg.deskripsiBelum}</p>
            )}

            {/* Kalimat panjangnya DICABUT dari sini: identik di ketiga kartu,
                jadi dipindah ke satu banner di atas seksinya. Di kartu cukup
                badge "Perlu TTE Ulang" - yang menandai KARTU MANA, dan itu
                yang tidak bisa dijawab banner. */}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setModalTerbuka(true)}
            // SAAT BASI, INI AKSI UTAMANYA - bukan mengunduh dokumen yang
            // angkanya sudah berubah.
            className={`btn btn-sm flex items-center gap-1.5 text-xs ${
              perluTteUlang || !isSudahTte
                ? "btn-primary"
                : "btn-ghost text-muted hover:text-ink"
            }`}
          >
            <FiEdit3 className="size-3.5" />
            {isSudahTte ? "TTE Ulang" : "Tanda Tangani SPTJM"}
          </button>

          {/* HAPUS DRAFT - hanya muncul sebelum ditandatangani.

              Sesudah ber-TTE BSrE, yang tersedia TTE Ulang: dokumen bertanda
              tangan elektronik tidak dibuang lewat tombol. Server menolaknya
              juga (hapusDraftSptjmAction), jadi ini bukan satu-satunya
              penjagaan - tapi tombol yang selalu ditolak itu jalan buntu. */}
          {!isSudahTte &&
            (mintaKonfirmasi ? (
              <>
                <span className="text-xs font-semibold text-red">Hapus draft ini?</span>
                <button
                  type="button"
                  onClick={hapusDraft}
                  disabled={sedangHapus}
                  className="btn btn-sm flex items-center gap-1.5 bg-red text-xs text-white hover:opacity-90 disabled:opacity-60"
                >
                  <FiTrash2 className="size-3.5" />
                  {sedangHapus ? "Menghapus..." : "Ya, hapus"}
                </button>
                <button
                  type="button"
                  onClick={() => setMintaKonfirmasi(false)}
                  disabled={sedangHapus}
                  className="btn btn-secondary btn-sm text-xs disabled:opacity-60"
                >
                  Batal
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setErrorHapus(null);
                  setMintaKonfirmasi(true);
                }}
                className="btn btn-ghost btn-sm flex items-center gap-1.5 text-xs text-muted hover:text-red"
              >
                <FiTrash2 className="size-3.5" />
                Hapus Draft
              </button>
            ))}

          {isSudahTte && dokumen?.fileSignedPath ? (
            <>
              <span className="hidden sm:inline-block h-4 w-px bg-line-2" />
              <a
                href={dokumen.fileSignedPath}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs"
              >
                <FiEye className="size-3.5 text-biru" /> Lihat PDF
              </a>
              <a
                href={dokumen.fileSignedPath}
                download={namaFileResmi}
                target="_blank"
                rel="noopener noreferrer"
                className={`btn btn-sm flex items-center gap-1.5 text-xs ${
                  perluTteUlang ? "btn-secondary" : "btn-primary"
                }`}
              >
                <FiDownload className="size-3.5" /> Unduh PDF
              </a>
            </>
          ) : null}
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
              // Dari balasan server - yang benar-benar menandatangani.
              penandatanganNama: res.penandatanganNama ?? null,
            });
            setNotifSukses(
              `SPTJM ${cfg.label} berhasil ditandatangani (NOMOR ${res.nomorDokumen || "-"}).`
            );
          }
        }}
      />
    </div>
  );
}

