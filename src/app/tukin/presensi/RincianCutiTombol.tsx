"use client";

import { useEffect, useState } from "react";
import { RiCloseLine } from "react-icons/ri";
import { formatRentangTanggal, type RincianJenisCuti } from "../../../lib/format/rincianCuti";

/**
 * Sel kolom Cuti di tabel Presensi: kotak kecil berisi ANGKA saja (keputusan
 * user 2026-11-16) yang bisa diklik untuk membuka pop up rincian cuti per
 * jenis dari baris harian e-Presensi. Jenis cutinya hanya di pop up.
 *
 * Label di sel = label RINGKASAN rekap bulanan, yaitu jenis dengan hari
 * terbanyak. Pop up menunjukkan semua jenisnya, dan bila ada lebih dari satu
 * jenis, menjelaskan kenapa sel hanya menyebut satu label - itu keterangan
 * tentang TABEL, bukan klaim aturan perhitungan.
 *
 * Dokumen pendukung cuti TIDAK ditampilkan: data e-Presensi yang ditarik
 * Gajihub tidak memuatnya, dan isinya tidak boleh dikarang.
 *
 * `rincian` null = baris harian periode ini tidak menyimpan jenis cuti
 * (sebelum 2026-09-29). Pop up tetap dibuka dan mengatakannya.
 */
export function RincianCutiTombol({
  nama,
  nip,
  periodeLabel,
  periodeBulan,
  periodeTahun,
  jumlahRekap,
  labelRekap,
  rincian,
}: {
  nama: string;
  nip: string;
  /** Mis. "Oktober 2026". */
  periodeLabel: string;
  periodeBulan: number;
  periodeTahun: number;
  /** `jumlahHariCuti` di rekap bulanan. */
  jumlahRekap: number;
  /** Label ringkasan di tabel (jenis terbanyak di rekap), mis. "Cuti Sakit". */
  labelRekap: string | null;
  rincian: RincianJenisCuti[] | null;
}) {
  const [buka, setBuka] = useState(false);
  const totalRincian = rincian?.reduce((n, r) => n + r.hari, 0) ?? 0;
  const ada = rincian !== null && rincian.length > 0;
  const dominan = ada ? rincian![0] : null;

  // Escape menutup; latar berhenti bergulir selama pop up terbuka.
  useEffect(() => {
    if (!buka) return;
    const onTombol = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBuka(false);
    };
    document.addEventListener("keydown", onTombol);
    const gulungAsli = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onTombol);
      document.body.style.overflow = gulungAsli;
    };
  }, [buka]);

  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        aria-label={`Rincian cuti ${nama}, ${jumlahRekap} hari`}
        title="Lihat jenis cuti"
        className="inline-flex min-w-10 items-center justify-center rounded-lg border border-biru/30 bg-biru/5 px-2.5 py-1 transition hover:border-biru/60 hover:bg-biru/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biru"
      >
        <span className="font-mono text-sm font-bold text-navy">{jumlahRekap}</span>
      </button>

      {buka && (
        // Tanpa portal, jadi pembungkusnya memaksa rata kiri & font sans -
        // kalau tidak, gaya sel tabel (rata tengah, font-mono) ikut terwarisi.
        <span
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/50 p-4 text-left font-sans backdrop-blur-[2px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setBuka(false);
          }}
        >
          <span
            role="dialog"
            aria-modal="true"
            aria-label={`Rincian cuti ${nama} - ${periodeLabel}`}
            className="card block max-h-[85vh] w-full max-w-md overflow-y-auto p-5"
            style={{ animation: "gj-masuk 180ms ease-out both" }}
          >
            {/* Kepala */}
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="inline-block rounded-md bg-biru/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-biru-deep">
                  Rincian cuti pegawai &middot; e-Presensi
                </span>
                <span className="mt-2 block text-base font-bold text-ink">{nama}</span>
                <span className="block text-xs text-muted">
                  <span className="font-mono">{nip}</span> &middot; Periode {periodeLabel}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setBuka(false)}
                aria-label="Tutup"
                className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biru"
              >
                <RiCloseLine aria-hidden="true" className="size-5" />
              </button>
            </span>

            {/* Ringkasan */}
            <span className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-biru/20 bg-biru/5 px-4 py-3">
              <span>
                <span className="block text-[10px] font-bold uppercase tracking-wide text-biru-deep">
                  Total cuti terpakai
                </span>
                <span className="block text-xl font-bold text-navy">
                  <span className="font-mono">{jumlahRekap}</span> Hari
                </span>
              </span>
              {labelRekap && (
                <span className="text-right">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-muted">
                    Label ringkasan di tabel
                  </span>
                  <span className="block text-xs font-semibold text-ink">
                    <span className="font-mono">{jumlahRekap}</span> {labelRekap}
                  </span>
                </span>
              )}
            </span>

            {ada ? (
              <>
                <span className="mt-4 block text-[10px] font-bold uppercase tracking-wide text-muted">
                  Rincian per jenis cuti
                </span>
                <span className="mt-2 flex flex-col gap-2">
                  {rincian!.map((r) => (
                    <span key={r.jenis} className="block rounded-xl border border-line bg-surface px-4 py-2.5">
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-sm font-bold text-ink">{r.jenis}</span>
                        <span className="text-xs font-semibold text-ink-2">
                          <span className="font-mono">{r.hari}</span> Hari
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        Tanggal <span className="font-mono">{formatRentangTanggal(r.tanggal, periodeBulan, periodeTahun)}</span>
                      </span>
                    </span>
                  ))}
                </span>

                {rincian!.length > 1 && dominan && labelRekap && (
                  <span className="mt-4 block rounded-xl border border-gold/40 bg-gold-tint px-4 py-2.5 text-xs text-gold-deep">
                    <span className="block font-bold">Ketentuan label dominan</span>
                    <span className="mt-0.5 block">
                      {dominan.jenis} (<span className="font-mono">{dominan.hari}</span> hari) paling banyak di periode
                      ini, sehingga seluruh <span className="font-mono">{jumlahRekap}</span> hari cuti di tabel diringkas
                      sebagai label {labelRekap}.
                    </span>
                  </span>
                )}

                {totalRincian !== jumlahRekap && (
                  <span className="mt-3 block rounded-xl bg-gold-tint px-4 py-2 text-xs font-medium text-gold-deep">
                    Jumlah hari di rincian (<span className="font-mono">{totalRincian}</span>) berbeda dengan angka rekap
                    (<span className="font-mono">{jumlahRekap}</span>). Periksa presensi harian pegawai ini.
                  </span>
                )}
              </>
            ) : (
              <span className="mt-4 block text-xs text-ink-2">
                Rincian per jenis tidak tersedia untuk periode ini - data harian e-Presensi sebelum 29 September 2026
                tidak menyimpan jenis cutinya.
              </span>
            )}
          </span>
        </span>
      )}
    </>
  );
}
