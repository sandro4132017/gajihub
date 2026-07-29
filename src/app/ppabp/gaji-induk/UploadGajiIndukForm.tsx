"use client";

import { useActionState } from "react";
import { uploadGajiIndukAction, type UploadGajiIndukFormState } from "./actions";
import { NAMA_BULAN } from "../../bulan";

const INITIAL_STATE: UploadGajiIndukFormState = {};

const formatRupiah = (nilai: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(nilai);

export function UploadGajiIndukForm() {
  const [state, formAction, pending] = useActionState(uploadGajiIndukAction, INITIAL_STATE);

  return (
    <div className="card mt-4 p-4">
      <h2 className="text-sm font-bold text-ink">Upload ADK gaji dari GPP</h2>
      <p className="mt-1 text-sm text-muted">
        Pilih file <span className="font-mono text-xs">Gaji_Bank_&lt;kode satker&gt;_&lt;...&gt;.xlsx</span> hasil
        export aplikasi GPP/Web Gaji. Periode diambil dari isi file (kolom <span className="font-mono text-xs">bulan</span>{" "}
        &amp; <span className="font-mono text-xs">tahun</span>), jadi tidak perlu dipilih manual.
      </p>

      <form action={formAction} className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          required
          className="field-input py-1.5 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink-2"
        />
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Memproses..." : "Upload & proses"}
        </button>
      </form>

      <p className="mt-2 text-xs text-muted">
        File-nya sendiri TIDAK disimpan - yang masuk database cuma komponen gajinya. Kolom NPWP, nomor rekening, dan
        nama bank sengaja dibuang saat pemrosesan.
      </p>

      {state.error && <p className="mt-3 text-sm font-medium text-red">{state.error}</p>}
      {state.success && <p className="mt-3 text-sm font-semibold text-green">{state.success}</p>}

      {state.ringkasan && state.ringkasan.length > 0 && (
        <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Periode yang tersimpan</p>
          <ul className="mt-1.5 space-y-1 text-sm text-ink-2">
            {state.ringkasan.map((r) => (
              <li key={`${r.periodeTahun}-${r.periodeBulan}`}>
                <span className="font-semibold text-ink">
                  {NAMA_BULAN[r.periodeBulan - 1] ?? r.periodeBulan} {r.periodeTahun}
                </span>{" "}
                - {r.jumlahTersimpan} pegawai, total gaji bersih{" "}
                <span className="font-mono">{formatRupiah(r.totalGajiBersih)}</span>
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

      {state.selisih && state.selisih.length > 0 && (
        <div className="mt-3 rounded-lg bg-gold-tint px-3 py-2">
          <p className="text-xs font-bold uppercase tracking-wide text-gold-deep">
            Perlu dicek - komponen tidak menjumlah ke kolom &quot;bersih&quot; di file
          </p>
          <ul className="mt-1.5 space-y-1 text-sm text-ink-2">
            {state.selisih.map((s) => (
              <li key={s.nip}>
                NIP <span className="font-mono">{s.nip}</span>, selisih{" "}
                <span className="font-mono">{formatRupiah(s.selisih)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-muted">
            Baris tetap tersimpan apa adanya. Selisih biasanya berarti ada kolom potongan di file yang belum dikenali
            Gajihub - laporkan supaya pemetaannya ditambahkan.
          </p>
        </div>
      )}
    </div>
  );
}
