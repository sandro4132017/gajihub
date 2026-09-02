import { prisma } from "../../lib/prisma";
import { FilterBar } from "../FilterBar";
import { BadgeStatusKirim, keadaanKirimBaris } from "../StatusKirimBaris";
import { getSessionAccount } from "../../auth/getSessionAccount";
import { canViewApproverDashboard } from "../../auth/permissions";
import { resolveSatkerEfektif, resolveSatuanKerjaListUntukFilter } from "../dashboardScope";
import { AksesDitolak } from "../AksesDitolak";
import { StatusBadge } from "../StatusBadge";
import { RincianUangMakan } from "../RincianUangMakan";
import { PratinjauAdkUangMakan } from "../ppabp/adk/PratinjauAdkUangMakan";
import { dataUangMakanHarian } from "../ppabp/adk/dataUangMakanHarian";

export const dynamic = "force-dynamic";

const formatRupiah = (nilai: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(nilai);

export default async function UangMakanPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string; satker?: string }>;
}) {
  const { bulan, tahun, satker } = await searchParams;

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

  const kalkulasiList = await prisma.uangMakan.findMany({
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

  // Bahan rincian "kenapa segini". Diambil sekali untuk seluruh daftar lalu
  // dipetakan per pegawai+periode - bukan satu query per kartu.
  const rekapSemua = await prisma.rekapPresensiPeriode.findMany({
    where: {
      OR: kalkulasiList.map((k) => ({
        pegawaiId: k.pegawaiId,
        periodeBulan: k.periodeBulan,
        periodeTahun: k.periodeTahun,
      })),
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

  // --- Pratinjau isi ADK Uang Makan ---------------------------------------
  //
  // HANYA kalau bulan DAN tahun sudah dipilih. Berkas ADK selalu milik satu
  // periode; tanpa periode yang pasti tidak ada yang bisa dipratinjau, dan
  // menebak "periode terbaru di daftar" akan menampilkan isi berkas yang bukan
  // yang sedang dilihat orangnya.
  //
  // Discope ke `satkerEfektif` supaya pratinjaunya tidak memperlihatkan unit
  // lain di halaman yang seluruh isinya sudah disaring - untuk PPABP nilainya
  // null, jadi dia tetap melihat seluruh isi berkas.
  const periodeAdk = bulan && tahun ? { bulan: Number(bulan), tahun: Number(tahun) } : null;
  const pratinjauAdk = periodeAdk
    ? await dataUangMakanHarian(periodeAdk.bulan, periodeAdk.tahun, satkerEfektif)
    : null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Uang Makan</h1>
      <p className="mt-1 text-sm text-muted">
        Hasil kalkulasi uang makan dari job scheduler, siap direview dan disetujui berjenjang.
      </p>

      <FilterBar satuanKerjaList={satuanKerjaList} bulan={bulan} tahun={tahun} satker={satkerEfektif} />

      {/* Pratinjau isi ADK - RUMAHNYA di sini, bukan di halaman Export ADK.
          Yang memeriksa isinya orang yang mengurus uang makan, dan dia bekerja
          di menu ini.

          TERTUTUP seperti di halaman Export ADK: gridnya 31 kolom kali 25
          baris, dan kalau terbuka sendiri ia mendorong daftar pegawai - isi
          utama halaman ini - keluar layar. Judul ringkasannya sudah menyebut
          jumlah baris & pegawai, jadi yang tidak perlu membukanya tetap dapat
          angkanya. */}
      {periodeAdk && pratinjauAdk && (
        <PratinjauAdkUangMakan
          data={pratinjauAdk}
          periodeBulan={periodeAdk.bulan}
          periodeTahun={periodeAdk.tahun}
          satuanKerja={satkerEfektif}
        />
      )}
      {!periodeAdk && (
        <p className="mt-4 text-xs text-muted">
          Pilih <strong>bulan dan tahun</strong> di filter untuk melihat pratinjau isi ADK Uang Makan periode itu.
        </p>
      )}

      <div className="mt-8 space-y-4">
        {kalkulasiList.length === 0 && (
          <p className="card p-6 text-sm text-muted">
            Tidak ada data untuk filter ini. Kalau memang belum ada data sama sekali, jalankan job scheduler dulu (npx tsx src/jobs/runUangMakanJobDemo.ts).
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
                  <p className="text-xs text-muted/80">
                    Dibayar {kalkulasi.jumlahHariDibayar} hari x {formatRupiah(kalkulasi.tarifHarian)} - hadir{" "}
                    {kalkulasi.jumlahHariHadir} dari {kalkulasi.jumlahHariKerja} hari kerja
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono font-bold text-ink">{formatRupiah(kalkulasi.totalUangMakan)}</p>
                  <BadgeStatusKirim keadaan={keadaanKirim} />
                </div>
              </div>

              {kalkulasi.catatanAnomali && (
                <p className="mt-2 rounded-lg bg-gold-tint px-2.5 py-1.5 text-xs font-medium text-gold-deep">
                  Catatan validasi: {kalkulasi.catatanAnomali}
                </p>
              )}

              {(() => {
                const rekap = petaRekap.get(
                  kunciRekap(kalkulasi.pegawaiId, kalkulasi.periodeBulan, kalkulasi.periodeTahun)
                );
                if (!rekap) {
                  // Jujur soal batasnya: rekap bulanan cuma ada untuk periode
                  // yang ditarik/diupload. Tanpa itu rinciannya memang tidak
                  // bisa direkonstruksi - dan itu dikatakan, bukan dikosongkan.
                  return (
                    <p className="mt-3 text-xs text-muted">
                      Rincian per status kehadiran tidak tersedia - rekap presensi periode ini belum ada di database.
                    </p>
                  );
                }
                return (
                  <RincianUangMakan
                    input={{ golongan: kalkulasi.pegawai.golongan, ...rekap }}
                    nilaiTersimpan={kalkulasi.totalUangMakan}
                    hariDibayarTersimpan={kalkulasi.jumlahHariDibayar}
                  />
                );
              })()}

            </div>
          );
        })}
      </div>
    </main>
  );
}
