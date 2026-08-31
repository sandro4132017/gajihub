import Link from "next/link";
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

const NAMA_BULAN_SINGKAT = [
  "JAN", "FEB", "MAR", "APR", "MEI", "JUN",
  "JUL", "AGU", "SEP", "OKT", "NOV", "DES",
];

const NAMA_BULAN_LENGKAP = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function formatRupiah(nilai: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
    notation: "compact",
  }).format(nilai);
}

function formatRupiahPenuh(nilai: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(nilai);
}

function inisialNama(nama: string): string {
  const parts = nama.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
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
  const satuanKerjaList = resolveSatuanKerjaListUntukFilter(
    authUser,
    satuanKerjaRows.map((r) => r.satuanKerja)
  );

  if (!satkerEfektif) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <h1 className="text-2xl font-black tracking-tight text-ink">Dashboard Unit</h1>
        <p className="mt-1 text-sm text-muted">Pilih satuan kerja terlebih dahulu untuk melihat dashboard.</p>
        <div className="mt-4">
          <FilterBar satuanKerjaList={satuanKerjaList} bulan={bulan} tahun={tahun} satker={satker} />
        </div>
      </main>
    );
  }

  if (!canViewDashboardUnit(authUser, satkerEfektif)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang melihat dashboard unit ini." />;
  }

  // Default periode = periode Tukin paling baru yang ada datanya
  let periodeBulan = bulan ? Number(bulan) : undefined;
  let periodeTahun = tahun ? Number(tahun) : undefined;
  if (!periodeBulan || !periodeTahun) {
    const terbaru = await prisma.tukinCalculation.findFirst({
      where: { pegawai: { satuanKerja: satkerEfektif } },
      orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }],
      select: { periodeBulan: true, periodeTahun: true },
    });
    periodeBulan = periodeBulan ?? terbaru?.periodeBulan ?? new Date().getMonth() + 1;
    periodeTahun = periodeTahun ?? terbaru?.periodeTahun ?? new Date().getFullYear();
  }

  const [
    totalPegawai,
    tukinRows,
    umRows,
    lemburRows,
    trendTukin,
    trendUm,
    trendLembur,
    countPredikat,
    countBanding,
    countKgb,
    countHukdis,
  ] = await Promise.all([
    prisma.pegawai.count({
      where: { satuanKerja: satkerEfektif, statusPegawai: "AKTIF" },
    }),
    prisma.tukinCalculation.findMany({
      where: { periodeBulan, periodeTahun, pegawai: { satuanKerja: satkerEfektif } },
      include: {
        pegawai: {
          select: {
            id: true,
            nama: true,
            nip: true,
            jabatan: true,
            kelasJabatan: true,
            golongan: true,
          },
        },
      },
      orderBy: { tukinBersih: "desc" },
    }),
    prisma.uangMakan.findMany({
      where: { periodeBulan, periodeTahun, pegawai: { satuanKerja: satkerEfektif } },
    }),
    prisma.uangLembur.findMany({
      where: { periodeBulan, periodeTahun, pegawai: { satuanKerja: satkerEfektif } },
    }),
    // Data tren 12 bulan (Jan - Des) di tahun terpilih
    prisma.tukinCalculation.groupBy({
      by: ["periodeBulan"],
      where: { periodeTahun, pegawai: { satuanKerja: satkerEfektif } },
      _sum: { tukinBersih: true },
      _count: { id: true },
    }),
    prisma.uangMakan.groupBy({
      by: ["periodeBulan"],
      where: { periodeTahun, pegawai: { satuanKerja: satkerEfektif } },
      _sum: { totalUangMakan: true },
    }),
    prisma.uangLembur.groupBy({
      by: ["periodeBulan"],
      where: { periodeTahun, pegawai: { satuanKerja: satkerEfektif } },
      _sum: { totalUangLembur: true },
    }),
    // Data kelengkapan dokumen pendukung
    prisma.predikatKinerja.count({
      where: { periodeBulan, periodeTahun, pegawai: { satuanKerja: satkerEfektif } },
    }),
    prisma.banding.findMany({
      where: { pegawai: { satuanKerja: satkerEfektif }, periodeBulan, periodeTahun },
      select: { status: true },
    }),
    prisma.skKgb.count({
      where: { pegawai: { satuanKerja: satkerEfektif } },
    }),
    prisma.skHukumanDisiplin.count({
      where: { pegawai: { satuanKerja: satkerEfektif } },
    }),
  ]);

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

  const nominalTukinTotal = tukinRows.reduce((a, r) => a + r.tukinBersih, 0);
  const nominalUmTotal = umRows.reduce((a, r) => a + r.totalUangMakan, 0);
  const nominalLemburTotal = lemburRows.reduce((a, r) => a + r.totalUangLembur, 0);
  const totalNominalPeriode = nominalTukinTotal + nominalUmTotal + nominalLemburTotal;

  const totalKalkulasi = tallyTukin.total + tallyUm.total + tallyLembur.total;
  const totalApproved = tallyTukin.approved + tallyUm.approved + tallyLembur.approved;
  const totalProses = tallyTukin.prosesApproval + tallyUm.prosesApproval + tallyLembur.prosesApproval;
  const totalBelumDiajukan = tallyTukin.belumDiajukan + tallyUm.belumDiajukan + tallyLembur.belumDiajukan;
  const totalTertolak = tallyTukin.tertolak + tallyUm.tertolak + tallyLembur.tertolak;

  // Persentase Progres Approval
  const persenTukin = tallyTukin.total > 0 ? Math.round((tallyTukin.approved / tallyTukin.total) * 100) : 0;
  const persenUm = tallyUm.total > 0 ? Math.round((tallyUm.approved / tallyUm.total) * 100) : 0;
  const persenLembur = tallyLembur.total > 0 ? Math.round((tallyLembur.approved / tallyLembur.total) * 100) : 0;
  const persenTotal = totalKalkulasi > 0 ? Math.round((totalApproved / totalKalkulasi) * 100) : 0;

  // Status Siklus
  let statusSiklusLabel = "Belum dihitung";
  let statusSiklusBg = "bg-line text-muted";
  if (totalKalkulasi > 0) {
    if (totalApproved === totalKalkulasi) {
      statusSiklusLabel = "Selesai Disetujui";
      statusSiklusBg = "bg-green-tint text-green font-bold";
    } else if (totalTertolak > 0) {
      statusSiklusLabel = `${totalTertolak} Ditolak`;
      statusSiklusBg = "bg-red-tint text-red font-bold";
    } else if (totalBelumDiajukan > 0) {
      statusSiklusLabel = "Menunggu Diajukan";
      statusSiklusBg = "bg-gold-tint text-gold-deep font-bold";
    } else {
      statusSiklusLabel = "Proses Approval";
      statusSiklusBg = "bg-teal-tint text-navy font-bold";
    }
  }

  // Pengolahan data bulanan 12 bulan (Jan - Des)
  const dataBulanan = Array.from({ length: 12 }, (_, i) => {
    const bulanIndex = i + 1;
    const itemTukin = trendTukin.find((t) => t.periodeBulan === bulanIndex);
    const itemUm = trendUm.find((u) => u.periodeBulan === bulanIndex);
    const itemLembur = trendLembur.find((l) => l.periodeBulan === bulanIndex);

    const nominalBulan =
      (itemTukin?._sum.tukinBersih ?? 0) +
      (itemUm?._sum.totalUangMakan ?? 0) +
      (itemLembur?._sum.totalUangLembur ?? 0);
    const pegawaiBulan = itemTukin?._count.id ?? 0;

    return {
      bulan: bulanIndex,
      namaSingkat: NAMA_BULAN_SINGKAT[i],
      namaLengkap: NAMA_BULAN_LENGKAP[i],
      nominal: nominalBulan,
      pegawai: pegawaiBulan,
    };
  });

  const maxNominalBulanan = Math.max(...dataBulanan.map((d) => d.nominal), 1);

  // Dokumen & Kesiapan
  const persenPredikat = totalPegawai > 0 ? Math.min(100, Math.round((countPredikat / totalPegawai) * 100)) : 0;
  const bandingPending = countBanding.filter((b) => b.status === "DIAJUKAN").length;
  const bandingSelesai = countBanding.filter((b) => b.status === "DISETUJUI" || b.status === "DITOLAK").length;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 space-y-6">
      {/* ====================================================================
          1. HEADER & ACTION BAR
          ==================================================================== */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-ink">Dashboard Unit</h1>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusSiklusBg}`}>
              {statusSiklusLabel}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-muted">
            {satkerEfektif} &bull; Periode{" "}
            <span className="font-semibold text-ink">
              {NAMA_BULAN_LENGKAP[periodeBulan - 1]} {periodeTahun}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href={`/kasubag/kalkulasi?bulan=${periodeBulan}&tahun=${periodeTahun}&satker=${encodeURIComponent(satkerEfektif)}`}
            className="btn btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold shadow-sm"
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Kalkulasi Massal
          </Link>
          <Link
            href={`/kasubag/pegawai?satker=${encodeURIComponent(satkerEfektif)}`}
            className="btn btn-ghost inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-2"
          >
            <svg className="size-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            Pegawai Unit ({totalPegawai})
          </Link>
        </div>
      </div>

      {/* ====================================================================
          2. FILTER BAR & QUICK NAVIGATION TABS
          ==================================================================== */}
      <div className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
        <FilterBar satuanKerjaList={satuanKerjaList} bulan={bulan} tahun={tahun} satker={satkerEfektif} />
        
        <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-line-2 pt-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted mr-1">Pintasan Layanan:</span>
          <Link
            href={`/tukin/presensi?bulan=${periodeBulan}&tahun=${periodeTahun}`}
            className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink transition hover:border-biru hover:text-biru"
          >
            Presensi Pegawai
          </Link>
          <Link
            href="/tukin/predikat-kinerja"
            className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink transition hover:border-biru hover:text-biru"
          >
            Predikat Kinerja
          </Link>
          <Link
            href={`/kasubag/banding?satker=${encodeURIComponent(satkerEfektif)}`}
            className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink transition hover:border-biru hover:text-biru"
          >
            Verifikasi Banding {bandingPending > 0 && <span className="ml-1 rounded-full bg-gold px-1.5 py-0.2 text-[10px] text-white">{bandingPending}</span>}
          </Link>
          <Link
            href={`/kasubag/sk-kgb?satker=${encodeURIComponent(satkerEfektif)}`}
            className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink transition hover:border-biru hover:text-biru"
          >
            SK KGB
          </Link>
          <Link
            href={`/kasubag/sk-hukuman-disiplin?satker=${encodeURIComponent(satkerEfektif)}`}
            className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink transition hover:border-biru hover:text-biru"
          >
            SK Hukuman Disiplin
          </Link>
        </div>
      </div>

      {/* ====================================================================
          3. TOP SECTION: KPI METRICS (LEFT) + MONTHLY ACTIVITY CHART (RIGHT)
          ==================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* KPI Grid (6 Cards / 2 Columns) */}
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:col-span-6">
          {/* Card 1: Total Pegawai */}
          <div className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-xs transition hover:shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted">Pegawai Aktif</span>
              <div className="rounded-lg bg-teal-tint p-1.5 text-navy">
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
            <div className="mt-3">
              <div className="font-mono text-2xl font-extrabold text-ink">{totalPegawai}</div>
              <p className="mt-0.5 text-[11px] text-muted">Tergabung di unit kerja</p>
            </div>
          </div>

          {/* Card 2: Total Belanja Periode */}
          <div className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-xs transition hover:shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted">Total Belanja</span>
              <div className="rounded-lg bg-green-tint p-1.5 text-green">
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="mt-3">
              <div className="font-mono text-2xl font-extrabold text-ink">{formatRupiah(totalNominalPeriode)}</div>
              <p className="mt-0.5 text-[11px] text-muted" title={formatRupiahPenuh(totalNominalPeriode)}>
                Periode {periodeBulan}/{periodeTahun}
              </p>
            </div>
          </div>

          {/* Card 3: Total Selesai / Approved */}
          <div className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-xs transition hover:shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted">Selesai Approval</span>
              <div className="rounded-lg bg-gold-tint p-1.5 text-gold-deep">
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="mt-3">
              <div className="font-mono text-2xl font-extrabold text-ink">
                {totalApproved}
                <span className="text-sm font-medium text-muted">/{totalKalkulasi}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted">{persenTotal}% tervalidasi</p>
            </div>
          </div>

          {/* Card 4: Progres Tukin + Sparkline */}
          <div className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-xs transition hover:shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted">Progres Tukin</span>
              <span className="rounded-full bg-teal-tint px-2 py-0.5 text-[10px] font-bold text-navy">
                {persenTukin}%
              </span>
            </div>
            <div className="mt-2">
              <div className="font-mono text-xl font-black text-ink">{persenTukin}%</div>
              {/* Mini SVG Sparkline */}
              <div className="mt-1 h-6 w-full">
                <svg className="h-full w-full overflow-visible" viewBox="0 0 100 24" preserveAspectRatio="none">
                  <path
                    d="M0,20 Q15,18 30,12 T60,8 T100,2"
                    fill="none"
                    stroke="#13416B"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M0,20 Q15,18 30,12 T60,8 T100,2 L100,24 L0,24 Z"
                    fill="rgba(19,65,107,0.08)"
                  />
                </svg>
              </div>
              <p className="text-[10px] text-muted">{tallyTukin.approved} dari {tallyTukin.total} pegawai</p>
            </div>
          </div>

          {/* Card 5: Progres Uang Makan + Sparkline */}
          <div className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-xs transition hover:shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted">Uang Makan</span>
              <span className="rounded-full bg-biru/10 px-2 py-0.5 text-[10px] font-bold text-biru">
                {persenUm}%
              </span>
            </div>
            <div className="mt-2">
              <div className="font-mono text-xl font-black text-ink">{persenUm}%</div>
              {/* Mini SVG Sparkline */}
              <div className="mt-1 h-6 w-full">
                <svg className="h-full w-full overflow-visible" viewBox="0 0 100 24" preserveAspectRatio="none">
                  <path
                    d="M0,18 Q20,16 40,10 T80,6 T100,2"
                    fill="none"
                    stroke="#3F72AF"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M0,18 Q20,16 40,10 T80,6 T100,2 L100,24 L0,24 Z"
                    fill="rgba(63,114,175,0.08)"
                  />
                </svg>
              </div>
              <p className="text-[10px] text-muted">{tallyUm.approved} dari {tallyUm.total} pegawai</p>
            </div>
          </div>

          {/* Card 6: Progres Uang Lembur + Sparkline */}
          <div className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-xs transition hover:shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted">Uang Lembur</span>
              <span className="rounded-full bg-gold-tint px-2 py-0.5 text-[10px] font-bold text-gold-deep">
                {persenLembur}%
              </span>
            </div>
            <div className="mt-2">
              <div className="font-mono text-xl font-black text-ink">{persenLembur}%</div>
              {/* Mini SVG Sparkline */}
              <div className="mt-1 h-6 w-full">
                <svg className="h-full w-full overflow-visible" viewBox="0 0 100 24" preserveAspectRatio="none">
                  <path
                    d="M0,22 Q25,20 50,14 T80,6 T100,4"
                    fill="none"
                    stroke="#C8871F"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M0,22 Q25,20 50,14 T80,6 T100,4 L100,24 L0,24 Z"
                    fill="rgba(200,135,31,0.08)"
                  />
                </svg>
              </div>
              <p className="text-[10px] text-muted">{tallyLembur.approved} dari {tallyLembur.total} pegawai</p>
            </div>
          </div>
        </div>

        {/* Right Column: Monthly Activity & Trend Chart */}
        <div className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-5 shadow-xs lg:col-span-6">
          <div className="flex items-center justify-between pb-3 border-b border-line-2">
            <div>
              <h2 className="text-sm font-bold text-ink">Tren Realisasi Belanja Unit</h2>
              <p className="text-xs text-muted">Aktivitas pengajuan sepanjang tahun {periodeTahun}</p>
            </div>
            <span className="rounded-xl border border-line bg-surface-2 px-3 py-1 text-xs font-bold text-ink">
              Tahun {periodeTahun}
            </span>
          </div>

          {/* Bar Chart Container */}
          <div className="mt-4 flex flex-1 flex-col justify-end">
            <div className="grid h-44 grid-cols-12 items-end gap-1.5 sm:gap-2.5 pt-4">
              {dataBulanan.map((d) => {
                const tinggiPersen = d.nominal > 0 ? Math.max(12, Math.round((d.nominal / maxNominalBulanan) * 100)) : 6;
                const isSelected = d.bulan === periodeBulan;

                return (
                  <div key={d.bulan} className="group relative flex flex-col items-center h-full justify-end">
                    {/* Tooltip Hover */}
                    <div className="pointer-events-none absolute -top-10 left-1/2 z-20 hidden -translate-x-1/2 rounded-lg bg-navy-deep px-2.5 py-1 text-[10px] font-bold text-white shadow-md whitespace-nowrap group-hover:block">
                      {d.namaLengkap}: {d.nominal > 0 ? formatRupiah(d.nominal) : "Rp 0"}
                    </div>

                    {/* Bar Background Track */}
                    <div className="relative flex h-full w-full max-w-[28px] items-end rounded-t-lg bg-line-2/70 p-0.5">
                      {/* Active Bar Fill */}
                      <div
                        style={{ height: `${tinggiPersen}%` }}
                        className={`w-full rounded-md transition-all duration-300 ${
                          isSelected
                            ? "bg-gradient-to-t from-navy to-biru shadow-sm ring-2 ring-biru/40"
                            : d.nominal > 0
                            ? "bg-biru/70 hover:bg-biru"
                            : "bg-line hover:bg-muted/30"
                        }`}
                      />
                    </div>

                    {/* Month Label */}
                    <span
                      className={`mt-2 text-[10px] font-bold ${
                        isSelected ? "text-navy font-black underline underline-offset-2" : "text-muted"
                      }`}
                    >
                      {d.namaSingkat}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-line-2 pt-3 text-xs text-muted">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-navy" />
                <span>Bulan Terpilih ({NAMA_BULAN_SINGKAT[periodeBulan - 1]})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-biru/70" />
                <span>Realisasi Lainnya</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ====================================================================
          4. MIDDLE SECTION: PROGRESS PER KOMPONEN & KESIAPAN DATA UNIT
          ==================================================================== */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Card: Progres Realisasi per Komponen Belanja */}
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-line-2">
            <h2 className="text-sm font-bold text-ink">Status Approval per Komponen</h2>
            <span className="text-xs font-semibold text-muted">Periode {periodeBulan}/{periodeTahun}</span>
          </div>

          <div className="mt-4 space-y-4">
            {/* Tukin */}
            <div className="rounded-xl border border-line-2 bg-surface-2 p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-navy text-white text-xs font-extrabold">
                    TK
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-ink">Tunjangan Kinerja</h3>
                    <p className="text-[11px] text-muted">{formatRupiah(nominalTukinTotal)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono text-sm font-black text-ink">{persenTukin}%</span>
                  <p className="text-[10px] text-muted">Disetujui</p>
                </div>
              </div>
              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-navy to-biru transition-all duration-500"
                  style={{ width: `${persenTukin}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted font-medium">
                <span className="text-green font-bold">{tallyTukin.approved} Disetujui</span>
                <span>&bull;</span>
                <span className="text-navy">{tallyTukin.prosesApproval} Proses</span>
                <span>&bull;</span>
                <span className="text-gold-deep">{tallyTukin.belumDiajukan} Draft</span>
                {tallyTukin.tertolak > 0 && (
                  <>
                    <span>&bull;</span>
                    <span className="text-red font-bold">{tallyTukin.tertolak} Ditolak</span>
                  </>
                )}
              </div>
            </div>

            {/* Uang Makan */}
            <div className="rounded-xl border border-line-2 bg-surface-2 p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-biru text-white text-xs font-extrabold">
                    UM
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-ink">Uang Makan Pegawai</h3>
                    <p className="text-[11px] text-muted">{formatRupiah(nominalUmTotal)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono text-sm font-black text-ink">{persenUm}%</span>
                  <p className="text-[10px] text-muted">Disetujui</p>
                </div>
              </div>
              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-biru to-teal-tint transition-all duration-500"
                  style={{ width: `${persenUm}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted font-medium">
                <span className="text-green font-bold">{tallyUm.approved} Disetujui</span>
                <span>&bull;</span>
                <span className="text-navy">{tallyUm.prosesApproval} Proses</span>
                <span>&bull;</span>
                <span className="text-gold-deep">{tallyUm.belumDiajukan} Draft</span>
                {tallyUm.tertolak > 0 && (
                  <>
                    <span>&bull;</span>
                    <span className="text-red font-bold">{tallyUm.tertolak} Ditolak</span>
                  </>
                )}
              </div>
            </div>

            {/* Uang Lembur */}
            <div className="rounded-xl border border-line-2 bg-surface-2 p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-gold text-white text-xs font-extrabold">
                    UL
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-ink">Uang Lembur Pegawai</h3>
                    <p className="text-[11px] text-muted">{formatRupiah(nominalLemburTotal)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono text-sm font-black text-ink">{persenLembur}%</span>
                  <p className="text-[10px] text-muted">Disetujui</p>
                </div>
              </div>
              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-gold to-gold-tint transition-all duration-500"
                  style={{ width: `${persenLembur}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted font-medium">
                <span className="text-green font-bold">{tallyLembur.approved} Disetujui</span>
                <span>&bull;</span>
                <span className="text-navy">{tallyLembur.prosesApproval} Proses</span>
                <span>&bull;</span>
                <span className="text-gold-deep">{tallyLembur.belumDiajukan} Draft</span>
                {tallyLembur.tertolak > 0 && (
                  <>
                    <span>&bull;</span>
                    <span className="text-red font-bold">{tallyLembur.tertolak} Ditolak</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Card: Kesiapan Data & Dokumen Unit */}
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-line-2">
            <h2 className="text-sm font-bold text-ink">Kesiapan Data & Dokumen Unit</h2>
            <span className="text-xs font-semibold text-muted">Persyaratan Payroll</span>
          </div>

          <div className="mt-4 space-y-4">
            {/* Predikat Kinerja BKN */}
            <div className="rounded-xl border border-line-2 bg-surface-2 p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-green text-white text-xs font-bold">
                    PK
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-ink">Predikat Kinerja e-Kinerja BKN</h3>
                    <p className="text-[11px] text-muted">{countPredikat} dari {totalPegawai} pegawai terunggah</p>
                  </div>
                </div>
                <span className="font-mono text-sm font-black text-green">{persenPredikat}%</span>
              </div>
              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-green transition-all duration-500"
                  style={{ width: `${persenPredikat}%` }}
                />
              </div>
            </div>

            {/* Verifikasi Banding Presensi */}
            <div className="rounded-xl border border-line-2 bg-surface-2 p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-biru text-white text-xs font-bold">
                    VB
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-ink">Verifikasi Banding Presensi Unit</h3>
                    <p className="text-[11px] text-muted">
                      {bandingPending} menunggu verifikasi &bull; {bandingSelesai} selesai
                    </p>
                  </div>
                </div>
                <Link
                  href={`/kasubag/banding?satker=${encodeURIComponent(satkerEfektif)}`}
                  className="btn btn-ghost btn-sm text-xs font-semibold text-biru"
                >
                  Buka Banding
                </Link>
              </div>
            </div>

            {/* SK KGB & Hukuman Disiplin */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="rounded-xl border border-line-2 bg-surface-2 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-muted">SK KGB Unit</span>
                  <span className="font-mono text-sm font-extrabold text-ink">{countKgb}</span>
                </div>
                <Link
                  href={`/kasubag/sk-kgb?satker=${encodeURIComponent(satkerEfektif)}`}
                  className="mt-2 block text-[11px] font-semibold text-biru hover:underline"
                >
                  Kelola SK KGB &rarr;
                </Link>
              </div>

              <div className="rounded-xl border border-line-2 bg-surface-2 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-muted">SK Hukdis</span>
                  <span className="font-mono text-sm font-extrabold text-ink">{countHukdis}</span>
                </div>
                <Link
                  href={`/kasubag/sk-hukuman-disiplin?satker=${encodeURIComponent(satkerEfektif)}`}
                  className="mt-2 block text-[11px] font-semibold text-biru hover:underline"
                >
                  Kelola Hukdis &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ====================================================================
          5. BOTTOM SECTION: RECENT EMPLOYEE APPROVAL & UNIT SUMMARY
          ==================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Card: Status Approval Pegawai Terkini (7 Cols) */}
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-xs lg:col-span-7">
          <div className="flex items-center justify-between pb-3 border-b border-line-2">
            <div>
              <h2 className="text-sm font-bold text-ink">Status Approval Pegawai Unit Terkini</h2>
              <p className="text-xs text-muted">Daftar perhitungan Tukin periode berjalan</p>
            </div>
            <Link
              href={`/kasubag/pegawai?satker=${encodeURIComponent(satkerEfektif)}`}
              className="text-xs font-semibold text-biru hover:underline"
            >
              Lihat Semua ({totalPegawai}) &rarr;
            </Link>
          </div>

          <div className="mt-4 divide-y divide-line-2">
            {tukinRows.length === 0 && (
              <div className="py-8 text-center text-sm text-muted">
                Belum ada data kalkulasi Tukin pada periode {periodeBulan}/{periodeTahun}.
              </div>
            )}
            {tukinRows.slice(0, 5).map((row) => {
              const status = row.status;
              const isApproved = status === "APPROVED" || status === "COCOK" || status === "DIKIRIM";
              const isTertolak = status === "SELISIH";
              const isProses = status === "SANGGAH";

              const badgeColor = isApproved
                ? "bg-green-tint text-green"
                : isTertolak
                ? "bg-red-tint text-red"
                : isProses
                ? "bg-teal-tint text-navy"
                : "bg-line text-muted";

              const badgeText = isApproved
                ? "Disetujui"
                : isTertolak
                ? "Ditolak"
                : isProses
                ? "Proses"
                : "Draft";

              return (
                <div key={row.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-biru to-navy text-xs font-black text-white shadow-2xs">
                      {inisialNama(row.pegawai.nama)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-ink">{row.pegawai.nama}</p>
                      <p className="truncate text-[11px] text-muted">
                        NIP {row.pegawai.nip} &bull; Kelas {row.pegawai.kelasJabatan ?? "-"}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-right">
                      <p className="font-mono text-xs font-bold text-ink">{formatRupiahPenuh(row.tukinBersih)}</p>
                      <p className="text-[10px] text-muted">Tukin Bersih</p>
                    </div>
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ${badgeColor}`}>
                      {badgeText}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Card: Layanan & Tindakan Cepat (5 Cols) */}
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-xs lg:col-span-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-line-2">
              <h2 className="text-sm font-bold text-ink">Ringkasan Tindakan Unit</h2>
              <span className="text-xs font-semibold text-muted">Tugas Kasubag TU</span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3">
                <div className="mt-0.5 rounded-lg bg-teal-tint p-1.5 text-navy">
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs font-bold text-ink">Kalkulasi Massal Periode Ini</h3>
                  <p className="text-[11px] text-muted">
                    {totalBelumDiajukan > 0
                      ? `${totalBelumDiajukan} kalkulasi siap diajukan ke jenjang approval.`
                      : "Semua kalkulasi telah diproses untuk periode ini."}
                  </p>
                  <Link
                    href={`/kasubag/kalkulasi?bulan=${periodeBulan}&tahun=${periodeTahun}&satker=${encodeURIComponent(satkerEfektif)}`}
                    className="mt-2 inline-block text-xs font-bold text-biru hover:underline"
                  >
                    Buka Kalkulasi Massal &rarr;
                  </Link>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3">
                <div className="mt-0.5 rounded-lg bg-gold-tint p-1.5 text-gold-deep">
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs font-bold text-ink">Banding Kehadiran Pegawai</h3>
                  <p className="text-[11px] text-muted">
                    {bandingPending > 0
                      ? `Terdapat ${bandingPending} pengajuan banding dari pegawai yang perlu diverifikasi unit.`
                      : "Tidak ada permohonan banding kehadiran yang tertunda."}
                  </p>
                  <Link
                    href={`/kasubag/banding?satker=${encodeURIComponent(satkerEfektif)}`}
                    className="mt-2 inline-block text-xs font-bold text-biru hover:underline"
                  >
                    Periksa Sanggahan & Banding &rarr;
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-teal-tint/60 p-3 text-center text-xs font-medium text-navy">
            Unit Kerja: <span className="font-bold">{satkerEfektif}</span>
          </div>
        </div>
      </div>
    </main>
  );
}
