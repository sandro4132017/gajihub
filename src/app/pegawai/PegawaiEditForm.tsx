"use client";

import { useActionState } from "react";
import type { Pegawai } from "@prisma/client";
import { ubahDataPegawaiAction, type UbahDataPegawaiFormState } from "./actions";
import { SearchableSelect } from "../SearchableSelect";

const INITIAL_STATE: UbahDataPegawaiFormState = {};

// Nilai yang dipakai di data pegawai hasil impor SEKARANG cuma "AKTIF", tapi
// komentar di model Pegawai (schema.prisma) menyebut AKTIF/CUTI/MUTASI/PENSIUN
// sebagai nilai yang diharapkan - dipakai sebagai daftar dasar, digabung
// dengan nilai lain yang benar-benar ada di database (lihat page.tsx).
const STATUS_DASAR = ["AKTIF", "CUTI", "MUTASI", "PENSIUN"];

const KELAS_JABATAN = Array.from({ length: 17 }, (_, i) => String(i + 1));

export function PegawaiEditForm({
  pegawai,
  satuanKerjaList,
  golonganList,
  statusList,
  bolehPindahSatker,
}: {
  pegawai: Pegawai;
  satuanKerjaList: string[];
  golonganList: string[];
  statusList: string[];
  /** false untuk KASUBAG_TU - lihat canPindahSatuanKerjaPegawai. */
  bolehPindahSatker: boolean;
}) {
  const [state, formAction, pending] = useActionState(ubahDataPegawaiAction, INITIAL_STATE);

  const semuaStatus = Array.from(new Set([...STATUS_DASAR, ...statusList]));

  return (
    <form action={formAction} className="card mt-4 p-5">
      <input type="hidden" name="pegawaiId" value={pegawai.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label">NIP</label>
          {/* NIP sengaja read-only - kunci relasi ke akun/presensi/kalkulasi. */}
          <input value={pegawai.nip} readOnly disabled className="field-input bg-surface-2 text-muted" />
          <p className="mt-1 text-[11px] text-muted">NIP tidak bisa diubah dari sini (kunci relasi ke akun &amp; data payroll).</p>
        </div>

        <div>
          <label className="field-label">Nama</label>
          <input name="nama" defaultValue={pegawai.nama} required className="field-input" />
        </div>

        <div>
          <label className="field-label">Satuan kerja (Eselon II)</label>
          {bolehPindahSatker ? (
            <SearchableSelect
              name="satuanKerja"
              options={satuanKerjaList.map((s) => ({ value: s, label: s }))}
              defaultValue={pegawai.satuanKerja}
              required
            />
          ) : (
            <>
              <input value={pegawai.satuanKerja} readOnly disabled className="field-input bg-surface-2 text-muted" />
              <input type="hidden" name="satuanKerja" value={pegawai.satuanKerja} />
              <p className="mt-1 text-[11px] text-muted">
                Kasubag TU tidak bisa memindahkan pegawai keluar unit - minta PPABP atau Admin.
              </p>
            </>
          )}
        </div>

        <div>
          <label className="field-label">Unit kerja</label>
          <input name="unitKerja" defaultValue={pegawai.unitKerja} required className="field-input" />
        </div>

        <div>
          <label className="field-label">Jabatan</label>
          <input name="jabatan" defaultValue={pegawai.jabatan ?? ""} className="field-input" />
        </div>

        <div>
          <label className="field-label">Golongan</label>
          <SearchableSelect
            name="golongan"
            options={golonganList.map((g) => ({ value: g, label: g }))}
            defaultValue={pegawai.golongan ?? ""}
            emptyLabel="- kosongkan -"
          />
        </div>

        <div>
          <label className="field-label">Kelas jabatan (grade)</label>
          <SearchableSelect
            name="kelasJabatan"
            options={KELAS_JABATAN.map((k) => ({ value: k, label: `Kelas ${k}` }))}
            defaultValue={pegawai.kelasJabatan ? String(pegawai.kelasJabatan) : ""}
            emptyLabel="- kosongkan -"
          />
          <p className="mt-1 text-[11px] text-muted">Dipakai buat lookup tarif tukin pokok (Permenaker 15/2024).</p>
        </div>

        <div>
          <label className="field-label">Status pegawai</label>
          <SearchableSelect
            name="statusPegawai"
            options={semuaStatus.map((s) => ({ value: s, label: s }))}
            defaultValue={pegawai.statusPegawai}
            required
          />
        </div>

        <div>
          <label className="field-label">TMT SK terakhir</label>
          <input
            type="date"
            name="tmtSkTerakhir"
            defaultValue={pegawai.tmtSkTerakhir ? pegawai.tmtSkTerakhir.toISOString().slice(0, 10) : ""}
            className="field-input"
          />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Menyimpan..." : "Simpan perubahan"}
        </button>
        {state.success && <p className="text-xs font-semibold text-green">{state.success}</p>}
        {state.error && <p className="text-xs font-medium text-red">{state.error}</p>}
      </div>
    </form>
  );
}
