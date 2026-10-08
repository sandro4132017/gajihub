import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { canAjukanKalkulasiTukinMassalUnit, canExportRekapUnit } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { FilterBar } from "../../FilterBar";
import { InfoIkon } from "../../InfoIkon";
import { resolveSatuanKerjaListUntukFilter } from "../../dashboardScope";
import { NAMA_BULAN } from "../../bulan";
import { periodePunyaPredikatKinerja, resolvePeriode } from "../../periodeDefault";
import { ambilAksesUnit } from "../access";
import { TUKIN_POKOK_PER_KELAS_JABATAN } from "../../../business-logic/tarifTukinPokok";
import { TARIF_POTONGAN_PASAL_13 } from "../../../business-logic/tukin";
import { rincianTukinTersimpan } from "../../../business-logic/rincianTukinTersimpan";
import { selCuti, jenisKepegawaian } from "../../../business-logic/rekapUnitExcel";
import { LABEL_PREDIKAT } from "../../tukin/predikat-kinerja/predikat";
import { KalkulasiMassalForm } from "./KalkulasiMassalForm";
import { PanelKesiapan } from "./PanelKesiapan";
import { BantuanRincianTukin } from "./BantuanRincianTukin";
import { SumberAcuan } from "../../SumberAcuan";
import { ambilSumberData, keSumberAcuan } from "../../sumberData";
import { periksaKesiapanKalkulasi } from "../../../business-logic/kesiapanKalkulasi";
import { KoreksiLemburForm } from "./KoreksiLemburForm";
import { Paginasi, hitungPaginasi } from "../../Paginasi";
import { BadgePejabatEselon } from "../../BadgePejabatEselon";
import { TAMPILKAN_NOMINAL_LEMBUR } from "../../tampilUangLembur";
import { lemburTeks } from "../../presensiTampilan";
import { PengecualianForm, BatalPengecualianForm } from "./PengecualianForm";
import {
  alasanDariKode,
  petunjukKemungkinanKeluar,
} from "../../../business-logic/pengecualianPegawai";
import {
  cekBolehKirim,
  statusUnit,
  tabelBelumDiverifikasi,
  TABEL_WAJIB_DIVERIFIKASI,
  type JenisTabelKalkulasi,
} from "../../../business-logic/pengirimanUnit";
import { KirimRekapForm } from "../kirim/KirimRekapForm";
import { VerifikasiTabelPanel } from "../kirim/VerifikasiTabelPanel";
import { TabelPemeriksaanLembur } from "./TabelPemeriksaanLembur";
import { TabelPerubahanPegawai } from "./TabelPerubahanPegawai";
import { PanelTteSptjm } from "./PanelTteSptjm";
import { HALAMAN } from "../../layoutHalaman";
import { muatHariLiburPeriode } from "../../../lib/hariLibur";

export const dynamic = "force-dynamic";

const formatRupiah = (nilai: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(nilai);

const formatPersen = (nilai: number, desimal = 3) =>
  new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: desimal }).format(nilai) + "%";

const TARIF_UANG_LEMBUR_DEFAULT = 25_000; // TODO(confirm): sama seperti seedSimulasi.ts, bukan SBM resmi

function uraianPotongan(rekap: {
  totalMenitTerlambat: number;
  totalMenitPulangCepat: number;
  totalMenitMeninggalkanKantor: number;
  jumlahTidakPresensi: number;
  jumlahHariAlpha: number;
  jumlahTidakIkutUpacara: number;
}): string {
  const t = TARIF_POTONGAN_PASAL_13;
  const persen = (v: number) => formatPersen(v * 100, 2);
  // Tiga pelanggaran bertarif per menit di Pasal 13 ayat (3) - tidak lebih.
  const menit =
    rekap.totalMenitTerlambat + rekap.totalMenitPulangCepat + rekap.totalMenitMeninggalkanKantor;

  const bagian: string[] = [];
  if (menit > 0) bagian.push(`${menit} menit x 0,01% = ${persen(menit * t.perMenit)}`);
  if (rekap.jumlahTidakPresensi > 0)
    bagian.push(
      `${rekap.jumlahTidakPresensi} lupa absen x 1% = ${persen(rekap.jumlahTidakPresensi * t.perKejadianTidakPresensi)}`
    );
  if (rekap.jumlahHariAlpha > 0)
    bagian.push(`${rekap.jumlahHariAlpha} hari alpha x 3% = ${persen(rekap.jumlahHariAlpha * t.perHariAlpha)}`);
  if (rekap.jumlahTidakIkutUpacara > 0)
    bagian.push(
      `${rekap.jumlahTidakIkutUpacara}x tidak upacara x 3% = ${persen(rekap.jumlahTidakIkutUpacara * t.perKejadianTidakUpacara)}`
    );

  if (bagian.length === 0) return "Tidak ada pelanggaran Pasal 13 pada rekap presensi periode ini.";
  return `Dari rekap presensi saat ini: ${bagian.join("  +  ")}`;
}

function NamaPegawai({
  nama,
  nip,
  periodeBulan,
  periodeTahun,
  satuanKerja,
  kelasJabatan,
}: {
  nama: string;
  nip: string;
  periodeBulan: number;
  periodeTahun: number;
  satuanKerja?: string;
  kelasJabatan?: number | null;
}) {
  const q =
    `?bulan=${periodeBulan}&tahun=${periodeTahun}&dari=kalkulasi` +
    (satuanKerja ? `&satker=${encodeURIComponent(satuanKerja)}` : "");
  return (
    <>
      <Link
        href={`/tukin/presensi/${nip}${q}`}
        className="font-semibold text-teal-deep underline"
        title={`Lihat rincian presensi harian ${nama}`}
      >
        {nama}
      </Link>
      <BadgePejabatEselon kelasJabatan={kelasJabatan} />
    </>
  );
}

function BelumAda({ judul }: { judul: string }) {
  return (
    <span className="text-muted/60" title={judul}>
      -
    </span>
  );
}

