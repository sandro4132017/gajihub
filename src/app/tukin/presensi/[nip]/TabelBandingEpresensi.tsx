import {
  PENJELASAN_SEBAB,
  type HasilBandingPotongan,
  type SebabBeda,
} from "../../../../business-logic/bandingPotonganEpresensi";

const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** Warna chip per sebab - merah kalau Gajihub memotong lebih besar. */
const WARNA_SEBAB: Record<SebabBeda, string> = {
  TARIF_LUPA_ABSEN: "bg-gold-tint text-gold-deep",
  KLASIFIKASI_LUPA_ABSEN: "bg-gold-tint text-gold-deep",
  TARIF_TERLAMBAT: "bg-line-2 text-navy",
  BATAS_HARIAN_EPRESENSI: "bg-red-tint text-red",
  HANYA_EPRESENSI: "bg-gold-tint text-gold-deep",
  HANYA_GAJIHUB: "bg-red-tint text-red",
  LAINNYA: "bg-line-2 text-muted",
};

function persen(p: number) {
  return p.toLocaleString("id-ID", { maximumFractionDigits: 2, minimumFractionDigits: 0 }) + "%";
}

function tanggalTeks(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  return {
    tanggal: `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    hari: NAMA_HARI[d.getUTCDay()],
  };
}

export function TabelBandingEpresensi({
  hasil,
  bobotKehadiranRupiah,
}: {
  hasil: HasilBandingPotongan;
  bobotKehadiranRupiah: number | null;
}) {
  const rupiah = (n: number) => "Rp " + Math.round(Math.abs(n)).toLocaleString("id-ID");
  // Legenda cuma memuat sebab yang BENAR-BENAR muncul - daftar lengkap yang
  // sebagian tidak terpakai justru membuat orang berhenti membacanya.
  const sebabMuncul = [...new Set(hasil.beda.map((b) => b.sebab))];

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Menurut web e-Presensi</p>
          <p className="mt-1 font-mono text-xl font-extrabold text-ink">
            {persen(hasil.totalEpresensiPersen * 100)}
          </p>
          <p className="mt-0.5 text-xs text-muted">Rumus Lama</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Menurut Gajihub</p>
          <p className="mt-1 font-mono text-xl font-extrabold text-teal-deep">
            {persen(hasil.totalGajihubPersen * 100)}
          </p>
          <p className="mt-0.5 text-xs text-muted">Permenaker 15/2024 - yang dibayarkan</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Selisih</p>
          <p className="mt-1 font-mono text-xl font-extrabold text-ink">
            {hasil.selisihRupiah === null ? (
              <span className="text-muted">-</span>
            ) : (
              <span className={hasil.selisihRupiah > 0 ? "text-red" : "text-green"}>
                {hasil.selisihRupiah > 0 ? "+" : "-"}
                {rupiah(hasil.selisihRupiah)}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {hasil.selisihRupiah === null
              ? "kelas jabatan belum terisi"
              : hasil.selisihRupiah > 0
                ? "Gajihub memotong lebih besar"
                : "Gajihub memotong lebih kecil"}
          </p>
        </div>
      </div>

      <div className="card mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
              <th className="px-3 py-2.5">Tanggal</th>
              <th className="px-3 py-2.5">e-Presensi</th>
              <th className="px-3 py-2.5">Gajihub</th>
              <th className="px-3 py-2.5">Selisih</th>
              <th className="px-3 py-2.5">Sebab</th>
            </tr>
          </thead>
          <tbody>
            {hasil.beda.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted">
                  Tidak ada tanggal yang berbeda pada periode ini - kedua sistem sepakat.
                </td>
              </tr>
            )}
            {hasil.beda.map((b) => {
              const t = tanggalTeks(b.tanggalIso);
              return (
                <tr key={b.tanggalIso} className="border-b border-line-2">
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className="font-semibold text-ink">{t.tanggal}</span>
                    <span className="ml-1.5 text-xs text-muted">{t.hari}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-ink-2">{persen(b.epresensiPersen * 100)}</span>
                    {b.keteranganEpresensi && (
                      <span className="mt-0.5 block text-xs text-muted">{b.keteranganEpresensi}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono font-semibold text-teal-deep">{persen(b.gajihubPersen * 100)}</span>
                    {b.rincianGajihub.map((r) => (
                      <span key={r.jenis} className="mt-0.5 block text-xs text-muted">
                        {r.jenis}: {r.jumlah} {r.satuan} &times; {persen(r.tarifPersen * 100)} ={" "}
                        {persen(r.totalPersen * 100)}
                        <span className="ml-1 text-line">({r.dasarHukum})</span>
                      </span>
                    ))}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono">
                    <span className={b.selisihPersen > 0 ? "text-red" : "text-green"}>
                      {b.selisihPersen > 0 ? "+" : "-"}
                      {persen(Math.abs(b.selisihPersen) * 100)}
                    </span>
                    {bobotKehadiranRupiah !== null && (
                      <span className="mt-0.5 block text-xs text-muted">
                        {rupiah(b.selisihPersen * bobotKehadiranRupiah)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`chip ${WARNA_SEBAB[b.sebab]}`}>{PENJELASAN_SEBAB[b.sebab].judul}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sebabMuncul.length > 0 && (
        <div className="card mt-3 p-4">
          <p className="text-sm font-bold text-ink">Kenapa berbeda</p>
          <dl className="mt-2 space-y-2 text-xs text-ink-2">
            {sebabMuncul.map((s) => (
              <div key={s}>
                <dt className="font-semibold text-ink">{PENJELASAN_SEBAB[s].judul}</dt>
                <dd className="mt-0.5">{PENJELASAN_SEBAB[s].dasar}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 rounded-lg bg-gold-tint px-3 py-2 text-xs text-ink-2">
            <strong>Yang dibayarkan adalah kolom Gajihub.</strong> Angka di web e-Presensi dihitung dengan rumus lama dan menyimpang dari Pasal 13 Permenaker 15/2024 -
            jadi selisih ini akan terus ada selama sistem itu tidak diperbaiki. Gajihub tidak pernah memakai angka
            potongan e-Presensi; yang diambil hanya faktanya (tanggal, status kerja, jam masuk, jam keluar).
          </p>
        </div>
      )}
    </div>
  );
}
