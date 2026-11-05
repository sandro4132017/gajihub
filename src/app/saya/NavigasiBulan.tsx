import Link from "next/link";
import { NAMA_BULAN } from "../../lib/format/bulan";
import { periodeTetangga, type PeriodeSaya } from "./periodeSaya";

/**
 * Tautan ke bulan sebelum/sesudah pada halaman slip & presensi. Tautan
 * mengarah apa adanya (tanpa query data); halaman tujuan yang menjawab kalau
 * bulannya kosong. Tidak ikut tercetak.
 */
export function NavigasiBulan({
  periode,
  sekarang,
  dasar,
}: {
  periode: PeriodeSaya;
  sekarang: PeriodeSaya;
  dasar: "/saya/slip-gaji" | "/saya/presensi";
}) {
  const { sebelum, sesudah } = periodeTetangga(periode, sekarang);
  const nama = (p: PeriodeSaya) => `${NAMA_BULAN[p.bulan - 1]} ${p.tahun}`;
  const href = (p: PeriodeSaya) => `${dasar}/${p.bulan}/${p.tahun}`;
  return (
    <nav aria-label="Pindah periode" className="flex flex-wrap items-center gap-2 print:hidden">
      <Link
        href={href(sebelum)}
        aria-label={`Periode sebelumnya: ${nama(sebelum)}`}
        className="btn btn-ghost btn-sm min-h-11"
      >
        &lsaquo; {nama(sebelum)}
      </Link>
      {sesudah && (
        <Link
          href={href(sesudah)}
          aria-label={`Periode berikutnya: ${nama(sesudah)}`}
          className="btn btn-ghost btn-sm min-h-11"
        >
          {nama(sesudah)} &rsaquo;
        </Link>
      )}
    </nav>
  );
}
