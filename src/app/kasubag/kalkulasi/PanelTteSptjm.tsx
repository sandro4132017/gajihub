"use client";

import { useState, useEffect } from "react";
import { ModalPassphraseTte } from "@/app/tte/ModalPassphraseTte";
import { type JenisSptjm, generateNamaFileSptjm } from "@/lib/tte/sptjmTypes";
import { statusSptjm } from "@/business-logic/sptjmUnit";
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
  /** Nama cetak penanda tangan (akun yang login), ditampilkan di modal TTE. */
  namaPenandatangan?: string;
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
  /** Kalkulasi terakhir komponen ini (ISO). TTE sebelum ini = perlu TTE ulang. */
  dihitungTerakhir?: string | null;
  /** Ringkasan satu baris di bawah judul, mis. "46 Pegawai - Rp ...". */
  ringkasan?: string;
  /**
   * false = dokumen ini belum menahan pengiriman (SPTJM Lembur selama uang
   * lembur ditunda). Tetap bisa ditandatangani - hanya ditandai.
   */
  wajib?: boolean;
  /** Rekap sudah dikirim & terkunci: baris hanya-baca, tinggal Lihat PDF. */
  terkunci?: boolean;
}

/**
 * Satu baris dokumen SPTJM di Tahap 3: berbingkai merah muda, ikon PDF,
 * judul + ringkasan, badge status, dan aksi tanda tangan / hapus draft /
 * lihat & unduh PDF.
 */
