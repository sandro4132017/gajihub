import { prisma } from "../../../lib/prisma";
import { canAjukanKalkulasiTukinMassalUnit, canExportRekapUnit, canKoreksiJamPresensi } from "../../../auth/permissions";
import { AksesDitolak } from "../../../components/feedback/AksesDitolak";
import { FilterBar } from "../../../components/forms/FilterBar";
import { resolveSatuanKerjaListUntukFilter } from "../../dashboardScope";
import { NAMA_BULAN } from "../../../lib/format/bulan";
import { periodePunyaPredikatKinerja, resolvePeriode } from "../../periodeDefault";
import { ambilAksesUnit } from "../access";
import { TUKIN_POKOK_PER_KELAS_JABATAN } from "../../../business-logic/tarifTukinPokok";
import { rincianTukinTersimpan } from "../../../business-logic/rincianTukinTersimpan";
import { LABEL_PREDIKAT } from "../../tukin/predikat-kinerja/predikat";
import { KalkulasiMassalForm } from "./KalkulasiMassalForm";
import { SumberAcuan } from "../../../components/shared/SumberAcuan";
import { ambilSumberData, keSumberAcuan } from "../../sumberData";
import { periksaKesiapanKalkulasi } from "../../../business-logic/kesiapanKalkulasi";
import { sebabPerluHitungUlang } from "../../../business-logic/kalkulasiBasi";
import { namaCetakPegawai } from "../../../business-logic/namaPegawai";
import { Paginasi, hitungPaginasi } from "../../../components/tables/Paginasi";
import { TabelRincianTukinLengkap } from "../../../components/tables/TabelRincianTukinLengkap";
import { hitungTapTidakWajarUnit } from "../../../lib/tapTidakWajarDb";
import { TAMPILKAN_NOMINAL_LEMBUR } from "../../../lib/format/tampilUangLembur";
import { alasanDariKode, petunjukKemungkinanKeluar } from "../../../business-logic/pengecualianPegawai";
import { spklBerlakuDiPeriode } from "../../../lib/lembur/perintahPeriode";
import Link from "next/link";
import {
  cekBolehKirim,
  statusUnit,
  TABEL_WAJIB_DIVERIFIKASI,
  type JenisTabelKalkulasi,
} from "../../../business-logic/pengirimanUnit";
import {
  URUTAN_SPTJM,
  pilihDokumenTerbaru,
  ringkasSyaratTte,
  waktuTerakhir,
  type JenisSptjmUnit,
} from "../../../business-logic/sptjmUnit";
import {
  bacaTab,
  hitungTabelWajibSudah,
  kandidatAnomali,
  labelTemuanAnomali,
  labelSumberData,
  ringkasKesiapanPegawai,
  saringPegawai,
  subSptjmLembur,
  subSptjmUang,
  susunChecklist,
  susunStepper,
  totalTukinBersih,
  validasiNominalNol,
} from "../../../business-logic/tahapKalkulasiUnit";
import { TabelPemeriksaanLembur } from "./TabelPemeriksaanLembur";
import { KepalaKalkulasi } from "./KepalaKalkulasi";
import { StepperKalkulasi } from "./StepperKalkulasi";
import { TahapKesiapan } from "./TahapKesiapan";
import { SpandukPengembalian } from "./SpandukPengembalian";
import { TahapKalkulasi } from "./TahapKalkulasi";
import { TabelTukinRingkas } from "./TabelTukinRingkas";
import { TabelUangMakan } from "./TabelUangMakan";
import { TabelKoreksiLemburRinci } from "./TabelKoreksiLemburRinci";
import { TahapTteSptjm, type DokumenSptjmTampil } from "./TahapTteSptjm";
import { TahapPengiriman } from "./TahapPengiriman";
import { HALAMAN } from "../../../components/layout/layoutHalaman";
import { muatHariLiburPeriode } from "../../../lib/hariLibur";

export const dynamic = "force-dynamic";

const TARIF_UANG_LEMBUR_DEFAULT = 25_000; // TODO(confirm): sama seperti seedSimulasi.ts, bukan SBM resmi

