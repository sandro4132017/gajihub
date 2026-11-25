import type { ReactNode } from "react";
import { RiErrorWarningLine } from "react-icons/ri";
import { PilPredikat } from "../../components/shared/PilPredikat";

/**
 * Tabel rincian Tukin satu satuan kerja - nilai intinya saja.
 *
 * Grade, nominal tukin, potongan, capaian kinerja, dibayarkan. Tujuh kolom,
 * muat tanpa menggeser layar.
 *
 * SENGAJA TIDAK MENIRU 38 kolom form "Rincian Tunkin" milik Biro Keuangan.
 * Sempat dibuat begitu lengkap dengan kelompok kolom yang bisa dibuka-tutup,
 * lalu dicabut (permintaan user 2026-09-06): yang dikerjakan orang di halaman
 * ini adalah menyapu daftar mencari baris yang janggal, dan untuk itu kolom
 * yang lebih sedikit justru lebih cepat. Rincian per hari, per jenis cuti, dan
 * per pasal potongan sudah punya tempatnya sendiri di halaman Presensi dan di
 * rincian per pegawai.
 */

export interface BarisRincianTukin {
  /**
   * Id baris kalkulasi - dipakai sebagai `key` React.
   *
   * SENGAJA BUKAN NIP. Satu pegawai punya satu baris PER PERIODE, dan waktu
   * Dashboard Tukin dibuka tanpa memilih bulan, seluruh periode ikut tampil -
   * NIP yang sama muncul lebih dari sekali dan React menolaknya sebagai key
   * ganda. Ketemu betulan pada satu pegawai yang punya baris di periode 5/2026
   * DAN 7/2026 sekaligus.
   */
  id: string;
  nip: string;
  nama: string;
  kelasJabatan: number | null;
  /** Tarif penuh kelas jabatan sebelum potongan apa pun. */
  nominalTukin: number | null;
  /** Predikat kinerja - bobot 70%. */
  predikat: string | null;
  dibayarkan: number;
  catatanAnomali: string | null;
}

const rupiah = (n: number | null) =>
  n === null ? "-" : `Rp ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n)}`;

/**
 * Potongan = tarif penuh kelas jabatan dikurangi yang benar-benar dibayarkan.
 *
 * SENGAJA BUKAN potongan satu pasal saja. Potongan datang dari tiga arah -
 * Pasal 13 (kehadiran), Pasal 14 (override cuti), dan capaian kinerja di bawah
 * penuh - dan yang ingin diketahui orang waktu menyapu tabel adalah "berapa
 * yang hilang", bukan "berapa yang hilang dari satu pasal".
 */
function potonganTotal(b: BarisRincianTukin): number | null {
  return b.nominalTukin === null ? null : b.nominalTukin - b.dibayarkan;
}

/**
 * Potongan sebagai PERSEN dari tarif penuh kelas jabatannya.
 *
 * Persen dipilih daripada rupiah karena kolom ini dibaca dengan cara
 * dibandingkan antar baris - dan rupiah tidak bisa dibandingkan begitu saja:
 * potongan Rp 2 juta pada kelas 15 dan pada kelas 8 dua hal yang sangat
 * berbeda beratnya. Persen menyamakan penyebutnya, jadi baris yang paling
 * berat langsung terlihat tanpa perlu melihat kolom di sebelahnya.
 *
 * Rupiahnya tidak hilang - ikut sebagai `title` pada selnya.
 */
function persenPotongan(b: BarisRincianTukin): number | null {
  const pot = potonganTotal(b);
  if (pot === null || b.nominalTukin === null || b.nominalTukin === 0) return null;
  return (pot / b.nominalTukin) * 100;
}

const format2 = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n);

// Gaya sama dengan tabel Tukin di Kalkulasi Unit (TabelTukinRingkas).
const TH = "whitespace-nowrap px-3 py-3 text-[11px] font-semibold uppercase tracking-wide";
const TD = "whitespace-nowrap px-3 py-3";

function SubJudul({ children }: { children: string }) {
  return <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-muted/80">{children}</span>;
}

