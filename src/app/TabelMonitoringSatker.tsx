import Link from "next/link";
import type { BarisMonitoringSatker, StatusKirimSatker } from "../business-logic/monitoringSatker";
import { nilaiKalkulasiTampil } from "../business-logic/monitoringSatker";
import { NAMA_BULAN } from "./bulan";
import { KartuGrafik } from "./KitGrafik";
import { Paginasi, type HasilPaginasi } from "./Paginasi";
import { PencarianDebounce } from "./PencarianDebounce";
import { SearchableSelect } from "./SearchableSelect";
import { TAMPILKAN_NOMINAL_LEMBUR } from "./tampilUangLembur";

// ============================================================================
// TABEL MONITORING PENGIRIMAN & REKONSILIASI PER SATUAN KERJA.
//
// ENAM KOLOM - di bawah ambang 8 kolom yang dipakai proyek ini. Periode TIDAK
// jadi kolom ketujuh melainkan baris kecil di bawah nama unit, dan hanya saat
// cakupannya memang lebih dari satu periode: kolom yang isinya sama di
// seluruh baris bukan informasi, cuma lebar.
//
// PENCARIAN & PENYARING STATUS ADA DI KARTU INI, dan itu BUKAN pelanggaran
// aturan "filter satu baris di atas segalanya". Yang di kepala halaman
// menyaring SELURUH halaman (periode, satuan kerja); yang di sini cuma
// memperkecil tabel ini - dua hal berbeda yang kebetulan sama-sama bernama
// filter. Keduanya hidup di URL, jadi tetap jalan tanpa JavaScript dan
// tautannya bisa dibagikan.
//
// RUPIAH LEMBUR TIDAK IKUT di kolom Nilai Kalkulasi selama
// TAMPILKAN_NOMINAL_LEMBUR mati - tabel ini kartu ringkasan dashboard, persis
// yang disebut saklar itu. Pil "Lembur" di kolom jenis pembayaran TETAP
// tampil: yang ditahan nominalnya, bukan keberadaan jamnya.
// ============================================================================

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

const GAYA_STATUS: Record<StatusKirimSatker, { label: string; kelas: string }> = {
  TERKIRIM: { label: "Terkirim", kelas: "bg-green-tint text-green" },
  BELUM_KIRIM: { label: "Belum Dikirim", kelas: "bg-gold-tint text-gold-deep" },
  DIKEMBALIKAN: { label: "Dikembalikan", kelas: "bg-red-tint text-red" },
};

export const PILIHAN_STATUS_MONITORING = [
  { value: "", label: "Semua status" },
  { value: "BELUM_KIRIM", label: "Belum Dikirim" },
  { value: "DIKEMBALIKAN", label: "Dikembalikan" },
  { value: "TERKIRIM", label: "Terkirim" },
];

/** Pil jenis pembayaran yang BENAR-BENAR punya baris kalkulasi di unit itu. */
function PilJenis({ baris }: { baris: BarisMonitoringSatker }) {
  const jenis = [
    { kode: "TK", ada: baris.jumlahPegawaiTukin > 0, judul: `Tunjangan Kinerja: ${baris.jumlahPegawaiTukin} pegawai` },
    { kode: "UM", ada: baris.jumlahPegawaiUangMakan > 0, judul: `Uang Makan: ${baris.jumlahPegawaiUangMakan} pegawai` },
    { kode: "Lembur", ada: baris.jumlahPegawaiUangLembur > 0, judul: `Uang Lembur: ${baris.jumlahPegawaiUangLembur} pegawai` },
  ].filter((j) => j.ada);

  if (jenis.length === 0) return <span className="text-xs text-muted">Belum dihitung</span>;

  return (
    <span className="inline-flex flex-wrap justify-center gap-1">
      {jenis.map((j) => (
        <span
          key={j.kode}
          className="rounded-md bg-teal-tint px-1.5 py-0.5 text-[10px] font-bold text-navy"
          title={j.judul}
        >
          {j.kode}
        </span>
      ))}
    </span>
  );
}

