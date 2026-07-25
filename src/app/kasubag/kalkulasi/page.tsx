import { prisma } from "../../../lib/prisma";
import { canAjukanKalkulasiTukinMassalUnit } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { FilterBar } from "../../FilterBar";
import { resolveSatuanKerjaListUntukFilter } from "../../dashboardScope";
import { NAMA_BULAN } from "../../bulan";
import { ambilAksesUnit } from "../access";
import { KalkulasiMassalForm } from "./KalkulasiMassalForm";
import { KoreksiLemburForm } from "./KoreksiLemburForm";

export const dynamic = "force-dynamic";

const formatRupiah = (nilai: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(nilai);

const TARIF_UANG_LEMBUR_DEFAULT = 25_000; // TODO(confirm): sama seperti seedSimulasi.ts, bukan SBM resmi

export default async function KalkulasiUnitPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string; satker?: string }>;
}) {
  const { bulan, tahun, satker } = await searchParams;
  const akses = await ambilAksesUnit(satker);
  if (!akses) {
    return <AksesDitolak pesan="Kamu harus login dulu buat lihat halaman ini." />;
  }
  const { authUser, satkerEfektif } = akses;

  const satuanKerjaRows = await prisma.pegawai.findMany({
    distinct: ["satuanKerja"],
    select: { satuanKerja: true },
    orderBy: { satuanKerja: "asc" },
  });
  const satuanKerjaList = resolveSatuanKerjaListUntukFilter(authUser, satuanKerjaRows.map((r) => r.satuanKerja));

  const periodeBulan = bulan ? Number(bulan) : new Date().getMonth() + 1;
  const periodeTahun = tahun ? Number(tahun) : new Date().getFullYear();

  if (!satkerEfektif) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <h1 className="text-xl font-extrabold tracking-tight text-ink">Kalkulasi Unit</h1>
        <p className="mt-1 text-sm text-muted">Pilih satuan kerja dan periode dulu.</p>
        <FilterBar satuanKerjaList={satuanKerjaList} bulan={bulan} tahun={tahun} satker={satker} />
      </main>
    );
  }

  if (!canAjukanKalkulasiTukinMassalUnit(authUser, satkerEfektif)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang mengelola kalkulasi unit ini." />;
  }

  const pegawaiList = await prisma.pegawai.findMany({
    where: { satuanKerja: satkerEfektif },
    orderBy: { nama: "asc" },
    include: {
      tukinCalc: { where: { periodeBulan, periodeTahun } },
      uangMakan: { where: { periodeBulan, periodeTahun } },
      uangLembur: { where: { periodeBulan, periodeTahun } },
    },
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Kalkulasi Unit</h1>
      <p className="mt-1 text-sm text-muted">
        {satkerEfektif} - Periode {NAMA_BULAN[periodeBulan - 1]} {periodeTahun}
      </p>

      <FilterBar satuanKerjaList={satuanKerjaList} bulan={String(periodeBulan)} tahun={String(periodeTahun)} satker={satkerEfektif} />

      <KalkulasiMassalForm satuanKerja={satkerEfektif} periodeBulan={periodeBulan} periodeTahun={periodeTahun} />

      <div className="card mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left text-xs font-bold uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5">Nama</th>
              <th className="px-4 py-2.5">Tukin bersih</th>
              <th className="px-4 py-2.5">Uang Makan</th>
              <th className="px-4 py-2.5">Uang Lembur</th>
              <th className="px-4 py-2.5">Koreksi jam lembur</th>
            </tr>
          </thead>
          <tbody>
            {pegawaiList.map((p) => {
              const tukin = p.tukinCalc[0];
              const um = p.uangMakan[0];
              const lembur = p.uangLembur[0];
              return (
                <tr key={p.id} className="border-b border-line-2 align-top">
                  <td className="px-4 py-2.5 font-semibold text-ink">{p.nama}</td>
                  <td className="px-4 py-2.5 font-mono text-ink-2">{tukin ? formatRupiah(tukin.tukinBersih) : "-"}</td>
                  <td className="px-4 py-2.5 font-mono text-ink-2">{um ? formatRupiah(um.totalUangMakan) : "-"}</td>
                  <td className="px-4 py-2.5 font-mono text-ink-2">
                    {lembur ? `${formatRupiah(lembur.totalUangLembur)} (${lembur.totalJamLembur} jam)` : "-"}
                  </td>
                  <td className="px-4 py-2.5">
                    <KoreksiLemburForm
                      pegawaiId={p.id}
                      periodeBulan={periodeBulan}
                      periodeTahun={periodeTahun}
                      totalJamLemburSaatIni={lembur?.totalJamLembur ?? 0}
                      tarifPerJam={lembur?.tarifPerJam ?? TARIF_UANG_LEMBUR_DEFAULT}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
