"use client";

import { useActionState, useState } from "react";
import { catatSkGradeAction, hapusSkGradeAction, type SkGradeFormState } from "./actionsSkGrade";
import { tglTampil } from "../tanggalTampil";

const AWAL: SkGradeFormState = {};

export interface BarisSkGrade {
  id: string;
  nomorSk: string;
  /** ISO "2026-08-31" - sudah dipotong di server, bukan Date. */
  tanggalSk: string;
  tmtBerlaku: string;
  kelasJabatan: number;
  keterangan: string | null;
  dicatatOleh: string;
}

/**
 * Riwayat SK GRADING satu pegawai - SK yang menetapkan kelas jabatannya.
 *
 * KENAPA DIKETIK, BUKAN DITARIK. Nomor SK grading tidak ada di SIAP: tabel
 * `MANJAB_PENERBITAN_*` yang seharusnya memuatnya nol baris, dan
 * `PEGAWAI.JOBGRADE` terisi 0 dari 5.073 pegawai aktif (diukur 2026-09-14).
 * Kelas jabatan yang dipakai sistem ini datang dari tabel acuan per JABATAN,
 * yang tidak membawa nomor SK sama sekali.
 *
 * KENAPA DAFTAR, BUKAN SATU ISIAN. Berkas ADK bisa dibuat jauh sesudah
 * periodenya lewat, jadi yang dipakai adalah SK yang berlaku PADA PERIODE
 * ITU - bukan yang terbaru. Aturan pemilihannya di
 * src/business-logic/skGrade.ts, diuji tersendiri.
 *
 * BERKAS SK-nya TIDAK diunggah (keputusan user 2026-09-14). Nilainya justru
 * di situ: petugas membuka dokumen resminya untuk mengetik nomor, tanggal,
 * TMT, dan kelasnya - pemeriksaan ulang yang tidak akan terjadi kalau
 * angkanya datang sendiri dari sinkronisasi.
 */
