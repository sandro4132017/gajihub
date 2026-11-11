"use client";

import { useState } from "react";
import { Modal } from "../../../components/feedback/Modal";
import type { RincianJenisCuti } from "../../../lib/format/rincianCuti";

/**
 * Angka cuti di tabel Presensi yang bisa diklik - membuka pop up rincian cuti
 * per jenis dari baris harian e-Presensi.
 *
 * Sel cuma berisi ANGKA (keputusan user 2026-11-11) - jenis cutinya dibaca
 * lewat pop up, bukan ditulis di bawah angka. Garis bawah putus-putus jadi
 * tanda bisa diklik.
 *
 * `rincian` null = baris harian periode ini tidak menyimpan jenis cuti
 * (sebelum 2026-09-29). Pop up tetap dibuka dan mengatakannya, bukan diam.
 */
export function RincianCutiTombol({
  nama,
  periodeLabel,
  jumlahRekap,
  labelRekap,
  rincian,
}: {
  nama: string;
  /** Mis. "Oktober 2026". */
  periodeLabel: string;
  /** `jumlahHariCuti` di rekap bulanan. */
  jumlahRekap: number;
  /** Jenis cuti yang dipakai perhitungan (jenis terbanyak), mis. "Cuti Sakit". */
  labelRekap: string | null;
  rincian: RincianJenisCuti[] | null;
}) {
  const [buka, setBuka] = useState(false);
  const totalRincian = rincian?.reduce((n, r) => n + r.hari, 0) ?? 0;
  const ada = rincian !== null && rincian.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        className="cursor-pointer rounded font-mono text-ink-2 underline decoration-dotted underline-offset-4 hover:text-teal-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biru"
        title="Lihat rincian cuti per jenis"
        aria-label={`Rincian cuti ${nama}, ${jumlahRekap} hari`}
      >
        {jumlahRekap}
      </button>

      {/* Pembungkus font-sans & rata kiri: modal dirender di tempatnya (tanpa
          portal), jadi tanpa ini ia mewarisi font-mono & rata tengah dari sel
          tabel tempat tombolnya berada. */}
      <span className="block text-left font-sans">
      <Modal
        terbuka={buka}
        judul="Rincian Cuti"
        subjudul={[nama, periodeLabel]}
        onTutup={() => setBuka(false)}
        aksi={
          <button type="button" className="btn btn-primary" onClick={() => setBuka(false)}>
            Tutup
          </button>
        }
      >
        {ada ? (
          <>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="col-nama py-1.5 font-semibold">Jenis cuti</th>
                  <th className="py-1.5 font-semibold">Hari</th>
                  <th className="py-1.5 font-semibold">Tanggal</th>
                </tr>
              </thead>
              <tbody>
                {rincian!.map((r) => (
                  <tr key={r.jenis} className="border-b border-line-2 last:border-0">
                    <td className="col-nama py-1.5 font-semibold text-ink">{r.jenis}</td>
                    <td className="py-1.5 font-mono">{r.hari}</td>
                    <td className="py-1.5 font-mono">{r.tanggal.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalRincian !== jumlahRekap && (
              <p className="mt-2 rounded-lg bg-gold-tint px-2.5 py-1.5 font-medium text-gold-deep">
                Jumlah hari di rincian (<span className="font-mono">{totalRincian}</span>) berbeda dengan angka rekap
                (<span className="font-mono">{jumlahRekap}</span>). Periksa presensi harian pegawai ini.
              </p>
            )}
          </>
        ) : (
          <p>
            Rincian per jenis tidak tersedia untuk periode ini - data harian e-Presensi sebelum 29 September 2026
            tidak menyimpan jenis cutinya. Angka rekap: <span className="font-mono">{jumlahRekap}</span> hari
            {labelRekap ? ` (${labelRekap})` : ""}.
          </p>
        )}
      </Modal>
      </span>
    </>
  );
}
