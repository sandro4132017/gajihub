import type { ReactNode } from "react";
import Link from "next/link";
import { BadgePejabatEselon } from "../../../components/shared/BadgePejabatEselon";
import { formatRupiah } from "../../../lib/format/rupiah";

export interface BarisUangMakan {
  id: string;
  nama: string;
  nip: string;
  kelasJabatan: number | null;
  dikecualikan: boolean;
  /** null = uang makan belum dihitung. */
  makan: { hariKerja: number; hariDibayar: number; tarifHarian: number; total: number } | null;
  hrefNama: string;
}

/**
 * Tabel Uang Makan Tahap 2: No, Nama/NIP, Hari kerja, Hari dibayar, Tarif
 * harian, Total. Hari dibayar = hari yang BENAR-BENAR dibayar (WFO + WFH/WFA),
 * bisa lebih kecil dari hari hadir (diklat/dinas luar tidak berhak).
 */
export function TabelUangMakan({
  baris,
  nomorAwal,
  kosongKarena,
  kaki,
}: {
  baris: readonly BarisUangMakan[];
  nomorAwal: number;
  kosongKarena: string;
  kaki: ReactNode;
}) {
  return (
    <div className="overflow-hidden border-t border-line">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2/50 text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className="px-3 py-3 sm:pl-5">No.</th>
              <th className="col-nama px-4 py-2.5">Nama Pegawai / NIP</th>
              <th className="px-4 py-2.5">Hari Kerja</th>
              <th className="px-4 py-2.5">Hari Dibayar</th>
              <th className="px-4 py-2.5">Tarif Harian</th>
              <th className="px-4 py-2.5">Total</th>
            </tr>
          </thead>
          <tbody>
            {baris.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted">
                  {kosongKarena}
                </td>
              </tr>
            )}
            {baris.map((b, i) => (
              <tr key={b.id} className="border-b border-line-2 bg-surface">
                <td className="px-3 py-3 font-mono text-xs text-muted sm:pl-5">{nomorAwal + i}</td>
                <td className="col-nama px-4 py-3">
                  <Link
                    href={b.hrefNama}
                    className="font-medium text-biru-deep no-underline hover:underline"
                    title={`Lihat rincian presensi harian ${b.nama}`}
                  >
                    {b.nama}
                  </Link>
                  <BadgePejabatEselon kelasJabatan={b.kelasJabatan} />
                  {b.dikecualikan && <span className="chip chip-draft ml-1.5 align-middle text-[11px]">dikecualikan</span>}
                  <span className="mt-0.5 block font-mono text-[11px] text-muted">{b.nip}</span>
                </td>
                {b.makan ? (
                  <>
                    <td className="px-4 py-3 font-mono text-ink-2">{b.makan.hariKerja}</td>
                    <td className="px-4 py-3 font-mono text-ink-2">{b.makan.hariDibayar}</td>
                    <td className="px-4 py-3 font-mono text-ink-2">{formatRupiah(b.makan.tarifHarian)}</td>
                    <td className="px-4 py-3 font-mono font-bold text-ink sm:pr-5">{formatRupiah(b.makan.total)}</td>
                  </>
                ) : (
                  <td colSpan={4} className="px-4 py-2.5 text-xs text-muted">
                    Uang makan periode ini belum dihitung
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line-2 px-4 py-3 sm:px-5">{kaki}</div>
    </div>
  );
}
