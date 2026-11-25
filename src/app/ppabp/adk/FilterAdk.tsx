"use client";

import { useRef } from "react";
import { SearchableSelect } from "../../../components/forms/SearchableSelect";
import { NAMA_BULAN, daftarTahunPeriode } from "../../../lib/format/bulan";
import { JENIS_PEGAWAI_ADK } from "./jenisPegawaiAdk";

/**
 * Filter Export ADK: satuan kerja (hanya yang sudah mengirim), bulan, tahun,
 * jenis pegawai. Berlaku LANGSUNG begitu satu pilihan diganti - tanpa tombol
 * "Terapkan" (desain 2026-11-25).
 *
 * Tetap <form method="get">: statusnya di URL, dan tanpa JavaScript tombol
 * kirim tersembunyi di bawah tetap bisa dipakai lewat Enter.
 */
export function FilterAdk({
  satkerList,
  satker,
  bulan,
  tahun,
  jenis,
  adk,
}: {
  /** Satuan kerja yang sudah mengirim & mengunci rekap periode ini. */
  satkerList: readonly string[];
  satker: string;
  bulan: string;
  tahun: string;
  jenis: string;
  adk: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  // Ditunda satu tick: SearchableSelect menulis nilainya ke input tersembunyi
  // lewat state, jadi form baru berisi pilihan baru setelah render berikutnya.
  const kirim = () => setTimeout(() => formRef.current?.requestSubmit(), 0);

  const tahunPilihan = daftarTahunPeriode();
  if (!tahunPilihan.includes(Number(tahun))) tahunPilihan.push(Number(tahun));

  return (
    <form ref={formRef} method="get" className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="adk" value={adk} />

      <div className="min-w-[12rem] flex-1">
        <label className="field-label text-xs">Satuan kerja</label>
        <SearchableSelect
          name="satker"
          emptyLabel="Semua satuan kerja (terkirim)"
          options={[...satkerList]
            .sort((a, b) => a.localeCompare(b, "id-ID"))
            .map((nama) => ({ value: nama, label: nama }))}
          defaultValue={satker}
          onValueChange={kirim}
        />
      </div>

      <div className="w-[7.5rem] shrink-0">
        <label className="field-label text-xs" htmlFor="adk-bulan">
          Bulan
        </label>
        <select
          id="adk-bulan"
          name="bulan"
          defaultValue={bulan}
          onChange={kirim}
          className="field-input w-full px-2 text-sm"
        >
          {NAMA_BULAN.map((nama, i) => (
            <option key={nama} value={String(i + 1)}>
              {nama}
            </option>
          ))}
        </select>
      </div>

      <div className="w-[5.5rem] shrink-0">
        <label className="field-label text-xs" htmlFor="adk-tahun">
          Tahun
        </label>
        <select id="adk-tahun" name="tahun" defaultValue={tahun} onChange={kirim} className="field-input w-full px-2 text-sm">
          {tahunPilihan.map((t) => (
            <option key={t} value={String(t)}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="w-[8.5rem] shrink-0">
        <label className="field-label text-xs" htmlFor="adk-jenis">
          Jenis Pegawai
        </label>
        <select id="adk-jenis" name="jenis" defaultValue={jenis} onChange={kirim} className="field-input w-full px-2 text-sm">
          <option value="">Semua</option>
          {JENIS_PEGAWAI_ADK.map((j) => (
            <option key={j.kode} value={j.kode}>
              {j.label}
            </option>
          ))}
        </select>
      </div>

      <button type="submit" className="sr-only">
        Terapkan filter
      </button>
    </form>
  );
}