const NAMA_HARI_LEMBUR = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const jamTeksLembur = (d: Date | null | undefined) =>
  d ? `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}` : null;

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
    halLembur?: string;
    perLembur?: string;
    tab?: string;
    q?: string;
    tinjau?: string;
  }>;
}) {
  const { bulan, tahun, satker, rincian, hal, per, halLembur, perLembur, tab: tabMentah, q: qMentah, tinjau } =
    await searchParams;
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
    return <AksesDitolak pesan="Peran kamu tidak berwenang mengelola kalkulasi unit ini." />;
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
  const namaBulan = NAMA_BULAN[periodeBulan - 1] ?? String(periodeBulan);

  // Nama yang akan TERCETAK sebagai penanda tangan SPTJM - sumbernya sama
  // dengan yang dipakai server saat menandatangani (data pegawai akun yang
  // login, src/app/tte/actions.ts), supaya yang dilihat di modal tidak
  // berbeda dengan yang tercetak.
  const pegawaiPenandatangan = await prisma.pegawai.findUnique({
    where: { nip: authUser.nip },
    select: { nama: true },
  });
  const namaPenandatanganSptjm = pegawaiPenandatangan ? namaCetakPegawai(pegawaiPenandatangan) : "";

  // Keadaan pengiriman unit periode ini. Menentukan: chip di kepala, boleh-
  // tidaknya tombol Kirim, dan kapan TTE SPTJM dianggap basi.
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
  const dikembalikanPada = barisPengiriman?.dikembalikanPada ?? null;

  // Centang "sudah saya periksa" per tabel. Dibaca dari database - sumber yang
  // SAMA dengan yang ditagih server saat Kirim ditekan, supaya tombol yang
  // menyala di layar tidak pernah berbeda dari keputusan server.
  const verifikasiTabel = await prisma.verifikasiTabelUnit.findMany({
    where: { satuanKerja: satkerEfektif, periodeBulan, periodeTahun },
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

  // PENCARIAN (?q=) - HANYA menyaring baris tabel. Semua angka di bawah
  // (jumlah tab, total, kesiapan, syarat kirim) dihitung dari pegawaiList /
  // pegawaiAktif utuh.
  const q = (qMentah ?? "").trim().slice(0, 100);
  const tab = bacaTab(tabMentah);
  const tampilRinci = rincian === "1";
  const pegawaiTersaring = saringPegawai(pegawaiList, q);

  // --- Bahan tab Lembur: dimuat HANYA saat tab itu dibuka ------------------
  //
  // Jumlah jam lembur HARIAN per pegawai - bahan pemeriksaan silang di tabel
  // Jam Lembur. Rincian harian yang mengalir ke berkas ADK (formatnya per
  // tanggal) dan total bulanan yang jadi dasar rupiah adalah DUA angka
  // tersimpan yang berbeda. Seharusnya selalu sama - dan kalau berbeda berarti
  // rekapnya dihitung sebelum presensinya berubah. Yang dibayar Web Gaji
  // adalah jam di berkas, bukan angka yang tersimpan, jadi selisihnya wajib
  // terlihat SEBELUM dikirim.
  const awalPeriodeLembur = new Date(Date.UTC(periodeTahun, periodeBulan - 1, 1));
  const akhirPeriodeLembur = new Date(Date.UTC(periodeTahun, periodeBulan, 1));
  const idSemua = pegawaiList.map((p) => p.id);

  const barisLembur: React.ComponentProps<typeof TabelPemeriksaanLembur>["baris"] = await (async () => {
    if (tab !== "lembur") return [];
    const [lemburHarianPerPegawai, koreksiLemburRows, hariLiburMap] = await Promise.all([
      prisma.presensiHarian.groupBy({
        by: ["pegawaiId"],
        where: {
          pegawaiId: { in: idSemua },
          tanggal: { gte: awalPeriodeLembur, lt: akhirPeriodeLembur },
          jamLembur: { gt: 0 },
        },
        _sum: { jamLembur: true },
      }),
      prisma.koreksiPresensiHarian.findMany({
        where: {
          pegawaiId: { in: idSemua },
          tanggal: { gte: awalPeriodeLembur, lt: akhirPeriodeLembur },
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
        pegawaiId: { in: idSemua },
        tanggal: { gte: awalPeriodeLembur, lt: akhirPeriodeLembur },
        OR: [{ jamLembur: { gt: 0 } }, { tanggal: { in: koreksiLemburRows.map((k) => k.tanggal) } }],
      },
      select: { pegawaiId: true, tanggal: true, jamMasuk: true, jamKeluar: true, jamLembur: true },
      orderBy: { tanggal: "asc" },
    });

    const petaLemburHarian = new Map(lemburHarianPerPegawai.map((g) => [g.pegawaiId, { jam: g._sum.jamLembur ?? 0 }]));
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

    return pegawaiList.map((p) => {
      const lembur = p.uangLembur[0];
      const harian = petaLemburHarian.get(p.id);
      const daftarPresensi = petaPresensiPerPegawai.get(p.id) ?? [];
      const daftarKoreksi = petaKoreksiLemburPerPegawai.get(p.id) ?? [];
      const petaKoreksiTgl = new Map(daftarKoreksi.map((k) => [k.tanggal.toISOString().slice(0, 10), k]));
      const petaPresensiTgl = new Map(daftarPresensi.map((pr) => [pr.tanggal.toISOString().slice(0, 10), pr]));
      const semuaTanggalIso = Array.from(new Set([...petaPresensiTgl.keys(), ...petaKoreksiTgl.keys()])).sort();

      const rincianHari = semuaTanggalIso.map((iso) => {
        const pr = petaPresensiTgl.get(iso);
        const kr = petaKoreksiTgl.get(iso);
        const d = pr ? pr.tanggal : kr!.tanggal;
        const day = d.getUTCDay();
        const liburKeterangan = hariLiburMap.get(iso);
        const isHariLibur = day === 0 || day === 6 || !!liburKeterangan;
        const keteranganHari = liburKeterangan ? liburKeterangan : day === 0 || day === 6 ? "Akhir Pekan" : "Hari Kerja";
        const [y, b, h] = iso.split("-");
        return {
          tanggalIso: iso,
          tanggalTampil: `${NAMA_HARI_LEMBUR[day]}, ${h}/${b}/${y}`,
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
    });
  })();

  // Berapa hari presensi tiap orang pernah dikoreksi manual pada periode ini.
  //
  // Bukan cacat data - justru sebaliknya. Ditampilkan karena yang memeriksa
  // berhak tahu baris mana yang sudah tidak apa adanya dari e-Presensi,
  // terutama kalau nanti angkanya dipersoalkan pegawainya.
  const koreksiPeriode = await prisma.koreksiPresensiHarian.groupBy({
    by: ["pegawaiId"],
    where: {
      pegawaiId: { in: pegawaiAktif.map((p) => p.id) },
      tanggal: { gte: awalPeriodeLembur, lt: akhirPeriodeLembur },
    },
    _count: { _all: true },
  });
  const petaKoreksi = new Map(koreksiPeriode.map((k) => [k.pegawaiId, k._count._all]));

  // PERUBAHAN DATA KEPEGAWAIAN unit ini - dipakai menandai angka basi.
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
      terdeteksiPada: { gte: awalPeriodeLembur },
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
  const sumberData = await ambilSumberData({
    satuanKerja: satkerEfektif,
    periodeBulan,
    periodeTahun,
  });

  // --- TTE SPTJM -----------------------------------------------------------
  // Dokumen TERBARU per jenis, dan penilaian sah/basi/belum, memakai fungsi
  // yang SAMA dengan gerbang di server (business-logic/sptjmUnit.ts).
  const dokumenRows = await prisma.dokumenTte
    .findMany({
      where: {
        satuanKerja: satkerEfektif,
        periodeBulan,
        periodeTahun,
        jenisDokumen: { in: [...URUTAN_SPTJM] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        jenisDokumen: true,
        status: true,
        nomorDokumen: true,
        fileSignedPath: true,
        signedAt: true,
        penandatanganNama: true,
        createdAt: true,
      },
    })
    .catch(() => []);
  const dokumenTerbaru = pilihDokumenTerbaru(dokumenRows);
  // Kalkulasi terakhir tiap komponen: SPTJM yang ditandatangani sebelum
  // hitung ulang wajib ditandatangani ulang (sama dengan gerbang di server).
  const dihitungTerakhir = {
    SPTJM_TUKIN: waktuTerakhir(pegawaiList.map((p) => p.tukinCalc[0]?.calculatedAt)),
    SPTJM_UANG_MAKAN: waktuTerakhir(pegawaiList.map((p) => p.uangMakan[0]?.calculatedAt)),
    SPTJM_LEMBUR: waktuTerakhir(pegawaiList.map((p) => p.uangLembur[0]?.calculatedAt)),
  };
  const tte = ringkasSyaratTte({
    dokumen: dokumenTerbaru,
    dikembalikanPada,
    lemburWajib: TAMPILKAN_NOMINAL_LEMBUR,
    dihitungTerakhir,
  });
  const jenisPerluUlang = URUTAN_SPTJM.filter((j) => tte.statusPerJenis[j] === "PERLU_TTE_ULANG");
  const dokumenTampil = Object.fromEntries(
    URUTAN_SPTJM.map((j) => {
      const d = dokumenTerbaru[j];
      const tampil: DokumenSptjmTampil | null = d
        ? {
            id: d.id,
            status: d.status,
            nomorDokumen: d.nomorDokumen,
            fileSignedPath: d.fileSignedPath,
            signedAt: d.signedAt ? d.signedAt.toISOString() : null,
            penandatanganNama: d.penandatanganNama,
          }
        : null;
      return [j, tampil];
    }),
  ) as Record<JenisSptjmUnit, DokumenSptjmTampil | null>;

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
  const ringkasKesiapan = ringkasKesiapanPegawai(kesiapan);

  const belumPunyaPredikat = pegawaiAktif.filter((p) => p.predikatKinerja.length === 0);
  const belumPunyaPresensi = pegawaiAktif.filter((p) => p.rekapPresensi.length === 0);

  // Kandidat pengecualian = tanpa predikat UNION kehadiran 0 hari sebulan.
  const petaPegawaiAktif = new Map(pegawaiAktif.map((p) => [p.nip, p]));
  const kandidat = kandidatAnomali(kesiapan.perPegawai).flatMap((k) => {
    const p = petaPegawaiAktif.get(k.nip);
    if (!p) return [];
    return [
      {
        id: p.id,
        nama: p.nama,
        nip: p.nip,
        temuan: labelTemuanAnomali(k.temuan),
        petunjuk: petunjukKemungkinanKeluar({
          jumlahHariKerja: p.rekapPresensi[0]?.jumlahHariKerja ?? 0,
          jumlahHariHadir: p.rekapPresensi[0]?.jumlahHariHadir ?? 0,
          punyaPredikat: p.predikatKinerja.length > 0,
          jumlahHariCuti: p.rekapPresensi[0]?.jumlahHariCuti ?? 0,
          jumlahHariTugasBelajar: p.rekapPresensi[0]?.jumlahHariTugasBelajar ?? 0,
        }),
      },
    ];
  });

  // Angka Tukin yang tampil di tabel adalah nilai TERSIMPAN, dibekukan saat
  // tombol Hitung ditekan. Kalau presensi atau predikatnya berubah setelah
  // itu (mis. presensi ditarik ulang karena ada koreksi jam), angkanya
  // menjadi basi tanpa tanda apa pun - dan orang menyimpulkan koreksinya
  // gagal. Kejadian nyata waktu fitur koreksi jam baru dipakai: rekap sudah
  // 0 pelanggaran, tapi Tukin tersimpan masih memuat potongan 1%.
  const perluHitungUlang = (p: (typeof pegawaiAktif)[number]): string | null => {
    const t = p.tukinCalc[0];
    if (!t) return null;
    // Aturan & alasannya ada di business-logic/kalkulasiBasi.ts.
    const sebab = sebabPerluHitungUlang({
      calculatedAt: t.calculatedAt,
      rekapDiunggahPada: p.rekapPresensi[0]?.diunggahPada ?? null,
      predikatSyncedAt: p.predikatKinerja[0]?.sourceSyncedAt ?? null,
      perubahanDataTerakhir: petaPerubahanTerbaru.get(p.nip) ?? null,
    });
    return sebab.length > 0 ? sebab.join(" & ") : null;
  };
  const jumlahPerluHitungUlang = pegawaiAktif.filter((p) => perluHitungUlang(p) !== null).length;

  // Rincian per unit penilai (Kepala Biro / Kasubbag TU / sumber tidak
  // tercatat) SENGAJA TIDAK ditampilkan - permintaan user, dua kali: pertama
  // di halaman Predikat Kinerja, lalu di kartu ini. Yang perlu diketahui
  // Kasubag TU cuma BERAPA yang sudah punya predikat, bukan siapa penilainya.

  // --- Angka ringkasan (SELURUH pegawai aktif, bukan halaman & bukan hasil cari)
  const jumlahKalkulasi = pegawaiAktif.filter((p) => p.tukinCalc.length > 0).length;
  const totalTukin = totalTukinBersih(pegawaiAktif.map((p) => p.tukinCalc[0]?.tukinBersih));
  const pegawaiPunyaMakan = pegawaiAktif.filter((p) => p.uangMakan.length > 0);
  const totalMakan = pegawaiPunyaMakan.reduce((n, p) => n + (p.uangMakan[0]?.totalUangMakan ?? 0), 0);
  const pegawaiBerlembur = pegawaiAktif.filter((p) => (p.uangLembur[0]?.totalJamLembur ?? 0) > 0);
  const totalJamLembur = pegawaiBerlembur.reduce((n, p) => n + (p.uangLembur[0]?.totalJamLembur ?? 0), 0);
  const totalUangLembur = pegawaiBerlembur.reduce((n, p) => n + (p.uangLembur[0]?.totalUangLembur ?? 0), 0);
  const nominalNol = validasiNominalNol(
    pegawaiAktif.map((p) => ({ nip: p.nip, nama: p.nama, tukinBersih: p.tukinCalc[0]?.tukinBersih ?? null })),
  );

  const checklist = susunChecklist({
    tte,
    nominalNol,
    totalPegawai: pegawaiAktif.length,
    jumlahKalkulasi,
    jumlahBasi: jumlahPerluHitungUlang,
    tabelDiverifikasi,
  });
  // GERBANG YANG SAMA dengan kirimRekapUnitAction di server. Pembaginya
  // `pegawaiAktif` (tanpa yang dikecualikan) - WAJIB sama dengan hitungan di
  // server, kalau berbeda tombolnya menyala tapi server menolak.
  const alasanTertahan = cekBolehKirim(
    {
      totalPegawai: pegawaiAktif.length,
      jumlahKalkulasi,
      tabelDiverifikasi,
      // Punya baris Tukin TIDAK SAMA DENGAN siap kirim: baris yang sumbernya
      // sudah berubah atau dihapus tetap berdiri dengan angka lama.
      jumlahBasi: jumlahPerluHitungUlang,
      sptjm: { dokumen: dokumenTerbaru, dikembalikanPada, lemburWajib: TAMPILKAN_NOMINAL_LEMBUR },
    },
    kirimStatus,
  ).alasan;

  const stepper = susunStepper({
    kesiapan: ringkasKesiapan,
    kalkulasiLengkap: pegawaiAktif.length > 0 && jumlahKalkulasi >= pegawaiAktif.length && jumlahPerluHitungUlang === 0,
    tte,
    tabelWajibSudah: hitungTabelWajibSudah(tabelDiverifikasi),
    tabelWajib: TABEL_WAJIB_DIVERIFIKASI.length,
    keadaan: kirimStatus.keadaan,
    jumlahDikecualikan: pengecualian.length,
  });

  // --- URL ------------------------------------------------------------------
  const paramDasar = new URLSearchParams({
    bulan: String(periodeBulan),
    tahun: String(periodeTahun),
    satker: satkerEfektif,
  });
  const urlDengan = (tambahan: Record<string, string | undefined>, jangkar: string) => {
    const p = new URLSearchParams(paramDasar);
    for (const [k, v] of Object.entries(tambahan)) if (v) p.set(k, v);
    return `/kasubag/kalkulasi?${p.toString()}${jangkar}`;
  };
  const bawaan = { q: q || undefined, per };
  const hrefTab = {
    tukin: urlDengan({ ...bawaan, rincian: tampilRinci ? "1" : undefined }, "#tahap-2"),
    makan: urlDengan({ ...bawaan, tab: "makan" }, "#tahap-2"),
    lembur: urlDengan({ ...bawaan, tab: "lembur", rincian: tampilRinci ? "1" : undefined }, "#tahap-2"),
  };
  const hrefRincian = urlDengan({ ...bawaan, rincian: "1" }, "#tahap-2");
  const hrefRingkas = urlDengan(bawaan, "#tahap-2");
  const hrefTinjau = urlDengan({ tinjau: "1" }, "#kecualikan");
  const paramForm: Record<string, string> = {
    bulan: String(periodeBulan),
    tahun: String(periodeTahun),
    satker: satkerEfektif,
    ...(tab !== "tukin" ? { tab } : {}),
    ...(tampilRinci ? { rincian: "1" } : {}),
    ...(per ? { per } : {}),
  };
  // Paginasi tukin/makan. Tabel Jam Lembur punya paginasinya sendiri
  // (halLembur/perLembur) dan membawa posisi halaman lainnya.
  const paramPaginasi = new URLSearchParams(paramDasar);
  if (tab !== "tukin") paramPaginasi.set("tab", tab);
  if (q) paramPaginasi.set("q", q);
  if (tampilRinci) paramPaginasi.set("rincian", "1");
  const paramPaginasiLembur = new URLSearchParams(paramPaginasi);
  if (hal) paramPaginasiLembur.set("hal", hal);
  if (per) paramPaginasiLembur.set("per", per);
  if (halLembur) paramPaginasi.set("halLembur", halLembur);
  if (perLembur) paramPaginasi.set("perLembur", perLembur);

  const paginasi = hitungPaginasi(pegawaiTersaring.length, hal, per);
  const pegawaiHalaman = pegawaiTersaring.slice(paginasi.mulai, paginasi.selesai);
  const kaki = (
    <Paginasi
      basePath="/kasubag/kalkulasi"
      params={paramPaginasi}
      info={paginasi}
      totalBaris={pegawaiTersaring.length}
      labelBaris="pegawai"
      anchor="tahap-2"
      varian="ringan"
    />
  );
  const hrefNama = (nip: string) =>
    `/tukin/presensi/${nip}?bulan=${periodeBulan}&tahun=${periodeTahun}&dari=kalkulasi&satker=${encodeURIComponent(satkerEfektif)}`;
  const kosongKarena =
    pegawaiList.length === 0
      ? "Belum ada pegawai aktif di unit ini pada periode ini."
      : `Tidak ada pegawai yang cocok dengan pencarian "${q}".`;

  // --- ISI TAB ----------------------------------------------------------------
  let isiTab: React.ReactNode;
  // Hanya untuk tabel rincian lengkap, dan hanya pegawai di halaman ini.
  const tapTidakWajar =
    tab === "tukin" && tampilRinci
      ? await hitungTapTidakWajarUnit(
          pegawaiHalaman.map((p) => p.id),
          satkerEfektif,
          periodeBulan,
          periodeTahun
        )
      : null;
  if (tab === "tukin") {
    isiTab = tampilRinci ? (
      <TabelRincianTukinLengkap
        nomorAwal={paginasi.mulai + 1}
        hrefNama={(b) => hrefNama(b.nip)}
        baris={pegawaiHalaman.map((p) => ({
          id: p.id,
          nip: p.nip,
          nama: p.nama,
          golongan: p.golongan,
          kelasJabatan: p.kelasJabatan ?? null,
          tukin: p.tukinCalc[0] ?? null,
          rekap: p.rekapPresensi[0] ?? null,
          predikat: p.predikatKinerja[0] ?? null,
          basi: perluHitungUlang(p),
          tapTidakWajar: tapTidakWajar?.get(p.id) ?? 0,
        }))}
        kaki={kaki}
      />
    ) : (
      <TabelTukinRingkas
        nomorAwal={paginasi.mulai + 1}
        kosongKarena={kosongKarena}
        kaki={kaki}
        baris={pegawaiHalaman.map((p) => {
          const tukin = p.tukinCalc[0];
          const predikat = p.predikatKinerja[0];
          const tarifKelas =
            p.kelasJabatan !== null && p.kelasJabatan !== undefined
              ? (TUKIN_POKOK_PER_KELAS_JABATAN[p.kelasJabatan] ?? null)
              : null;
          const rincianBaris = tukin ? rincianTukinTersimpan(tukin, tarifKelas) : null;
          return {
            id: p.id,
            nama: p.nama,
            nip: p.nip,
            kelasJabatan: p.kelasJabatan ?? null,
            predikat: predikat ? (LABEL_PREDIKAT[predikat.predikat] ?? predikat.predikat) : null,
            penuh: tarifKelas,
            bersih: tukin ? tukin.tukinBersih : null,
            dikecualikan: setDikecualikan.has(p.id),
            basi: setDikecualikan.has(p.id) ? null : perluHitungUlang(p),
            kurangKinerja: rincianBaris?.potonganKinerja ?? 0,
            adaSelisih: rincianBaris?.adaSelisih ?? false,
            hrefNama: hrefNama(p.nip),
          };
        })}
      />
    );
  } else if (tab === "makan") {
    isiTab = (
      <TabelUangMakan
        nomorAwal={paginasi.mulai + 1}
        kosongKarena={kosongKarena}
        kaki={kaki}
        baris={pegawaiHalaman.map((p) => {
          const um = p.uangMakan[0];
          return {
            id: p.id,
            nama: p.nama,
            nip: p.nip,
            kelasJabatan: p.kelasJabatan ?? null,
            dikecualikan: setDikecualikan.has(p.id),
            makan: um
              ? {
                  hariKerja: um.jumlahHariKerja,
                  hariDibayar: um.jumlahHariDibayar,
                  tarifHarian: um.tarifHarian,
                  total: um.totalUangMakan,
                }
              : null,
            hrefNama: hrefNama(p.nip),
          };
        })}
      />
    );
  } else {
    isiTab = (
      <>
        <TabelPemeriksaanLembur
          tertanam
          halaman={halLembur}
          perHalaman={perLembur}
          paramPaginasi={paramPaginasiLembur.toString()}
          periodeBulan={periodeBulan}
          periodeTahun={periodeTahun}
          terkunci={kirimStatus.terkunci}
          bolehKoreksi={canKoreksiJamPresensi(authUser, satkerEfektif)}
          hanyaPegawaiId={q ? pegawaiTersaring.map((p) => p.id) : undefined}
          baris={barisLembur}
        />
        {tampilRinci && (
          <TabelKoreksiLemburRinci
            periodeBulan={periodeBulan}
            periodeTahun={periodeTahun}
            kosongKarena={kosongKarena}
            kaki={kaki}
            baris={pegawaiHalaman.map((p) => ({
              id: p.id,
              nama: p.nama,
              nip: p.nip,
              kelasJabatan: p.kelasJabatan ?? null,
              totalJam: p.uangLembur[0]?.totalJamLembur ?? 0,
              totalUangLembur: p.uangLembur[0]?.totalUangLembur ?? null,
              tarifPerJam: p.uangLembur[0]?.tarifPerJam ?? TARIF_UANG_LEMBUR_DEFAULT,
              hrefNama: hrefNama(p.nip),
              berSpkl: spklBerlakuDiPeriode(p.satuanKerja, periodeBulan, periodeTahun),
            }))}
          />
        )}
      </>
    );
  }

  // Sub-judul tiap SPTJM. Lembur: JAM saja selama nominalnya ditahan.
  const ringkasanSptjm: Record<JenisSptjmUnit, string> = {
    SPTJM_TUKIN: subSptjmUang(jumlahKalkulasi, totalTukin),
    SPTJM_UANG_MAKAN: subSptjmUang(pegawaiPunyaMakan.length, totalMakan),
    SPTJM_LEMBUR: TAMPILKAN_NOMINAL_LEMBUR
      ? subSptjmUang(pegawaiBerlembur.length, totalUangLembur)
      : subSptjmLembur(pegawaiBerlembur.length, totalJamLembur),
  };

  return (
    <main className={HALAMAN}>
      <KepalaKalkulasi
        satuanKerja={satkerEfektif}
        namaBulan={namaBulan}
        periodeBulan={periodeBulan}
        periodeTahun={periodeTahun}
        satuanKerjaList={satuanKerjaList}
        keadaan={kirimStatus.keadaan}
        hrefExport={
          bolehExportRekap
            ? `/kasubag/kalkulasi/export?bulan=${periodeBulan}&tahun=${periodeTahun}&satker=${encodeURIComponent(satkerEfektif)}`
            : null
        }
        sumberAcuan={
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
        }
      />

      {/* Catatan PPABP di PUNCAK halaman - dibaca sebelum mulai memperbaiki. */}
      {kirimStatus.keadaan === "DIKEMBALIKAN" && kirimStatus.alasanKembali && (
        <SpandukPengembalian alasan={kirimStatus.alasanKembali} />
      )}

      <StepperKalkulasi langkah={stepper} />

      <TahapKesiapan
        ringkas={ringkasKesiapan}
        presensi={{
          sumber: labelSumberData(sumberData.find((s) => s.nama === "Kehadiran")?.sistemSumber),
          terisi: pegawaiAktif.length - belumPunyaPresensi.length,
          dari: pegawaiAktif.length,
          href: "/tukin/presensi",
          labelAksi: "Kelola presensi",
        }}
        predikat={{
          sumber: labelSumberData(sumberData.find((s) => s.nama === "Kinerja")?.sistemSumber),
          terisi: pegawaiAktif.length - belumPunyaPredikat.length,
          dari: pegawaiAktif.length,
          href: "/tukin/predikat-kinerja",
          labelAksi: "Kelola predikat kinerja",
        }}
        jumlahBelumPredikat={belumPunyaPredikat.length}
        kandidat={kandidat}
        hrefTinjau={hrefTinjau}
        tinjauTerbuka={tinjau === "1"}
        periodeBulan={periodeBulan}
        periodeTahun={periodeTahun}
        satuanKerja={satkerEfektif}
        namaBulan={namaBulan}
        dikecualikan={pengecualian.map((x) => ({
          id: x.id,
          pegawaiId: x.pegawaiId,
          nama: x.pegawai.nama,
          nip: x.pegawai.nip,
          alasanKode: x.alasanKode,
          alasan: alasanDariKode(x.alasanKode)?.label ?? x.alasanKode,
          penjelasan: x.penjelasan,
        }))}
        terkunci={kirimStatus.terkunci}
      />

      <TahapKalkulasi
        tab={tab}
        tampilRinci={tampilRinci}
        kataKunci={q}
        labelLembur={TAMPILKAN_NOMINAL_LEMBUR ? "Uang Lembur" : "Jam Lembur"}
        jumlahTab={{ tukin: jumlahKalkulasi, makan: pegawaiPunyaMakan.length, lembur: pegawaiBerlembur.length }}
        hrefTab={hrefTab}
        hrefRincian={hrefRincian}
        hrefRingkas={hrefRingkas}
        paramForm={paramForm}
        jumlahPegawaiAktif={pegawaiAktif.length}
        totalTukinBersih={totalTukin}
        jumlahMakan={pegawaiPunyaMakan.length}
        totalMakan={totalMakan}
        jumlahBasi={jumlahPerluHitungUlang}
        aksiHitung={
          <KalkulasiMassalForm
            tanpaKartu
            satuanKerja={satkerEfektif}
            periodeBulan={periodeBulan}
            periodeTahun={periodeTahun}
            jumlahBelumPunyaPredikat={belumPunyaPredikat.length}
            namaBulan={namaBulan}
          />
        }
        kontrolVerifikasi={null}
        isi={isiTab}
      />

      {/* Tahap 3 lebih lebar dari Tahap 4 di layar lebar; bertumpuk di layar
          sempit. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
        <TahapTteSptjm
          periodeBulan={periodeBulan}
          periodeTahun={periodeTahun}
          satuanKerja={satkerEfektif}
          namaPenandatangan={namaPenandatanganSptjm}
          dikembalikanPada={dikembalikanPada ? dikembalikanPada.toISOString() : null}
          dokumen={dokumenTampil}
          ringkasan={ringkasanSptjm}
          perluUlang={jenisPerluUlang}
          lemburWajib={TAMPILKAN_NOMINAL_LEMBUR}
          dihitungTerakhir={{
            SPTJM_TUKIN: dihitungTerakhir.SPTJM_TUKIN?.toISOString() ?? null,
            SPTJM_UANG_MAKAN: dihitungTerakhir.SPTJM_UANG_MAKAN?.toISOString() ?? null,
            SPTJM_LEMBUR: dihitungTerakhir.SPTJM_LEMBUR?.toISOString() ?? null,
          }}
          terkunci={kirimStatus.terkunci}
        />
        <TahapPengiriman
          keadaan={kirimStatus.keadaan}
          terkunci={kirimStatus.terkunci}
          alasanKembali={kirimStatus.keadaan === "DIKEMBALIKAN" ? kirimStatus.alasanKembali : null}
          periodeBulan={periodeBulan}
          periodeTahun={periodeTahun}
          satuanKerja={satkerEfektif}
          jumlahKalkulasi={jumlahKalkulasi}
          checklist={checklist}
          daftarNominalNol={nominalNol.nol.map((n) => n.nama)}
          alasanTertahan={alasanTertahan}
        />
      </div>

      {/* SPKL harian (lembur) punya halaman sendiri, tanpa entri sidebar.
          Hanya muncul di periode yang sudah masuk gerbang pilot SPKL. */}
      {spklBerlakuDiPeriode(satkerEfektif, periodeBulan, periodeTahun) && (
        <p className="mt-3 text-xs text-muted">
          SPKL harian (lembur) dibentuk otomatis dan diunduh terpisah di{" "}
          <Link
            href={`/kasubag/spkl?bulan=${periodeBulan}&tahun=${periodeTahun}&satker=${encodeURIComponent(satkerEfektif)}`}
            className="font-semibold text-teal-deep underline"
          >
            halaman SPKL Harian
          </Link>
          .
        </p>
      )}
    </main>
  );
}