export default async function KalkulasiUnitPage({
  searchParams,
}: {
  searchParams: Promise<{
    bulan?: string;
    tahun?: string;
    satker?: string;
    rincian?: string;
    hal?: string;
    per?: string;
  }>;
}) {
  const { bulan, tahun, satker, rincian, hal, per } = await searchParams;
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
      <main className={HALAMAN}>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">Kalkulasi Unit</h1>
        <p className="mt-2 text-sm text-biru">Pilih satuan kerja dan periode dulu.</p>
        <FilterBar
          wajibPeriode
          wajibSatker
          satuanKerjaList={satuanKerjaList}
          bulan={bulan}
          tahun={tahun}
          satker={satker}
        />
      </main>
    );
  }

  if (!canAjukanKalkulasiTukinMassalUnit(authUser, satkerEfektif)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang mengelola kalkulasi unit ini." />;
  }

  // Dicek terpisah, tidak menumpang izin di atas: mengunduh rekap dan
  // MENJALANKAN kalkulasi massal dua kewenangan yang berbeda, dan kalau suatu
  // saat salah satunya digeser, yang satunya tidak boleh ikut bergeser diam-diam.
  const bolehExportRekap = canExportRekapUnit(authUser, satkerEfektif);

  const { bulan: periodeBulan, tahun: periodeTahun } = resolvePeriode(
    bulan,
    tahun,
    await periodePunyaPredikatKinerja(satkerEfektif)
  );

  // Keadaan pengiriman unit periode ini. Menentukan dua hal sekaligus:
  // spanduk di atas halaman, dan boleh-tidaknya tombol Kirim muncul.
  const barisPengiriman = await prisma.pengirimanUnit.findUnique({
    where: {
      satuanKerja_periodeBulan_periodeTahun: {
        satuanKerja: satkerEfektif,
        periodeBulan,
        periodeTahun,
      },
    },
  });
  const kirimStatus = statusUnit(barisPengiriman);

  // Centang "sudah saya periksa" per tabel. Dibaca dari database - sumber yang
  // SAMA dengan yang ditagih server saat Kirim ditekan, supaya tombol yang
  // menyala di layar tidak pernah berbeda dari keputusan server.
  const verifikasiTabel = await prisma.verifikasiTabelUnit.findMany({
    where: { satuanKerja: satkerEfektif, periodeBulan, periodeTahun },
    include: { diverifikasiOleh: { select: { nama: true } } },
  });
  const tabelDiverifikasi = verifikasiTabel.map((v) => v.jenisTabel as JenisTabelKalkulasi);


  // HANYA PEGAWAI AKTIF - pensiun/berhenti/nonaktif tidak muncul di halaman
  // ini sama sekali (keputusan user 2026-09-02).
  //
  // Disaring DI QUERY, bukan di tampilan. Kalau disaring belakangan, tiap
  // hitungan turunan (pembagi kelengkapan, paginasi, jumlah baris di panel
  // Kirim) harus ingat menyaring lagi sendiri-sendiri - dan yang lupa satu
  // saja akan memunculkan mereka kembali lewat pintu lain.
  const pegawaiList = await prisma.pegawai.findMany({
    where: { satuanKerja: satkerEfektif, statusPegawai: "AKTIF" },
    orderBy: { nama: "asc" },
    include: {
      tukinCalc: { where: { periodeBulan, periodeTahun } },
      uangMakan: { where: { periodeBulan, periodeTahun } },
      uangLembur: { where: { periodeBulan, periodeTahun } },
      rekapPresensi: { where: { periodeBulan, periodeTahun } },
      predikatKinerja: { where: { periodeBulan, periodeTahun } },
    },
  });

  // Pegawai yang DIKECUALIKAN dari periode ini - masih tercatat di unit,
  // tapi sudah dinyatakan tidak seharusnya ikut dihitung. Lihat
  // src/business-logic/pengecualianPegawai.ts.
  const pengecualian = await prisma.pengecualianPegawai.findMany({
    where: {
      periodeBulan,
      periodeTahun,
      pegawai: { satuanKerja: satkerEfektif },
    },
    include: { pegawai: { select: { id: true, nama: true, nip: true } } },
  });
  const setDikecualikan = new Set(pengecualian.map((p) => p.pegawaiId));

  // INI PEMBAGI SELURUH KELENGKAPAN. Yang dikecualikan keluar dari sini, jadi
  // dia tidak lagi mengunci unitnya - itulah seluruh gunanya fitur ini.
  //
  // Mereka TETAP tampil di tabel (dengan tanda), supaya tidak ada orang yang
  // lenyap dari layar tanpa jejak.
  const pegawaiAktif = pegawaiList.filter((p) => !setDikecualikan.has(p.id));

  // Jumlah jam lembur HARIAN per pegawai - bahan pemeriksaan silang di tabel
  // Jam Lembur di bawah.
  //
  // KENAPA DIADU. Rincian harian yang mengalir ke berkas ADK (formatnya per
  // tanggal) dan total bulanan yang jadi dasar rupiah adalah DUA angka
  // tersimpan yang berbeda. Seharusnya selalu sama - pembulatan lembur terjadi
  // per hari di hulu - dan kalau berbeda berarti rekapnya dihitung sebelum
  // presensinya berubah. Yang dibayar Web Gaji adalah jam di berkas, bukan
  // angka yang tersimpan, jadi selisihnya wajib terlihat SEBELUM dikirim.
  const awalPeriodeLembur = new Date(Date.UTC(periodeTahun, periodeBulan - 1, 1));
  const akhirPeriodeLembur = new Date(Date.UTC(periodeTahun, periodeBulan, 1));

  const [lemburHarianPerPegawai, koreksiLemburRows, hariLiburMap] = await Promise.all([
    prisma.presensiHarian.groupBy({
      by: ["pegawaiId"],
      where: {
        pegawaiId: { in: pegawaiList.map((p) => p.id) },
        tanggal: {
          gte: awalPeriodeLembur,
          lt: akhirPeriodeLembur,
        },
        jamLembur: { gt: 0 },
      },
      _sum: { jamLembur: true },
    }),
    prisma.koreksiPresensiHarian.findMany({
      where: {
        pegawaiId: { in: pegawaiList.map((p) => p.id) },
        tanggal: {
          gte: awalPeriodeLembur,
          lt: akhirPeriodeLembur,
        },
        jamLembur: { not: null },
      },
      select: {
        id: true,
        pegawaiId: true,
        tanggal: true,
        jamLembur: true,
        alasan: true,
        dikoreksiPada: true,
        dikoreksiOleh: { select: { nama: true } },
      },
      orderBy: { tanggal: "asc" },
    }),
    muatHariLiburPeriode(periodeBulan, periodeTahun),
  ]);

  const presensiLemburRows = await prisma.presensiHarian.findMany({
    where: {
      pegawaiId: { in: pegawaiList.map((p) => p.id) },
      tanggal: {
        gte: awalPeriodeLembur,
        lt: akhirPeriodeLembur,
      },
      OR: [
        { jamLembur: { gt: 0 } },
        { tanggal: { in: koreksiLemburRows.map((k) => k.tanggal) } },
      ],
    },
    select: {
      pegawaiId: true,
      tanggal: true,
      jamMasuk: true,
      jamKeluar: true,
      jamLembur: true,
    },
    orderBy: { tanggal: "asc" },
  });

  const petaLemburHarian = new Map(
    lemburHarianPerPegawai.map((g) => [g.pegawaiId, { jam: g._sum.jamLembur ?? 0 }])
  );

  const petaPresensiPerPegawai = new Map<string, typeof presensiLemburRows>();
  for (const pr of presensiLemburRows) {
    const list = petaPresensiPerPegawai.get(pr.pegawaiId) ?? [];
    list.push(pr);
    petaPresensiPerPegawai.set(pr.pegawaiId, list);
  }

  const petaKoreksiLemburPerPegawai = new Map<string, typeof koreksiLemburRows>();
  for (const kr of koreksiLemburRows) {
    const list = petaKoreksiLemburPerPegawai.get(kr.pegawaiId) ?? [];
    list.push(kr);
    petaKoreksiLemburPerPegawai.set(kr.pegawaiId, list);
  }

  const NAMA_HARI_LEMBUR = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const jamTeksLembur = (d: Date | null | undefined) =>
    d ? `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}` : null;
  // Berapa hari presensi tiap orang pernah dikoreksi manual pada periode ini.
  //
  // Bukan cacat data - justru sebaliknya. Ditampilkan karena yang memeriksa
  // berhak tahu baris mana yang sudah tidak apa adanya dari e-Presensi,
  // terutama kalau nanti angkanya dipersoalkan pegawainya.
  const koreksiPeriode = await prisma.koreksiPresensiHarian.groupBy({
    by: ["pegawaiId"],
    where: {
      pegawaiId: { in: pegawaiAktif.map((p) => p.id) },
      tanggal: {
        gte: new Date(Date.UTC(periodeTahun, periodeBulan - 1, 1)),
        lt: new Date(Date.UTC(periodeTahun, periodeBulan, 1)),
      },
    },
    _count: { _all: true },
  });
  const petaKoreksi = new Map(koreksiPeriode.map((k) => [k.pegawaiId, k._count._all]));

  // DAFTAR PERUBAHAN DATA KEPEGAWAIAN unit ini.
  //
  // Jendelanya mulai dari AWAL BULAN PERIODE, bukan dari tanggal kalkulasi:
  // perubahan yang terjadi di tengah bulan - sebelum angkanya dihitung - tetap
  // perlu dilihat orang yang memeriksa, karena itulah yang menjelaskan kenapa
  // angka bulan ini berbeda dari bulan lalu. Yang datang SESUDAH kalkulasi
  // ditandai tersendiri di tabelnya.
  //
  // Batas atasnya sengaja TIDAK dipasang. Perubahan yang terdeteksi bulan
  // depan pun masih bisa membatalkan angka periode ini selama rekapnya belum
  // dikirim, dan memotongnya di akhir bulan justru menyembunyikan persis
  // kasus yang paling perlu terlihat.
  const perubahanPegawai = await prisma.perubahanDataPegawai.findMany({
    where: {
      terdeteksiPada: { gte: new Date(Date.UTC(periodeTahun, periodeBulan - 1, 1)) },
      // OR, bukan satu kolom: orang yang PINDAH KELUAR tercatat dengan unit
      // ini di `satuanKerjaDari` dan unit lain di `satuanKerjaKe`. Kalau cuma
      // salah satu yang diperiksa, salah satu unit tidak pernah tahu.
      OR: [{ satuanKerjaDari: satkerEfektif }, { satuanKerjaKe: satkerEfektif }],
    },
    orderBy: { terdeteksiPada: "desc" },
  });
  // Perubahan TERBARU per NIP - dipakai menandai kalkulasi yang sudah basi.
  // Cukup yang terbaru: satu perubahan saja sudah membuat angkanya harus
  // dihitung ulang, dan menyimpan semuanya tidak menambah jawaban apa pun.
  const petaPerubahanTerbaru = new Map<string, Date>();
  for (const c of perubahanPegawai) {
    const ada = petaPerubahanTerbaru.get(c.nip);
    if (!ada || c.terdeteksiPada > ada) petaPerubahanTerbaru.set(c.nip, c.terdeteksiPada);
  }
  // Kapan kalkulasi tiap pegawai dibekukan - pembanding untuk menandai
  // perubahan yang datang terlambat. Pegawai yang belum punya kalkulasi tidak
  // masuk peta, dan barisnya memang tidak perlu ditandai: tidak ada angka
  // basi kalau belum ada angka sama sekali.
  const petaKalkulasiPerNip = new Map<string, Date>(
    pegawaiAktif.flatMap((p) => (p.tukinCalc[0] ? [[p.nip, p.tukinCalc[0].calculatedAt] as const] : []))
  );

  const sumberData = await ambilSumberData({
    satuanKerja: satkerEfektif,
    periodeBulan,
    periodeTahun,
  });

  const dokumenTteTerbaru = await prisma.dokumenTte.findFirst({
    where: {
      satuanKerja: satkerEfektif,
      periodeBulan,
      periodeTahun,
      jenisDokumen: "SPTJM_LEMBUR",
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      nomorDokumen: true,
      fileSignedPath: true,
      signedAt: true,
      penandatanganNama: true,
    },
  });

  // Pemeriksaan kelengkapan SEBELUM tombol Hitung. Yang dikecualikan sudah
  // keluar lewat `pegawaiAktif` di atas - lihat alasannya di
  // src/business-logic/kesiapanKalkulasi.ts.
  const kesiapan = periksaKesiapanKalkulasi(
    pegawaiAktif.map((p) => {
      const r = p.rekapPresensi[0];
      return {
        nip: p.nip,
        nama: p.nama,
        kelasJabatan: p.kelasJabatan,
        adaPredikat: p.predikatKinerja.length > 0,
        jumlahKoreksi: petaKoreksi.get(p.id) ?? 0,
        rekap: r
          ? {
              jumlahHariKerja: r.jumlahHariKerja,
              jumlahHariHadir: r.jumlahHariHadir,
              jumlahHariCuti: r.jumlahHariCuti,
              jumlahHariDinasLuar: r.jumlahHariDinasLuar,
              jumlahHariDiklat: r.jumlahHariDiklat,
              jumlahHariTugasBelajar: r.jumlahHariTugasBelajar,
              jenisCutiAktif: r.jenisCutiAktif,
              bulanCutiKeberapa: r.bulanCutiKeberapa,
            }
          : null,
      };
    })
  );

  const belumPunyaPredikat = pegawaiAktif.filter(
    (p) => p.predikatKinerja.length === 0,
  );
  const belumPunyaPresensi = pegawaiAktif.filter(
    (p) => p.rekapPresensi.length === 0,
  );

  // Angka Tukin yang tampil di tabel adalah nilai TERSIMPAN, dibekukan saat
  // tombol Hitung ditekan. Kalau presensi atau predikatnya berubah setelah
  // itu (mis. presensi ditarik ulang karena ada koreksi jam), angkanya
  // menjadi basi tanpa tanda apa pun - dan orang menyimpulkan koreksinya
  // gagal. Kejadian nyata waktu fitur koreksi jam baru dipakai: rekap sudah
  // 0 pelanggaran, tapi Tukin tersimpan masih memuat potongan 1%.
  const perluHitungUlang = (p: (typeof pegawaiAktif)[number]): string | null => {
    const t = p.tukinCalc[0];
    if (!t) return null;
    const sebab: string[] = [];

    // SUMBER YANG HILANG DICEK LEBIH DULU, dan ini bukan kelengkapan.
    //
    // Versi pertama cuma membandingkan CAP WAKTU baris yang masih ada. Kalau
    // predikatnya DIHAPUS, `p.predikatKinerja[0]` jadi undefined - tidak ada
    // yang dibandingkan, jadi tidak ada sebab yang dilaporkan, sementara
    // baris Tukin-nya tetap berdiri dengan angka hasil hitungan dari predikat
    // yang sudah tidak ada.
    //
    // Terjadi betulan 2026-09-02: predikat CHAERUNNISA dihapus, Tukin-nya
    // Rp 2.415.155 tetap tersimpan, dan yang muncul di layar cuma "presensi
    // berubah" - sebab yang benar tidak pernah disebut.
    if (p.predikatKinerja.length === 0) sebab.push("predikat kinerja dihapus");
    if (p.rekapPresensi.length === 0) sebab.push("rekap presensi dihapus");

    if (p.rekapPresensi[0] && p.rekapPresensi[0].diunggahPada > t.calculatedAt)
      sebab.push("presensi berubah");
    if (
      p.predikatKinerja[0] &&
      p.predikatKinerja[0].sourceSyncedAt > t.calculatedAt
    )
      sebab.push("predikat kinerja berubah");

    // DATA KEPEGAWAIAN - ditambahkan 2026-09-24, dan sebelumnya memang tidak
    // ada. Kelas jabatan menentukan SELURUH tarif tukin pokok, jadi kelas
    // yang bergeser setelah kalkulasi membuat angka tersimpan salah tanpa
    // satu pun kolom lain ikut berubah.
    //
    // Sumbernya daftar perubahan, BUKAN `Pegawai.sourceSyncedAt`: kolom itu
    // distempel ulang pada setiap baris di tiap sinkronisasi, berubah atau
    // tidak. Begitu sync dijadwalkan harian, membandingkannya dengan
    // calculatedAt akan menyalakan peringatan untuk seluruh roster setiap
    // hari - dan peringatan yang selalu menyala berhenti dibaca.
    const perubahanData = petaPerubahanTerbaru.get(p.nip);
    if (perubahanData && perubahanData > t.calculatedAt) sebab.push("data kepegawaian berubah");

    return sebab.length > 0 ? sebab.join(" & ") : null;
  };
  const jumlahPerluHitungUlang = pegawaiAktif.filter((p) => perluHitungUlang(p) !== null).length;

  // Rincian per unit penilai (Kepala Biro / Kasubbag TU / sumber tidak
  // tercatat) SENGAJA TIDAK ditampilkan - permintaan user, dua kali: pertama
  // di halaman Predikat Kinerja, lalu di kartu ini. Yang perlu diketahui
  // Kasubag TU cuma BERAPA yang sudah punya predikat, bukan siapa penilainya.
  // `unitPenilaian` tetap tersimpan dan tetap bisa dilihat per pegawai.

  // Tanpa text-left/align-bottom: perataan tengah-menengah datang dari aturan
  // tabel di globals.css. Utility di sini akan MENIMPA aturan itu (layer
  // utilities menang atas base), jadi menuliskannya berarti tabel 40 kolom ini
  // sendirian tidak ikut perataan yang berlaku di seluruh project.
  const th = "whitespace-nowrap px-3 py-2";
  const td = "whitespace-nowrap px-3 py-2 font-mono text-ink-2";

  const tampilRinci = rincian === "1";
  const paramDasar = new URLSearchParams({
    bulan: String(periodeBulan),
    tahun: String(periodeTahun),
    satker: satkerEfektif,
  });

  const paramMode = new URLSearchParams(paramDasar);
  if (per) paramMode.set("per", per);
  const linkRinci = `/kasubag/kalkulasi?${paramMode.toString()}&rincian=1`;
  const linkRingkas = `/kasubag/kalkulasi?${paramMode.toString()}`;

  const paginasi = hitungPaginasi(pegawaiList.length, hal, per);
  const pegawaiHalaman = pegawaiList.slice(paginasi.mulai, paginasi.selesai);
  const paramPaginasi = new URLSearchParams(paramDasar);
  if (tampilRinci) paramPaginasi.set("rincian", "1");

  return (
    <main className={HALAMAN}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">
            Kalkulasi Unit
            {/* BADGE, bukan kartu berisi pesan PPABP. Pesan lengkapnya ada di
                panel Kirim di kaki halaman - lihat catatan di sana.
                Yang dibutuhkan di puncak halaman cuma SATU hal: halaman ini
                sedang dalam tahap apa. Pesan detail di sini dibaca sekali di
                awal, lalu tergulir hilang justru pada saat orang selesai
                memperbaiki dan hendak mengirim ulang. */}
            {kirimStatus.keadaan === "DIKEMBALIKAN" && (
              <a
                href="#kirim"
                className="chip chip-danger align-middle text-[11px] no-underline hover:brightness-95"
                title="PPABP mengembalikan rekap periode ini - klik untuk melompat ke catatannya di panel Kirim."
              >
                Revisi dari PPABP
              </a>
            )}
            <SumberAcuan
              judul="Dasar aturan"
              sumber={keSumberAcuan(sumberData)}
              acuan={[
                { aturan: "Pasal 5 Permenaker 15/2024", tentang: "Bobot 70% capaian kinerja + 30% kehadiran" },
                { aturan: "Lampiran Permenaker 15/2024", tentang: "Tukin pokok per kelas jabatan" },
                { aturan: "Pasal 13 Permenaker 15/2024", tentang: "Potongan kehadiran - alpha, lupa absen, terlambat, pulang cepat" },
                { aturan: "Pasal 14 Permenaker 15/2024", tentang: "Persentase yang dibayarkan selama cuti" },
                { aturan: "Kepsekjen 82/2025", tentang: "Konversi predikat kinerja ke persentase" },
                { aturan: "PP 94/2021", tentang: "Kelas jabatan yang turun selama hukuman disiplin" },
                { aturan: "PMK 32/2025", tentang: "Tarif uang makan & uang lembur (SBM 2026)" },
              ]}
              catatan="Pejabat pimpinan tinggi (kelas jabatan 15 ke atas) dibayar penuh komponen kehadirannya - mengikuti praktik pembayaran yang berjalan, bukan pasal di Permenaker 15/2024."
            />
          </h1>
          <p className="mt-0.5 text-sm font-bold text-ink">
            {satkerEfektif} &middot; {NAMA_BULAN[periodeBulan - 1]} {periodeTahun}
          </p>
          <p className="mt-2 text-sm text-biru">
            Hitung Tukin dan Uang Makan seluruh pegawai unit ini untuk satu periode, lalu kirim rekapnya ke PPABP.
          </p>
        </div>
        {/*
          Membawa periode & unit yang SEDANG DILIHAT. Berkasnya memuat SEMUA
          baris apa pun statusnya - itu memang gunanya: dipakai memeriksa
          SEBELUM dikirim. Yang disetor ke Web Gaji tetap ADK di /ppabp/adk,
          dan itu hanya unit yang sudah dikirim & dikunci.
        */}
        {bolehExportRekap && (
          <a
            href={`/kasubag/kalkulasi/export?bulan=${periodeBulan}&tahun=${periodeTahun}&satker=${encodeURIComponent(satkerEfektif)}`}
            className="btn btn-secondary"
          >
            Unduh Excel
          </a>
        )}
      </div>

      {/* SATU KARTU: filter periode + ringkasan kesiapan datanya.
          Keduanya menjawab pertanyaan yang sama - "periode ini, unit ini,
          datanya bagaimana" - dan waktu jadi dua kartu bertumpuk, angka
          kesiapannya terbaca seperti urusan terpisah dari periode yang baru
          saja dipilih. */}
      <div className="card mt-4 p-4">
        <FilterBar
          tanpaKartu
          wajibPeriode
          wajibSatker
          satuanKerjaList={satuanKerjaList}
          bulan={String(periodeBulan)}
          tahun={String(periodeTahun)}
          satker={satkerEfektif}
        />
        {/* Pemeriksaan kelengkapan - SEBELUM tombol hitung, supaya ketahuan
            lebih dulu daripada setelah kalkulasi terlanjur jalan. */}
        <PanelKesiapan
          ringkasan={kesiapan}
          tanpaKartu
          sumber={[
            {
              nama: "Rekap presensi",
              bobot: "30%",
              terisi: pegawaiAktif.length - belumPunyaPresensi.length,
              dari: pegawaiAktif.length,
              href: "/tukin/presensi",
              labelAksi: "Kelola presensi",
            },
            {
              nama: "Predikat kinerja",
              bobot: "70%",
              terisi: pegawaiAktif.length - belumPunyaPredikat.length,
              dari: pegawaiAktif.length,
              href: "/tukin/predikat-kinerja",
              labelAksi: "Kelola predikat kinerja",
            },
          ]}
        />
      </div>

      {/* Daftar yang sedang dikecualikan. WAJIB TAMPIL - kalau orang yang
          dikeluarkan dari hitungan tidak kelihatan di mana pun, pengecualian
          berubah jadi cara menghilangkan orang tanpa jejak. */}
      {pengecualian.length > 0 && (
        <section className="card mt-4 p-4">
          <h2 className="text-sm font-bold text-ink">
            {pengecualian.length} pegawai dikecualikan dari periode ini
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Tidak dihitung dan tidak ikut ke PPABP. Laporkan ke PPABP supaya
            data SIAP diperbaiki.
          </p>
          <ul className="mt-2 space-y-1.5 text-xs">
            {pengecualian.map((x) => (
              <li key={x.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-ink">{x.pegawai.nama}</span>
                <span className="text-muted">({x.pegawai.nip})</span>
                <span className="chip chip-draft">
                  {alasanDariKode(x.alasanKode)?.label ?? x.alasanKode}
                </span>
                {x.penjelasan && (
                  <span className="text-muted">- {x.penjelasan}</span>
                )}
                <BatalPengecualianForm
                  pegawaiId={x.pegawaiId}
                  periodeBulan={periodeBulan}
                  periodeTahun={periodeTahun}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* SPANDUK KEADAAN - ditaruh PALING ATAS, sebelum data apa pun.
          Orang yang membuka halaman ini untuk memperbaiki sesuatu harus tahu
          lebih dulu apakah perbaikannya bisa disimpan, bukan setelah mengisi
          form dan ditolak server. */}
      {kirimStatus.keadaan === "TERKIRIM" && (
        <div className="card mt-4 border-l-4 border-l-green p-4">
          <p className="text-sm font-bold text-ink">
            Rekap periode ini sudah dikirim &amp; terkunci
          </p>
          <p className="mt-1 text-xs text-muted">
            Kalkulasi tidak bisa dijalankan ulang selama masih terkunci. Kalau
            ada yang perlu diperbaiki, minta PPABP mengembalikannya lebih dulu.
          </p>
        </div>
      )}
      {/* Kartu "Sumber data periode ini" DICABUT - kedua angkanya (47/48)
          pindah jadi checklist di panel kesiapan, supaya tidak ada dua tempat
          yang menyebut angka yang sama.

          Peringatan angka basi TIDAK ikut pindah: itu urusan berbeda (angka
          yang SUDAH dihitung kini kedaluwarsa), dan sekarang berdiri sendiri -
          kartunya cuma muncul kalau memang ada yang basi, tidak lagi menyisakan
          kotak kosong waktu semuanya mutakhir.

          Angka Tukin dibekukan saat dihitung. Kalau sumbernya berubah setelah
          itu, tabel di bawah menampilkan angka lama tanpa tanda - dan itu
          terbaca sebagai "koreksi saya tidak berpengaruh". */}
      {/* KECUALIKAN PEGAWAI - satu-satunya jalan keluar untuk orang yang memang
          sudah tidak seharusnya dihitung di unit ini (mis. sudah mutasi tapi
          SIAP belum diperbarui). Sempat HILANG dari halaman waktu kartu
          "Sumber data periode ini" dibongkar - formnya dulu menempel pada
          daftar pegawai tanpa predikat di dalam kartu itu.

          DILIPAT, dan itu disengaja: sebagian besar periode tidak
          membutuhkannya, sementara tombol "kecualikan" yang selalu terbuka di
          sebelah tiap nama mengundang dipakai sebagai jalan pintas
          menghilangkan orang yang datanya cuma belum lengkap. */}
      {belumPunyaPredikat.length > 0 && (
        <details className="card mt-4 p-4">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-sm font-bold text-ink [&::-webkit-details-marker]:hidden">
            Kecualikan pegawai dari perhitungan
            <span className="font-mono text-xs font-bold text-muted">{belumPunyaPredikat.length} kandidat</span>
            {/* Ikon "i" AMAN di dalam <summary> - InfoIkon seluruhnya <span>.
                Sebab tersering dijelaskan di sini, bukan di badan kartu:
                orang yang sudah tahu tidak perlu membacanya tiap kali, dan
                yang baru pertama kali membuka kartu ini justru butuh tahu
                lebih dulu sebelum memutuskan mengeluarkan seseorang. */}
            <InfoIkon
              judul="Kapan ini dipakai"
              poin={[
                {
                  judul: "Data SIAP belum diperbarui—sebab tersering",
                  isi: "Pegawai sudah mutasi atau berhenti, tapi SIAP masih mencatatnya di unit ini. Gajihub menyalin SIAP apa adanya tiap malam, jadi selama SIAP belum berubah, namanya tetap muncul di sini.",
                },
                {
                  judul: "BUKAN untuk data yang sekadar belum lengkap",
                  isi: "Predikat kinerja yang belum diupload cukup ditagih ke penilainya, atau dilewati sekali jalan lewat kotak centang di panel Kalkulasi.",
                },
              ]}
              catatan="Yang dikecualikan tidak dihitung dan tidak ikut dikirim ke PPABP, tapi tetap terlihat di daftar beserta alasannya—pengecualian tidak boleh jadi cara menghilangkan orang tanpa jejak."
            />
          </summary>
          <p className="mt-1 text-xs text-muted">
            Gunakan fitur ini khusus untuk pegawai yang memang sudah tidak seharusnya dihitung di unit ini—bukan
            untuk pegawai yang datanya sekadar belum lengkap. Pegawai yang dikecualikan akan tetap tampil di daftar
            atas beserta alasannya.
          </p>
          <ul className="mt-3 space-y-2 text-xs">
            {belumPunyaPredikat.slice(0, 15).map((p) => (
              <li key={p.id} className="border-l-2 border-line pl-3">
                <span className="font-medium text-ink">{p.nama}</span>{" "}
                <span className="text-muted">({p.nip})</span>
                <PengecualianForm
                  pegawaiId={p.id}
                  nama={p.nama}
                  periodeBulan={periodeBulan}
                  periodeTahun={periodeTahun}
                  petunjuk={petunjukKemungkinanKeluar({
                    jumlahHariKerja: p.rekapPresensi[0]?.jumlahHariKerja ?? 0,
                    jumlahHariHadir: p.rekapPresensi[0]?.jumlahHariHadir ?? 0,
                    punyaPredikat: p.predikatKinerja.length > 0,
                    jumlahHariCuti: p.rekapPresensi[0]?.jumlahHariCuti ?? 0,
                    jumlahHariTugasBelajar: p.rekapPresensi[0]?.jumlahHariTugasBelajar ?? 0,
                  })}
                />
              </li>
            ))}
          </ul>
          {belumPunyaPredikat.length > 15 && (
            <p className="mt-2 text-xs text-muted">
              Menampilkan 15 dari {belumPunyaPredikat.length}. Sisanya muncul setelah yang ini ditangani.
            </p>
          )}
        </details>
      )}

      {jumlahPerluHitungUlang > 0 && (
        <div className="card mt-4 border-l-4 border-l-gold p-4 text-xs text-ink-2">
          <p className="text-sm font-semibold text-ink">
            {jumlahPerluHitungUlang} pegawai perlu dihitung ulang - angka Tukin-nya sudah basi.
          </p>
          {/* Sebabnya: presensi/predikat berubah SETELAH Tukin terakhir
              dihitung (mis. presensi ditarik ulang karena koreksi jam), jadi
              angka di tabel masih yang lama. Tidak ditulis di layar - yang
              perlu diketahui pembaca cuma berapa orang dan apa yang harus
              ditekan. */}
          <p className="mt-1 text-muted">Baris terdampak ditandai kuning. Tekan Hitung sekarang.</p>
        </div>
      )}

      <KalkulasiMassalForm
        satuanKerja={satkerEfektif}
        periodeBulan={periodeBulan}
        periodeTahun={periodeTahun}
        jumlahBelumPunyaPredikat={belumPunyaPredikat.length}
        namaBulan={NAMA_BULAN[periodeBulan - 1] ?? String(periodeBulan)}
      />

      {/* ------------------------------------------------------------------ */}
      {/* RINCIAN TUKIN - ringkas (default) atau lengkap (?rincian=1)         */}
      {/* ------------------------------------------------------------------ */}
      <div
        id="rincian-tukin"
        className="mt-8 flex scroll-mt-4 flex-wrap items-center justify-between gap-3"
      >
        {/* Ikon bantuan DI SAMPING heading, bukan di dalamnya - lihat catatan
            flow content di BantuanRincianTukin.tsx. */}
        <div className="flex items-center gap-1.5">
          <h2 className="text-base font-bold text-ink">
            Rincian Tukin{tampilRinci && <span className="ml-2 text-sm font-normal text-muted">- rincian lengkap</span>}
          </h2>
          <BantuanRincianTukin tampilRinci={tampilRinci} />
        </div>
        <a
          href={tampilRinci ? linkRingkas : linkRinci}
          className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface-3"
        >
          {tampilRinci ? "Tampilkan ringkas" : "Lihat rincian lengkap"}
        </a>
      </div>

      {!tampilRinci && (
        <div className="card mt-2 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
                <th className="col-nama kolom-beku px-4 py-2.5">Nama</th>
                <th className="px-4 py-2.5">Predikat Kinerja</th>
                <th className="px-4 py-2.5">
                  Tunjangan Kinerja
                  <span className="block text-[10px] font-normal normal-case">kotor</span>
                </th>
                <th className="px-4 py-2.5">
                  Potongan %
                  <span className="block text-[10px] font-normal normal-case">dari bobot kehadiran</span>
                </th>
                <th className="px-4 py-2.5">Uang Makan</th>
                {TAMPILKAN_NOMINAL_LEMBUR && (
                  <th className="px-4 py-2.5">Uang Lembur</th>
                )}
                {/* KOLOM "Jam Lembur" DICABUT 2026-09-22 (permintaan user):
                    "kan udah ada tabel khusus lembur". Satu angka total sebulan
                    di sini tidak bisa diperiksa - yang menentukan bayar adalah
                    pemisahan hari kerja vs hari libur (tarifnya beda) dan
                    rincian hariannya, dan keduanya ada di Tabel Jam Lembur.
                    Dua tempat yang menampilkan jam lembur dengan kedalaman
                    berbeda cuma mengundang orang memeriksa yang dangkal. */}
                <th className="px-4 py-2.5">Tukin bersih</th>
              </tr>
            </thead>
            <tbody>
              {pegawaiHalaman.map((p) => {
                const tukin = p.tukinCalc[0];
                const um = p.uangMakan[0];
                const lembur = p.uangLembur[0];
                const predikat = p.predikatKinerja[0];

                const tarifKelas =
                  p.kelasJabatan !== null && p.kelasJabatan !== undefined
                    ? TUKIN_POKOK_PER_KELAS_JABATAN[p.kelasJabatan] ?? null
                    : null;
                const rincianBaris = tukin ? rincianTukinTersimpan(tukin, tarifKelas) : null;

                const persenPotongan =
                  rincianBaris && rincianBaris.bobotKehadiranPenuh
                    ? ((rincianBaris.potonganKehadiran ?? 0) / rincianBaris.bobotKehadiranPenuh) * 100
                    : null;

                const kurangKinerja = rincianBaris?.potonganKinerja ?? 0;
                const basi = perluHitungUlang(p);

                return (
                  <tr key={p.id} className={`border-b border-line-2 align-top ${basi ? "bg-gold-tint" : "bg-surface"}`}>
                    <td className="col-nama kolom-beku px-4 py-2.5">
                      <NamaPegawai
                        nama={p.nama}
                        nip={p.nip}
                        periodeBulan={periodeBulan}
                        periodeTahun={periodeTahun}
                        satuanKerja={satkerEfektif}
                        kelasJabatan={p.kelasJabatan}
                      />
                      {basi && (
                        <span
                          className="mt-0.5 block text-xs font-semibold text-amber-700 dark:text-amber-400"
                          title={`Data ${basi} berubah setelah Tukin ini dihitung - angka di baris ini masih yang lama.`}
                        >
                          angka basi - {basi} berubah
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-ink-2">
                      {predikat ? (
                        LABEL_PREDIKAT[predikat.predikat] ?? predikat.predikat
                      ) : (
                        <BelumAda judul="Predikat kinerja periode ini belum diupload" />
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-ink-2">
                      {tarifKelas !== null ? (
                        formatRupiah(tarifKelas)
                      ) : (
                        <BelumAda judul="Kelas jabatan belum terisi di data pegawai" />
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-ink-2">
                      {persenPotongan !== null ? (
                        formatPersen(persenPotongan, 2)
                      ) : (
                        <BelumAda judul="Tukin periode ini belum dihitung" />
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-ink-2">
                      {um ? formatRupiah(um.totalUangMakan) : "-"}
                    </td>
                    {TAMPILKAN_NOMINAL_LEMBUR && (
                      <td className="px-4 py-2.5 font-mono text-ink-2">
                        {lembur ? formatRupiah(lembur.totalUangLembur) : "-"}
                      </td>
                    )}
                    <td className="px-4 py-2.5 font-mono font-semibold text-ink">
                      {tukin ? formatRupiah(tukin.tukinBersih) : <BelumAda judul="Tukin periode ini belum dihitung" />}
                      {kurangKinerja > 1 && (
                        <span className="mt-0.5 block font-sans text-[11px] font-normal text-muted">
                          termasuk {formatRupiah(kurangKinerja)} dari capaian kinerja di bawah 100%
                        </span>
                      )}
                      {rincianBaris?.adaSelisih && (
                        <span className="mt-0.5 block font-sans text-[11px] font-normal text-amber-700 dark:text-amber-400">
                          cek override cuti / tugas belajar
                        </span>
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
              basePath="/kasubag/kalkulasi"
              params={paramPaginasi}
              info={paginasi}
              totalBaris={pegawaiList.length}
              labelBaris="pegawai"
            />
          </div>
        </div>
      )}

      {tampilRinci && (
      <>
      <div className="card mt-2 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-[11px] font-bold uppercase tracking-wide text-muted">
              <th className={th}>No.</th>
              <th className={`col-nama kolom-beku ${th}`}>Nama Pegawai</th>
              <th className={th}>NIP</th>
              <th className={th}>GOL</th>
              <th className={th}>Kelas Jabatan</th>
              <th className={th}>Nominal Tukin</th>
              <th className={th}>Status</th>
              <th className={th}>Hari Kerja</th>
              <th className={th}>Hari WFO</th>
              <th className={th}>Hari WFH/WFA</th>
              <th className={th}>Terlambat (Menit)</th>
              <th className={th}>Lupa Absen</th>
              <th className={th}>Alpa</th>
              <th className={th}>Dinas Luar</th>
              <th className={th}>CT Gugur Kandungan</th>
              <th className={th}>CT Gugur Kandungan &gt;1 Bulan</th>
              <th className={th}>Cuti Thn</th>
              <th className={th}>Cuti Melahirkan</th>
              <th className={th}>Cuti Sakit Bulan I</th>
              <th className={th}>Cuti Sakit Bulan II</th>
              <th className={th}>Cuti Sakit Bulan III</th>
              <th className={th}>Cuti Sakit &gt; 3 Bulan</th>
              <th className={th}>CT B/CT AP &lt; 1 Bln</th>
              <th className={th}>CT Bsr Bln I</th>
              <th className={th}>CT Besar Bln II</th>
              <th className={th}>CT Besar Bln III</th>
              <th className={th}>TB</th>
              <th className={th}>Diklat</th>
              <th className={th}>TDK UPC</th>
              <th className={th}>WFO + WFH</th>
              <th className={th}>% Pot</th>
              <th className={th}>Persentase Kehadiran (30%)</th>
              <th className={th}>Nominal Kehadiran</th>
              <th className={th}>Jumlah Potongan Kehadiran</th>
              <th className={th}>Hasil Kerja</th>
              <th className={th}>Perilaku Kerja</th>
              <th className={th}>Capaian Kinerja</th>
              <th className={th}>Persentase Kinerja (70%)</th>
              <th className={th}>Nominal Kinerja</th>
              <th className={th}>Dibayarkan</th>
            </tr>
          </thead>
          <tbody>
            {pegawaiHalaman.map((p, i) => {
              const tukin = p.tukinCalc[0];
              const rekap = p.rekapPresensi[0];
              const predikat = p.predikatKinerja[0];

              const tarifKelas =
                p.kelasJabatan !== null && p.kelasJabatan !== undefined
                  ? TUKIN_POKOK_PER_KELAS_JABATAN[p.kelasJabatan] ?? null
                  : null;
              const rincian = tukin ? rincianTukinTersimpan(tukin, tarifKelas) : null;

              const persenPotongan =
                rincian && rincian.bobotKehadiranPenuh
                  ? ((rincian.potonganKehadiran ?? 0) / rincian.bobotKehadiranPenuh) * 100
                  : null;
              const persenKehadiran =
                rincian && tarifKelas ? (rincian.komponenKehadiran / tarifKelas) * 100 : null;
              const persenKinerja = rincian && tarifKelas ? (rincian.komponenKinerja / tarifKelas) * 100 : null;

              const jenis = jenisKepegawaian(p.golongan);
              const basi = perluHitungUlang(p);

              return (
                <tr key={p.id} className={`border-b border-line-2 ${basi ? "bg-gold-tint" : "bg-surface"}`}>
                  <td className={`${td} text-muted`}>{paginasi.mulai + i + 1}</td>
                  <td className="col-nama kolom-beku whitespace-nowrap px-3 py-2">
                    <NamaPegawai
                      nama={p.nama}
                      nip={p.nip}
                      periodeBulan={periodeBulan}
                      periodeTahun={periodeTahun}
                      satuanKerja={satkerEfektif}
                      kelasJabatan={p.kelasJabatan}
                    />
                    {basi && (
                      <span
                        className="mt-0.5 block text-xs font-semibold text-amber-700 dark:text-amber-400"
                        title={`Data ${basi} berubah setelah Tukin ini dihitung - angkanya masih yang lama.`}
                      >
                        angka basi - {basi} berubah
                      </span>
                    )}
                  </td>
                  <td className={td}>{p.nip}</td>
                  <td className={td}>{p.golongan ?? <BelumAda judul="Golongan belum terisi di data pegawai" />}</td>
                  <td className={td}>
                    {p.kelasJabatan ?? <BelumAda judul="Kelas jabatan belum terisi di data pegawai" />}
                  </td>
                  <td className={td}>{tarifKelas !== null ? formatRupiah(tarifKelas) : <BelumAda judul="Tarif tidak diketahui karena kelas jabatan kosong" />}</td>
                  <td className={td}>{jenis ?? <BelumAda judul="Jenis kepegawaian tidak dapat diturunkan dari format golongan" />}</td>

                  {/* --- Rekap presensi periode ini --- */}
                  <td className={td}>{rekap ? rekap.jumlahHariKerja : <BelumAda judul="Rekap presensi periode ini belum ada" />}</td>
                  <td className={td}>{rekap ? rekap.jumlahHariWfo : <BelumAda judul="Rekap presensi periode ini belum ada" />}</td>
                  <td className={td}>{rekap ? rekap.jumlahHariWfhWfa : <BelumAda judul="Rekap presensi periode ini belum ada" />}</td>
                  <td className={td}>{rekap ? rekap.totalMenitTerlambat : <BelumAda judul="Rekap presensi periode ini belum ada" />}</td>
                  <td className={td}>{rekap ? rekap.jumlahTidakPresensi : <BelumAda judul="Rekap presensi periode ini belum ada" />}</td>
                  <td className={td}>{rekap ? rekap.jumlahHariAlpha : <BelumAda judul="Rekap presensi periode ini belum ada" />}</td>
                  <td className={td}>{rekap ? rekap.jumlahHariDinasLuar : <BelumAda judul="Rekap presensi periode ini belum ada" />}</td>

                  {/* --- Cuti (Pasal 14) ---
                      12 kolom gaya rekap Excel, diturunkan dari tiga kolom
                      yang benar-benar disimpan. Kalau rekap presensinya belum
                      ada sama sekali, ditandai "-" (data tidak ada); kalau
                      rekapnya ada tapi orangnya tidak cuti, dibiarkan kosong -
                      sama seperti sel kosong di Excel. */}
                  {["GUGUR_1", "GUGUR_2", "TAHUNAN", "MELAHIRKAN", "SAKIT_1", "SAKIT_2", "SAKIT_3", "SAKIT_4", "BESAR_AP_KURANG", "BESAR_1", "BESAR_2", "BESAR_3"].map((k) => (
                    <td key={k} className={td}>
                      {rekap ? selCuti(k, rekap) : <BelumAda judul="Rekap presensi periode ini belum ada" />}
                    </td>
                  ))}

                  <td className={td}>{rekap ? rekap.jumlahHariTugasBelajar : <BelumAda judul="Rekap presensi periode ini belum ada" />}</td>
                  <td className={td}>{rekap ? rekap.jumlahHariDiklat : <BelumAda judul="Rekap presensi periode ini belum ada" />}</td>
                  <td className={td}>{rekap ? rekap.jumlahTidakIkutUpacara : <BelumAda judul="Rekap presensi periode ini belum ada" />}</td>
                  <td className={td}>
                    {rekap ? (
                      rekap.jumlahHariWfo + rekap.jumlahHariWfhWfa
                    ) : (
                      <BelumAda judul="Rekap presensi periode ini belum ada" />
                    )}
                  </td>

                  {/* --- Hasil kalkulasi --- */}
                  <td className={`${td} ${rekap ? "cursor-help underline decoration-dotted" : ""}`} title={rekap ? uraianPotongan(rekap) : undefined}>
                    {persenPotongan !== null ? formatPersen(persenPotongan, 2) : <BelumAda judul="Tukin periode ini belum dihitung" />}
                  </td>
                  <td className={td}>{persenKehadiran !== null ? formatPersen(persenKehadiran) : <BelumAda judul="Tukin periode ini belum dihitung" />}</td>
                  <td className={td}>{rincian ? formatRupiah(rincian.komponenKehadiran) : <BelumAda judul="Tukin periode ini belum dihitung" />}</td>
                  <td className={td}>
                    {rincian?.potonganKehadiran !== null && rincian?.potonganKehadiran !== undefined
                      ? formatRupiah(rincian.potonganKehadiran)
                      : <BelumAda judul="Butuh kelas jabatan untuk menghitung potongan dalam rupiah" />}
                  </td>

                  {/* Rating penyusun predikat, apa adanya dari file Rekap
                      Penilaian e-Kinerja BKN. Kosong untuk baris yang
                      predikatnya diketik manual - lihat actionsKelola.ts. */}
                  <td className="whitespace-nowrap px-3 py-2 text-ink-2">
                    {predikat?.hasilKerja ?? (
                      <BelumAda judul={predikat ? "Tidak ada di sumbernya (predikat diinput manual)" : "Predikat kinerja periode ini belum diupload"} />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-2">
                    {predikat?.perilakuKerja ?? (
                      <BelumAda judul={predikat ? "Tidak ada di sumbernya (predikat diinput manual)" : "Predikat kinerja periode ini belum diupload"} />
                    )}
                  </td>

                  <td className="whitespace-nowrap px-3 py-2 text-ink-2">
                    {predikat ? (
                      // Ditulis seperti di rekap Excel ("Sangat Baik"), bukan
                      // nilai mentah enum-nya ("SANGAT_BAIK").
                      LABEL_PREDIKAT[predikat.predikat] ?? predikat.predikat
                    ) : (
                      <BelumAda judul="Predikat kinerja periode ini belum diupload" />
                    )}
                  </td>
                  <td className={td}>{persenKinerja !== null ? formatPersen(persenKinerja) : <BelumAda judul="Tukin periode ini belum dihitung" />}</td>
                  <td className={td}>{rincian ? formatRupiah(rincian.komponenKinerja) : <BelumAda judul="Tukin periode ini belum dihitung" />}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono font-semibold text-ink">
                    {tukin ? formatRupiah(tukin.tukinBersih) : <BelumAda judul="Tukin periode ini belum dihitung" />}
                    {rincian?.adaSelisih && (
                      <span
                        className="mt-1 block font-sans text-[11px] font-normal text-amber-700 dark:text-amber-400"
                        title={`Bruto tersimpan ${formatRupiah(rincian.tukinBruto)}, sedangkan kehadiran + kinerja = ${formatRupiah(
                          rincian.komponenKehadiran + rincian.komponenKinerja
                        )}.`}
                      >
                        cek override cuti / tugas belajar
                      </span>
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
            basePath="/kasubag/kalkulasi"
            params={paramPaginasi}
            info={paginasi}
            totalBaris={pegawaiList.length}
            labelBaris="pegawai"
          />
        </div>
      </div>

          {/* ---------------------------------------------------------------- */}
          {/* Uang makan & lembur - di tampilan RINCI saja. Di tampilan ringkas */}
          {/* ketiganya sudah jadi kolom biasa di tabel utama.                  */}
          {/* ---------------------------------------------------------------- */}
          <h2 id="uang-makan" className="mt-8 scroll-mt-4 text-base font-bold text-ink">
            Uang Makan &amp;{" "}
            {TAMPILKAN_NOMINAL_LEMBUR ? "Uang Lembur" : "Jam Lembur"}
          </h2>
          <p className="mt-1 text-xs text-muted">
            Di luar cakupan rekap Excel Tukin - dipisah supaya tabel di atas
            tetap sebanding kolom per kolom.
          </p>
          <div className="card mt-2 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
                  <th className="col-nama px-4 py-2.5">Nama</th>
                  <th className="px-4 py-2.5">Uang Makan</th>
                  {TAMPILKAN_NOMINAL_LEMBUR && (
                    <th className="px-4 py-2.5">Uang Lembur</th>
                  )}
                  <th className="px-4 py-2.5">Koreksi jam lembur</th>
                </tr>
              </thead>
              <tbody>
                {pegawaiHalaman.map((p) => {
                  const um = p.uangMakan[0];
                  const lembur = p.uangLembur[0];
                  return (
                    <tr key={p.id} className="border-b border-line-2 align-top">
                      <td className="col-nama px-4 py-2.5">
                        <NamaPegawai
                          nama={p.nama}
                          nip={p.nip}
                          periodeBulan={periodeBulan}
                          periodeTahun={periodeTahun}
                          satuanKerja={satkerEfektif}
                          kelasJabatan={p.kelasJabatan}
                        />
                      </td>
                      <td className="px-4 py-2.5 font-mono text-ink-2">
                        {um ? formatRupiah(um.totalUangMakan) : "-"}
                      </td>
                      {TAMPILKAN_NOMINAL_LEMBUR && (
                        <td className="px-4 py-2.5 font-mono text-ink-2">
                          {lembur
                            ? `${formatRupiah(lembur.totalUangLembur)} (${lemburTeks(lembur.totalJamLembur)})`
                            : "-"}
                        </td>
                      )}
                      <td className="px-4 py-2.5">
                        {/* TETAP TAMPIL walau nominalnya ditahan: pengumpulan data
                        jam lembur harus jalan terus selama menunggu tata cara
                        turun, kalau tidak periode-periode ini akan kosong dan
                        harus diisi ulang dari kertas. Formnya hanya menerima
                        angka jam - tidak ada rupiah di dalamnya. */}
                        <KoreksiLemburForm
                          pegawaiId={p.id}
                          periodeBulan={periodeBulan}
                          periodeTahun={periodeTahun}
                          totalJamLemburSaatIni={lembur?.totalJamLembur ?? 0}
                          tarifPerJam={
                            lembur?.tarifPerJam ?? TARIF_UANG_LEMBUR_DEFAULT
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <div className="border-t border-line-2 px-4 py-3 sm:px-6">
              <Paginasi
                basePath="/kasubag/kalkulasi"
                params={paramPaginasi}
                info={paginasi}
                totalBaris={pegawaiList.length}
                labelBaris="pegawai"
              />
            </div>
          </div>
        </>
      )}

      {/* Panel Kirim sengaja di BAWAH tabel, bukan di atas: yang ditandatangani
          Kasubag TU adalah angka-angka di atasnya, dan tombol yang mengunci
          sebaiknya berada sesudah hal yang dikunci - bukan sebelum. */}
      {/* SENGAJA TIDAK DIBUNGKUS `{!kirimStatus.terkunci && ...}`. Aksi kirim
          memanggil revalidatePath, jadi begitu berhasil halaman ini langsung
          dirender ulang dalam keadaan terkunci - dan komponen yang ikut
          dilepas di situ membawa serta popup "berhasil dikirim"-nya sebelum
          sempat terbaca. Keadaannya dikirim sebagai prop; komponennya sendiri
          yang menyembunyikan formnya. */}
      {/* TABEL YANG DITAGIH CENTANGNYA. Ditaruh tepat di atas daftar periksa,
          bukan di bagian lain halaman: centang "sudah saya periksa" yang
          jauh dari barang yang diperiksa adalah centang yang diisi tanpa
          dibaca.

          SELURUH pegawai unit, bukan sehalaman paginasi - yang dicentang
          pernyataan atas satu periode utuh, dan tabel yang cuma memperlihatkan
          10 baris pertama membuat pernyataan itu tidak benar. */}
      <TabelPerubahanPegawai
        periodeBulan={periodeBulan}
        periodeTahun={periodeTahun}
        namaBulan={NAMA_BULAN[periodeBulan - 1] ?? String(periodeBulan)}
        baris={perubahanPegawai.map((c) => {
          const t = petaKalkulasiPerNip.get(c.nip);
          return {
            id: c.id,
            nip: c.nip,
            nama: c.nama,
            jenis: c.jenis,
            dari: c.dari,
            ke: c.ke,
            terdeteksiPada: c.terdeteksiPada,
            keluarDariUnit: c.jenis === "PINDAH_UNIT" && c.satuanKerjaDari === satkerEfektif,
            sesudahHitung: t !== undefined && c.terdeteksiPada > t,
          };
        })}
      />

      <TabelPemeriksaanLembur
        periodeBulan={periodeBulan}
        periodeTahun={periodeTahun}
        terkunci={kirimStatus.terkunci}
        baris={pegawaiList.map((p) => {
          const lembur = p.uangLembur[0];
          const harian = petaLemburHarian.get(p.id);

          const daftarPresensi = petaPresensiPerPegawai.get(p.id) ?? [];
          const daftarKoreksi = petaKoreksiLemburPerPegawai.get(p.id) ?? [];
          const petaKoreksiTgl = new Map(daftarKoreksi.map((k) => [k.tanggal.toISOString().slice(0, 10), k]));
          const petaPresensiTgl = new Map(daftarPresensi.map((pr) => [pr.tanggal.toISOString().slice(0, 10), pr]));

          const semuaTanggalIso = Array.from(
            new Set([...petaPresensiTgl.keys(), ...petaKoreksiTgl.keys()])
          ).sort();

          const rincianHari = semuaTanggalIso.map((iso) => {
            const pr = petaPresensiTgl.get(iso);
            const kr = petaKoreksiTgl.get(iso);
            const d = pr ? pr.tanggal : kr!.tanggal;
            const day = d.getUTCDay();
            const namaHari = NAMA_HARI_LEMBUR[day];
            const liburKeterangan = hariLiburMap.get(iso);
            const isHariLibur = day === 0 || day === 6 || !!liburKeterangan;
            const keteranganHari = liburKeterangan
              ? liburKeterangan
              : day === 0 || day === 6
              ? "Akhir Pekan"
              : "Hari Kerja";

            const [y, b, h] = iso.split("-");
            const tanggalTampil = `${namaHari}, ${h}/${b}/${y}`;

            return {
              tanggalIso: iso,
              tanggalTampil,
              isHariLibur,
              keteranganHari,
              jamMasuk: jamTeksLembur(pr?.jamMasuk),
              jamKeluar: jamTeksLembur(pr?.jamKeluar),
              jamMesin: pr?.jamLembur ?? 0,
              jamSaatIni: kr?.jamLembur ?? pr?.jamLembur ?? 0,
              koreksi: kr
                ? {
                    id: kr.id,
                    jamLembur: kr.jamLembur,
                    alasan: kr.alasan,
                    dikoreksiOlehNama: kr.dikoreksiOleh.nama,
                    dikoreksiPada: kr.dikoreksiPada.toISOString(),
                  }
                : null,
            };
          });

          return {
            pegawaiId: p.id,
            nip: p.nip,
            nama: p.nama,
            jamHariKerja: lembur?.jamLemburHariKerja ?? null,
            jamHariLibur: lembur?.jamLemburHariLibur ?? null,
            totalTersimpan: lembur?.totalJamLembur ?? null,
            jamHarian: harian?.jam ?? 0,
            rincianHari,
          };
        })}
      />

      {/* SATU KARTU, DUA KOLOM - permintaan user 2026-09-28, dan alasannya
          memang alur: periksa data -> semua terverifikasi -> kirim rekap.
          Sebagai dua kartu terpisah, syarat dan akibatnya terbaca sebagai dua
          urusan berbeda, padahal kolom kanan justru TIDAK BISA dipakai sampai
          kolom kiri selesai.

          Daftar periksa tetap di luar dialog Kirim: memeriksa tabel adalah
          pekerjaan yang dikerjakan sambil membacanya, sementara dialog Kirim
          baru terbuka ketika orangnya sudah memutuskan. */}
      {/* Border kiri 2px, bukan 4px seperti kartu lain di aplikasi ini.
          Kartu ini satu-satunya yang SEKALIGUS punya header bergaris, pemisah
          tengah, dan border luar - pada 4px ketiganya saling berebut. Kartu
          lain tetap 4px; kalau nanti diseragamkan, di sinilah tempatnya. */}
      <section id="kirim" className="card mt-6 border-l-2 border-l-navy">
        <div className="border-b border-line-2 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-bold text-ink">Periksa &amp; kirim rekap</h2>
          <p className="mt-0.5 text-xs text-muted">Pengiriman mengunci periode ini.</p>
        </div>

        {/* Panel Tanda Tangan Elektronik (TTE) BSrE untuk Dokumen SPTJM */}
        <div className="border-b border-line-2 px-4 py-3 sm:px-5">
          <PanelTteSptjm
            periodeBulan={periodeBulan}
            periodeTahun={periodeTahun}
            satuanKerja={satkerEfektif}
            dokumenTteTerbaru={
              dokumenTteTerbaru
                ? {
                    ...dokumenTteTerbaru,
                    signedAt: dokumenTteTerbaru.signedAt
                      ? dokumenTteTerbaru.signedAt.toISOString()
                      : null,
                  }
                : null
            }
          />
        </div>

        {/* Pemisah vertikal HANYA dari lg ke atas. Di bawah itu keduanya
            bertumpuk dan garis tegak jadi menyesatkan - yang benar di layar
            sempit adalah garis datar antar langkah, dan itu yang dipakai. */}
        <div className="grid divide-y divide-line-2 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <div className="p-4 sm:p-5">
            <VerifikasiTabelPanel
              periodeBulan={periodeBulan}
              periodeTahun={periodeTahun}
              terkunci={kirimStatus.terkunci}
              // Anchor ditentukan DI SINI karena hanya halaman ini yang tahu
              // tabel mana yang sedang benar-benar dirender.
              //
              // UANG_MAKAN yang jadi sebabnya: tabel tersendirinya cuma ada di
              // tampilan RINCI. Di tampilan ringkas, Uang Makan adalah satu
              // kolom di tabel Rincian Tukin - jadi ke situlah tautannya
              // diarahkan, bukan ke id yang belum lahir.
              tautan={{
                PERUBAHAN_PEGAWAI: "#perubahan-pegawai",
                TUKIN: "#rincian-tukin",
                UANG_MAKAN: tampilRinci ? "#uang-makan" : "#rincian-tukin",
                UANG_LEMBUR: "#tabel-lembur",
              }}
              verifikasi={verifikasiTabel.map((v) => ({
                jenisTabel: v.jenisTabel as JenisTabelKalkulasi,
                olehNama: v.diverifikasiOleh.nama,
                pada: v.diverifikasiPada,
              }))}
            />
          </div>

          <div className="p-4 sm:p-5">
            {/* Terkunci: KirimRekapForm sengaja cuma mengembalikan popup
                hasilnya (tanpa isi yang terlihat), jadi kolom ini akan kosong
                melompong tanpa penggantinya. Komponennya TETAP dirender -
                popup "berhasil dikirim" lahir dari situ, dan halaman ini
                dirender ulang dalam keadaan terkunci tepat setelah kirim
                berhasil. */}
            {kirimStatus.terkunci && (
              <div className="rounded-lg border border-green bg-green/10 px-3.5 py-3">
                <p className="text-sm font-bold text-green">Sudah dikirim &amp; terkunci</p>
                <p className="mt-1 text-xs text-ink-2">
                  Periode ini tidak bisa dihitung ulang atau disunting. Hanya PPABP yang bisa
                  mengembalikannya ke unit.
                </p>
              </div>
            )}
            <KirimRekapForm
              terkunci={kirimStatus.terkunci}
              // Catatan PPABP ditampilkan DI SINI, bukan di puncak halaman: ini hal
              // terakhir yang dibaca sebelum tombol Kirim Ulang ditekan, jadi bisa
              // diadu dengan perbaikan yang barusan dikerjakan.
              alasanKembali={kirimStatus.keadaan === "DIKEMBALIKAN" ? kirimStatus.alasanKembali : null}
              periodeBulan={periodeBulan}
              periodeTahun={periodeTahun}
              satuanKerja={satkerEfektif}
              // PEMBAGINYA `pegawaiAktif`, BUKAN `pegawaiList`.
              //
              // Tabel di atas sengaja menampilkan SEMUA pegawai unit termasuk yang
              // sudah pensiun/berhenti - bulan terakhir mereka tetap perlu terlihat
              // dan tetap perlu dihitung. Tapi mereka TIDAK BOLEH ikut jadi syarat
              // kelengkapan: orang yang sudah pensiun tidak akan pernah punya
              // predikat kinerja baru, jadi unitnya tidak akan pernah bisa
              // mengirim - macet permanen tanpa jalan keluar.
              //
              // Angka ini WAJIB sama dengan yang dihitung kirimRekapUnitAction di
              // server (yang memakai `statusPegawai: "AKTIF"`). Kalau berbeda,
              // tombolnya menyala tapi server menolak - atau lebih buruk,
              // sebaliknya.
              jumlahPegawai={pegawaiAktif.length}
              jumlahKalkulasi={
                pegawaiAktif.filter((p) => p.tukinCalc.length > 0).length
              }
              // Ketiga syarat yang diperiksa cekBolehKirim(), dioper APA ADANYA
              // supaya daftarnya di layar dan gerbang di server memakai angka
              // yang sama. Menghitungnya ulang di dalam komponen berarti dua
              // sumber untuk satu pertanyaan.
              jumlahBasi={jumlahPerluHitungUlang}
              tabelKurang={tabelBelumDiverifikasi(tabelDiverifikasi).length}
              tabelWajib={TABEL_WAJIB_DIVERIFIKASI.length}
              alasanTertahan={
                cekBolehKirim(
                  {
                    totalPegawai: pegawaiAktif.length,
                    jumlahKalkulasi: pegawaiAktif.filter(
                      (p) => p.tukinCalc.length > 0,
                    ).length,
                    tabelDiverifikasi,
                    // Punya baris Tukin TIDAK SAMA DENGAN siap kirim. Baris yang
                    // sumbernya sudah berubah atau dihapus tetap berdiri dengan
                    // angka lama, dan tanpa hitungan ini ia ikut terkirim &
                    // terkunci tanpa ada yang menyadarinya.
                    jumlahBasi: jumlahPerluHitungUlang,
                  },
                  kirimStatus,
                ).alasan
              }
            />
          </div>
        </div>
      </section>
    </main>
  );
}
