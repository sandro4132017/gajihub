import type { ReactNode } from "react";
import Link from "next/link";
import { BadgePejabatEselon } from "../../../components/shared/BadgePejabatEselon";
import { PilPredikat } from "../../../components/shared/PilPredikat";
import { potonganTukin } from "../../../business-logic/tahapKalkulasiUnit";
import { formatPersen, formatRupiah } from "../../../lib/format/rupiah";

export interface BarisTukinRingkas {
  id: string;
  nama: string;
  nip: string;
  kelasJabatan: number | null;
  /** Label predikat; null = belum ada predikat periode ini. */
  predikat: string | null;
  /** Tarif tukin pokok kelas jabatan; null = kelas belum terisi / tidak ada di tabel tarif. */
  penuh: number | null;
  /** Tukin bersih tersimpan; null = belum dihitung. */
  bersih: number | null;
  dikecualikan: boolean;
  /** Sebab angka basi ("presensi berubah", dst); null = segar. */
  basi: string | null;
  /** Selisih capaian kinerja di bawah 100% (rupiah); <= 1 tidak ditampilkan. */
  kurangKinerja: number;
  /** Override cuti / tugas belajar membuat penjumlahan komponen tidak cocok. */
  adaSelisih: boolean;
  hrefNama: string;
}

function SubJudul({ children }: { children: string }) {
  return <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-muted/80">{children}</span>;
}

function BelumAda({ judul }: { judul: string }) {
  return (
    <span className="text-muted/60" title={judul}>
      -
    </span>
  );
}

/**
 * Tabel Tukin ringkas Tahap 2 - tujuh kolom (batas <= 8, laws-of-ux bagian 6).
 * Rincian 38 kolomnya ada di `?rincian=1` (TabelRincianTukinLengkap).
 *
 * POTONGAN (%) dan NOMINAL POTONGAN diturunkan dari TOTAL tukin:
 * (penuh - bersih) / penuh - keputusan user, lihat potonganTukin().
 */
export function TabelTukinRingkas({
  baris,
  nomorAwal,
  kosongKarena,
  kaki,
}: {
  baris: readonly BarisTukinRingkas[];
  nomorAwal: number;
  /** Sebab tabel kosong, ditulis di sel kosong - bukan sekadar "tidak ada data". */
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
              <th className="px-4 py-2.5">Predikat Kinerja</th>
              <th className="px-4 py-2.5">
                Tunjangan Penuh<SubJudul>kotor, sesuai kelas jabatan</SubJudul>
              </th>
              <th className="px-4 py-2.5">
                Potongan (%)<SubJudul>dari tunjangan penuh</SubJudul>
              </th>
              <th className="px-4 py-2.5">Nominal Potongan</th>
              <th className="px-4 py-2.5">Tunjangan Bersih</th>
            </tr>
          </thead>
          <tbody>
            {baris.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  {kosongKarena}
                </td>
              </tr>
            )}
            {baris.map((b, i) => {
              const potongan = potonganTukin(b.penuh, b.bersih);
              return (
                <tr key={b.id} className={`border-b border-line-2 ${b.basi ? "bg-gold-tint" : "bg-surface"}`}>
                  <td className="px-3 py-3 font-mono text-xs text-muted sm:pl-5">{nomorAwal + i}</td>
                  <td className="col-nama px-4 py-3">
                    <Link
                      href={b.hrefNama}
                      className="font-semibold text-ink no-underline hover:text-biru-deep hover:underline"
                      title={`Lihat rincian presensi harian ${b.nama}`}
                    >
                      {b.nama}
                    </Link>
                    <BadgePejabatEselon kelasJabatan={b.kelasJabatan} />
                    {b.dikecualikan && (
                      <span
                        className="chip chip-draft ml-1.5 align-middle text-[11px]"
                        title="Dikecualikan dari periode ini - tidak dihitung dan tidak ikut ke PPABP"
                      >
                        dikecualikan
                      </span>
                    )}
                    <span className="mt-0.5 block text-[11px] text-muted">
                      NIP. <span className="font-mono">{b.nip}</span>
                    </span>
                    {b.basi && (
                      <span
                        className="mt-0.5 block text-xs font-semibold text-gold-deep"
                        title={`Sebab: ${b.basi} setelah Tukin ini dihitung - angka di baris ini masih yang lama.`}
                      >
                        angka basi - {b.basi}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {b.predikat ? (
                      <PilPredikat nilai={b.predikat} />
                    ) : (
                      <BelumAda judul="Predikat kinerja periode ini belum diupload" />
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-ink-2">
                    {b.penuh !== null ? (
                      formatRupiah(b.penuh)
                    ) : (
                      <BelumAda judul="Kelas jabatan belum terisi di data pegawai" />
                    )}
                  </td>
                  <td
                    className={`px-4 py-3 font-mono ${
                      !potongan
                        ? "text-muted"
                        : potongan.persen > 0
                          ? "font-semibold text-gold-deep"
                          : "font-semibold text-green"
                    }`}
                  >
                    {potongan ? formatPersen(potongan.persen) : <BelumAda judul="Tukin periode ini belum dihitung" />}
                  </td>
                  <td
                    className={`px-4 py-3 font-mono ${
                      potongan && potongan.nominal > 0 ? "font-bold text-red" : "text-muted"
                    }`}
                  >
                    {potongan ? formatRupiah(potongan.nominal) : <BelumAda judul="Tukin periode ini belum dihitung" />}
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-ink sm:pr-5">
                    {b.bersih !== null ? formatRupiah(b.bersih) : <BelumAda judul="Tukin periode ini belum dihitung" />}
                    {b.kurangKinerja > 1 && (
                      <span className="mt-0.5 block font-sans text-[11px] font-normal text-muted">
                        termasuk {formatRupiah(b.kurangKinerja)} dari capaian kinerja di bawah 100%
                      </span>
                    )}
                    {b.adaSelisih && (
                      <span className="mt-0.5 block font-sans text-[11px] font-normal text-gold-deep">
                        cek override cuti / tugas belajar
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line-2 px-4 py-3 sm:px-5">{kaki}</div>
    </div>
  );
}
