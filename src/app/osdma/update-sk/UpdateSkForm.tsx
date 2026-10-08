"use client";

import { useActionState } from "react";
import { updateSkStrukturalAction, type UpdateSkStrukturalFormState } from "./actions";
import { GrDocumentUser } from "react-icons/gr";
import { FiCheck, FiAlertCircle } from "react-icons/fi";

const INITIAL_STATE: UpdateSkStrukturalFormState = {};

export function UpdateSkForm({
  pegawai,
}: {
  pegawai: {
    id: string;
    nama: string;
    nip: string;
    jabatan: string | null;
    golongan: string | null;
    kelasJabatan: number | null;
  };
}) {
  const [state, formAction, pending] = useActionState(updateSkStrukturalAction, INITIAL_STATE);

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-[0_2px_12px_rgba(19,65,107,0.06)]">
      <div className="flex items-center gap-2.5 border-b border-line pb-4">
        <span className="flex size-9 items-center justify-center rounded-xl bg-teal-tint text-biru ring-1 ring-biru/20">
          <GrDocumentUser className="size-4" />
        </span>
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink">
            Formulir Pemutakhiran SK Jabatan & Golongan
          </h2>
          <p className="text-[11px] text-muted">
            Perubahan ini langsung memperbarui data pokok kepegawaian dan dicatat ke dalam audit trail
          </p>
        </div>
      </div>

      <form action={formAction} className="mt-4 grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="pegawaiId" value={pegawai.id} />

        <div className="sm:col-span-2">
          <label className="field-label">Nama Jabatan Baru *</label>
          <input
            name="jabatan"
            required
            defaultValue={pegawai.jabatan ?? ""}
            className="field-input"
            placeholder="cth. Kepala Bagian Kepegawaian / Analis Kebijakan Ahli Muda"
            disabled={pending}
          />
          <p className="mt-1 text-[11px] text-muted">
            Nama jabatan definitif sesuai SK pelantikan struktural atau pengangkatan fungsional.
          </p>
        </div>

        <div>
          <label className="field-label">Golongan Baru *</label>
          <input
            name="golongan"
            required
            defaultValue={pegawai.golongan ?? ""}
            className="field-input"
            placeholder="cth. III/c atau IV/a"
            disabled={pending}
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="field-label">Kelas Jabatan (Grade)</label>
            <span className="chip chip-navy text-[10px] font-bold">Penentu Tarif Tukin</span>
          </div>
          <input
            type="number"
            name="kelasJabatan"
            min={1}
            max={17}
            defaultValue={pegawai.kelasJabatan ?? ""}
            className="field-input"
            placeholder="cth. 7, 9, atau 12"
            disabled={pending}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="field-label">TMT SK Terakhir (Tanggal Mulai Berlaku)</label>
          <input
            type="date"
            name="tmtSkTerakhir"
            className="field-input sm:w-1/2"
            disabled={pending}
          />
          <p className="mt-1 text-[11px] text-muted">
            Kosongkan jika ingin mempertahankan tanggal TMT SK yang sudah tercatat sebelumnya.
          </p>
        </div>

        <div className="sm:col-span-2 pt-3 border-t border-line/60 flex flex-wrap items-center justify-between gap-3">
          <button
            type="submit"
            disabled={pending}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <FiCheck className="size-4" />
            <span>{pending ? "Menyimpan ke Sistem..." : "Simpan Pemutakhiran SK"}</span>
          </button>

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
