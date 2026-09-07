import { prisma } from "../../lib/prisma";
import { FilterBar } from "../FilterBar";
import { BadgeStatusKirim, keadaanKirimBaris } from "../StatusKirimBaris";
import { getSessionAccount } from "../../auth/getSessionAccount";
import { canViewApproverDashboard } from "../../auth/permissions";
import { resolveSatkerEfektif, resolveSatuanKerjaListUntukFilter } from "../dashboardScope";
import { AksesDitolak } from "../AksesDitolak";
import { StatusBadge } from "../StatusBadge";
import {
  ALASAN_UANG_LEMBUR_DISEMBUNYIKAN,
  TAMPILKAN_MENU_LEMBUR,
  TAMPILKAN_NOMINAL_LEMBUR,
} from "../tampilUangLembur";
import { HALAMAN } from "../layoutHalaman";

export const dynamic = "force-dynamic";

const formatRupiah = (nilai: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(nilai);

export default async function UangLemburPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string; satker?: string }>;
}) {
  const { bulan, tahun, satker } = await searchParams;

  // Gerbang paling luar, SEBELUM satu query pun dijalankan.
  //
  // Diletakkan di sini, bukan sekadar melepas menunya dari sidebar: menu yang
  // hilang tidak menutup URL, dan orang yang pernah mem-bookmark halaman ini
  // akan tetap sampai ke angkanya. Yang dilihatnya sekarang penjelasan, bukan
  // halaman kosong yang terbaca seperti kerusakan.
  if (!TAMPILKAN_MENU_LEMBUR) {
    return (
      <main className={HALAMAN}>
        <h1 className="text-xl font-extrabold tracking-tight text-ink">Uang Lembur</h1>
        <div className="card mt-4 max-w-2xl p-5">
          <span className="chip chip-wait">Sementara disembunyikan</span>
          <p className="mt-3 text-sm text-ink-2">{ALASAN_UANG_LEMBUR_DISEMBUNYIKAN}</p>
        </div>
      </main>
    );
  }

  // Guard sama dengan Dashboard Tukin (lihat src/app/tukin/page.tsx) -
  // KASUBAG_TU discope ke unit kerjanya sendiri, PEGAWAI diarahkan ke
  // dashboard self-service (/saya).
  const akun = await getSessionAccount();
  const authUser = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canViewApproverDashboard(authUser)) {
    return authUser?.role === "PEGAWAI" ? (
      <AksesDitolak
        pesan="Halaman ini untuk approver, bukan pegawai."
        hrefAlternatif="/saya"
        labelAlternatif="Lihat data saya"
      />
    ) : (
      <AksesDitolak pesan="Role kamu tidak berwenang melihat data kalkulasi payroll." />
    );
  }
  const satkerEfektif = resolveSatkerEfektif(authUser, satker);

  const satuanKerjaRows = await prisma.pegawai.findMany({
    distinct: ["satuanKerja"],
    select: { satuanKerja: true },
    orderBy: { satuanKerja: "asc" },
  });
  const satuanKerjaList = resolveSatuanKerjaListUntukFilter(
    authUser,
    satuanKerjaRows.map((r) => r.satuanKerja)
  );

  const kalkulasiList = await prisma.uangLembur.findMany({
    where: {
      periodeBulan: bulan ? Number(bulan) : undefined,
      periodeTahun: tahun ? Number(tahun) : undefined,
      pegawai: satkerEfektif ? { satuanKerja: satkerEfektif } : undefined,
    },
    include: { pegawai: true },
    orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }, { pegawai: { nama: "asc" } }],
  });

  // Status baris dari PENGIRIMAN UNIT - pola yang sama persis dengan
  // src/app/tukin/page.tsx. Approval berjenjang dihapus 2026-09-02.
  const pengirimanPeriode = await prisma.pengirimanUnit.findMany({
    where: {
      OR: kalkulasiList.map((k) => ({
        satuanKerja: k.pegawai.satuanKerja,
        periodeBulan: k.periodeBulan,
        periodeTahun: k.periodeTahun,
      })),
    },
    select: { satuanKerja: true, periodeBulan: true, periodeTahun: true, status: true },
  });
  const petaKirim = new Map(
    pengirimanPeriode.map((p) => [`${p.satuanKerja}|${p.periodeBulan}|${p.periodeTahun}`, p.status])
  );

  return (
    <main className={HALAMAN}>
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Uang Lembur</h1>
      <p className="mt-1 text-sm text-muted">
        Pemantauan <strong>jam lembur</strong> yang terekam per pegawai per periode, dari e-Presensi dan koreksi
        manual di halaman Kalkulasi.
      </p>

      {/* Halaman ini SENGAJA tetap dibuka walau nominalnya ditahan. Jam
          lembur harus terus terpantau selama menunggu tata cara turun -
          halaman yang ikut ditutup membuat periode-periode ini lewat tanpa
          ada yang memeriksa, dan mengisinya ulang nanti berarti dari kertas. */}
      {!TAMPILKAN_NOMINAL_LEMBUR && (
        <div className="card mt-4 border-l-4 border-l-gold p-4">
          <p className="text-sm font-bold text-ink">Nominal rupiah belum ditampilkan</p>
          <p className="mt-1 text-sm text-muted">{ALASAN_UANG_LEMBUR_DISEMBUNYIKAN}</p>
        </div>
      )}

      <FilterBar satuanKerjaList={satuanKerjaList} bulan={bulan} tahun={tahun} satker={satkerEfektif} />

      <div className="mt-8 space-y-4">
        {kalkulasiList.length === 0 && (
          <p className="card p-6 text-sm text-muted">
            Belum ada hasil kalkulasi untuk filter ini. Coba ubah periode atau satuan kerjanya.
          </p>
        )}

        {kalkulasiList.map((kalkulasi) => {
          const keadaanKirim = keadaanKirimBaris(
            petaKirim.get(
              `${kalkulasi.pegawai.satuanKerja}|${kalkulasi.periodeBulan}|${kalkulasi.periodeTahun}`
            )
          );

          return (
            <div key={kalkulasi.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-ink">{kalkulasi.pegawai.nama}</p>
                  <p className="text-sm text-muted">
                    NIP {kalkulasi.pegawai.nip} - Periode {kalkulasi.periodeBulan}/{kalkulasi.periodeTahun}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {/* Yang ditahan RUPIAHNYA, bukan jamnya - jadi jam naik ke
                      tempat angka utama, bukan diganti tanda hubung. Kolom
                      kosong terbaca seperti data yang belum masuk, padahal
                      datanya ada dan justru itu yang perlu diperiksa. */}
                  <p className="font-mono font-bold text-ink">
                    {TAMPILKAN_NOMINAL_LEMBUR
                      ? formatRupiah(kalkulasi.totalUangLembur)
                      : `${kalkulasi.totalJamLembur} jam`}
                  </p>
                  <BadgeStatusKirim keadaan={keadaanKirim} />
                </div>
              </div>

              {kalkulasi.catatanAnomali && (
                <p className="mt-2 rounded-lg bg-gold-tint px-2.5 py-1.5 text-xs font-medium text-gold-deep">
                  Catatan validasi: {kalkulasi.catatanAnomali}
                </p>
              )}

            </div>
          );
        })}
      </div>
    </main>
  );
}
