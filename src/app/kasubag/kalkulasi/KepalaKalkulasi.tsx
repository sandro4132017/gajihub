import type { ReactNode } from "react";
import { FilterBar } from "../../../components/forms/FilterBar";
import type { KeadaanPengiriman } from "../../../business-logic/pengirimanUnit";

/**
 * Kartu kepala halaman Kalkulasi Unit: judul, "<satuan kerja> - <periode>",
 * deskripsi, filter (bulan, tahun, satuan kerja), dan tombol Unduh Excel.
 *
 * SERVER component - tidak ada state. Ikon dasar aturan (SumberAcuan) dan
 * chip keadaan (Dikembalikan dari PPABP / Sudah dikirim & terkunci) di
 * samping judul.
 */
export function KepalaKalkulasi({
  satuanKerja,
  namaBulan,
  periodeBulan,
  periodeTahun,
  satuanKerjaList,
  keadaan,
  sumberAcuan,
  hrefExport,
}: {
  satuanKerja: string;
  namaBulan: string;
  periodeBulan: number;
  periodeTahun: number;
  satuanKerjaList: string[];
  keadaan: KeadaanPengiriman;
  /** Ikon "i" dasar aturan - dirakit halaman karena butuh data sumber. */
  sumberAcuan: ReactNode;
  /** null = pengguna tidak berhak mengunduh rekap, tombolnya TIDAK dirender. */
  hrefExport: string | null;
}) {
  return (
    <section className="card p-4 sm:p-5" aria-label="Kalkulasi Unit">
      <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">
        Kalkulasi Unit
        {/* BADGE, bukan kartu berisi pesan PPABP. Pesan lengkapnya ada di
            Tahap 4; yang dibutuhkan di puncak halaman cuma SATU hal: halaman
            ini sedang dalam tahap apa. */}
        {keadaan === "DIKEMBALIKAN" && (
          <span className="rounded-full border border-red/30 bg-red-tint px-2.5 py-0.5 align-middle text-[11px] font-bold tracking-normal text-red">
            Dikembalikan dari PPABP
          </span>
        )}
        {keadaan === "TERKIRIM" && (
          <span className="rounded-full border border-green/30 bg-green-tint px-2.5 py-0.5 align-middle text-[11px] font-bold tracking-normal text-green">
            Sudah dikirim &amp; terkunci
          </span>
        )}
        {sumberAcuan}
      </h1>
      <p className="mt-0.5 text-sm font-bold text-ink">
        {satuanKerja} &middot; {namaBulan} {periodeTahun}
      </p>
      <p className="mt-2 max-w-3xl text-sm text-biru">
        Hitung Tukin, Uang Makan, dan Uang Lembur seluruh pegawai unit ini untuk satu periode, lalu kirim rekapnya ke
        PPABP.
      </p>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-line-2 bg-surface-2 p-3 sm:p-4">
        <FilterBar
          tanpaKartu
          wajibPeriode
          wajibSatker
          satuanKerjaList={satuanKerjaList}
          bulan={String(periodeBulan)}
          tahun={String(periodeTahun)}
          satker={satuanKerja}
        />
        {/* Membawa periode & unit yang SEDANG DILIHAT. Berkasnya memuat SEMUA
            baris apa pun statusnya - dipakai memeriksa SEBELUM dikirim. Yang
            disetor ke Web Gaji tetap ADK di /ppabp/adk, dan itu hanya unit
            yang sudah dikirim & dikunci. */}
        {hrefExport && (
          <a href={hrefExport} className="btn btn-secondary">
            Unduh Excel
          </a>
        )}
      </div>
    </section>
  );
}
