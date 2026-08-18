"use client";

import { useActionState, useState } from "react";
import { inputSkHukdisAction, type InputSkHukdisFormState } from "./actions";
import { SearchableSelect } from "../../SearchableSelect";
import { NAMA_BULAN } from "../../bulan";

const INITIAL_STATE: InputSkHukdisFormState = {};

export function InputSkHukdisForm({ pegawaiList }: { pegawaiList: { id: string; nama: string; nip: string }[] }) {
  const [state, formAction, pending] = useActionState(inputSkHukdisAction, INITIAL_STATE);
  // Nomor SK dinonaktifkan begitu ditandai belum terbit - kalau dua-duanya
  // bisa diisi, orang akan mengetik "-" lalu mencentang, dan penandanya jadi
  // tidak berarti apa-apa.
  const [belumTerbit, setBelumTerbit] = useState(false);

  return (
    <form action={formAction} className="card mt-4 grid gap-3 p-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="field-label">Pegawai</label>
        <SearchableSelect
          name="pegawaiId"
          options={pegawaiList.map((p) => ({ value: p.id, label: p.nama, keterangan: `NIP ${p.nip}` }))}
          placeholder="Cari nama atau NIP pegawai..."
          required
        />
      </div>
      <div>
        <label className="field-label">Nomor SK</label>
        <input
          name="nomorSk"
          className="field-input"
          placeholder="cth. 220/HD/VII/2026"
          disabled={belumTerbit}
        />
        <label className="mt-1.5 flex items-start gap-2 text-xs text-muted">
          <input
            type="checkbox"
            name="skBelumTerbit"
            checked={belumTerbit}
            onChange={(e) => setBelumTerbit(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <strong>SK belum terbit</strong> - keputusannya masih diproses pimpinan. Baris ini tetap dihitung
            (setelah disetujui OSDMA), tapi ditandai merah di semua daftar sampai nomornya dilengkapi.
          </span>
        </label>
      </div>
      <div>
        <label className="field-label">Tanggal SK</label>
        <input type="date" name="tanggalSk" required className="field-input" />
      </div>
      <div>
        <label className="field-label">Jenis hukuman</label>
        <input name="jenisHukuman" required className="field-input" placeholder="cth. Teguran tertulis (bebas isi - lihat catatan)" />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="field-label">Periode mulai (bulan)</label>
          <SearchableSelect
            name="periodeMulaiBulan"
            options={NAMA_BULAN.map((nama, i) => ({ value: String(i + 1), label: nama }))}
            required
          />
        </div>
        <div className="flex-1">
          <label className="field-label">Periode mulai (tahun)</label>
          <input type="number" name="periodeMulaiTahun" required className="field-input" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="field-label">Periode selesai (bulan)</label>
          <SearchableSelect
            name="periodeSelesaiBulan"
            options={NAMA_BULAN.map((nama, i) => ({ value: String(i + 1), label: nama }))}
            emptyLabel="(sampai dicabut)"
          />
        </div>
        <div className="flex-1">
          <label className="field-label">Periode selesai (tahun)</label>
          <input type="number" name="periodeSelesaiTahun" className="field-input" placeholder="kosongkan kalau belum ditentukan" />
        </div>
      </div>

      {/* Penurunan kelas jabatan - satu-satunya bagian form ini yang MENGUBAH
          UANG, jadi dipisah dan dijelaskan, bukan diselipkan sebagai field
          biasa. Lihat src/business-logic/kelasJabatanEfektif.ts. */}
      <div className="sm:col-span-2 rounded-xl border border-line bg-surface-2 p-3">
        <label className="field-label">Kelas jabatan selama hukuman (opsional)</label>
        <input
          type="number"
          name="kelasJabatanSelamaHukuman"
          min={1}
          max={17}
          className="field-input w-32"
          placeholder="cth. 6"
        />
        <p className="mt-1.5 text-xs text-muted">
          Isi HANYA kalau hukumannya menurunkan jabatan (PP 94/2021) - mis. turun dari kelas 7 ke{" "}
          <strong>6</strong> selama satu tahun. Tarif tunjangan kinerja ditentukan kelas jabatan, jadi angka ini{" "}
          <strong>langsung mengubah yang dibayarkan</strong> selama periode di atas, lalu kembali sendiri setelah
          periodenya lewat.
        </p>
        <p className="mt-1 text-xs text-muted">
          Wajib diketik manual: <strong>SIAP tidak mencatat penurunan ini</strong>, jadi tidak akan pernah datang
          sendiri dari sinkronisasi pegawai. Kosongkan untuk hukuman yang tidak menurunkan jabatan (teguran lisan/
          tertulis). Berlaku hanya setelah <strong>disetujui OSDMA</strong>.
        </p>
      </div>

      <div className="sm:col-span-2">
        <label className="field-label">Keterangan (opsional)</label>
        <textarea name="keterangan" rows={2} className="field-input" />
      </div>
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Menyimpan..." : "Input SK Hukuman Disiplin"}
        </button>
        {state.success && <p className="mt-2 text-sm font-semibold text-green">{state.success}</p>}
        {state.error && <p className="mt-2 text-sm font-medium text-red">{state.error}</p>}
      </div>
    </form>
  );
}
