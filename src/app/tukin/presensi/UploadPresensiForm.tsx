"use client";

import Link from "next/link";
import { useActionState } from "react";
import { uploadRekapPresensiAction, type UploadPresensiFormState } from "./actions";
import { NAMA_BULAN } from "../../bulan";
import { SearchableSelect } from "../../SearchableSelect";

const INITIAL_STATE: UploadPresensiFormState = {};

export function UploadPresensiForm({
  defaultBulan,
  defaultTahun,
}: {
  defaultBulan: number;
  defaultTahun: number;
}) {
  const [state, formAction, pending] = useActionState(uploadRekapPresensiAction, INITIAL_STATE);
  const r = state.ringkasan;

  return (
    <div className="card mt-4 p-4">
      <h2 className="text-sm font-bold text-ink">Upload rekap presensi bulanan</h2>
      <p className="mt-1 text-sm text-muted">
        Untuk angka yang memang tidak ada di e-Presensi - menit meninggalkan kantor dan jumlah tidak ikut upacara.
        Keduanya selalu nol lewat sinkronisasi maupun upload PDF. Isi template Gajihub (satu baris per pegawai,
        di-key NIP), lalu upload di sini.
      </p>

      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="field-label">Bulan</label>
          <SearchableSelect
            name="periodeBulan"
            className="w-36"
            options={NAMA_BULAN.map((nama, i) => ({ value: String(i + 1), label: nama }))}
            defaultValue={String(defaultBulan)}
          />
        </div>
        <div>
          <label className="field-label">Tahun</label>
          <input type="number" name="periodeTahun" defaultValue={defaultTahun} required className="field-input w-28 py-1.5" />
        </div>
        <div className="min-w-[240px] flex-1">
          <label className="field-label">File rekap</label>
          <input
            type="file"
            name="file"
            accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            required
            className="field-input py-1.5 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink-2"
          />
        </div>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Memproses..." : "Upload & proses"}
        </button>
      </form>

      <p className="mt-2 text-xs text-muted">
        Belum punya templatenya?{" "}
        <Link href="/tukin/presensi/template" className="font-semibold text-teal-deep underline">
          Unduh template rekap presensi
        </Link>
        . Periode diisi manual di sini karena rekapnya tidak memuat kolom periode.
      </p>

      {state.error && <p className="mt-3 text-sm font-medium text-red">{state.error}</p>}
      {state.success && <p className="mt-3 text-sm font-semibold text-green">{state.success}</p>}

      {r && (
        <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3 text-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Ringkasan</p>
          <p className="mt-1.5 text-ink-2">
            Periode{" "}
            <span className="font-semibold text-ink">
              {NAMA_BULAN[r.periodeBulan - 1] ?? r.periodeBulan} {r.periodeTahun}
            </span>{" "}
            - {r.jumlahTersimpan} pegawai
          </p>
          <ul className="mt-1.5 space-y-1 text-ink-2">
            {r.perSatuanKerja.map((s) => (
              <li key={s.satuanKerja}>
                {s.satuanKerja}: <span className="font-semibold">{s.jumlah} pegawai</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.dilewati && state.dilewati.length > 0 && (
        <div className="mt-3 rounded-lg bg-gold-tint px-3 py-2">
          <p className="text-xs font-bold uppercase tracking-wide text-gold-deep">Baris yang dilewati</p>
          <ul className="mt-1.5 space-y-1 text-sm text-ink-2">
            {state.dilewati.map((d) => (
              <li key={d.alasan}>
                <span className="font-semibold">{d.jumlah} baris</span> - {d.alasan}
                {d.contohNip.length > 0 && <span className="text-muted"> (mis. {d.contohNip.join(", ")})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.perluHitungUlang && (
        <div className="mt-3 rounded-lg bg-gold-tint px-3 py-2 text-sm text-ink-2">
          <span className="font-semibold">{state.perluHitungUlang} pegawai</span> sudah punya kalkulasi Tukin periode
          ini yang dibuat SEBELUM rekap presensi barusan masuk - komponen kehadirannya masih memakai data lama. Hitung
          ulang lewat{" "}
          <Link href="/kasubag/kalkulasi" className="font-semibold text-teal-deep underline">
            Kalkulasi
          </Link>
          . Ingat, menghitung ulang mereset siklus approval yang sudah jalan ke DRAFT.
        </div>
      )}
    </div>
  );
}
