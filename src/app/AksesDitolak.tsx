import Link from "next/link";
import { HALAMAN } from "./layoutHalaman";

/** Halaman "Akses ditolak" generik - dipakai di semua guard role per dashboard. */
export function AksesDitolak({
  pesan,
  hrefAlternatif,
  labelAlternatif,
}: {
  pesan: string;
  hrefAlternatif?: string;
  labelAlternatif?: string;
}) {
  return (
    <main className={HALAMAN}>
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Akses ditolak</h1>
      <p className="mt-2 text-sm text-muted">{pesan}</p>
      {hrefAlternatif && (
        <Link href={hrefAlternatif} className="mt-3 inline-block text-sm font-semibold text-teal-deep underline">
          {labelAlternatif ?? "Kembali"}
        </Link>
      )}
    </main>
  );
}
