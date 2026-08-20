import { jamDariMenit, type BarisRincianJamKerja } from "../../../../business-logic/rincianJamKerjaHarian";

/**
 * Tabel rincian JAM KERJA harian - bentuk yang selama ini direkap petugas di
 * "Jam Absensi.xlsx". Menjawab pertanyaan yang berbeda dari tabel presensi
 * biasa: bukan "apa yang dilanggar", tapi "jam kerja hari itu terpenuhi atau
 * tidak".
 *
 * Angkanya disusun `rincianJamKerjaHarian.ts` (PURE) - komponen ini cuma
 * memformat. Rumusnya dibongkar dari berkas asli petugas, lihat kepala modul
 * itu untuk angka kecocokannya.
 */

const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export interface BarisTabelRincianJamKerja {
  tanggal: Date;
  statusLabel: string;
  rincian: BarisRincianJamKerja;
  /** Pecahan dari bobot kehadiran (0,0099 = 0,99%). */
  potonganPersen: number;
  /** Kejadian Pasal 13 ayat (2) hari itu - ikut menyusun % potongan. */
  kejadianTidakPresensi: number;
  keteranganLibur: string | null;
  dikoreksiManual: boolean;
}

/**
 * "-" untuk sel yang memang tidak punya angka - jangan pernah tulis 0.
 *
 * Jam yang melewati tengah malam (mis. tap masuk 23:26 + 8,5 jam) ditulis
 * sebagai jam hari berikutnya + penanda "+1", bukan "32:26". Berkas petugas
 * membungkusnya diam-diam jadi "08:26" karena Excel menyimpannya sebagai
 * pecahan hari - terbaca seperti pagi hari yang sama, dan itu menyesatkan.
 */
function jam(menit: number | null) {
  if (menit === null) return <span className="text-muted">-</span>;
  const lewatTengahMalam = menit >= 24 * 60;
  return (
    <span className="whitespace-nowrap font-mono">
      {jamDariMenit(menit % (24 * 60))}
      {lewatTengahMalam && <span className="ml-0.5 text-[11px] text-red">+1</span>}
    </span>
  );
}

function menitTeks(n: number | null, tandaiKalauAda = false) {
  if (n === null) return <span className="text-muted">-</span>;
  if (n === 0) return <span className="text-muted">0</span>;
  return <span className={`font-mono ${tandaiKalauAda ? "text-red" : ""}`}>{n}</span>;
}

export function TabelRincianJamKerja({ baris }: { baris: BarisTabelRincianJamKerja[] }) {
  // Batas kolom antar kelompok: fakta presensi | jam acuan | hasil hitungan.
  const pisah = "border-l border-line";

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
            <th className="px-3 py-2.5">Tanggal</th>
            <th className="px-3 py-2.5">Status</th>
            <th className="px-3 py-2.5">Masuk</th>
            <th className="px-3 py-2.5">Pulang</th>
            <th className={`px-3 py-2.5 ${pisah}`}>
              Jam harus pulang
            </th>
            <th className="px-3 py-2.5">Jam masuk</th>
            <th className="px-3 py-2.5">Tol. masuk</th>
            <th className="px-3 py-2.5">Jam pulang</th>
            <th className="px-3 py-2.5">Tol. pulang</th>
            <th className={`px-3 py-2.5 ${pisah}`}>Terlambat</th>
            <th className="px-3 py-2.5">Menit kerja</th>
            <th className="px-3 py-2.5">Kekurangan jam kerja</th>
            <th className="px-3 py-2.5">Jml menit kekurangan</th>
            <th className="px-3 py-2.5">% Potongan</th>
          </tr>
        </thead>
        <tbody>
          {baris.length === 0 && (
            <tr>
              <td colSpan={14} className="px-3 py-6 text-center text-muted">
                Tidak ada rincian harian untuk periode ini.
              </td>
            </tr>
          )}
          {baris.map((b) => {
            const r = b.rincian;
            const hariKe = b.tanggal.getUTCDay();
            return (
              <tr key={r.tanggalIso} className={`border-b border-line-2 ${r.hariLibur ? "bg-surface-2" : ""}`}>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className="font-semibold text-ink">
                    {String(b.tanggal.getUTCDate()).padStart(2, "0")}/
                    {String(b.tanggal.getUTCMonth() + 1).padStart(2, "0")}
                  </span>
                  <span className="ml-1.5 text-xs text-muted">{NAMA_HARI[hariKe]}</span>
                  {b.keteranganLibur && (
                    <span className="ml-1.5 rounded bg-red-tint px-1 text-[11px] text-ink-2">
                      {b.keteranganLibur}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-ink-2 whitespace-nowrap">
                  {b.statusLabel}
                  {b.dikoreksiManual && (
                    <span className="ml-1.5 rounded bg-gold-tint px-1 text-[11px] text-ink-2">dikoreksi</span>
                  )}
                </td>
                <td className="px-3 py-2 text-ink-2">{jam(r.jamMasukMenit)}</td>
                <td className="px-3 py-2 text-ink-2">{jam(r.jamKeluarMenit)}</td>
                <td className={`px-3 py-2 text-ink-2 ${pisah}`}>{jam(r.jamHarusPulangMenit)}</td>
                <td className="px-3 py-2 text-muted">{jam(r.jamMasukWajibMenit)}</td>
                <td className="px-3 py-2 text-muted">{jam(r.jamToleransiMasukMenit)}</td>
                <td className="px-3 py-2 text-muted">{jam(r.jamPulangWajibMenit)}</td>
                <td className="px-3 py-2 text-muted">{jam(r.jamToleransiPulangMenit)}</td>
                <td className={`px-3 py-2 ${pisah}`}>{menitTeks(r.hariLibur ? null : r.menitTerlambat, true)}</td>
                <td className="px-3 py-2">{menitTeks(r.menitKerja)}</td>
                <td className="px-3 py-2">{menitTeks(r.kekuranganJamKerjaMenit, true)}</td>
                <td className="px-3 py-2">{menitTeks(r.totalMenitKekuranganHarian, true)}</td>
                <td className="px-3 py-2">
                  {b.potonganPersen > 0 ? (
                    <span className="font-mono text-red">
                      {(b.potonganPersen * 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%
                    </span>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
