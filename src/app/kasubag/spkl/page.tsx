import { prisma } from "../../../lib/prisma";
import { canLihatPerintahLemburUnit } from "../../../auth/permissions";
import { AksesDitolak } from "../../../components/feedback/AksesDitolak";
import { FilterBar } from "../../../components/forms/FilterBar";
import { HALAMAN } from "../../../components/layout/layoutHalaman";
import { SpklHarianUnit } from "../../../components/shared/SpklHarianUnit";
import { NAMA_BULAN } from "../../../lib/format/bulan";
import { SPKL_AKTIF, berlakuMulaiSpkl } from "../../../lib/lembur/gerbangSpkl";
import { spklBerlakuDiPeriode } from "../../../lib/lembur/perintahPeriode";
import { muatDaftarSpklHarianDenganUnik, muatRekapSpklHarian } from "../../../lib/lembur/rekapSpklHarian";
import { tanggalIsoTeks } from "../../../lib/lembur/waktuTampil";
import { satkerTerkunciUntukAkun } from "../../dashboardScope";
import { resolvePeriode, type Periode } from "../../periodeDefault";
import { ambilAksesUnit } from "../access";

export const dynamic = "force-dynamic";

const FORMAT_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

/**
 * SPKL Harian unit: satu dokumen per tanggal yang memuat semua perintah lembur
 * TERKIRIM hari itu dari semua Kepala Tim. Dibentuk otomatis, tanpa tanda
 * tangan elektronik (sementara; lihat lib/lembur/sakelarTteLembur.ts). Terkunci
 * tepat pukul 15.00 WIB (berbasis waktu, tanpa job); PDF-nya dibentuk saat
 * diunduh lewat /berkas/spkl-harian.
 *
 * Menu sidebar: grup "Lembur" > "SPKL Harian" (AppShell), sehingga jumlah entri
 * menu Kasubag TU tidak bertambah. Tampilannya komponen bersama
 * components/shared/SpklHarianUnit.tsx (dipakai juga Pimpinan).
 * Satker Kasubag TU dikunci dari akunnya (ambilAksesUnit); ?satker= hanya
 * dibaca untuk PPABP/ADMIN yang lihat-saja.
 */
export default async function SpklHarianPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string; satker?: string; tanggal?: string; hal?: string; per?: string }>;
}) {
  const { bulan, tahun, satker, tanggal, hal, per } = await searchParams;
  const akses = await ambilAksesUnit(satker);
  if (!akses) {
    return <AksesDitolak pesan="Kamu harus login dulu buat lihat halaman ini." />;
  }
  const { authUser, satkerEfektif } = akses;
  const terkunci = satkerTerkunciUntukAkun(authUser);
  // Satker yang SPKL-nya sudah diaktifkan; sumber tunggalnya gerbangSpkl.
  const satuanKerjaList = terkunci ? (satkerEfektif ? [satkerEfektif] : []) : SPKL_AKTIF.map((a) => a.satuanKerja);

  // Wewenang SEBELUM cabang "satker belum dipilih": role tanpa hak lihat tidak
  // boleh sampai ke FilterBar. Tanpa satker terpilih, cukup berhak atas salah
  // satu satker yang ditawarkan.
  const berhakLihat = satkerEfektif
    ? canLihatPerintahLemburUnit(authUser, satkerEfektif)
    : satuanKerjaList.some((s) => canLihatPerintahLemburUnit(authUser, s));
  if (!berhakLihat) {
    return <AksesDitolak pesan="Peran kamu tidak berwenang melihat SPKL unit ini." />;
  }

  if (!satkerEfektif) {
    return (
      <main className={HALAMAN}>
        <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">SPKL Harian</h1>
        <p className="mt-1 text-xs text-muted sm:text-sm">Pilih satuan kerja dan periode dulu.</p>
        <FilterBar wajibPeriode wajibSatker satuanKerjaList={satuanKerjaList} bulan={bulan} tahun={tahun} satker={satker} />
      </main>
    );
  }

  // Periode bawaan: bulan terakhir yang punya perintah (bulan berjalan dilewati,
  // aturan resolvePeriode). Satu query kecil: tanggal berbeda perintah satker ini.
  const tanggalPerintah = await prisma.perintahLembur.findMany({
    where: { satuanKerja: satkerEfektif, status: "TERKIRIM" },
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
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">SPKL Harian</h1>
        <span className="chip chip-navy text-xs font-semibold">{satkerEfektif}</span>
      </div>
      <p className="mt-1 text-xs text-muted sm:text-sm">
        SPKL harian terbentuk otomatis berdasarkan perintah lembur yang diterbitkan pada tanggal terkait.
      </p>
      <div className="card mt-4 p-4">
        <FilterBar
          tanpaKartu
          wajibPeriode
          wajibSatker
          satkerTerkunci={terkunci}
          satuanKerjaList={satuanKerjaList}
          bulan={String(periodeBulan)}
          tahun={String(periodeTahun)}
          satker={satkerEfektif}
        />
      </div>
    </>
  );

  // Di luar gerbang pilot: sebutkan sebabnya, jangan tampilkan dokumen kosong.
  if (!spklBerlakuDiPeriode(satkerEfektif, periodeBulan, periodeTahun)) {
    const mulai = berlakuMulaiSpkl(satkerEfektif);
    return (
      <main className={HALAMAN}>
        {kepala}
        <div className="mt-4 border-l-4 border-l-gold bg-gold-tint px-4 py-3 text-sm text-ink-2" role="status">
          {mulai
            ? `SPKL di satuan kerja ini berlaku mulai ${tanggalIsoTeks(mulai)}, jadi belum ada SPKL untuk ${labelPeriode}.`
            : `SPKL belum diaktifkan untuk satuan kerja ${satkerEfektif}.`}
        </div>
      </main>
    );
  }

  const tanggalDipilih = tanggal && FORMAT_TANGGAL.test(tanggal) ? tanggal : null;
  const [{ daftar, jumlahPegawaiUnik }, rekap] = await Promise.all([
    muatDaftarSpklHarianDenganUnik(prisma, satkerEfektif, periodeBulan, periodeTahun),
    tanggalDipilih ? muatRekapSpklHarian(prisma, satkerEfektif, tanggalDipilih) : Promise.resolve(null),
  ]);

  const sekarang = new Date();
  const paramDasar = new URLSearchParams({
    bulan: String(periodeBulan),
    tahun: String(periodeTahun),
    satker: satkerEfektif,
  });

  return (
    <main className={HALAMAN}>
      {kepala}
      <SpklHarianUnit
        basePath="/kasubag/spkl"
        satuanKerja={satkerEfektif}
        labelPeriode={labelPeriode}
        daftar={daftar}
        jumlahPegawaiUnik={jumlahPegawaiUnik}
        tanggalDipilih={tanggalDipilih}
        rekap={rekap}
        sekarang={sekarang}
        paramDasar={paramDasar}
        hal={hal}
        per={per}
      />
    </main>
  );
}
