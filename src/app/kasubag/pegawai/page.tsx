import { prisma } from "../../../lib/prisma";
import { canViewRekapUnitKerja, canEditDataPegawai } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { resolveSatuanKerjaListUntukFilter } from "../../dashboardScope";
import { ambilAksesUnit } from "../access";
import { SatkerPicker } from "../SatkerPicker";
import { PencarianDebounce } from "../../PencarianDebounce";
import { Paginasi, hitungPaginasi } from "../../Paginasi";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function RosterPegawaiUnitPage({
  searchParams,
}: {
  searchParams: Promise<{ satker?: string; q?: string; nonaktif?: string; hal?: string; per?: string }>;
}) {
  const { satker, q, nonaktif, hal, per } = await searchParams;
  const akses = await ambilAksesUnit(satker);
  if (!akses) {
    return <AksesDitolak pesan="Kamu harus login dulu buat lihat halaman ini." />;
  }
  const { authUser, satkerEfektif } = akses;

  if (!satkerEfektif) {
    const satuanKerjaRows = await prisma.pegawai.findMany({
      distinct: ["satuanKerja"],
      select: { satuanKerja: true },
      orderBy: { satuanKerja: "asc" },
    });
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <h1 className="text-xl font-extrabold tracking-tight text-ink">Pegawai Unit</h1>
        <p className="mt-1 text-sm text-muted">Pilih satuan kerja dulu.</p>
        <SatkerPicker satuanKerjaList={resolveSatuanKerjaListUntukFilter(authUser, satuanKerjaRows.map((r) => r.satuanKerja))} />
      </main>
    );
  }

  if (!canViewRekapUnitKerja(authUser, satkerEfektif)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang melihat rekap pegawai unit ini." />;
  }

  // Default hanya AKTIF. Pegawai yang sudah pensiun/berhenti TETAP ADA di
  // database (mereka berhak atas tukin bulan yang sudah dikerjakan), tapi
  // roster unit yang memuat mereka bikin jumlahnya salah dan membingungkan.
  // Disembunyikan lewat DEFAULT, bukan lewat query yang tidak bisa dibuka -
  // ada tombol "Tampilkan yang sudah tidak aktif" di bawah, supaya tidak ada
  // pegawai yang lenyap tanpa jejak dari sudut pandang Kasubag TU.
  const tampilkanNonaktif = nonaktif === "1";
  const [pegawaiList, jumlahNonaktif] = await Promise.all([
    prisma.pegawai.findMany({
      where: {
        satuanKerja: satkerEfektif,
        ...(tampilkanNonaktif ? {} : { statusPegawai: "AKTIF" }),
        ...(q
          ? {
              OR: [
                { nama: { contains: q, mode: "insensitive" } },
                { nip: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { nama: "asc" },
    }),
    prisma.pegawai.count({ where: { satuanKerja: satkerEfektif, statusPegawai: { not: "AKTIF" } } }),
  ]);

  // PAGINASI. Unit terbesar di data ini berisi 227 pegawai (Balai Bekasi),
  // dan 54 dari 84 unit melewati 50 orang - daftar utuh dalam satu halaman
  // menjadikan halaman ini gulungan panjang tanpa ujung.
  //
  // Bawaannya 50 baris, bukan 10 seperti UKURAN_HALAMAN_DEFAULT: ini roster
  // yang dibaca menyeluruh ("siapa saja di unit saya"), bukan tabel hasil
  // pencarian yang dibaca sebaris.
  const paginasi = hitungPaginasi(pegawaiList.length, hal, per ?? "50");
  const pegawaiHalamanIni = pegawaiList.slice(paginasi.mulai, paginasi.selesai);
  const paramPaginasi = new URLSearchParams({ satker: satkerEfektif });
  if (q) paramPaginasi.set("q", q);
  if (tampilkanNonaktif) paramPaginasi.set("nonaktif", "1");

  // Tombol Edit cuma muncul kalau memang berwenang - halaman /pegawai
  // memeriksanya lagi per baris, jadi ini soal tidak menawarkan pintu yang
  // akan ditolak, bukan soal keamanan.
  const bolehEdit = canEditDataPegawai(authUser, satkerEfektif);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Pegawai Unit</h1>
      <p className="mt-1 text-sm text-muted">
        {satkerEfektif} - {pegawaiList.length} pegawai
        {tampilkanNonaktif ? " (termasuk yang sudah tidak aktif)" : " aktif"}
      </p>

      <form method="get" className="card mt-4 flex flex-wrap items-end gap-3 p-4">
        <input type="hidden" name="satker" value={satkerEfektif} />
        {tampilkanNonaktif && <input type="hidden" name="nonaktif" value="1" />}
        <div className="flex-1 min-w-[200px]">
          <label className="field-label">Cari nama atau NIP</label>
          <PencarianDebounce defaultValue={q} placeholder="Cari..." />
        </div>
        <button type="submit" className="btn btn-primary">
          Cari
        </button>
      </form>

      {jumlahNonaktif > 0 && (
        <p className="mt-2 text-xs text-muted">
          {tampilkanNonaktif ? (
            <>
              Termasuk {jumlahNonaktif} pegawai yang sudah pensiun/berhenti.{" "}
              <a
                href={`/kasubag/pegawai?satker=${encodeURIComponent(satkerEfektif)}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className="font-semibold text-teal-deep underline"
              >
                Sembunyikan
              </a>
            </>
          ) : (
            <>
              {jumlahNonaktif} pegawai unit ini sudah pensiun/berhenti dan tidak ditampilkan. Datanya sengaja tidak
              dihapus - mereka tetap berhak atas tukin bulan yang sudah dikerjakan.{" "}
              <a
                href={`/kasubag/pegawai?satker=${encodeURIComponent(satkerEfektif)}&nonaktif=1${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className="font-semibold text-teal-deep underline"
              >
                Tampilkan
              </a>
            </>
          )}
        </p>
      )}

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
              <th className="col-nama px-4 py-2.5">Nama</th>
              <th className="px-4 py-2.5">NIP</th>
              <th className="px-4 py-2.5">Jabatan</th>
              <th className="px-4 py-2.5">Golongan</th>
              <th className="px-4 py-2.5">Kelas</th>
              <th className="px-4 py-2.5">Status</th>
              {bolehEdit && <th className="px-4 py-2.5">Tindakan</th>}
            </tr>
          </thead>
          <tbody>
            {pegawaiList.length === 0 && (
              <tr>
                <td colSpan={bolehEdit ? 7 : 6} className="px-4 py-6 text-center text-muted">
                  Tidak ada pegawai yang cocok.
                </td>
              </tr>
            )}
            {pegawaiHalamanIni.map((p) => (
              <tr key={p.id} className="border-b border-line-2">
                <td className="col-nama px-4 py-2.5 font-semibold text-ink">{p.nama}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted">{p.nip}</td>
                <td className="px-4 py-2.5 text-ink-2">{p.jabatan ?? "-"}</td>
                <td className="px-4 py-2.5 text-ink-2">{p.golongan ?? "-"}</td>
                <td className="px-4 py-2.5 font-mono text-ink-2">{p.kelasJabatan ?? "-"}</td>
                <td className="px-4 py-2.5">
                  <span className={`chip ${p.statusPegawai === "AKTIF" ? "chip-navy" : "chip-wait"}`}>
                    {p.statusPegawai}
                  </span>
                </td>
                {bolehEdit && (
                  <td className="px-4 py-2.5">
                    {/* Menuju /pegawai - SATU-SATUNYA tempat data pegawai
                        diubah. Halaman ini sengaja tetap baca-saja: form
                        sunting yang disalin ke dua tempat cepat atau lambat
                        berbeda aturannya. */}
                    <Link
                      href={`/pegawai?pegawaiId=${p.id}`}
                      className="text-xs font-semibold text-biru hover:underline"
                    >
                      Edit data
                    </Link>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <Paginasi
          basePath="/kasubag/pegawai"
          params={paramPaginasi}
          info={paginasi}
          totalBaris={pegawaiList.length}
          labelBaris="pegawai"
        />
      </div>
    </main>
  );
}
