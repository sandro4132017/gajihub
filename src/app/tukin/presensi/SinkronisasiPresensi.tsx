"use client";

import { useActionState } from "react";
import { tarikPresensiEpresensiAction, type SinkronPresensiFormState } from "./actionsSync";
import { NAMA_BULAN } from "../../bulan";
import { SearchableSelect } from "../../SearchableSelect";

const INITIAL_STATE: SinkronPresensiFormState = {};

export function SinkronisasiPresensi({
  defaultBulan,
  defaultTahun,
}: {
  defaultBulan: number;
  defaultTahun: number;
}) {
  const [state, formAction, pending] = useActionState(tarikPresensiEpresensiAction, INITIAL_STATE);

  return (
    <div className="card mt-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-navy">Sinkronisasi e-Presensi</h2>
          <p className="mt-1 text-sm text-muted">
            Menarik data kehadiran langsung dari e-Presensi, tanpa upload manual
          </p>
        </div>
        {/* Pil hijau, bukan chip persegi - penanda status koneksi, sengaja
            dibedakan bentuknya dari chip status data di tabel. */}
        <span className="chip chip-ok rounded-full px-3.5 py-1.5 text-[13px]">Tersambung</span>
      </div>

      {/* Satu baris: bulan - "Tahun" <tahun> - tombol. Label di ATAS tiap field
          sengaja dihapus; bulan sudah jelas dari isinya, dan periodenya
          dijelaskan kalimat di bawah. */}
      <form action={formAction} className="mt-4 flex flex-wrap items-center gap-3">
        <SearchableSelect
          name="bulan"
          className="w-40"
          options={NAMA_BULAN.map((nama, i) => ({ value: String(i + 1), label: nama }))}
          defaultValue={String(defaultBulan)}
        />
        <label className="flex items-center gap-3 text-sm font-semibold text-ink">
          Tahun
          <input
            type="number"
            name="tahun"
            min="2000"
            max="2100"
            defaultValue={defaultTahun}
            className="field-input mt-0 w-28 text-center"
          />
        </label>
        <button type="submit" disabled={pending} className="btn btn-primary px-4 py-2.5">
          {pending ? "Menarik data..." : "Tarik Data Presensi"}
        </button>
      </form>

      {/* Dua paragraf keterangan digabung jadi satu blok - keduanya menjawab
          pertanyaan yang sama ("apa yang terjadi kalau tombol ini ditekan"),
          dan yang soal potongan dulu terdampar di kaki kartu, jauh dari
          tombolnya. */}
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Penarikan data akan menimpa rekap pada bulan yang dipilih. Bulan lain tidak berubah. Potongan dihitung ulang oleh GajiHub sesuai <strong>Permenaker 15/2024</strong>, bukan menggunakan nilai potongan dari e-Presensi.
      </p>

      {pending && (
        <p className="mt-2 text-xs text-muted">
          Menarik & menganalisis seluruh baris presensi periode ini - untuk satu bulan penuh biasanya butuh
          beberapa puluh detik. Jangan tutup halaman ini.
        </p>
      )}

      {state.error && <p className="mt-3 text-sm text-red">{state.error}</p>}

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
    </div>
  );
}
