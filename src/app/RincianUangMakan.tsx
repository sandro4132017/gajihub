import { rincianUangMakan, type InputRincianUangMakan } from "../business-logic/rincianUangMakan";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

/**
 * Tabel "kenapa uang makan saya segini" - rantai golongan -> tarif -> hari
 * dibayar -> total, plus penjelasan hari yang hadir tapi tidak dibayar.
 *
 * Angkanya dipanggil dari `rincianUangMakan()`, yang dikunci test supaya
 * selalu menghasilkan angka yang sama dengan `hitungUangMakan()` - fungsi yang
 * benar-benar membayar. Jadi tampilan tidak bisa bercerita beda dari kas.
 *
 * DIREKONSTRUKSI dari `RekapPresensiPeriode`, bukan disimpan - pola yang sama
 * dengan RincianPotonganKehadiran. Konsekuensinya sama pula: yang ditampilkan
 * rekap SAAT INI, jadi kalau tidak cocok dengan `nilaiTersimpan`, itu berarti
 * presensinya berubah setelah kalkulasi terakhir - dan itu justru yang perlu
 * diketahui, bukan disembunyikan.
 */
export function RincianUangMakan({
  input,
  nilaiTersimpan,
  hariDibayarTersimpan,
}: {
  input: InputRincianUangMakan;
  /** totalUangMakan yang tersimpan di baris kalkulasi, buat dibandingkan. */
  nilaiTersimpan?: number | null;
  hariDibayarTersimpan?: number | null;
}) {
  const r = rincianUangMakan(input);

  const basi =
    r.total !== null &&
    typeof nilaiTersimpan === "number" &&
    Math.abs(r.total - nilaiTersimpan) > 1;

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface-2 p-3">
      <p className="text-xs font-semibold text-ink">Rincian uang makan</p>

      {/* Rantai tarif - menjawab "kenapa tarifnya segini" */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
        <span className="rounded-md bg-surface px-2 py-1">
          Golongan <strong className="text-ink">{r.golonganAsli ?? "(kosong)"}</strong>
        </span>
        <span aria-hidden className="text-muted">
          &rarr;
        </span>
        <span className="rounded-md bg-surface px-2 py-1">
          {r.labelKelompok ?? "tarif tidak diketahui"} <span className="text-muted">(SBM 2026 item 22.1)</span>
        </span>
        <span aria-hidden className="text-muted">
          &rarr;
        </span>
        <span className="rounded-md bg-surface px-2 py-1 font-mono font-semibold text-ink">
          {r.tarifPerHari === null ? "-" : `${rupiah(r.tarifPerHari)} / hari`}
        </span>
      </div>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted">
              <th className="py-1 pr-2 font-medium">Status kehadiran</th>
              <th className="py-1 pr-2 font-medium">Hari</th>
              <th className="py-1 pl-2 font-medium">Uang makan</th>
            </tr>
          </thead>
          <tbody>
            {r.baris.map((b) => (
              <tr key={b.status} className="border-t border-line/60">
                <td className="py-1 pr-2 text-ink-2">{b.status}</td>
                <td className="py-1 pr-2 font-mono text-ink">{b.jumlahHari}</td>
                <td className={`py-1 pl-2 ${b.berhak ? "text-ink" : "text-muted"}`}>
                  {b.berhak ? (
                    <span className="font-mono">
                      {r.tarifPerHari === null ? "-" : rupiah(b.jumlahHari * r.tarifPerHari)}
                    </span>
                  ) : (
                    <span className="line-through decoration-muted/70">tidak dibayar</span>
                  )}
                  {!b.berhak && <span className="ml-1 not-italic text-muted">({b.alasan})</span>}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-line font-semibold">
              <td className="py-1.5 pr-2 text-ink">Dibayar</td>
              <td className="py-1.5 pr-2 font-mono text-ink">{r.hariDibayar}</td>
              <td className="py-1.5 pl-2 font-mono text-ink">{r.total === null ? "-" : rupiah(r.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {typeof hariDibayarTersimpan === "number" && hariDibayarTersimpan !== r.hariDibayar && (
        <p className="mt-2 text-xs text-muted">
          Baris kalkulasi tersimpan memakai <strong>{hariDibayarTersimpan} hari</strong>.
        </p>
      )}

      {basi && (
        <p className="mt-2 rounded-lg border border-amber-300 bg-gold-tint px-2.5 py-1.5 text-xs font-medium text-ink-2 dark:border-amber-800">
          Angka tersimpan <span className="font-mono">{rupiah(nilaiTersimpan!)}</span> tidak sama dengan rincian di
          atas - presensi periode ini berubah setelah uang makan terakhir dihitung. Perlu dihitung ulang.
        </p>
      )}

      {r.catatan.map((c) => (
        <p key={c} className="mt-2 rounded-lg bg-gold-tint px-2.5 py-1.5 text-xs text-gold-deep">
          {c}
        </p>
      ))}
    </div>
  );
}