export function TabelMonitoringSatker({
  baris,
  totalBaris,
  info,
  params,
  basePath,
  banyakPeriode,
  readOnly,
  tundaMs,
  q,
  status,
}: {
  /** SUDAH disaring & dipotong halaman oleh pemanggil. */
  baris: BarisMonitoringSatker[];
  totalBaris: number;
  info: HasilPaginasi;
  /** Parameter URL lain yang harus ikut terbawa saat pindah halaman. */
  params: URLSearchParams;
  /**
   * Alamat halaman yang memuat tabel ini - dipakai tautan paginasi.
   *
   * WAJIB DIOPER, bukan ditulis mati "/ppabp": dashboard yang sama dipakai
   * role Pimpinan di /pimpinan, dan alamat yang ditulis mati membuat tombol
   * "halaman 2" di sana melempar pembacanya ke halaman milik role lain - yang
   * lalu ditolak guard-nya. Ketahuan waktu halamannya dirender di test.
   */
  basePath: string;
  banyakPeriode: boolean;
  readOnly: boolean;
  tundaMs: number;
  q?: string;
  status?: string;
}) {
  return (
    <KartuGrafik
      judul="Monitoring Pengiriman & Rekonsiliasi Satuan Kerja"
      subjudul="Keadaan tiap unit pada periode yang sedang difilter"
      tundaMs={tundaMs}
      aksi={
        // Satu <form method="get"> - sama polanya dengan FilterBar, jadi
        // tetap jalan tanpa JavaScript. Parameter halaman TIDAK disertakan:
        // hasil pencarian baru hampir selalu lebih pendek, dan bertahan di
        // "halaman 5" berarti mendarat di tabel kosong yang terlihat seperti
        // "tidak ada hasil".
        <form method="get" className="flex flex-wrap items-center gap-2">
          {[...params.entries()]
            .filter(([k]) => !["q", "status", "hal"].includes(k))
            .map(([k, v]) => (
              <input key={`${k}=${v}`} type="hidden" name={k} value={v} />
            ))}
          <PencarianDebounce
            name="q"
            defaultValue={q}
            placeholder="Cari satuan kerja"
            className="w-48 rounded-full border border-line bg-surface-2 px-3.5 py-1.5 text-xs"
          />
          <SearchableSelect
            name="status"
            options={PILIHAN_STATUS_MONITORING}
            defaultValue={status ?? ""}
            placeholder="Semua status"
            className="w-40 text-xs"
          />
          <button
            type="submit"
            className="btn btn-ghost shrink-0 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-bold text-ink transition hover:bg-surface-2"
          >
            Filter
          </button>
        </form>
      }
    >
      {totalBaris === 0 ? (
        // Keadaan kosong menyebut SEBABNYA, bukan cuma "tidak ada data".
        <p className="py-8 text-center text-sm text-muted">
          {q || status
            ? "Tidak ada satuan kerja yang cocok dengan pencarian atau penyaring status di atas."
            : "Belum ada satuan kerja dalam cakupan periode ini."}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="px-2 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted">No</th>
                  <th className="col-nama px-2 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                    Satuan Kerja
                  </th>
                  <th className="px-2 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                    Jenis Pembayaran
                  </th>
                  <th className="px-2 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                    Nilai Kalkulasi
                  </th>
                  <th className="px-2 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                    Status PPABP
                  </th>
                  <th className="px-2 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {baris.map((b, i) => {
                  const gaya = GAYA_STATUS[b.status];
                  const nilai = nilaiKalkulasiTampil(b, TAMPILKAN_NOMINAL_LEMBUR);
                  return (
                    <tr key={b.kunci} className="border-b border-line-2 transition hover:bg-surface-2">
                      {/* Nomor memakai posisi di SELURUH daftar, bukan di
                          halaman ini - kalau di-reset, baris pertama halaman
                          2 ikut bernomor 1. */}
                      <td className="px-2 py-2.5 font-mono text-xs text-muted">{info.mulai + i + 1}</td>
                      <td className="col-nama px-2 py-2.5">
                        <span className="block truncate font-semibold text-ink" title={b.satuanKerja}>
                          {b.satuanKerja}
                        </span>
                        {banyakPeriode && (
                          <span className="block text-[11px] text-muted">
                            {NAMA_BULAN[b.periodeBulan - 1]} {b.periodeTahun}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <PilJenis baris={b} />
                      </td>
                      <td className="px-2 py-2.5 font-mono text-xs font-bold text-ink">
                        {nilai > 0 ? rupiah(nilai) : <span className="font-sans text-muted">&mdash;</span>}
                      </td>
                      <td className="px-2 py-2.5">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${gaya.kelas}`}>
                          {gaya.label}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        {readOnly ? (
                          <span className="text-xs text-muted">&mdash;</span>
                        ) : (
                          <Link
                            href={`/ppabp/adk?bulan=${b.periodeBulan}&tahun=${b.periodeTahun}&satker=${encodeURIComponent(b.satuanKerja)}`}
                            className="text-xs font-semibold text-teal-deep underline"
                          >
                            Buka ADK
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Paginasi
            basePath={basePath}
            params={params}
            info={info}
            totalBaris={totalBaris}
            labelBaris="satuan kerja"
          />
        </>
      )}
    </KartuGrafik>
  );
}
