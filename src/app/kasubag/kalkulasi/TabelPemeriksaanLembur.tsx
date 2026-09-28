import Link from "next/link";
import { lemburTeks } from "../../presensiTampilan";
import { BantuanTabel, BarisSumber } from "./BantuanTabel";

export interface BarisPemeriksaanLembur {
  pegawaiId: string;
  nip: string;
  nama: string;
  jamHariKerja: number | null;
  jamHariLibur: number | null;
  totalTersimpan: number | null;
  jamHarian: number;
}

export function TabelPemeriksaanLembur({
  baris,
  periodeBulan,
  periodeTahun,
}: {
  baris: readonly BarisPemeriksaanLembur[];
  periodeBulan: number;
  periodeTahun: number;
}) {
  const berlembur = baris.filter((b) => (b.totalTersimpan ?? 0) > 0 || b.jamHarian > 0);
  const tidakCocok = berlembur.filter(
    (b) => b.totalTersimpan !== null && b.totalTersimpan !== b.jamHarian
  );
  const totalKerja = berlembur.reduce((n, b) => n + (b.jamHariKerja ?? 0), 0);
  const totalLibur = berlembur.reduce((n, b) => n + (b.jamHariLibur ?? 0), 0);

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
                <strong>Ketukan presensi e-Presensi.</strong> Jam lembur dihitung dari selisih
                ketukan pulang terhadap batas jam lembur hari itu - bukan angka yang diketik orang.
              </BarisSumber>
              <BarisSumber label="Acuan">
                <strong>Surat Perintah Lembur (SPL).</strong> Yang mengesahkan lembur adalah SPL-nya,
                bukan ketukan presensi - periksa angkanya ke SPL sebelum dicentang.
              </BarisSumber>
            </dl>

            <p className="mt-3 text-xs font-bold text-ink">Hari kerja vs hari libur</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Dipisah karena tarif per jamnya berbeda. Akhir pekan dan tanggal merah TIDAK disaring
              dari perhitungan - lembur hari libur memang dibayar.
            </p>

            <p className="mt-2.5 text-xs font-bold text-ink">Kenapa rincian harian yang menentukan</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Berkas ADK dibentuk dari rincian <strong>harian</strong>, jadi itulah yang akan
              dibayar - bukan angka total bulanan yang tersimpan. Kalau keduanya berbeda, panel di
              atas tabel menyalakan peringatan; tekan <strong>Hitung sekarang</strong> supaya sama.
            </p>

            <p className="mt-2.5 text-xs leading-relaxed text-muted">
              Koreksi jam dikerjakan <strong>per tanggal</strong> lewat tautan di kolom Periksa, di
              halaman tempat jam masuk/pulang dan hitungan mesinnya terlihat berdampingan.
            </p>
          </BantuanTabel>
        </div>
        <span className="text-xs text-muted">
          {berlembur.length} pegawai berlembur &middot; {totalKerja} jam hari kerja, {totalLibur} jam hari
          libur
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
                <th className="px-4 py-2.5">
                  Hari kerja
                </th>
                <th className="px-4 py-2.5">
                  Hari libur
                </th>
                <th className="px-4 py-2.5">Total</th>
                <th className="px-4 py-2.5">Periksa</th>
              </tr>
            </thead>
            <tbody>
              {berlembur.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    Tidak ada pegawai dengan jam lembur pada periode ini.
                  </td>
                </tr>
              )}
              {berlembur.map((b) => (
                  <tr key={b.pegawaiId} className="border-b border-line-2">
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
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/tukin/presensi/${b.nip}?bulan=${periodeBulan}&tahun=${periodeTahun}&rinci=1`}
                        className="text-xs font-semibold text-teal-deep underline"
                      >
                        Lihat &amp; koreksi per hari
                      </Link>
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
