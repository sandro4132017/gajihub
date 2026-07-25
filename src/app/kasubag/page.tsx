import { prisma } from "../../lib/prisma";
import { canViewDashboardUnit } from "../../auth/permissions";
import { DEFAULT_TOTAL_JENJANG_APPROVAL } from "../../approval/approvalTukinService";
import { DEFAULT_TOTAL_JENJANG_APPROVAL_UANG_MAKAN } from "../../approval/approvalUangMakanService";
import { DEFAULT_TOTAL_JENJANG_APPROVAL_UANG_LEMBUR } from "../../approval/approvalUangLemburService";
import { AksesDitolak } from "../AksesDitolak";
import { FilterBar } from "../FilterBar";
import { resolveSatuanKerjaListUntukFilter } from "../dashboardScope";
import { tallyApproval } from "../tallyApproval";
import { ambilAksesUnit } from "./access";

export const dynamic = "force-dynamic";

const formatRupiah = (nilai: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0, notation: "compact" }).format(
    nilai
  );

function StatTile({ label, nilai, warna }: { label: string; nilai: string; warna?: "danger" | "wait" }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p
        className={`mt-1 font-mono text-xl font-extrabold ${
          warna === "danger" ? "text-red" : warna === "wait" ? "text-gold-deep" : "text-ink"
        }`}
      >
        {nilai}
      </p>
    </div>
  );
}

export default async function KasubagDashboardPage({
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

  if (!satkerEfektif) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <h1 className="text-xl font-extrabold tracking-tight text-ink">Dashboard Unit</h1>
        <p className="mt-1 text-sm text-muted">Pilih satuan kerja dulu buat lihat dashboard-nya.</p>
        <FilterBar satuanKerjaList={satuanKerjaList} bulan={bulan} tahun={tahun} satker={satker} />
      </main>
    );
  }

  if (!canViewDashboardUnit(authUser, satkerEfektif)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang melihat dashboard unit ini." />;
  }

  // Default periode = periode Tukin paling baru yang ada datanya buat unit
  // ini, biar dashboard tidak kosong begitu dibuka pertama kali tanpa filter.
  let periodeBulan = bulan ? Number(bulan) : undefined;
  let periodeTahun = tahun ? Number(tahun) : undefined;
  if (!periodeBulan || !periodeTahun) {
    const terbaru = await prisma.tukinCalculation.findFirst({
      where: { pegawai: { satuanKerja: satkerEfektif } },
      orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }],
      select: { periodeBulan: true, periodeTahun: true },
    });
    periodeBulan = periodeBulan ?? terbaru?.periodeBulan;
    periodeTahun = periodeTahun ?? terbaru?.periodeTahun;
  }

  const totalPegawai = await prisma.pegawai.count({ where: { satuanKerja: satkerEfektif } });

  const [tukinRows, umRows, lemburRows] = periodeBulan && periodeTahun
    ? await Promise.all([
        prisma.tukinCalculation.findMany({
          where: { periodeBulan, periodeTahun, pegawai: { satuanKerja: satkerEfektif } },
        }),
        prisma.uangMakan.findMany({
          where: { periodeBulan, periodeTahun, pegawai: { satuanKerja: satkerEfektif } },
        }),
        prisma.uangLembur.findMany({
          where: { periodeBulan, periodeTahun, pegawai: { satuanKerja: satkerEfektif } },
        }),
      ])
    : [[], [], []];

  const [tallyTukin, tallyUm, tallyLembur] = await Promise.all([
    tallyApproval(
      tukinRows.map((r) => ({ id: r.id, nilai: r.tukinBersih, status: r.status, calculatedAt: r.calculatedAt })),
      "TUKIN",
      DEFAULT_TOTAL_JENJANG_APPROVAL
    ),
    tallyApproval(
      umRows.map((r) => ({ id: r.id, nilai: r.totalUangMakan, status: r.status, calculatedAt: r.calculatedAt })),
      "UANG_MAKAN",
      DEFAULT_TOTAL_JENJANG_APPROVAL_UANG_MAKAN
    ),
    tallyApproval(
      lemburRows.map((r) => ({ id: r.id, nilai: r.totalUangLembur, status: r.status, calculatedAt: r.calculatedAt })),
      "UANG_LEMBUR",
      DEFAULT_TOTAL_JENJANG_APPROVAL_UANG_LEMBUR
    ),
  ]);

  const totalNominal =
    tukinRows.reduce((a, r) => a + r.tukinBersih, 0) +
    umRows.reduce((a, r) => a + r.totalUangMakan, 0) +
    lemburRows.reduce((a, r) => a + r.totalUangLembur, 0);

  const totalTertolak = tallyTukin.tertolak + tallyUm.tertolak + tallyLembur.tertolak;
  const totalBelumDiajukan = tallyTukin.belumDiajukan + tallyUm.belumDiajukan + tallyLembur.belumDiajukan;
  const totalKalkulasi = tallyTukin.total + tallyUm.total + tallyLembur.total;
  const totalApproved = tallyTukin.approved + tallyUm.approved + tallyLembur.approved;

  const statusSiklus =
    totalKalkulasi === 0
      ? "Belum dihitung"
      : totalBelumDiajukan > 0
        ? "Menunggu diajukan"
        : totalApproved === totalKalkulasi
          ? "Selesai"
          : "Proses approval";

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Dashboard Unit</h1>
      <p className="mt-1 text-sm text-muted">
        {satkerEfektif} - Periode {periodeBulan && periodeTahun ? `${periodeBulan}/${periodeTahun}` : "belum ada data"}
      </p>

      <FilterBar satuanKerjaList={satuanKerjaList} bulan={bulan} tahun={tahun} satker={satkerEfektif} />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Total pegawai" nilai={String(totalPegawai)} />
        <StatTile label="Total nominal periode" nilai={formatRupiah(totalNominal)} />
        <StatTile label="Status siklus" nilai={statusSiklus} />
        <StatTile label="Tertolak" nilai={String(totalTertolak)} warna={totalTertolak > 0 ? "danger" : undefined} />
        <StatTile
          label="Belum diajukan"
          nilai={String(totalBelumDiajukan)}
          warna={totalBelumDiajukan > 0 ? "wait" : undefined}
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <h2 className="text-sm font-bold text-ink">Tukin</h2>
          <p className="mt-1 text-xs text-muted">
            {tallyTukin.approved} disetujui &middot; {tallyTukin.prosesApproval} proses &middot; {tallyTukin.tertolak} ditolak &middot;{" "}
            {tallyTukin.belumDiajukan} belum diajukan
          </p>
        </div>
        <div className="card p-4">
          <h2 className="text-sm font-bold text-ink">Uang Makan</h2>
          <p className="mt-1 text-xs text-muted">
            {tallyUm.approved} disetujui &middot; {tallyUm.prosesApproval} proses &middot; {tallyUm.tertolak} ditolak &middot;{" "}
            {tallyUm.belumDiajukan} belum diajukan
          </p>
        </div>
        <div className="card p-4">
          <h2 className="text-sm font-bold text-ink">Uang Lembur</h2>
          <p className="mt-1 text-xs text-muted">
            {tallyLembur.approved} disetujui &middot; {tallyLembur.prosesApproval} proses &middot; {tallyLembur.tertolak} ditolak &middot;{" "}
            {tallyLembur.belumDiajukan} belum diajukan
          </p>
        </div>
      </div>
    </main>
  );
}