export function PanelTteSptjm({
  jenisDokumen = "SPTJM_TUKIN",
  periodeBulan,
  periodeTahun,
  satuanKerja,
  namaPenandatangan = "",
  dokumenTteTerbaru,
  dikembalikanPada = null,
  dihitungTerakhir = null,
  ringkasan,
  wajib = true,
  terkunci = false,
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
    } catch {
      setErrorHapus("Gagal menghubungi layanan TTE.");
    } finally {
      setSedangHapus(false);
      setMintaKonfirmasi(false);
    }
  }

  useEffect(() => {
    setDokumen(dokumenTteTerbaru);
  }, [dokumenTteTerbaru]);

  const isSudahTte = dokumen?.status === "TERTANDATANGANI";
  // Ada dokumen tapi belum ditandatangani = ada DRAFT yang bisa dihapus.
  const adaDraft = Boolean(dokumen) && !isSudahTte;

  // SPTJM YANG DITANDATANGANI SEBELUM REKAPNYA DIKEMBALIKAN SUDAH BASI.
  //
  // SPTJM menyatakan hitungan periode ini sudah benar. Begitu PPABP
  // menemukan anomali dan mengembalikannya, angkanya akan berubah - jadi
  // tanda tangan yang lama membenarkan angka yang sudah tidak berlaku.
  // Dokumennya TIDAK dihapus (itu bukti sah atas apa yang dinyatakan saat
  // itu), tapi tidak boleh lagi tampil sebagai "TTE Sah" untuk angka baru.
  //
  // Aturannya SATU untuk layar dan server: statusSptjm()
  // (src/business-logic/sptjmUnit.ts) - gerbang kirim di server memakai
  // fungsi yang sama.
  const perluTteUlang =
    statusSptjm(
      dokumen
        ? { status: dokumen.status, signedAt: dokumen.signedAt ? new Date(dokumen.signedAt) : null }
        : null,
      dikembalikanPada ? new Date(dikembalikanPada) : null,
      dihitungTerakhir ? new Date(dihitungTerakhir) : null,
    ) === "PERLU_TTE_ULANG";
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

  // MODE TERKUNCI - rekap sudah dikirim: tidak ada tanda tangan ulang atau
  // hapus draft (server juga menolaknya); yang tersisa melihat dokumennya.
  if (terkunci) {
    const sah = isSudahTte && dokumen?.fileSignedPath;
    return (
      <div className="grid gap-x-3 gap-y-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex min-w-0 items-start gap-2">
          <FiFileText aria-hidden className="mt-0.5 size-4 shrink-0 text-red" />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <h4 className="truncate text-[13px] font-bold text-ink">{cfg.judul}</h4>
              {isSudahTte ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-tint px-1.5 py-px text-[10px] font-bold text-green">
                  Sudah TTE &amp; Diperiksa <FiCheckCircle className="size-2.5" />
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center rounded-full bg-surface-2 px-1.5 py-px text-[10px] font-medium text-muted">
                  Tidak ditandatangani
                </span>
              )}
            </div>
            <p
              className="truncate text-[11px] text-muted"
              title={isSudahTte ? `Penandatangan: ${dokumen?.penandatanganNama || "Kasubag TU unit ini"}` : undefined}
            >
              SPTJM rincian pembayaran {cfg.label} pegawai {satuanKerja}.
            </p>
          </div>
        </div>
        {sah && (
          <a
            href={`/berkas/tte/${dokumen!.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] font-bold text-ink no-underline hover:border-muted sm:justify-self-end"
          >
            Lihat PDF
          </a>
        )}
      </div>
    );
  }

  return (
    <div
      className={`space-y-2 rounded-xl border bg-surface px-3.5 py-2.5 ${
        isSudahTte && !perluTteUlang ? "border-green/30" : "border-red/40"
      }`}
    >
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

      <div className="grid gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex min-w-0 items-start gap-2">
          <FiFileText aria-hidden className="mt-0.5 size-4 shrink-0 text-red" />
          {/* DUA BARIS SAJA: judul + status, lalu satu baris keterangan.
              Penandatangan ada di tooltip baris kedua (dan di PDF-nya). */}
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <h4 className="truncate text-[13px] font-bold text-ink">{cfg.judul}</h4>
              {perluTteUlang ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gold-tint px-1.5 py-px text-[10px] font-bold text-gold-deep">
                  <FiAlertTriangle className="size-2.5" /> Perlu TTE Ulang
                </span>
              ) : isSudahTte ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green/10 px-1.5 py-px text-[10px] font-bold text-green">
                  <FiCheckCircle className="size-2.5" /> TTE Sah
                </span>
              ) : (
                <span className="sr-only">Belum ditandatangani</span>
              )}
            </div>
            <p
              className="truncate text-[11px] text-muted"
              title={
                isSudahTte
                  ? `Penandatangan: ${dokumen?.penandatanganNama || "Kasubag TU unit ini"}`
                  : undefined
              }
            >
              {ringkasan ? <span className="font-mono">{ringkasan}</span> : !isSudahTte ? cfg.deskripsiBelum : null}
              {isSudahTte && dokumen?.nomorDokumen && (
                <>
                  {ringkasan ? " • " : ""}No. <span className="font-mono text-biru">{dokumen.nomorDokumen}</span>
                </>
              )}
              {!wajib && <> &bull; belum diwajibkan</>}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:justify-end">
          <button
            type="button"
            onClick={() => setModalTerbuka(true)}
            // SAAT BASI, INI AKSI UTAMANYA - bukan mengunduh dokumen yang
            // angkanya sudah berubah.
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
              perluTteUlang || !isSudahTte
                ? "bg-navy text-white hover:bg-navy-deep"
                : "border border-line bg-surface text-ink-2 hover:border-muted"
            }`}
          >
            <FiEdit3 className="size-3.5" />
            {isSudahTte ? "TTE Ulang" : "Tanda Tangani SPTJM"}
          </button>

          {/* HAPUS DRAFT - hanya bila ADA draft dan belum ditandatangani.

              Sesudah ber-TTE BSrE, yang tersedia TTE Ulang: dokumen bertanda
              tangan elektronik tidak dibuang lewat tombol. Server menolaknya
              juga (hapusDraftSptjmAction), jadi ini bukan satu-satunya
              penjagaan - tapi tombol yang selalu ditolak itu jalan buntu. */}
          {adaDraft &&
            (mintaKonfirmasi ? (
              <>
                <span className="text-[11px] font-semibold text-red">Hapus draft?</span>
                <button
                  type="button"
                  onClick={hapusDraft}
                  disabled={sedangHapus}
                  className="inline-flex items-center gap-1 rounded-lg bg-red px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                >
                  <FiTrash2 className="size-3.5" />
                  {sedangHapus ? "Menghapus..." : "Ya, hapus"}
                </button>
                <button
                  type="button"
                  onClick={() => setMintaKonfirmasi(false)}
                  disabled={sedangHapus}
                  className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-bold text-ink-2 disabled:opacity-60"
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
                className="inline-flex items-center gap-1.5 rounded-lg border border-red/20 bg-red-tint px-3 py-1.5 text-[11px] font-bold text-red hover:border-red/50"
              >
                <FiTrash2 className="size-3.5" />
                Hapus Draft
              </button>
            ))}

          {isSudahTte && dokumen?.fileSignedPath ? (
            <>
              <a
                href={`/berkas/tte/${dokumen.id}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Lihat PDF"
                aria-label={`Lihat PDF ${cfg.judul}`}
                className="grid size-7 place-items-center rounded-lg border border-line bg-surface text-biru hover:border-biru/50"
              >
                <FiEye className="size-3.5" />
              </a>
              <a
                href={`/berkas/tte/${dokumen.id}?unduh=1`}
                download={namaFileResmi}
                target="_blank"
                rel="noopener noreferrer"
                title="Unduh PDF"
                aria-label={`Unduh PDF ${cfg.judul}`}
                className="grid size-7 place-items-center rounded-lg border border-line bg-surface text-biru hover:border-biru/50"
              >
                <FiDownload className="size-3.5" />
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
        namaPenandatanganDefault={namaPenandatangan}
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
