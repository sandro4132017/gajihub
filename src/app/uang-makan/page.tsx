import { prisma } from "../../lib/prisma";
import { FilterBar } from "../../components/forms/FilterBar";
import { BadgeStatusKirim, keadaanKirimBaris } from "../../components/feedback/StatusKirimBaris";
import { getSessionAccount } from "../../auth/getSessionAccount";
import { canViewApproverDashboard } from "../../auth/permissions";
import { resolveSatkerEfektif, resolveSatuanKerjaListUntukFilter } from "../dashboardScope";
import { AksesDitolak } from "../../components/feedback/AksesDitolak";
import { TombolRincianUangMakan } from "./TombolRincianUangMakan";
import { PratinjauAdkUangMakan } from "../ppabp/adk/PratinjauAdkUangMakan";
import { dataUangMakanHarian } from "../ppabp/adk/dataUangMakanHarian";
import { HALAMAN } from "../../components/layout/layoutHalaman";
import { SumberAcuan } from "../../components/shared/SumberAcuan";
import { Paginasi, hitungPaginasi } from "../../components/tables/Paginasi";
import { NAMA_BULAN } from "../../lib/format/bulan";
import { periodePunyaUangMakan, resolvePeriode } from "../periodeDefault";
import Link from "next/link";

export const dynamic = "force-dynamic";