export function SkGradeForm({
  pegawaiId,
  namaPegawai,
  kelasJabatanBerlaku,
  riwayat,
  bolehKelola,
}: {
  pegawaiId: string;
  namaPegawai: string;
  /** Kelas jabatan yang sekarang dipakai menghitung tarif - bahan pembanding. */
  kelasJabatanBerlaku: number | null;
  riwayat: BarisSkGrade[];
  bolehKelola: boolean;
}) {
  const [state, formAction, pending] = useActionState(catatSkGradeAction, AWAL);
  const [hapusState, hapusAction, hapusPending] = useActionState(hapusSkGradeAction, AWAL);
  const [buka, setBuka] = useState(false);

  // SK paling akhir yang tercatat, dibandingkan dengan kelas jabatan yang
  // BENAR-BENAR dipakai menghitung tarif. Kalau berbeda, salah satunya perlu
  // diperbaiki - dan bedanya terbawa ke tiap berkas ADK sebagai selisih
  // rupiah, bukan sekadar catatan yang tidak cocok.
  const terbaru = riwayat[0];
  const bedaKelas =
    terbaru !== undefined && kelasJabatanBerlaku !== null && terbaru.kelasJabatan !== kelasJabatanBerlaku;

  return (
    <div className="card mt-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-ink">SK Grading</p>
          <p className="text-xs text-muted">
            Dasar kolom <strong>Nomor SK</strong> di berkas ADK Tunjangan Kinerja.
          </p>
        </div>
        {bolehKelola && (
          <button type="button" onClick={() => setBuka(!buka)} className="btn btn-ghost btn-sm shrink-0">
            {buka ? "Tutup" : "+ Catat SK"}
          </button>
        )}
      </div>

      {bedaKelas && (
        <p className="mt-3 rounded-lg border border-gold bg-gold-tint px-3 py-2 text-xs text-ink-2">
          <strong className="font-bold text-ink">Kelas jabatan tidak sama.</strong> SK terakhir menetapkan kelas{" "}
          <strong>{terbaru.kelasJabatan}</strong>, yang dipakai menghitung tarif kelas{" "}
          <strong>{kelasJabatanBerlaku}</strong>. Salah satunya perlu diperbaiki.
        </p>
      )}

      {buka && bolehKelola && (
        <form action={formAction} className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
          <input type="hidden" name="pegawaiId" value={pegawaiId} />
          <p className="text-xs text-muted">
            Ketik dari SK aslinya untuk <strong className="text-ink-2">{namaPegawai}</strong>. Berkasnya tidak
            diunggah.
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="field-label">Nomor SK</label>
              <input name="nomorSk" required className="field-input" placeholder="Mis. 1234/SJ/KP.03.00/VII/2026" />
            </div>
            <div>
              <label className="field-label">Tanggal SK</label>
              <input type="date" name="tanggalSk" required className="field-input" />
              <p className="mt-1 text-[11px] text-muted">Tanggal SK diterbitkan.</p>
            </div>
            <div>
              <label className="field-label">TMT berlaku</label>
              <input type="date" name="tmtBerlaku" required className="field-input" />
              {/* Dua tanggal berdampingan tanpa keterangan adalah undangan
                  untuk tertukar - dan di sini yang tertukar menentukan SK mana
                  yang dipakai untuk suatu periode. */}
              <p className="mt-1 text-[11px] text-muted">Mulai berlaku - boleh lebih awal dari tanggal SK.</p>
            </div>
            <div>
              <label className="field-label">Kelas jabatan</label>
              <input type="number" name="kelasJabatan" min={1} max={17} required className="field-input w-32" />
            </div>
            <div>
              <label className="field-label">Keterangan (opsional)</label>
              <input name="keterangan" className="field-input" placeholder="Mis. SK Penyesuaian Kelas Jabatan" />
            </div>
          </div>
          <button type="submit" disabled={pending} className="btn btn-primary mt-3">
            {pending ? "Menyimpan..." : "Simpan SK"}
          </button>
          {state.error && <p className="mt-2 text-sm font-medium text-red">{state.error}</p>}
          {state.success && <p className="mt-2 text-sm font-semibold text-green">{state.success}</p>}
        </form>
      )}

      {riwayat.length === 0 ? (
        <p className="mt-3 text-xs text-muted">
          Belum ada SK grading tercatat. Kolom Nomor SK di ADK memakai isian manual di form Data Pegawai di bawah,
          atau kosong kalau itu pun belum diisi.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
                <th className="col-nama px-3 py-2">Nomor SK</th>
                <th className="px-3 py-2">Tanggal SK</th>
                <th className="px-3 py-2">TMT berlaku</th>
                <th className="px-3 py-2">Kelas</th>
                <th className="px-3 py-2">Dicatat</th>
                {bolehKelola && <th className="px-3 py-2">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {riwayat.map((r) => (
                <tr key={r.id} className="border-b border-line-2">
                  <td className="col-nama px-3 py-2">
                    <span className="font-semibold text-ink">{r.nomorSk}</span>
                    {r.keterangan && <span className="block text-xs text-muted">{r.keterangan}</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-2">{tglTampil(r.tanggalSk)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-2">{tglTampil(r.tmtBerlaku)}</td>
                  <td className="px-3 py-2 font-mono font-bold text-ink">{r.kelasJabatan}</td>
                  <td className="px-3 py-2 text-xs text-muted">{r.dicatatOleh}</td>
                  {bolehKelola && (
                    <td className="px-3 py-2">
                      <form action={hapusAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" disabled={hapusPending} className="link text-xs">
                          Hapus
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hapusState.error && <p className="mt-2 text-sm font-medium text-red">{hapusState.error}</p>}
      {hapusState.success && <p className="mt-2 text-sm font-semibold text-green">{hapusState.success}</p>}
    </div>
  );
}
