"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { lemburTeks } from "../../presensiTampilan";
import { BantuanTabel, BarisSumber } from "./BantuanTabel";
import {
  koreksiJamLemburHarianAction,
  hapusKoreksiJamLemburHarianAction,
  type KoreksiJamLemburHarianState,
} from "./actions";

export interface RincianLemburHari {
  tanggalIso: string;
  tanggalTampil: string;
  isHariLibur: boolean;
  keteranganHari: string;
  jamMasuk: string | null;
  jamKeluar: string | null;
  jamMesin: number;
  jamSaatIni: number;
  koreksi: {
    id: string;
    jamLembur: number | null;
    alasan: string;
    dikoreksiOlehNama: string;
    dikoreksiPada: string;
  } | null;
}

export interface BarisPemeriksaanLembur {
  pegawaiId: string;
  nip: string;
  nama: string;
  jamHariKerja: number | null;
  jamHariLibur: number | null;
  totalTersimpan: number | null;
  jamHarian: number;
  rincianHari: RincianLemburHari[];
}

const AWAL_STATE: KoreksiJamLemburHarianState = {};

function FormKoreksiHari({
  pegawaiId,
  nip,
  rincian,
  periodeBulan,
  periodeTahun,
  terkunci,
}: {
  pegawaiId: string;
  nip: string;
  rincian: RincianLemburHari;
  periodeBulan: number;
  periodeTahun: number;
  terkunci: boolean;
}) {
  const [state, formAction, pending] = useActionState(koreksiJamLemburHarianAction, AWAL_STATE);
  const [hapusState, hapusAction, hapusPending] = useActionState(hapusKoreksiJamLemburHarianAction, AWAL_STATE);

  return (
    <div className="rounded-xl border border-line bg-surface p-4 transition-all hover:border-biru/40">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-2 pb-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-ink">{rincian.tanggalTampil}</span>
          {rincian.isHariLibur ? (
            <span className="chip chip-warn text-[11px]">
              Hari Libur &middot; Tarif 2x ({rincian.keteranganHari})
            </span>
          ) : (
            <span className="chip chip-neutral text-[11px]">Hari Kerja &middot; Tarif 1x</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span>
            Ketukan:{" "}
            <strong className="font-mono text-ink">
              {rincian.jamMasuk ?? "-"} s.d. {rincian.jamKeluar ?? "-"}
            </strong>
          </span>
          <span>&bull;</span>
          <span>
            Hitungan Mesin:{" "}
            <strong className="font-mono text-ink">{rincian.jamMesin} jam</strong>
          </span>
        </div>
      </div>

      {rincian.koreksi && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-deep/20 bg-teal-tint px-3 py-2 text-xs">
          <div>
            <span className="font-bold text-teal-deep">
              Telah disesuaikan: {rincian.koreksi.jamLembur} jam
            </span>
            <span className="ml-2 text-ink-2">
              (Dasar SPL: <strong>{rincian.koreksi.alasan}</strong>)
            </span>
            <span className="block text-[11px] text-muted">
              Oleh {rincian.koreksi.dikoreksiOlehNama}
            </span>
          </div>

          {!terkunci && (
            <form action={hapusAction}>
              <input type="hidden" name="koreksiId" value={rincian.koreksi.id} />
              <input type="hidden" name="pegawaiId" value={pegawaiId} />
              <input type="hidden" name="tanggalIso" value={rincian.tanggalIso} />
              <input type="hidden" name="periodeBulan" value={periodeBulan} />
              <input type="hidden" name="periodeTahun" value={periodeTahun} />
              <button
                type="submit"
                disabled={hapusPending}
                className="btn btn-ghost btn-sm text-xs text-red hover:bg-red/10"
              >
                {hapusPending ? "Memulihkan..." : "Pulihkan ke Mesin"}
              </button>
            </form>
          )}
        </div>
      )}

      {hapusState.error && (
        <p className="mt-2 text-xs font-semibold text-red">{hapusState.error}</p>
      )}
      {hapusState.success && (
        <p className="mt-2 text-xs font-semibold text-green">{hapusState.success}</p>
      )}

      {!terkunci && (
        <form action={formAction} className="mt-3">
          <input type="hidden" name="pegawaiId" value={pegawaiId} />
          <input type="hidden" name="tanggalIso" value={rincian.tanggalIso} />
          <input type="hidden" name="periodeBulan" value={periodeBulan} />
          <input type="hidden" name="periodeTahun" value={periodeTahun} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 sm:items-end">
            <div className="sm:col-span-3">
              <label className="field-label text-xs">
                Jam Bayar SPL
                <span className="font-normal text-muted"> (0 - 24)</span>
              </label>
              <input
                type="number"
                name="jamLembur"
                min="0"
                max="24"
                step="1"
                defaultValue={rincian.jamSaatIni}
                required
                className="field-input w-full py-1 text-sm font-semibold"
              />
            </div>

            <div className="sm:col-span-6">
              <label className="field-label text-xs">
                Dasar Koreksi / Nomor SPL
                <span className="font-normal text-muted"> (wajib min. 10 huruf)</span>
              </label>
              <input
                type="text"
                name="alasan"
                minLength={10}
                required
                defaultValue={rincian.koreksi?.alasan ?? ""}
                placeholder="Contoh: SPL No. 142/TU/VI/2026 tugas rekap LK"
                className="field-input w-full py-1 text-sm"
              />
            </div>

            <div className="sm:col-span-3">
              <button
                type="submit"
                disabled={pending}
                className="btn btn-primary w-full py-1 text-xs"
              >
                {pending ? "Menyimpan..." : "Simpan SPL"}
              </button>
            </div>
          </div>

          <span className="mt-1.5 block text-[11px] text-muted">
            * Isi <strong>0</strong> jika ketukan pulang malam bukan penugasan lembur. Sisa menit tidak dibayarkan.
          </span>

          {state.error && (
            <p className="mt-2 text-xs font-semibold text-red">{state.error}</p>
          )}
          {state.success && (
            <p className="mt-2 text-xs font-semibold text-green">{state.success}</p>
          )}
        </form>
      )}
    </div>
  );
}

export function TabelPemeriksaanLembur({
  baris,
  periodeBulan,
  periodeTahun,
  terkunci = false,
}: {
  baris: readonly BarisPemeriksaanLembur[];
  periodeBulan: number;
  periodeTahun: number;
  terkunci?: boolean;
}) {
  const [pegawaiDipilih, setPegawaiDipilih] = useState<BarisPemeriksaanLembur | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const berlembur = baris.filter((b) => (b.totalTersimpan ?? 0) > 0 || b.jamHarian > 0);
  const tidakCocok = berlembur.filter(
    (b) => b.totalTersimpan !== null && b.totalTersimpan !== b.jamHarian
  );
  const totalKerja = berlembur.reduce((n, b) => n + (b.jamHariKerja ?? 0), 0);
  const totalLibur = berlembur.reduce((n, b) => n + (b.jamHariLibur ?? 0), 0);

  useEffect(() => {
    if (!pegawaiDipilih) {
      dialogRef.current?.close();
      return;
    }
    dialogRef.current?.showModal();
    const sebelumnya = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = sebelumnya;
    };
  }, [pegawaiDipilih]);

  // Cari data pegawai terpilih yang terbaru dari daftar baris
  const pegawaiAktifModal = pegawaiDipilih
    ? baris.find((b) => b.pegawaiId === pegawaiDipilih.pegawaiId) ?? pegawaiDipilih
    : null;

  return (
    <section id="tabel-lembur" className="mt-8 scroll-mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h2 className="text-base font-bold text-ink">Rincian Jam Lembur</h2>
          <BantuanTabel
            judul="Sumber Data & Acuan"
            label="Sumber data dan acuan tabel Jam Lembur"
          >
            <dl>
              <BarisSumber label="Sumber">
                <strong>Ketukan presensi e-Presensi.</strong> Jam lembur awalnya dihitung dari selisih
                ketukan pulang terhadap batas jam lembur hari itu - bukan angka yang diketik orang.
              </BarisSumber>
              <BarisSumber label="Acuan">
                <strong>Surat Perintah Lembur (SPL).</strong> Yang mengesahkan lembur adalah SPL-nya,
                bukan ketukan presensi fisik. Jika ada kelebihan jam ketukan di luar surat tugas,
                potong jam bayar sesuai SPL lewat tombol <strong>Periksa SPL &amp; Koreksi</strong>.
              </BarisSumber>
            </dl>

            <p className="mt-3 text-xs font-bold text-ink">Hari kerja vs hari libur</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Dipisah karena tarif per jamnya berbeda. Akhir pekan dan tanggal merah TIDAK disaring
              dari perhitungan - lembur hari libur memang dibayar dengan tarif berjenjang lebih tinggi.
            </p>

            <p className="mt-2.5 text-xs font-bold text-ink">Kenapa rincian harian yang menentukan</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Berkas ADK dibentuk dari rincian <strong>harian per tanggal</strong>, jadi itulah yang akan
              dibayar di Web Gaji/SAKTI - bukan angka total bulanan gelondongan. Menyesuaikan jam di sini
              langsung menyelaraskan rincian harian dan total bulanan secara bersamaan.
            </p>
          </BantuanTabel>
        </div>
        <span className="text-xs text-muted">
          {berlembur.length} pegawai berlembur &middot; {totalKerja} jam hari kerja, {totalLibur} jam hari libur
        </span>
      </div>

      {tidakCocok.length > 0 && (
        <div className="card mt-2 border-l-4 border-l-gold p-3">
          <p className="text-sm font-bold text-ink">
            {tidakCocok.length} pegawai rincian hariannya tidak cocok dengan total bulanan
          </p>
          <p className="mt-1 text-xs text-muted">
            Berkas ADK dibentuk dari rincian HARIAN, jadi itulah yang akan dibayar - bukan angka total yang
            tersimpan. Biasanya karena presensinya berubah setelah rekapnya dihitung; tekan Hitung sekarang
            supaya keduanya sama.
          </p>
        </div>
      )}

      <div className="card mt-2 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
                <th className="col-nama px-4 py-2.5">Nama</th>
                <th className="px-4 py-2.5">Hari kerja</th>
                <th className="px-4 py-2.5">Hari libur</th>
                <th className="px-4 py-2.5">Total Tersimpan</th>
                <th className="px-4 py-2.5">Hitungan Harian</th>
                <th className="px-4 py-2.5">Status SPL</th>
                <th className="px-4 py-2.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {berlembur.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted">
                    Tidak ada pegawai dengan jam lembur pada periode ini.
                  </td>
                </tr>
              )}
              {berlembur.map((b) => {
                const adaKoreksi = b.rincianHari.some((r) => r.koreksi !== null);
                const jmlKoreksi = b.rincianHari.filter((r) => r.koreksi !== null).length;
                const selisih = b.totalTersimpan !== null && b.totalTersimpan !== b.jamHarian;

                return (
                  <tr key={b.pegawaiId} className="border-b border-line-2 transition hover:bg-surface-2/50">
                    <td className="col-nama px-4 py-2.5">
                      <span className="font-semibold text-ink">{b.nama}</span>
                      <span className="block font-mono text-xs text-muted">{b.nip}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-ink-2">{lemburTeks(b.jamHariKerja ?? 0)}</td>
                    <td className="px-4 py-2.5 font-mono text-ink-2">{lemburTeks(b.jamHariLibur ?? 0)}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-ink">
                      {b.totalTersimpan === null ? (
                        <span className="font-sans text-xs font-normal text-muted">belum dihitung</span>
                      ) : (
                        lemburTeks(b.totalTersimpan)
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-ink">
                      <span className={selisih ? "rounded bg-gold-tint px-1.5 py-0.5 text-navy" : ""}>
                        {lemburTeks(b.jamHarian)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {adaKoreksi ? (
                        <span className="chip chip-info text-xs font-semibold" title={`${jmlKoreksi} hari disesuaikan dengan SPL`}>
                          Terkoreksi SPL ({jmlKoreksi} hari)
                        </span>
                      ) : (
                        <span className="chip chip-neutral text-xs text-muted">
                          Hitungan Mesin ({b.rincianHari.length} hari)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setPegawaiDipilih(b)}
                          className="btn btn-secondary btn-sm text-xs font-semibold"
                        >
                          Periksa SPL
                        </button>
                        <Link
                          href={`/tukin/presensi/${b.nip}?bulan=${periodeBulan}&tahun=${periodeTahun}&rinci=1`}
                          className="text-xs text-muted hover:text-ink underline"
                          title="Lihat kalender presensi 31 hari lengkap"
                        >
                          31 hari &rarr;
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* DIALOG MODAL PERIKSA & KOREKSI SPL */}
      <dialog
        ref={dialogRef}
        onClose={() => setPegawaiDipilih(null)}
        className="fixed top-1/2 left-1/2 m-0 max-h-[90vh] w-[min(54rem,96vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-left shadow-[0_20px_60px_rgba(19,65,107,0.25)] backdrop:bg-navy/40 backdrop:backdrop-blur-sm"
      >
        {pegawaiAktifModal && (
          <div className="p-6">
            {/* Header Modal */}
            <div className="flex items-start justify-between gap-3 border-b border-line-2 pb-4">
              <div>
                <h3 className="text-base font-extrabold text-navy">
                  Pemeriksaan &amp; Koreksi Jam Lembur (SPL)
                </h3>
                <p className="mt-0.5 text-xs text-muted">
                  Pegawai: <strong className="text-ink">{pegawaiAktifModal.nama}</strong> &middot; NIP:{" "}
                  <span className="font-mono">{pegawaiAktifModal.nip}</span> &middot; Periode:{" "}
                  <strong className="text-ink">
                    {periodeBulan}/{periodeTahun}
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPegawaiDipilih(null)}
                aria-label="Tutup"
                className="rounded-lg p-1 text-xl leading-none text-muted transition hover:bg-surface-2 hover:text-ink"
              >
                &times;
              </button>
            </div>

            {/* Ringkasan Akumulasi */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="card bg-surface-2/60 p-3">
                <span className="block text-[11px] font-medium text-muted">Jam Hari Kerja</span>
                <span className="text-sm font-bold font-mono text-ink">
                  {lemburTeks(pegawaiAktifModal.jamHariKerja ?? 0)}
                </span>
              </div>
              <div className="card bg-surface-2/60 p-3">
                <span className="block text-[11px] font-medium text-muted">Jam Hari Libur</span>
                <span className="text-sm font-bold font-mono text-ink">
                  {lemburTeks(pegawaiAktifModal.jamHariLibur ?? 0)}
                </span>
              </div>
              <div className="card bg-surface-2/60 p-3">
                <span className="block text-[11px] font-medium text-muted">Total Tersimpan</span>
                <span className="text-sm font-bold font-mono text-ink">
                  {lemburTeks(pegawaiAktifModal.totalTersimpan ?? 0)}
                </span>
              </div>
              <div className="card bg-surface-2/60 p-3">
                <span className="block text-[11px] font-medium text-muted">Total Rincian Harian</span>
                <span className="text-sm font-bold font-mono text-teal-deep">
                  {lemburTeks(pegawaiAktifModal.jamHarian)}
                </span>
              </div>
            </div>

            {/* Kotak Petunjuk Regulasi */}
            <div className="mt-4 rounded-xl border border-biru/20 bg-biru-tint p-3.5 text-xs leading-relaxed text-navy">
              <p className="font-bold">Ketentuan Penyesuaian Jam Lembur ke SPL (SBM 2026):</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-muted text-[11px]">
                <li>
                  Surat Perintah Lembur (SPL) adalah satu-satunya dokumen sah penugasan lembur. Jam ketukan
                  e-Presensi yang melebihi durasi SPL harus dipotong sesuai batas tugas SPL.
                </li>
                <li>
                  Jika kepulangan malam bukan dalam rangka lembur kedinasan, sesuaikan menjadi <strong>0</strong>.
                </li>
                <li>
                  Lembur dibulatkan ke bawah per jam penuh (sisa menit tidak dibayar). Lembur &ge; 2 jam
                  berhak uang makan lembur.
                </li>
                <li>
                  Wajib mengisi Nomor/Dasar SPL minimal 10 karakter untuk rekam jejak audit (BPK/Itjen).
                </li>
              </ul>
            </div>

            {terkunci && (
              <div className="mt-3 rounded-lg border border-gold bg-gold-tint p-3 text-xs font-semibold text-ink">
                Periode ini sudah dikirim ke PPABP dan terkunci. Rincian jam lembur hanya dapat dilihat (read-only).
              </div>
            )}

            {/* Daftar Tanggal Lembur Pegawai */}
            <div className="mt-5 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
                Tanggal Lembur Tercatat ({pegawaiAktifModal.rincianHari.length} Hari)
              </h4>

              {pegawaiAktifModal.rincianHari.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
                  Tidak ada tanggal lembur yang tercatat untuk pegawai ini pada periode {periodeBulan}/{periodeTahun}.
                </div>
              ) : (
                pegawaiAktifModal.rincianHari.map((r) => (
                  <FormKoreksiHari
                    key={r.tanggalIso}
                    pegawaiId={pegawaiAktifModal.pegawaiId}
                    nip={pegawaiAktifModal.nip}
                    rincian={r}
                    periodeBulan={periodeBulan}
                    periodeTahun={periodeTahun}
                    terkunci={terkunci}
                  />
                ))
              )}
            </div>

            <div className="mt-6 flex justify-end border-t border-line-2 pt-4">
              <button
                type="button"
                onClick={() => setPegawaiDipilih(null)}
                className="btn btn-secondary text-sm"
              >
                Selesai / Tutup
              </button>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