export function TabelRincianUnit({
  baris,
  satuanKerja,
  periode,
  aksi,
}: {
  baris: BarisRincianTukin[];
  /** Tombol di kepala tabel, mis. "Lihat rincian lengkap". */
  aksi?: ReactNode;
  satuanKerja: string;
  /**
   * Periode yang sedang ditampilkan, mis. "Juli 2026".
   *
   * DISEBUT DI JUDUL, bukan diserahkan ke filter di puncak halaman: tabel ini
   * jauh di bawah lipatan, dan angka rupiah tanpa keterangan bulan gampang
   * ikut tersalin ke tempat lain sebagai angka periode yang keliru.
   */
  periode: string;
}) {
  // BARIS TOTAL SENGAJA TIDAK MEMUAT PERSEN (permintaan user 2026-09-09).
  // Persen di kolom potongan gunanya membandingkan antar BARIS - berat
  // tidaknya potongan seseorang. Dijumlahkan ke satu angka unit, perbandingan
  // itu hilang dan yang tersisa cuma angka yang gampang disalahbaca sebagai
  // "unit ini dipotong sekian persen". Yang benar-benar dipakai dari baris
  // TOTAL adalah rupiah yang dibayarkan.
  const total = {
    dibayarkan: baris.reduce((a, b) => a + b.dibayarkan, 0),
  };

  return (
    <div className="card mt-8 overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-sm font-extrabold text-ink">
          Rincian Tukin {periode} &mdash; {satuanKerja}
        </h2>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted">{baris.length} pegawai</p>
          {aksi}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2/50 text-muted">
              <th className={`${TH} col-nama sm:pl-5`}>Nama Pegawai / NIP</th>
              <th className={TH}>Grade</th>
              <th className={TH}>
                Nominal Tukin<SubJudul>kotor, sesuai kelas jabatan</SubJudul>
              </th>
              <th className={TH}>
                Potongan<SubJudul>dari tunjangan penuh</SubJudul>
              </th>
              <th className={TH}>Capaian Kinerja</th>
              <th className={`${TH} sm:pr-5`}>Dibayarkan</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((b) => {
              const pot = potonganTotal(b);
              const persen = persenPotongan(b);
              return (
                <tr key={b.id} className="border-b border-line-2 last:border-0 hover:bg-surface-2/60">
                  <td className={`${TD} col-nama sm:pl-5`} title={b.nama}>
                    <span className="font-semibold text-ink">{b.nama}</span>
                    {/* Catatan validasi kalkulasi - mis. cuti panjang yang bulan
                        ke berapanya tidak diketahui. Isinya di `title` supaya
                        satu baris tidak melebar gara-gara kalimat panjang. */}
                    {b.catatanAnomali && (
                      <span
                        className="ml-1 inline-flex align-middle text-gold-deep"
                        title={b.catatanAnomali}
                      >
                        <RiErrorWarningLine aria-hidden />
                      </span>
                    )}
                    <span className="mt-0.5 block text-[11px] text-muted">
                      NIP. <span className="font-mono">{b.nip}</span>
                    </span>
                  </td>
                  <td className={`${TD} font-mono text-ink-2`}>{b.kelasJabatan ?? "-"}</td>
                  <td className={`${TD} font-mono text-ink-2`}>{rupiah(b.nominalTukin)}</td>
                  {/* 0% HIJAU, potongan oranye - sama dengan tabel Kalkulasi Unit
                      (keputusan user 2026-11-16). "-" hanya bila tarifnya tidak
                      diketahui. */}
                  <td
                    className={`${TD} font-mono font-semibold ${
                      persen === null ? "font-normal text-muted" : persen > 0 ? "text-gold-deep" : "text-green"
                    }`}
                    title={pot !== null && pot > 0 ? rupiah(pot) : undefined}
                  >
                    {persen === null ? "-" : persen > 0 ? `${format2(persen)}%` : "0%"}
                  </td>
                  <td className={TD}>
                    {b.predikat ? <PilPredikat nilai={b.predikat} /> : <span className="text-muted">-</span>}
                  </td>
                  <td className={`${TD} font-mono font-bold text-ink sm:pr-5`}>{rupiah(b.dibayarkan)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line bg-surface-2 font-bold text-ink">
              <td className={`${TD} col-nama sm:pl-5`}>TOTAL</td>
              <td className={TD} colSpan={4} />
              <td className={`${TD} font-mono sm:pr-5`}>{rupiah(total.dibayarkan)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
