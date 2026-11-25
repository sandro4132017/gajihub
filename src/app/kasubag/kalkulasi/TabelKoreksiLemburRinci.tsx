import type { ReactNode } from "react";
import Link from "next/link";
import { BadgePejabatEselon } from "../../../components/shared/BadgePejabatEselon";
import { KoreksiLemburForm } from "./KoreksiLemburForm";
import { TAMPILKAN_NOMINAL_LEMBUR } from "../../../lib/format/tampilUangLembur";
import { lemburTeks } from "../../../lib/format/presensiTampilan";
import { formatRupiah } from "../../../lib/format/rupiah";

export interface BarisKoreksiLembur {
  id: string;
  nama: string;
  nip: string;
  kelasJabatan: number | null;
  totalJam: number;
  totalUangLembur: number | null;
  tarifPerJam: number;
  hrefNama: string;
  /** Periode & satker sudah masuk gerbang pilot SPKL (lembur ber-perintah). */
  berSpkl?: boolean;
}

/**
 * Form "Koreksi jam lembur" per pegawai - mode RINCI (`?rincian=1`) tab Lembur.
 *
 * TETAP TAMPIL walau nominalnya ditahan: pengumpulan data jam lembur harus
 * jalan terus selama menunggu tata cara turun, kalau tidak periode-periode ini
 * akan kosong dan harus diisi ulang dari kertas. Formnya hanya menerima angka
 * jam - tidak ada rupiah di dalamnya. Kolom rupiah hanya muncul bila
 * TAMPILKAN_NOMINAL_LEMBUR menyala.
 */
export function TabelKoreksiLemburRinci({
  baris,
  periodeBulan,
  periodeTahun,
  kosongKarena,
  kaki,
}: {
  baris: readonly BarisKoreksiLembur[];
  periodeBulan: number;
  periodeTahun: number;
  kosongKarena: string;
  kaki: ReactNode;
}) {
  return (
    <div className="mt-4" id="koreksi-lembur">
      <h3 className="text-sm font-bold text-ink">Koreksi jam lembur per pegawai</h3>
      <p className="mt-0.5 text-xs text-muted">Mode rincian - koreksi total jam lembur sebulan langsung di baris pegawai.</p>
      <div className="card mt-2 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
                <th className="col-nama px-4 py-2.5">Nama</th>
                {TAMPILKAN_NOMINAL_LEMBUR && <th className="px-4 py-2.5">Uang Lembur</th>}
                <th className="px-4 py-2.5">Koreksi jam lembur</th>
              </tr>
            </thead>
            <tbody>
              {baris.length === 0 && (
                <tr>
                  <td colSpan={TAMPILKAN_NOMINAL_LEMBUR ? 3 : 2} className="px-4 py-6 text-center text-muted">
                    {kosongKarena}
                  </td>
                </tr>
              )}
              {baris.map((b) => (
                <tr key={b.id} className="border-b border-line-2">
                  <td className="col-nama px-4 py-2.5">
                    <Link href={b.hrefNama} className="font-semibold text-teal-deep underline">
                      {b.nama}
                    </Link>
                    <BadgePejabatEselon kelasJabatan={b.kelasJabatan} />
                    <span className="block font-mono text-xs text-muted">{b.nip}</span>
                  </td>
                  {TAMPILKAN_NOMINAL_LEMBUR && (
                    <td className="px-4 py-2.5 font-mono text-ink-2">
                      {b.totalUangLembur !== null
                        ? `${formatRupiah(b.totalUangLembur)} (${lemburTeks(b.totalJam)})`
                        : "-"}
                    </td>
                  )}
                  <td className="px-4 py-2.5">
                    <KoreksiLemburForm
                      pegawaiId={b.id}
                      periodeBulan={periodeBulan}
                      periodeTahun={periodeTahun}
                      berSpkl={b.berSpkl}
                      totalJamLemburSaatIni={b.totalJam}
                      tarifPerJam={b.tarifPerJam}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line-2 px-4 py-3 sm:px-6">{kaki}</div>
      </div>
    </div>
  );
}
