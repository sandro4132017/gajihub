import { prisma } from "../../lib/prisma";
import { FilterBar } from "../FilterBar";
import { BadgeStatusKirim, keadaanKirimBaris } from "../StatusKirimBaris";
import { getSessionAccount } from "../../auth/getSessionAccount";
import { canViewApproverDashboard, canAjukanKalkulasiTukinMassalUnit } from "../../auth/permissions";
import { resolveSatkerEfektif, resolveSatuanKerjaListUntukFilter } from "../dashboardScope";
import { AksesDitolak } from "../AksesDitolak";
import { StatusBadge } from "../StatusBadge";
import { SumberDataTukin } from "./SumberDataTukin";
import { BadgePejabatEselon } from "../BadgePejabatEselon";

export const dynamic = "force-dynamic";

const formatRupiah = (nilai: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(nilai);

export default async function TukinPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string; satker?: string }>;
}) {
  const { bulan, tahun, satker } = await searchParams;

  // Guard eksplisit: PEGAWAI diarahkan ke dashboard self-service sendiri
  // (/saya), bukan halaman approver ini - lihat canViewApproverDashboard +
  // role matrix di CLAUDE.md. TODO(confirm): ADMIN SEKARANG BOLEH lihat
  // halaman ini (privilege penuh, lihat enum Role di schema.prisma) - ini
  // BUKAN desain final untuk production.
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

  // KASUBAG_TU cuma boleh lihat rekap unit kerjanya sendiri (role matrix) -
  // paksa filter ke unitnya, abaikan ?satker= dari query kalau ada.
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

  const kalkulasiList = await prisma.tukinCalculation.findMany({
    where: {
      periodeBulan: bulan ? Number(bulan) : undefined,
      periodeTahun: tahun ? Number(tahun) : undefined,
      pegawai: satkerEfektif ? { satuanKerja: satkerEfektif } : undefined,
    },
    include: { pegawai: true },
    orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }, { pegawai: { nama: "asc" } }],
  });

  // Status baris sekarang datang dari PENGIRIMAN UNIT, bukan dari
  // ApprovalLog per baris. Approval berjenjang dihapus 2026-09-02 - yang
  // menggantikannya satu keputusan Kasubag TU per unit per periode, dan
  // keputusan itulah yang juga menentukan isi berkas ADK.
  //
  // Diambil per PERIODE YANG DITAMPILKAN, bukan per baris: satu query untuk
  // seluruh halaman, dan hasilnya tidak berubah dari baris ke baris dalam
  // satu unit.
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

  // --- Status kedua komponen pembentuk Tukin untuk periode yang difilter ---
  // Ditaruh di halaman yang sama supaya jelas kenapa seorang pegawai belum
  // punya kalkulasi: presensinya belum ada, predikatnya belum ada, atau
  // dua-duanya. Sebelumnya kedua sumber ini ada di menu yang terpisah-pisah.
  const periodeAktif =
    bulan && tahun ? { periodeBulan: Number(bulan), periodeTahun: Number(tahun) } : null;
  const filterPegawaiSatker = satkerEfektif ? { pegawai: { satuanKerja: satkerEfektif } } : {};

  const [jumlahPegawai, jumlahPresensi, jumlahPredikat] = periodeAktif
    ? await Promise.all([
        // Penyebut "X / Y pegawai" pada panel sumber data: hanya yang AKTIF,
        // supaya cakupannya tidak terlihat lebih buruk dari kenyataan gara-gara
        // pensiunan yang memang tidak akan pernah punya presensi/predikat baru.
        prisma.pegawai.count({
          where: { statusPegawai: "AKTIF", ...(satkerEfektif ? { satuanKerja: satkerEfektif } : {}) },
        }),
        prisma.rekapPresensiPeriode.count({ where: { ...periodeAktif, ...filterPegawaiSatker } }),
        prisma.predikatKinerja.count({ where: { ...periodeAktif, ...filterPegawaiSatker } }),
      ])
    : [0, 0, 0];

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Dashboard Tukin</h1>
      <p className="mt-1 text-sm text-muted">
        Satu tempat untuk kedua komponen pembentuk Tunjangan Kinerja: <strong>kehadiran 30%</strong> dan{" "}
        <strong>capaian kinerja 70%</strong> (Permenaker 15/2024 Pasal 5 &amp; 18), beserta hasil kalkulasi dan
        approval berjenjangnya.
      </p>

      <FilterBar satuanKerjaList={satuanKerjaList} bulan={bulan} tahun={tahun} satker={satkerEfektif} />

      <SumberDataTukin
        periodeAktif={periodeAktif}
        jumlahPegawai={jumlahPegawai}
        jumlahPresensi={jumlahPresensi}
        jumlahPredikat={jumlahPredikat}
        bolehHitung={canAjukanKalkulasiTukinMassalUnit(authUser, satkerEfektif ?? "")}
        satkerEfektif={satkerEfektif}
      />

      <div className="mt-8 space-y-4">
        {kalkulasiList.length === 0 && (
          <p className="card p-6 text-sm text-muted">
            Tidak ada data untuk filter ini. Kalau memang belum ada data sama sekali, jalankan job scheduler dulu (npx tsx src/jobs/runTukinJobDemo.ts).
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
                  {/* <div>, BUKAN <p>: badge-nya memakai <details>, dan itu
                      flow content - browser akan menutup paksa <p> sebelum
                      elemen itu, sehingga DOM hasil parsing beda dari pohon
                      React (hydration mismatch). Lihat BadgePejabatEselon. */}
                  <div className="font-bold text-ink">
                    {kalkulasi.pegawai.nama}
                    <BadgePejabatEselon kelasJabatan={kalkulasi.pegawai.kelasJabatan} />
                  </div>
                  <p className="text-sm text-muted">
                    NIP {kalkulasi.pegawai.nip} - Periode {kalkulasi.periodeBulan}/{kalkulasi.periodeTahun}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono font-bold text-ink">{formatRupiah(kalkulasi.tukinBersih)}</p>
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
