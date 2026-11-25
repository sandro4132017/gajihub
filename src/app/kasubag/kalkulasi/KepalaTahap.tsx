import type { ReactNode } from "react";

/** Judul kecil "TAHAP n" + nama tahap - dipakai keempat kartu tahap. */
export function KepalaTahap({
  nomor,
  judul,
  info,
  children,
}: {
  nomor: number;
  judul: string;
  /** Ikon (i) di samping judul - tempat keterangan panjang. */
  info?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="shrink-0 rounded-md bg-biru/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-biru-deep">
          Tahap {nomor}
        </span>
        <h2 className="min-w-0 text-base font-bold leading-tight text-navy">{judul}</h2>
        {info}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}
