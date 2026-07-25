import Link from "next/link";
import { prisma } from "../lib/prisma";
import type { AuthUser } from "../auth/permissions";
import { DEFAULT_TOTAL_JENJANG_APPROVAL } from "../approval/approvalTukinService";
import { DEFAULT_TOTAL_JENJANG_APPROVAL_UANG_MAKAN } from "../approval/approvalUangMakanService";
import { DEFAULT_TOTAL_JENJANG_APPROVAL_UANG_LEMBUR } from "../approval/approvalUangLemburService";
import { FilterBar } from "./FilterBar";
import { resolveSatkerEfektif, resolveSatuanKerjaListUntukFilter } from "./dashboardScope";
import { tallyApproval } from "./tallyApproval";

const formatRupiah = (nilai: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0, notation: "compact" }).format(nilai);

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

/**
 * Dashboard lintas unit - dipakai bareng PPABP (langkah 4d) dan PIMPINAN
 * (langkah 4f), role matrix eksplisit bilang "dashboard lintas unit SAMA
 * seperti PPABP" buat Pimpinan, cuma beda read-only. `readOnly=true`
 * (Pimpinan) menyembunyikan link ke halaman AKSI (Rekonsiliasi & Kelola
 * Anggaran Realisasi keduanya butuh izin PPABP/ADMIN yang Pimpinan tidak
 * punya - kalau tetap ditautkan, Pimpinan bakal mentok "Akses ditolak" di
 * halaman tujuan) - stat tile "Rekonsiliasi perlu ditangani" tetap
 * ditampilkan sebagai ANGKA SAJA (bukan link) buat Pimpinan, supaya
 * visibilitasnya tetap ada sesuai role matrix "dashboard yang SAMA".
 */
export async function DashboardLintasUnit({
  searchParams,
  authUser,
  readOnly,
}: {
  searchParams: { bulan?: string; tahun?: string; satker?: string };
  authUser: AuthUser;
  readOnly: boolean;
}) {
  const { bulan, tahun, satker } = searchParams;

  const satkerEfektif = resolveSatkerEfektif(authUser, satker);
  const satuanKerjaRows = await prisma.pegawai.findMany({
    distinct: ["satuanKerja"],
    select: { satuanKerja: true },
    orderBy: { satuanKerja: "asc" },
  });
  const satuanKerjaList = resolveSatuanKerjaListUntukFilter(authUser, satuanKerjaRows.map((r) => r.satuanKerja));

  let periodeBulan = bulan ? Number(bulan) : undefined;
  let periodeTahun = tahun ? Number(tahun) : undefined;
  if (!periodeBulan || !periodeTahun) {
    const terbaru = await prisma.tukinCalculation.findFirst({
      orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }],
      select: { periodeBulan: true, periodeTahun: true },
    });
    periodeBulan = periodeBulan ?? terbaru?.periodeBulan;
    periodeTahun = periodeTahun ?? terbaru?.periodeTahun;
  }

  const filterSatker = satkerEfektif ? { pegawai: { satuanKerja: satkerEfektif } } : {};
  const totalPegawai = await prisma.pegawai.count({ where: satkerEfektif ? { satuanKerja: satkerEfektif } : {} });

  const [tukinRows, umRows, lemburRows] = periodeBulan && periodeTahun
    ? await Promise.all([
        prisma.tukinCalculation.findMany({ where: { periodeBulan, periodeTahun, ...filterSatker } }),
        prisma.uangMakan.findMany({ where: { periodeBulan, periodeTahun, ...filterSatker } }),
        prisma.uangLembur.findMany({ where: { periodeBulan, periodeTahun, ...filterSatker } }),
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

  const anggaranRows = periodeBulan && periodeTahun
    ? await prisma.anggaranRealisasi.findMany({
        where: { periodeBulan, periodeTahun, ...(satkerEfektif ? { satuanKerja: satkerEfektif } : {}) },
      })
    : [];
  const totalPagu = anggaranRows.reduce((a, r) => a + r.pagu, 0);
  const totalRealisasi = anggaranRows.reduce((a, r) => a + r.realisasi, 0);

  const selisihMenunggu = await prisma.reconciliationStatus.count({
    where: {
      status: { in: ["SELISIH", "SANGGAH"] },
      ...(periodeBulan && periodeTahun ? { periodeBulan, periodeTahun } : {}),
    },
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Dashboard Lintas Unit</h1>
      <p className="mt-1 text-sm text-muted">
        {satkerEfektif ?? "Semua satuan kerja"} - Periode {periodeBulan && periodeTahun ? `${periodeBulan}/${periodeTahun}` : "belum ada data"}
      </p>

      <FilterBar satuanKerjaList={satuanKerjaList} bulan={bulan} tahun={tahun} satker={satker} />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Total pegawai" nilai={String(totalPegawai)} />
        <StatTile label="Total nominal periode" nilai={formatRupiah(totalNominal)} />
        <StatTile label="Tertolak" nilai={String(totalTertolak)} warna={totalTertolak > 0 ? "danger" : undefined} />
        <StatTile label="Belum diajukan" nilai={String(totalBelumDiajukan)} warna={totalBelumDiajukan > 0 ? "wait" : undefined} />
        {readOnly ? (
          <StatTile label="Rekonsiliasi perlu ditangani" nilai={String(selisihMenunggu)} warna={selisihMenunggu > 0 ? "wait" : undefined} />
        ) : (
          <Link href="/ppabp/rekonsiliasi" className="rounded-xl border border-line bg-surface-2 p-3 transition hover:border-teal-deep">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Rekonsiliasi perlu ditangani</p>
            <p className={`mt-1 font-mono text-xl font-extrabold ${selisihMenunggu > 0 ? "text-gold-deep" : "text-ink"}`}>{selisihMenunggu}</p>
          </Link>
        )}
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

      <div className="card mt-6 p-4">
        <h2 className="text-sm font-bold text-ink">Anggaran vs Realisasi</h2>
        {anggaranRows.length === 0 ? (
          <p className="mt-1 text-xs text-muted">Belum ada data Anggaran & Realisasi untuk periode/satker ini.</p>
        ) : (
          <p className="mt-1 font-mono text-sm text-ink-2">
            Pagu {formatRupiah(totalPagu)} &middot; Realisasi {formatRupiah(totalRealisasi)} (
            {totalPagu > 0 ? ((totalRealisasi / totalPagu) * 100).toFixed(1) : "0"}%)
          </p>
        )}
        {!readOnly && (
          <Link href="/ppabp/anggaran" className="mt-2 inline-block text-xs font-semibold text-teal-deep underline">
            Kelola Anggaran & Realisasi
          </Link>
        )}
      </div>
    </main>
  );
}
