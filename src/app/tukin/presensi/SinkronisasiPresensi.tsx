"use client";

import { useActionState, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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

  // ==========================================================================
  // FILTER DI BAWAH IKUT PINDAH KE PERIODE YANG BARU DITARIK.
  //
  // Tanpa ini, menarik Juli sementara halaman sedang menampilkan Agustus
  // menghasilkan pemandangan yang menyesatkan: tarikan berhasil, tapi tabel
  // di bawah tetap Agustus dan terlihat kosong - dan yang membacanya
  // menyimpulkan pegawainya gagal diproses.
  //
  // Tautan "Lihat rekap periode ini" sudah ada sejak dulu, tapi harus diklik,
  // dan keraguan itu muncul SEBELUM orang sempat membacanya.
  //
  // Parameter lain (pencarian, satker, halaman) sengaja dipertahankan: yang
  // berubah cuma periodenya, dan menyapu filter lain memaksa orang menyetel
  // ulang pekerjaannya.
  // ==========================================================================
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Penanda supaya perpindahan terjadi SEKALI per hasil tarikan. Tanpa ini,
  // router.replace memicu render ulang yang menjalankan efeknya lagi.
  const sudahPindah = useRef<string | null>(null);

  const ringkasan = state.ringkasan;
  useEffect(() => {
    if (!ringkasan) return;
    const kunci = `${ringkasan.periodeBulan}-${ringkasan.periodeTahun}`;
    if (sudahPindah.current === kunci) return;

    const bulanSekarang = searchParams.get("bulan");
    const tahunSekarang = searchParams.get("tahun");
    const sudahSama =
      bulanSekarang === String(ringkasan.periodeBulan) && tahunSekarang === String(ringkasan.periodeTahun);
    sudahPindah.current = kunci;
    if (sudahSama) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("bulan", String(ringkasan.periodeBulan));
    params.set("tahun", String(ringkasan.periodeTahun));
    // Halaman dikembalikan ke awal - hasil tarikan baru tidak ada urusannya
    // dengan halaman ke-4 daftar sebelumnya.
    params.delete("hal");
    router.replace(`${pathname}?${params.toString()}`);
  }, [ringkasan, pathname, router, searchParams]);

  return (
    <div className="card mt-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-navy">Sinkronisasi e-Presensi</h2>
          <p className="mt-1 text-sm text-muted">
            Menarik data kehadiran langsung dari e-Presensi, tanpa upload manual
          </p>
        </div>
        <span className="chip chip-ok rounded-full px-3.5 py-1.5 text-[13px]">Tersambung</span>
      </div>

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
          <p className="mt-2 text-xs text-muted">
            Filter di bawah sudah dipindahkan ke {NAMA_BULAN[state.ringkasan.periodeBulan - 1]}{" "}
            {state.ringkasan.periodeTahun}.{" "}
            <a
              href={`/tukin/presensi?bulan=${state.ringkasan.periodeBulan}&tahun=${state.ringkasan.periodeTahun}`}
              className="font-semibold underline"
            >
              Buka rekapnya &rarr;
            </a>
          </p>
          <p className="mt-2 text-xs text-muted">
            Kalkulasi Tukin/uang makan TIDAK otomatis dihitung ulang - jalankan sendiri dari halaman Kalkulasi.
          </p>
        </div>
      )}
    </div>
  );
}
