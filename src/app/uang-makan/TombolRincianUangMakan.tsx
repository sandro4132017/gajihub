"use client";

import { useState } from "react";
import Link from "next/link";
import { Modal } from "../../components/feedback/Modal";
import { RincianUangMakan } from "../../components/shared/RincianUangMakan";
import type { InputRincianUangMakan } from "../../business-logic/rincianUangMakan";

interface TombolRincianUangMakanProps {
  nama: string;
  nip: string;
  satuanKerja: string;
  periodeBulan: number;
  periodeTahun: number;
  input: InputRincianUangMakan;
  nilaiTersimpan: number;
  hariDibayarTersimpan: number;
}

export function TombolRincianUangMakan({
  nama,
  nip,
  satuanKerja,
  periodeBulan,
  periodeTahun,
  input,
  nilaiTersimpan,
  hariDibayarTersimpan,
}: TombolRincianUangMakanProps) {
  const [terbuka, setTerbuka] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setTerbuka(true)}
        className="btn btn-secondary btn-sm text-xs font-semibold"
      >
        Rincian
      </button>

      <Modal
        terbuka={terbuka}
        judul={`Rincian Uang Makan — ${nama}`}
        onTutup={() => setTerbuka(false)}
        aksi={
          <div className="flex w-full items-center justify-between gap-2">
            <Link
              href={`/tukin/presensi/${nip}?bulan=${periodeBulan}&tahun=${periodeTahun}`}
              className="text-xs font-semibold text-teal-deep underline hover:text-navy"
            >
              Lihat Kalender Presensi 31 Hari &rarr;
            </Link>
            <button
              type="button"
              onClick={() => setTerbuka(false)}
              className="btn btn-secondary btn-sm text-xs font-bold"
            >
              Tutup
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-left">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line-2 bg-surface-2 px-3.5 py-2.5 text-xs">
            <div>
              <span className="font-bold text-ink">{nama}</span>
              <span className="ml-2 font-mono text-muted">NIP {nip}</span>
            </div>
            <span className="text-muted">
              {satuanKerja} &middot; Periode {periodeBulan}/{periodeTahun}
            </span>
          </div>

          <RincianUangMakan
            input={input}
            nilaiTersimpan={nilaiTersimpan}
            hariDibayarTersimpan={hariDibayarTersimpan}
          />
        </div>
      </Modal>
    </>
  );
}

