import { prisma } from "../../../lib/prisma";
import { canViewRekapUnitKerja } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { resolveSatuanKerjaListUntukFilter } from "../../dashboardScope";
import { ambilAksesUnit } from "../access";
import { SatkerPicker } from "../SatkerPicker";

export const dynamic = "force-dynamic";

export default async function RosterPegawaiUnitPage({
  searchParams,
}: {
  searchParams: Promise<{ satker?: string; q?: string }>;
}) {
  const { satker, q } = await searchParams;
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

  const pegawaiList = await prisma.pegawai.findMany({
    where: {
      satuanKerja: satkerEfektif,
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
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Pegawai Unit</h1>
      <p className="mt-1 text-sm text-muted">
        {satkerEfektif} - {pegawaiList.length} pegawai
      </p>

      <form method="get" className="card mt-4 flex flex-wrap items-end gap-3 p-4">
        <input type="hidden" name="satker" value={satkerEfektif} />
        <div className="flex-1 min-w-[200px]">
          <label className="field-label">Cari nama atau NIP</label>
          <input type="text" name="q" defaultValue={q ?? ""} className="field-input" placeholder="Cari..." />
        </div>
        <button type="submit" className="btn btn-primary">
          Cari
        </button>
      </form>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left text-xs font-bold uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5">Nama</th>
              <th className="px-4 py-2.5">NIP</th>
              <th className="px-4 py-2.5">Jabatan</th>
              <th className="px-4 py-2.5">Golongan</th>
              <th className="px-4 py-2.5">Kelas</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {pegawaiList.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted">
                  Tidak ada pegawai yang cocok.
                </td>
              </tr>
            )}
            {pegawaiList.map((p) => (
              <tr key={p.id} className="border-b border-line-2">
                <td className="px-4 py-2.5 font-semibold text-ink">{p.nama}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted">{p.nip}</td>
                <td className="px-4 py-2.5 text-ink-2">{p.jabatan ?? "-"}</td>
                <td className="px-4 py-2.5 text-ink-2">{p.golongan ?? "-"}</td>
                <td className="px-4 py-2.5 font-mono text-ink-2">{p.kelasJabatan ?? "-"}</td>
                <td className="px-4 py-2.5">
                  <span className="chip chip-navy">{p.statusPegawai}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
