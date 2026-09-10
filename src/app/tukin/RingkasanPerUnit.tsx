import Link from "next/link";
import { BadgeStatusKirim, keadaanKirimBaris } from "../StatusKirimBaris";

/**
 * Ringkasan kalkulasi Tukin PER SATUAN KERJA - tampilan Dashboard Tukin waktu
 * belum ada satker yang dipilih.
 *
 * KENAPA PER UNIT, BUKAN PER ORANG. Yang diterima PPABP adalah satu rekap per
 * unit, dan sejak approval per baris dihapus 2026-09-02 baris per orang tidak
 * lagi memuat keputusan apa pun - PPABP menerima atau mengembalikan satu unit,
 * bukan satu orang. Menampilkan ribuan kartu per pegawai berarti menyuruh
 * orang menggulir daftar yang tidak ada satu pun tindakannya.
 *
 * Rinciannya TIDAK hilang: kolom pertama menautkan ke halaman yang sama dengan
 * `?satker=` terisi, dan di situ tampilan per pegawai yang lama muncul -
 * sekarang dengan isi satu unit saja, ukuran yang memang masuk akal dibaca.
 *
 * Kasubag TU tidak pernah melihat tabel ini: satuan kerjanya selalu dipaksa
 * oleh `resolveSatkerEfektif`, jadi mereka langsung mendarat di rincian.
 */

export interface BarisRingkasanUnit {
  satuanKerja: string;
  jumlahPegawai: number;
  /** Cacah baris yang punya `catatanAnomali` - penunjuk unit mana yang perlu dibuka. */
  jumlahCatatan: number;
  totalBersih: number;
  statusKirim: string | undefined;
  dikirimPada: Date | null;
  dikirimOleh: string | null;
}

const rupiah = (nilai: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(nilai);

const tanggalRingkas = (d: Date) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(d);

export function RingkasanPerUnit({
  baris,
  qsPeriode,
  hrefRincianTetap,
}: {
  baris: BarisRingkasanUnit[];
  /** Query string periode yang sedang aktif, diteruskan ke tautan rincian. */
  qsPeriode: string;
  /**
   * Tujuan tautan nama unit, kalau rinciannya TIDAK di halaman ini.
   *
   * Dipakai Kasubag TU: rincian per pegawai unitnya ada di halaman Kalkulasi,
   * dan tautan bawaan (`/tukin?satker=`) cuma mengembalikannya ke halaman yang
   * sedang dia buka - satuan kerjanya memang sudah dipaksa ke unitnya sendiri.
   */
  hrefRincianTetap?: string;
}) {
  const totalPegawai = baris.reduce((a, b) => a + b.jumlahPegawai, 0);
  const totalBersih = baris.reduce((a, b) => a + b.totalBersih, 0);

  return (
    <div className="card mt-8 overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-sm font-extrabold text-ink">Hasil kalkulasi per satuan kerja</h2>
        <p className="text-xs text-muted">
          {baris.length} unit &middot; {totalPegawai.toLocaleString("id-ID")} pegawai
        </p>
      </div>

      {/* Tabelnya punya `overflow-x` SENDIRI - 6 kolom di layar sempit tidak
          boleh membuat SELURUH halaman menggeser ke samping. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
              <th className="col-nama px-3 py-2">Satuan Kerja</th>
              <th className="px-3 py-2">Pegawai</th>
              <th className="px-3 py-2">Catatan</th>
              <th className="px-3 py-2">Total Tukin</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Dikirim</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((u) => (
              <tr key={u.satuanKerja} className="border-b border-line-2 last:border-0 hover:bg-surface-2">
                <td className="col-nama px-3 py-2">
                  <Link
                    href={
                      hrefRincianTetap ??
                      `/tukin${qsPeriode}${qsPeriode ? "&" : "?"}satker=${encodeURIComponent(u.satuanKerja)}`
                    }
                    // BUKAN text-teal-deep. Tokennya #0e3255, LEBIH GELAP
                    // daripada teks isi tabel (--color-ink #13416b), jadi nama
                    // unitnya terbaca sebagai penegasan - bukan tautan. Diganti
                    // --color-biru (#3f72af) yang jelas berbeda dari teks biasa.
                    //
                    // Panah kecil dipasang sebagai isyarat KEDUA: warna saja
                    // tidak cukup untuk pembaca yang sulit membedakan warna,
                    // dan di dalam tabel penuh angka, satu kolom berwarna beda
                    // gampang terbaca sebagai penanda status.
                    className="group inline-flex items-center gap-1 font-semibold text-biru underline decoration-transparent underline-offset-2 transition hover:decoration-current"
                    title={`Lihat rincian per pegawai - ${u.satuanKerja}`}
                  >
                    {u.satuanKerja}
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden
                      className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </Link>
                </td>
                <td className="px-3 py-2">{u.jumlahPegawai.toLocaleString("id-ID")}</td>
                <td className="px-3 py-2">
                  {/* Nol ditulis "-" supaya yang BUKAN nol langsung menonjol.
                      Kolom ini gunanya menunjuk unit mana yang perlu dibuka. */}
                  {u.jumlahCatatan > 0 ? (
                    <span className="font-bold text-gold-deep">{u.jumlahCatatan}</span>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono font-semibold text-ink">{rupiah(u.totalBersih)}</td>
                <td className="px-3 py-2">
                  <BadgeStatusKirim keadaan={keadaanKirimBaris(u.statusKirim)} />
                </td>
                <td className="px-3 py-2 text-xs text-muted">
                  {u.dikirimPada ? (
                    <>
                      {tanggalRingkas(u.dikirimPada)}
                      {u.dikirimOleh && <span className="block truncate">{u.dikirimOleh}</span>}
                    </>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {/* Baris TOTAL ini angka yang akhirnya masuk berkas ADK ke SAKTI.
                Sebelum ada tabel ini, tidak ada satu layar pun yang
                menampilkannya - PPABP harus menjumlah sendiri. */}
            <tr className="border-t-2 border-line bg-surface-2 font-bold text-ink">
              <td className="col-nama px-3 py-2.5">TOTAL</td>
              <td className="px-3 py-2.5">{totalPegawai.toLocaleString("id-ID")}</td>
              <td className="px-3 py-2.5" />
              <td className="px-3 py-2.5 font-mono">{rupiah(totalBersih)}</td>
              <td className="px-3 py-2.5" colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
        Klik nama satuan kerja untuk melihat rinciannya per pegawai.
        {!hrefRincianTetap && (
          <>
            {" "}
            Mengembalikan rekap ke unit dilakukan lewat papan progres pengiriman di halaman{" "}
            <strong>Export ADK</strong>.
          </>
        )}
      </p>
    </div>
  );
}
