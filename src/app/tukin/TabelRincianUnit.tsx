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
  n === null ? "-" : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);

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

const TH = "whitespace-nowrap px-3 py-2 text-[10.5px] font-bold uppercase tracking-wide";
const TD = "whitespace-nowrap px-3 py-2";

export function TabelRincianUnit({ baris, satuanKerja }: { baris: BarisRincianTukin[]; satuanKerja: string }) {
  // Persen pada baris TOTAL dihitung dari jumlah rupiahnya, BUKAN dari
  // rata-rata persen tiap baris. Rata-rata persen memberi bobot yang sama pada
  // pegawai kelas 15 dan kelas 8, padahal tarifnya berbeda jauh - hasilnya
  // angka yang tidak mewakili apa pun.
  const totalPotongan = baris.reduce((a, b) => a + (potonganTotal(b) ?? 0), 0);
  const totalTarif = baris.reduce((a, b) => a + (b.nominalTukin ?? 0), 0);
  const total = {
    potongan: totalPotongan,
    persen: totalTarif > 0 ? (totalPotongan / totalTarif) * 100 : null,
    dibayarkan: baris.reduce((a, b) => a + b.dibayarkan, 0),
  };

  return (
    <div className="card mt-8 overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-sm font-extrabold text-ink">Rincian Tukin &mdash; {satuanKerja}</h2>
        <p className="text-xs text-muted">{baris.length} pegawai</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-muted">
              <th className={`${TH} col-nama`}>Nama Pegawai</th>
              <th className={TH}>NIP</th>
              <th className={TH}>Grade</th>
              <th className={TH}>Nominal Tukin</th>
              <th className={TH}>Potongan</th>
              <th className={TH}>Capaian Kinerja</th>
              <th className={TH}>Dibayarkan</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((b) => {
              const pot = potonganTotal(b);
              const persen = persenPotongan(b);
              return (
                <tr key={b.nip} className="border-b border-line-2 last:border-0 hover:bg-surface-2">
                  <td className={`${TD} col-nama font-semibold text-ink`} title={b.nama}>
                    {b.nama}
                    {/* Catatan validasi kalkulasi - mis. cuti panjang yang bulan
                        ke berapanya tidak diketahui. Isinya di `title` supaya
                        satu baris tidak melebar gara-gara kalimat panjang. */}
                    {b.catatanAnomali && (
                      <span className="ml-1 text-gold-deep" title={b.catatanAnomali}>
                        &#9888;
                      </span>
                    )}
                  </td>
                  <td className={`${TD} font-mono text-xs text-muted`}>{b.nip}</td>
                  <td className={TD}>{b.kelasJabatan ?? "-"}</td>
                  <td className={`${TD} font-mono`}>{rupiah(b.nominalTukin)}</td>
                  {/* Potongan nol ditulis "-", bukan "0%": yang perlu tertangkap
                      mata adalah baris yang KENA potongan, bukan barisan nol. */}
                  <td
                    className={`${TD} font-mono ${pot && pot > 0 ? "font-semibold text-gold-deep" : "text-muted"}`}
                    title={pot !== null && pot > 0 ? `Rp ${rupiah(pot)}` : undefined}
                  >
                    {persen === null || persen <= 0 ? "-" : `${format2(persen)}%`}
                  </td>
                  <td className={TD}>{b.predikat ?? "-"}</td>
                  <td className={`${TD} font-mono font-bold text-ink`}>{rupiah(b.dibayarkan)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line bg-surface-2 font-bold text-ink">
              <td className={`${TD} col-nama`}>TOTAL</td>
              <td className={TD} colSpan={3} />
              <td className={`${TD} font-mono`} title={`Rp ${rupiah(total.potongan)}`}>
                {total.persen === null ? "-" : `${format2(total.persen)}%`}
              </td>
              <td className={TD} />
              <td className={`${TD} font-mono`}>{rupiah(total.dibayarkan)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
