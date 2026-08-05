"use client";

/**
 * Panel sinkronisasi e-Presensi.
 *
 * SUDAH TERSAMBUNG (sebelumnya tombolnya sengaja mati karena belum ada akses):
 * menarik langsung dari database e-Presensi lewat
 * src/adapters/EpresensiAdapter.ts. Modul yang dipakai SAMA PERSIS dengan
 * jalur CLI (src/jobs/importPresensiEpresensi.ts), jadi angkanya tidak bisa
 * berbeda antara tombol ini dan tarikan terjadwal.
 *
 * Upload PDF di bawah TIDAK dihapus - tetap jadi jalur cadangan kalau
 * jaringan ke server e-Presensi tidak bisa dijangkau, dan template Excel
 * tetap satu-satunya cara mengisi yang tidak ada di database (menit
 * meninggalkan kantor, tidak ikut upacara).
 */

import { useActionState } from "react";
import { tarikPresensiEpresensiAction, type SinkronPresensiFormState } from "./actionsSync";

const INITIAL_STATE: SinkronPresensiFormState = {};

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function SinkronisasiPresensi({
  defaultBulan,
  defaultTahun,
}: {
  defaultBulan: number;
  defaultTahun: number;
}) {
  const [state, formAction, pending] = useActionState(tarikPresensiEpresensiAction, INITIAL_STATE);

  return (
    <div className="card mt-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">Sinkronisasi e-Presensi</h2>
          <p className="mt-1 text-sm text-muted">
            Menarik data kehadiran langsung dari e-Presensi, tanpa upload manual.
          </p>
        </div>
        <span className="chip chip-ok">Tersambung</span>
      </div>

      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted">
          Periode yang DITARIK - bulan
          <input
            type="number"
            name="bulan"
            min="1"
            max="12"
            defaultValue={defaultBulan}
            className="field-input mt-1 w-20 py-1.5"
          />
        </label>
        <label className="text-xs text-muted">
          Tahun
          <input
            type="number"
            name="tahun"
            min="2000"
            max="2100"
            defaultValue={defaultTahun}
            className="field-input mt-1 w-24 py-1.5"
          />
        </label>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Menarik data..." : "Tarik data presensi"}
        </button>
      </form>

      <p className="mt-2 text-xs text-muted">
        Menarik data akan MENIMPA rekap periode ini. Satu tarikan hanya menyentuh bulan yang diisi di atas -
        bulan lain tidak ikut berubah. Filter di bawah halaman ini terpisah: itu cuma memilih periode mana yang
        ditampilkan di tabel, tidak menarik apa pun.
      </p>

      {pending && (
        <p className="mt-2 text-xs text-muted">
          Menarik & menganalisis seluruh baris presensi periode ini - untuk satu bulan penuh biasanya butuh
          beberapa puluh detik. Jangan tutup halaman ini.
        </p>
      )}

      {state.error && <p className="mt-3 text-sm text-danger">{state.error}</p>}

      {state.ringkasan && (
        <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
          <p className="text-sm font-semibold text-ink">
            {NAMA_BULAN[state.ringkasan.periodeBulan - 1]} {state.ringkasan.periodeTahun}:{" "}
            {state.ringkasan.tersimpan.toLocaleString("id-ID")} pegawai tersimpan
            <span className="font-normal text-muted">
              {" "}
              (dari {state.ringkasan.totalPegawaiSumber.toLocaleString("id-ID")} pegawai di e-Presensi)
            </span>
          </p>
          {state.ringkasan.dilewati.length > 0 && (
            <>
              <p className="mt-2 text-xs font-semibold text-muted">Dilewati:</p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted">
                {state.ringkasan.dilewati.slice(0, 8).map((d) => (
                  <li key={d.alasan}>
                    {d.jumlah.toLocaleString("id-ID")} - {d.alasan}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-2 text-xs">
            <a
              href={`/tukin/presensi?bulan=${state.ringkasan.periodeBulan}&tahun=${state.ringkasan.periodeTahun}`}
              className="font-semibold underline"
            >
              Lihat rekap periode ini di tabel bawah &rarr;
            </a>
          </p>
          <p className="mt-2 text-xs text-muted">
            Kalkulasi Tukin/uang makan/uang lembur TIDAK otomatis dihitung ulang - jalankan sendiri dari halaman
            Kalkulasi supaya siklus approval yang sudah selesai tidak dibuka ulang tanpa disengaja.
          </p>
        </div>
      )}

      <p className="mt-2 text-xs text-muted">
        Potongan dihitung ulang oleh Gajihub sesuai Permenaker 15/2024, BUKAN diambil dari kolom potongan
        e-Presensi. e-Presensi memberi toleransi keterlambatan 60 menit sementara Pasal 13 ayat (3) memotong
        setiap 1 menit - jadi potongan di sini bisa lebih besar daripada yang tertera di e-Presensi.
      </p>
    </div>
  );
}
