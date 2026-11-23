import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canLihatPerintahLemburUnit, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../../components/feedback/AksesDitolak";
import { FilterBar } from "../../../components/forms/FilterBar";
import { HALAMAN } from "../../../components/layout/layoutHalaman";
import { SpklHarianUnit } from "../../../components/shared/SpklHarianUnit";
import { NAMA_BULAN } from "../../../lib/format/bulan";
import { berlakuMulaiSpkl } from "../../../lib/lembur/gerbangSpkl";
import { spklBerlakuDiPeriode } from "../../../lib/lembur/perintahPeriode";
import { muatDaftarSpklHarian, muatRekapSpklHarian } from "../../../lib/lembur/rekapSpklHarian";
import { tanggalIsoTeks } from "../../../lib/lembur/waktuTampil";
import { resolvePeriode, type Periode } from "../../periodeDefault";

export const dynamic = "force-dynamic";

const FORMAT_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Pemantauan Lembur untuk Pimpinan: SPKL harian unit SENDIRI, lihat-saja.
 *
 * Pengecualian keputusan user 2026-11-20 (Pimpinan biasanya read-only):
 * satker diambil dari tabel Pegawai lewat NIP akun, bukan dari query, dan
 * terkunci; Pimpinan tanpa baris Pegawai ditolak. Wewenangnya
 * `canLihatPerintahLemburUnit` dengan satker Pegawai akun. Tampilannya
 * komponen bersama SpklHarianUnit (sama dengan halaman Kasubag TU).
 */
export default async function PemantauanLemburPimpinanPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string; tanggal?: string; hal?: string; per?: string }>;
}) {
  const { bulan, tahun, tanggal, hal, per } = await searchParams;
  const akun = await getSessionAccount();
  if (!akun) return <AksesDitolak pesan="Kamu harus login dulu buat lihat halaman ini." />;
  const authUser: AuthUser = { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (authUser.role !== "PIMPINAN") {
    return <AksesDitolak pesan="Halaman ini khusus Pimpinan." />;
  }

  const pegawai = await prisma.pegawai.findUnique({
    where: { nip: authUser.nip },
    select: { satuanKerja: true },
  });
  const satker = pegawai?.satuanKerja?.trim() ?? "";
  if (!satker) {
    return (
      <AksesDitolak pesan="Data pegawai untuk akun ini belum ada, jadi unit yang dipantau belum diketahui." />
    );
  }
  if (!canLihatPerintahLemburUnit(authUser, satker, satker)) {
    return <AksesDitolak pesan="Peran kamu tidak berwenang melihat SPKL unit ini." />;
  }

  // Periode bawaan: bulan terakhir yang punya perintah (aturan resolvePeriode).
  const tanggalPerintah = await prisma.perintahLembur.findMany({
    where: { satuanKerja: satker, status: "TERKIRIM" },
    distinct: ["tanggal"],
    select: { tanggal: true },
  });
  const tersedia = new Map<string, Periode>();
  for (const t of tanggalPerintah) {
    const p = { bulan: t.tanggal.getUTCMonth() + 1, tahun: t.tanggal.getUTCFullYear() };
    tersedia.set(`${p.tahun}-${p.bulan}`, p);
  }
  const { bulan: periodeBulan, tahun: periodeTahun } = resolvePeriode(bulan, tahun, [...tersedia.values()]);
  const labelPeriode = `${NAMA_BULAN[periodeBulan - 1]} ${periodeTahun}`;

  const kepala = (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">Pemantauan Lembur</h1>
      <p className="mt-0.5 text-sm font-bold text-ink">
        {satker} &middot; {labelPeriode}
      </p>
      <p className="mt-2 text-sm text-biru">
        SPKL harian unit kamu, dibentuk otomatis dari semua perintah lembur yang terkirim hari itu.
      </p>
      <div className="card mt-4 p-4">
        <FilterBar
          tanpaKartu
          wajibPeriode
          wajibSatker
          satkerTerkunci
          satuanKerjaList={[satker]}
          bulan={String(periodeBulan)}
          tahun={String(periodeTahun)}
          satker={satker}
        />
      </div>
    </>
  );

  if (!spklBerlakuDiPeriode(satker, periodeBulan, periodeTahun)) {
    const mulai = berlakuMulaiSpkl(satker);
    return (
      <main className={HALAMAN}>
        {kepala}
        <div className="mt-4 border-l-4 border-l-gold bg-gold-tint px-4 py-3 text-sm text-ink-2" role="status">
          {mulai
            ? `SPKL di satuan kerja ini berlaku mulai ${tanggalIsoTeks(mulai)}, jadi belum ada SPKL untuk ${labelPeriode}.`
            : `SPKL belum diaktifkan untuk satuan kerja ${satker}.`}
        </div>
      </main>
    );
  }

  const tanggalDipilih = tanggal && FORMAT_TANGGAL.test(tanggal) ? tanggal : null;
  const [daftar, rekap] = await Promise.all([
    muatDaftarSpklHarian(prisma, satker, periodeBulan, periodeTahun),
    tanggalDipilih ? muatRekapSpklHarian(prisma, satker, tanggalDipilih) : Promise.resolve(null),
  ]);

  return (
    <main className={HALAMAN}>
      {kepala}
      <SpklHarianUnit
        basePath="/pimpinan/lembur"
        satuanKerja={satker}
        labelPeriode={labelPeriode}
        daftar={daftar}
        tanggalDipilih={tanggalDipilih}
        rekap={rekap}
        sekarang={new Date()}
        paramDasar={new URLSearchParams({ bulan: String(periodeBulan), tahun: String(periodeTahun) })}
        hal={hal}
        per={per}
      />
    </main>
  );
}