const formatRupiah = (nilai: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(nilai);

export default async function UangMakanPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string; satker?: string; hal?: string; per?: string }>;
}) {
  const { bulan, tahun, satker, hal, per } = await searchParams;

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

  const satkerWajib = authUser.role === "KASUBAG_TU" ? authUser.satuanKerja : null;
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

  // Satu periode teresolusi otomatis (konsisten dengan /tukin dan /uang-lembur)
  const { bulan: periodeBulan, tahun: periodeTahun } = resolvePeriode(
    bulan,
    tahun,
    await periodePunyaUangMakan()
  );

  const kalkulasiList = await prisma.uangMakan.findMany({
    where: {
      periodeBulan,
      periodeTahun,
      pegawai: satkerEfektif ? { satuanKerja: satkerEfektif } : undefined,
    },
    include: { pegawai: true },
    orderBy: { pegawai: { nama: "asc" } },
  });

  // Paginasi URL
  const paginasi = hitungPaginasi(kalkulasiList.length, hal, per);
  const halamanIni = kalkulasiList.slice(paginasi.mulai, paginasi.selesai);
  const paramPaginasi = new URLSearchParams();
  paramPaginasi.set("bulan", String(periodeBulan));
  paramPaginasi.set("tahun", String(periodeTahun));
  if (satkerEfektif) paramPaginasi.set("satker", satkerEfektif);

  const pengirimanPeriode = await prisma.pengirimanUnit.findMany({
    where: {
      OR:
        halamanIni.length > 0
          ? halamanIni.map((k) => ({
              satuanKerja: k.pegawai.satuanKerja,
              periodeBulan: k.periodeBulan,
              periodeTahun: k.periodeTahun,
            }))
          : [{ satuanKerja: "__none__", periodeBulan, periodeTahun }],
    },
    select: { satuanKerja: true, periodeBulan: true, periodeTahun: true, status: true },
  });
  const petaKirim = new Map(
    pengirimanPeriode.map((p) => [`${p.satuanKerja}|${p.periodeBulan}|${p.periodeTahun}`, p.status])
  );

  const rekapSemua = await prisma.rekapPresensiPeriode.findMany({
    where: {
      OR:
        halamanIni.length > 0
          ? halamanIni.map((k) => ({
              pegawaiId: k.pegawaiId,
              periodeBulan: k.periodeBulan,
              periodeTahun: k.periodeTahun,
            }))
          : [{ pegawaiId: "__none__", periodeBulan, periodeTahun }],
    },
    select: {
      pegawaiId: true,
      periodeBulan: true,
      periodeTahun: true,
      jumlahHariWfo: true,
      jumlahHariWfhWfa: true,
      jumlahHariDiklat: true,
      jumlahHariDinasLuar: true,
      jumlahHariCuti: true,
      jumlahHariAlpha: true,
      jumlahHariKerja: true,
    },
  });
  const kunciRekap = (pegawaiId: string, b: number, t: number) => `${pegawaiId}|${b}|${t}`;
  const petaRekap = new Map(
    rekapSemua.map((r) => [kunciRekap(r.pegawaiId, r.periodeBulan, r.periodeTahun), r])
  );

  const pratinjauAdk = await dataUangMakanHarian(periodeBulan, periodeTahun, satkerEfektif);

  return (
    <main className={HALAMAN}>
      <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">
        Uang Makan
        <SumberAcuan
          judulKeterangan="Tentang uang makan"
          keterangan={[
            "Uang makan diberikan berdasarkan kehadiran kerja per hari kerja efektif (WFO/WFH/WFA).",
            "Pegawai yang sedang melaksanakan perjalanan dinas luar, cuti, tugas belajar/diklat, atau alpha tidak diberikan uang makan.",
            "Besaran tarif harian ditentukan berdasarkan golongan ruang pegawai.",
            ...(satkerWajib ? [`Data yang ditampilkan hanya pegawai ${satkerWajib}.`] : []),
          ]}
          acuan={[
            {
              aturan: "SBM 2026 item 22.1 (PMK 32/2025)",
              tentang: "Tarif uang makan ASN per hari: Gol I & II Rp35.000, Gol III Rp37.000, Gol IV Rp41.000",
            },
            {
              aturan: "PMK Nomor 72/PMK.05/2016",
              tentang: "Ketentuan pembayaran uang makan bagi Pegawai Aparatur Sipil Negara",
            },
          ]}
          catatan="Angka di halaman ini adalah nilai tersimpan hasil kalkulasi bulanan. Berkas ADK Uang Makan memuat fakta tanggal kehadiran harian untuk dihitung oleh Web Gaji Kemenkeu."
        />
      </h1>
      <p className="mt-0.5 text-sm font-bold text-ink">
        Di luar Tunjangan Kinerja &middot; dibayar berdasarkan hari kehadiran
      </p>
      <p className="mt-2 text-sm text-biru">
        Pantau hasil kalkulasi uang makan per pegawai berdasarkan rekap kehadiran bulanan dan tarif SBM.
      </p>

      <FilterBar
        wajibPeriode
        satuanKerjaList={satuanKerjaList}
        bulan={String(periodeBulan)}
        tahun={String(periodeTahun)}
        satker={satkerEfektif}
      />

      <PratinjauAdkUangMakan
        data={pratinjauAdk}
        periodeBulan={periodeBulan}
        periodeTahun={periodeTahun}
        satuanKerja={satkerEfektif}
      />

      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold tracking-tight text-navy">
            Uang Makan {satkerEfektif ?? "Seluruh Satuan Kerja"}{" "}
            {NAMA_BULAN[periodeBulan - 1] ?? periodeBulan} {periodeTahun}
          </h2>
          <span className="text-xs text-muted">{kalkulasiList.length} pegawai</span>
        </div>

        <div className="card mt-3 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
                  <th className="col-nama px-3 py-2.5 text-left">Pegawai</th>
                  <th className="px-3 py-2.5">Golongan &amp; Tarif</th>
                  <th className="px-3 py-2.5">Hari Kerja</th>
                  <th className="px-3 py-2.5">Hari Hadir</th>
                  <th className="px-3 py-2.5">Hari Dibayar</th>
                  <th className="px-3 py-2.5">Nominal</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {halamanIni.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-muted">
                      Belum ada hasil kalkulasi untuk filter ini. Coba ubah periode atau satuan kerjanya.
                    </td>
                  </tr>
                )}
                {halamanIni.map((kalkulasi) => {
                  const keadaanKirim = keadaanKirimBaris(
                    petaKirim.get(
                      `${kalkulasi.pegawai.satuanKerja}|${kalkulasi.periodeBulan}|${kalkulasi.periodeTahun}`
                    )
                  );
                  const rekap = petaRekap.get(
                    kunciRekap(kalkulasi.pegawaiId, kalkulasi.periodeBulan, kalkulasi.periodeTahun)
                  );

                  return (
                    <tr key={kalkulasi.id} className="border-b border-line-2">
                      <td className="col-nama px-3 py-2.5">
                        <Link
                          href={`/tukin/presensi/${kalkulasi.pegawai.nip}?bulan=${kalkulasi.periodeBulan}&tahun=${kalkulasi.periodeTahun}`}
                          className="font-semibold text-teal-deep underline"
                        >
                          {kalkulasi.pegawai.nama}
                        </Link>
                        <span className="block font-mono text-xs text-muted">
                          {kalkulasi.pegawai.nip}
                        </span>
                        {!satkerEfektif && (
                          <span className="block text-[11px] text-muted">
                            {kalkulasi.pegawai.satuanKerja}
                          </span>
                        )}
                        {kalkulasi.catatanAnomali && (
                          <span className="mt-1 block max-w-md whitespace-normal rounded-lg bg-gold-tint px-2 py-1 text-[11px] font-medium text-gold-deep">
                            Catatan validasi: {kalkulasi.catatanAnomali}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-ink-2">
                        <span className="font-semibold text-ink">
                          {kalkulasi.pegawai.golongan || "-"}
                        </span>
                        <span className="block font-mono text-xs text-muted">
                          {formatRupiah(kalkulasi.tarifHarian)} / hari
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-ink-2">
                        {kalkulasi.jumlahHariKerja} hari
                      </td>
                      <td className="px-3 py-2.5 font-mono text-ink-2">
                        {kalkulasi.jumlahHariHadir} hari
                      </td>
                      <td className="px-3 py-2.5 font-mono font-semibold text-ink">
                        {kalkulasi.jumlahHariDibayar} hari
                      </td>
                      <td className="px-3 py-2.5 font-mono font-semibold text-ink">
                        {formatRupiah(kalkulasi.totalUangMakan)}
                      </td>
                      <td className="px-3 py-2.5">
                        <BadgeStatusKirim keadaan={keadaanKirim} />
                      </td>
                      <td className="px-3 py-2.5">
                        {rekap ? (
                          <TombolRincianUangMakan
                            nama={kalkulasi.pegawai.nama}
                            nip={kalkulasi.pegawai.nip}
                            satuanKerja={kalkulasi.pegawai.satuanKerja}
                            periodeBulan={kalkulasi.periodeBulan}
                            periodeTahun={kalkulasi.periodeTahun}
                            input={{ golongan: kalkulasi.pegawai.golongan, ...rekap }}
                            nilaiTersimpan={kalkulasi.totalUangMakan}
                            hariDibayarTersimpan={kalkulasi.jumlahHariDibayar}
                          />
                        ) : (
                          <span className="text-xs text-muted">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line-2 px-4 py-3 sm:px-6">
            <Paginasi
              basePath="/uang-makan"
              params={paramPaginasi}
              info={paginasi}
              totalBaris={kalkulasiList.length}
              labelBaris="pegawai"
            />
          </div>
        </div>
      </div>
    </main>
  );
}
