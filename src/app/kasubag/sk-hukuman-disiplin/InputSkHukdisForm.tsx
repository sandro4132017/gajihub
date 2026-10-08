"use client";

import { useActionState, useState } from "react";
import { inputSkHukdisAction, type InputSkHukdisFormState } from "./actions";
import { SearchableSelect } from "../../SearchableSelect";
import { NAMA_BULAN } from "../../bulan";
import { RiFileWarningLine } from "react-icons/ri";
import { FiCheckCircle, FiAlertCircle, FiSend } from "react-icons/fi";

const INITIAL_STATE: InputSkHukdisFormState = {};

export function InputSkHukdisForm({
  pegawaiList,
}: {
  pegawaiList: { id: string; nama: string; nip: string }[];
}) {
  const [state, formAction, pending] = useActionState(inputSkHukdisAction, INITIAL_STATE);
  const [belumTerbit, setBelumTerbit] = useState(false);

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-[0_2px_12px_rgba(19,65,107,0.06)]">
      <div className="flex items-center gap-2.5 border-b border-line pb-4">
        <span className="flex size-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-rose-200">
          <RiFileWarningLine className="size-5" />
        </span>
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink">
            Formulir Catatan SK Hukuman Disiplin
          </h2>
          <p className="text-[11px] text-muted">
            Input catatan sanksi disiplin pegawai untuk diteruskan ke Biro OSDMA dan pemotongan tukin
          </p>
        </div>
      </div>

      <form action={formAction} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="field-label">Pilih Pegawai *</label>
          <SearchableSelect
            name="pegawaiId"
            options={pegawaiList.map((p) => ({
              value: p.id,
              label: p.nama,
              keterangan: `NIP ${p.nip}`,
            }))}
            placeholder="Ketik nama atau NIP pegawai..."
            required
          />
        </div>

        <div>
          <label className="field-label">Nomor Dokumen SK</label>
          <input
            name="nomorSk"
            className="field-input"
            placeholder="cth. 220/HD/VII/2026"
            disabled={belumTerbit || pending}
          />
          <label className="mt-2 flex items-start gap-2 text-xs text-muted">
            <input
              type="checkbox"
              name="skBelumTerbit"
              checked={belumTerbit}
              onChange={(e) => setBelumTerbit(e.target.checked)}
              className="mt-0.5 rounded border-line"
              disabled={pending}
            />
            <span>
              <strong className="text-rose-700">SK belum terbit</strong> - Keputusannya masih diproses pimpinan. Usulan tetap dihitung setelah disetujui OSDMA, namun ditandai merah hingga nomor SK dilengkapi.
            </span>
          </label>
        </div>

        <div>
          <label className="field-label">Tanggal Terbit SK *</label>
          <input
            type="date"
            name="tanggalSk"
            required
            className="field-input"
            disabled={pending}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="field-label">Jenis Hukuman Disiplin *</label>
          <input
            name="jenisHukuman"
            required
            className="field-input"
            placeholder="cth. Teguran tertulis / Penurunan jabatan setingkat lebih rendah"
            disabled={pending}
          />
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="field-label">Periode Mulai (Bulan) *</label>
            <SearchableSelect
              name="periodeMulaiBulan"
              options={NAMA_BULAN.map((nama, i) => ({ value: String(i + 1), label: nama }))}
              required
            />
          </div>
          <div className="w-28">
            <label className="field-label">Tahun *</label>
            <input
              type="number"
              name="periodeMulaiTahun"
              required
              defaultValue={new Date().getFullYear()}
              className="field-input"
              disabled={pending}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="field-label">Periode Selesai (Bulan)</label>
            <SearchableSelect
              name="periodeSelesaiBulan"
              options={NAMA_BULAN.map((nama, i) => ({ value: String(i + 1), label: nama }))}
              emptyLabel="(sampai dicabut)"
            />
          </div>
          <div className="w-28">
            <label className="field-label">Tahun</label>
            <input
              type="number"
              name="periodeSelesaiTahun"
              placeholder="opsional"
              className="field-input"
              disabled={pending}
            />
          </div>
        </div>

        {/* Penurunan kelas jabatan */}
        <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3.5">
          <div className="flex items-center gap-2">
            <label className="field-label mb-0 font-bold text-amber-900">
              Kelas Jabatan Selama Hukuman (Opsional)
            </label>
            <span className="chip chip-amber text-[10px] font-bold">Berdampak pada Tukin</span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="number"
              name="kelasJabatanSelamaHukuman"
              min={1}
              max={17}
              className="field-input w-36 bg-white"
              placeholder="cth. 6"
              disabled={pending}
            />
            <span className="text-xs text-muted">
              Isi jika sanksi menurunkan kelas jabatan (mis. turun dari kelas 7 ke <strong>6</strong>).
            </span>
          </div>
          <p className="mt-2 text-[11px] text-muted leading-relaxed">
            Angka ini akan <strong>langsung mengubah tarif tunjangan kinerja</strong> yang dibayarkan selama periode sanksi setelah disetujui Biro OSDMA, lalu kembali normal setelah masa berlaku sanksi selesai.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className="field-label">Keterangan Tambahan (Opsional)</label>
          <textarea
            name="keterangan"
            rows={2}
            className="field-input"
            placeholder="Tuliskan keterangan latar belakang atau pertimbangan..."
            disabled={pending}
          />
        </div>

        <div className="sm:col-span-2 pt-2 border-t border-line/60 flex flex-wrap items-center justify-between gap-3">
          <button
            type="submit"
            disabled={pending}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <FiSend className="size-4" />
            <span>{pending ? "Menyimpan Usulan..." : "Input SK Hukuman Disiplin"}</span>
          </button>

          {state.success && (
            <div className="flex items-center gap-2 rounded-xl bg-green-tint border border-green/30 px-3 py-2 text-xs font-bold text-green">
              <FiCheckCircle className="size-4 shrink-0" />
              <span>{state.success}</span>
            </div>
          )}

          {state.error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-tint border border-red/30 px-3 py-2 text-xs font-semibold text-red">
              <FiAlertCircle className="size-4 shrink-0" />
              <span>{state.error}</span>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
