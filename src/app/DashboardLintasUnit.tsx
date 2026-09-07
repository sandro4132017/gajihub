import Link from "next/link";
import { prisma } from "../lib/prisma";
import type { AuthUser } from "../auth/permissions";
import { FilterBar } from "./FilterBar";
import { resolveSatkerEfektif, resolveSatuanKerjaListUntukFilter } from "./dashboardScope";
import { kunciKirim, tallyKirim } from "./tallyKirim";
import { TAMPILKAN_NOMINAL_LEMBUR } from "./tampilUangLembur";
import { HALAMAN } from "./layoutHalaman";

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
  // Hanya AKTIF - pensiunan tetap disimpan (berhak atas tukin bulan yang
  // sudah dikerjakan) tapi tidak boleh ikut menggelembungkan hitungan pegawai.
  const totalPegawai = await prisma.pegawai.count({
    where: { statusPegawai: "AKTIF", ...(satkerEfektif ? { satuanKerja: satkerEfektif } : {}) },
  });

  const [tukinRows, umRows, lemburRows] = periodeBulan && periodeTahun
    ? await Promise.all([
        prisma.tukinCalculation.findMany({
          where: { periodeBulan, periodeTahun, ...filterSatker },
          // satuanKerja dibutuhkan buat mencocokkan baris ke pengiriman unitnya.
          include: { pegawai: { select: { satuanKerja: true } } },
        }),
        prisma.uangMakan.findMany({
          where: { periodeBulan, periodeTahun, ...filterSatker },
          // satuanKerja dibutuhkan buat mencocokkan baris ke pengiriman unitnya.
          include: { pegawai: { select: { satuanKerja: true } } },
        }),
        prisma.uangLembur.findMany({
          where: { periodeBulan, periodeTahun, ...filterSatker },
          // satuanKerja dibutuhkan buat mencocokkan baris ke pengiriman unitnya.
          include: { pegawai: { select: { satuanKerja: true } } },
        }),
      ])
    : [[], [], []];

  // Keadaan tiap baris = keadaan PENGIRIMAN unitnya. Satu query untuk
  // ketiga domain sekaligus - pengirimannya memang satu per unit per periode,
  // bukan per jenis pembayaran.
  const pengiriman =
    periodeBulan && periodeTahun
      ? await prisma.pengirimanUnit.findMany({
          where: { periodeBulan, periodeTahun },
          select: { satuanKerja: true, status: true },
        })
      : [];
  const petaKirim = new Map(
    pengiriman.map((p) => [kunciKirim(p.satuanKerja, periodeBulan!, periodeTahun!), p.status])
  );
  const kunci = (r: { pegawai: { satuanKerja: string }; periodeBulan: number; periodeTahun: number }) =>
    kunciKirim(r.pegawai.satuanKerja, r.periodeBulan, r.periodeTahun);

  const tallyTukin = tallyKirim(tukinRows.map(kunci), petaKirim);
  const tallyUm = tallyKirim(umRows.map(kunci), petaKirim);
  const tallyLembur = tallyKirim(lemburRows.map(kunci), petaKirim);

  const totalNominal =
    tukinRows.reduce((a, r) => a + r.tukinBersih, 0) +
    umRows.reduce((a, r) => a + r.totalUangMakan, 0) +
    lemburRows.reduce((a, r) => a + r.totalUangLembur, 0);

  const totalDikembalikan = tallyTukin.dikembalikan + tallyUm.dikembalikan + tallyLembur.dikembalikan;
  const totalBelumKirim = tallyTukin.belumKirim + tallyUm.belumKirim + tallyLembur.belumKirim;

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
    <main className={HALAMAN}>
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Dashboard Lintas Unit</h1>
      <p className="mt-1 text-sm text-muted">
        {satkerEfektif ?? "Semua satuan kerja"} - Periode {periodeBulan && periodeTahun ? `${periodeBulan}/${periodeTahun}` : "belum ada data"}
      </p>

      <FilterBar satuanKerjaList={satuanKerjaList} bulan={bulan} tahun={tahun} satker={satker} />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Total pegawai" nilai={String(totalPegawai)} />
        <StatTile label="Total nominal periode" nilai={formatRupiah(totalNominal)} />
        <StatTile
          label="Dikembalikan"
          nilai={String(totalDikembalikan)}
          warna={totalDikembalikan > 0 ? "danger" : undefined}
        />
        <StatTile
          label="Belum dikirim"
          nilai={String(totalBelumKirim)}
          warna={totalBelumKirim > 0 ? "wait" : undefined}
        />
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
            {tallyTukin.terkirim} terkirim &middot; {tallyTukin.dikembalikan} dikembalikan &middot;{" "}
            {tallyTukin.belumKirim} belum dikirim
          </p>
        </div>
        <div className="card p-4">
          <h2 className="text-sm font-bold text-ink">Uang Makan</h2>
          <p className="mt-1 text-xs text-muted">
            {tallyUm.terkirim} terkirim &middot; {tallyUm.dikembalikan} dikembalikan &middot;{" "}
            {tallyUm.belumKirim} belum dikirim
          </p>
        </div>
        {/* Kartu Uang Lembur ditahan selama angkanya belum disetujui -
            lihat src/app/tampilUangLembur.ts. */}
        {TAMPILKAN_NOMINAL_LEMBUR && (
          <div className="card p-4">
            <h2 className="text-sm font-bold text-ink">Uang Lembur</h2>
            <p className="mt-1 text-xs text-muted">
              {tallyLembur.terkirim} terkirim &middot; {tallyLembur.dikembalikan} dikembalikan &middot;{" "}
              {tallyLembur.belumKirim} belum dikirim
            </p>
          </div>
        )}
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
