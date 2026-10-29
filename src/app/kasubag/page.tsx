import Link from "next/link";
import { prisma } from "../../lib/prisma";
import { canViewDashboardUnit, canExportRekapUnit } from "../../auth/permissions";
import { AksesDitolak } from "../../components/feedback/AksesDitolak";
import { FilterBar } from "../../components/forms/FilterBar";
import { resolveSatuanKerjaListUntukFilter, satkerTerkunciUntukAkun } from "../dashboardScope";
import {
  riwayatPengirimanPeriode,
  statusUnit,
  type JenisTabelKalkulasi,
  type KeadaanPeriode,
} from "../../business-logic/pengirimanUnit";
import { RiwayatKirimPeriode } from "./kirim/RiwayatKirimPeriode";
import { periodePunyaRekapPresensi, resolvePeriode } from "../periodeDefault";
import { ambilAksesUnit } from "./access";
import { AngkaNaik } from "./AngkaNaik";
import { persenTeks } from "../../components/charts/KitGrafik";
import { daftarKartuKomponen, daftarLangkahTutupBulan, ringkasLangkah } from "../../business-logic/langkahTutupBulan";
import { sebabPerluHitungUlang } from "../../business-logic/kalkulasiBasi";
import { bulanSebelumnyaDalamTahun, deltaPersen } from "../../business-logic/deltaPeriode";
import { tinggiBatangPersen } from "./tinggiBatang";
import { TAMPILKAN_MENU_LEMBUR, TAMPILKAN_NOMINAL_LEMBUR } from "../../lib/format/tampilUangLembur";
import { HALAMAN } from "../../components/layout/layoutHalaman";
import { KartuSambutanUnit } from "./KartuSambutanUnit";
import { StepperTutupBulan } from "./StepperTutupBulan";
import { qPeriodeUnit } from "./tautanLangkah";

export const dynamic = "force-dynamic";

const NAMA_BULAN_SINGKAT = [
  "JAN", "FEB", "MAR", "APR", "MEI", "JUN",
  "JUL", "AGU", "SEP", "OKT", "NOV", "DES",
];

const NAMA_BULAN_LENGKAP = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function formatRupiah(nilai: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
    notation: "compact",
  }).format(nilai);
}

function formatRupiahPenuh(nilai: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(nilai);
}

export default async function KasubagDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string; satker?: string }>;
}) {
  const { bulan, tahun, satker } = await searchParams;
  const akses = await ambilAksesUnit(satker);
  if (!akses) {
    return <AksesDitolak pesan="Kamu harus login dulu buat lihat halaman ini." />;
  }
  const { authUser, satkerEfektif, nama: namaSesi } = akses;

  const satuanKerjaRows = await prisma.pegawai.findMany({
    distinct: ["satuanKerja"],
    select: { satuanKerja: true },
    orderBy: { satuanKerja: "asc" },
  });
  const satuanKerjaList = resolveSatuanKerjaListUntukFilter(
    authUser,
    satuanKerjaRows.map((r) => r.satuanKerja)
  );

  if (!satkerEfektif) {
    return (
      <main className={HALAMAN}>
        <h1 className="text-2xl font-black tracking-tight text-ink">Dashboard Unit</h1>
        <p className="mt-1 text-sm text-muted">Pilih satuan kerja terlebih dahulu untuk melihat dashboard.</p>
        <div className="mt-4">
          <FilterBar satuanKerjaList={satuanKerjaList} bulan={bulan} tahun={tahun} satker={satker} />
        </div>
      </main>
    );
  }

  if (!canViewDashboardUnit(authUser, satkerEfektif)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang melihat dashboard unit ini." />;
  }

  // Dicek terpisah dari izin membuka dashboard: PIMPINAN boleh MELIHAT
  // dashboard unit tapi tidak mengunduh rekapnya, dan kalau kedua izin ini
  // ditumpangkan, menambah role pemantau berarti diam-diam memberi akses
  // unduh berkas berisi nama & NIP satu unit.
  const bolehExportRekap = canExportRekapUnit(authUser, satkerEfektif);

  // Daftar periodenya dari REKAP PRESENSI unit ini, bukan dari baris
  // pengiriman: periode yang belum pernah dikirim tidak punya baris, dan
  // justru itu yang dicari. Presensi, bukan kalkulasi: kalkulasi adalah HASIL
  // pekerjaan yang ditagih dashboard ini, jadi memakainya sebagai daftar
  // membuat periode yang belum pernah dihitung tidak akan pernah muncul.
  //
  // Periode bawaan melewati bulan berjalan (datanya belum final) dan menjaga
  // `?bulan=abc` - lihat resolvePeriode().
  const periodePresensiUnit = await periodePunyaRekapPresensi(satkerEfektif);
  const { bulan: periodeBulan, tahun: periodeTahun } = resolvePeriode(
    bulan,
    tahun,
    periodePresensiUnit
  );
  const periodeAktif = { periodeBulan, periodeTahun };
  const periodeLabel = `${NAMA_BULAN_LENGKAP[periodeBulan - 1]} ${periodeTahun}`;

  // PEMBAGI = pegawai yang IKUT periode ini: aktif dan tidak dikecualikan.
  // Harus SAMA PERSIS dengan yang ditagih gerbang kirim
  // (kirim/actions.ts); kalau tidak, stepper berkata "lengkap" sementara
  // tombol Kirim menolak.
  const pegawaiIkut = {
    satuanKerja: satkerEfektif,
    statusPegawai: "AKTIF",
    pengecualian: { none: periodeAktif },
  };

  const [
    totalPegawaiAktif,
    pegawaiRows,
    perubahanPegawai,
    verifikasiTabel,
    barisKirim,
    tukinRows,
    trendTukin,
    trendUm,
    trendLembur,
    countKgb,
    countHukdis,
    kalkulasiPerPeriode,
    pengirimanUnitIni,
  ] = await Promise.all([
    prisma.pegawai.count({ where: { satuanKerja: satkerEfektif, statusPegawai: "AKTIF" } }),
    // Satu query untuk SEMUA hitungan bahan & kalkulasi: tiap relasi disaring
    // ke periode ini, jadi `length > 0` berarti "punya".
    prisma.pegawai.findMany({
      where: pegawaiIkut,
      select: {
        nip: true,
        tukinCalc: { where: periodeAktif, select: { calculatedAt: true } },
        uangMakan: { where: periodeAktif, select: { id: true } },
        uangLembur: { where: periodeAktif, select: { id: true } },
        rekapPresensi: { where: periodeAktif, select: { diunggahPada: true } },
        predikatKinerja: { where: periodeAktif, select: { sourceSyncedAt: true } },
      },
    }),
    // Jendela & syaratnya SAMA dengan /kasubag/kalkulasi, supaya angka basi di
    // sini dan di sana tidak berbeda.
    prisma.perubahanDataPegawai.findMany({
      where: {
        terdeteksiPada: { gte: new Date(Date.UTC(periodeTahun, periodeBulan - 1, 1)) },
        OR: [{ satuanKerjaDari: satkerEfektif }, { satuanKerjaKe: satkerEfektif }],
      },
      select: { nip: true, terdeteksiPada: true },
    }),
    prisma.verifikasiTabelUnit.findMany({
      where: { satuanKerja: satkerEfektif, ...periodeAktif },
      select: { jenisTabel: true },
    }),
    prisma.pengirimanUnit.findUnique({
      where: {
        satuanKerja_periodeBulan_periodeTahun: { satuanKerja: satkerEfektif, ...periodeAktif },
      },
      select: { status: true, dikirimPada: true, alasanKembali: true, dikembalikanPada: true },
    }),
    // Cuma lima baris teratas buat daftar "Status Approval". Nilai total
    // periode diambil dari deret tren di bawah, bukan dijumlahkan dari sini.
    prisma.tukinCalculation.findMany({
      where: { ...periodeAktif, pegawai: { satuanKerja: satkerEfektif } },
      include: {
        pegawai: {
          select: { id: true, nama: true, nip: true, jabatan: true, kelasJabatan: true, golongan: true },
        },
      },
      orderBy: { tukinBersih: "desc" },
      take: 5,
    }),
    // Data tren 12 bulan (Jan - Des) di tahun terpilih.
    //
    // SENGAJA TIDAK memfilter status: yang ditampilkan memang SELURUH
    // kalkulasi, termasuk yang masih draft, sedang disanggah, dan yang
    // ditolak. Judul panelnya menyebut itu apa adanya ("Kalkulasi", bukan
    // "Realisasi") - dulu tidak, dan grafiknya terbaca sebagai uang yang
    // sudah pasti dibayar padahal bukan.
    //
    // Menyaring ke yang benar-benar disetujui BUKAN sekadar menambah
    // `where: { status }`. Yang menentukan disetujui atau belum di aplikasi
    // ini adalah PengirimanUnit (lihat tallyKirim), bukan kolom `status` -
    // kolom itu dipakai untuk rekonsiliasi dengan Web Gaji. Memakai kolom
    // status di sini akan memunculkan definisi "disetujui" KEDUA yang berbeda
    // dari halaman lain.
    prisma.tukinCalculation.groupBy({
      by: ["periodeBulan"],
      where: { periodeTahun, pegawai: { satuanKerja: satkerEfektif } },
      _sum: { tukinBersih: true },
      _count: { id: true },
    }),
    prisma.uangMakan.groupBy({
      by: ["periodeBulan"],
      where: { periodeTahun, pegawai: { satuanKerja: satkerEfektif } },
      _sum: { totalUangMakan: true },
    }),
    prisma.uangLembur.groupBy({
      by: ["periodeBulan"],
      where: { periodeTahun, pegawai: { satuanKerja: satkerEfektif } },
      _sum: { totalUangLembur: true },
    }),
    prisma.skKgb.count({ where: { pegawai: { satuanKerja: satkerEfektif } } }),
    prisma.skHukumanDisiplin.count({ where: { pegawai: { satuanKerja: satkerEfektif } } }),
    // Riwayat pengiriman unit INI di SELURUH periode: "periode mana saja yang
    // sudah saya kirim?" tidak punya jawaban di layar mana pun kalau periode
    // yang tidak dibuka tidak pernah terlihat.
    prisma.tukinCalculation.groupBy({
      by: ["periodeBulan", "periodeTahun"],
      where: { pegawai: { satuanKerja: satkerEfektif } },
      _count: { _all: true },
    }),
    prisma.pengirimanUnit.findMany({
      where: { satuanKerja: satkerEfektif },
      select: {
        periodeBulan: true,
        periodeTahun: true,
        status: true,
        dikirimPada: true,
        alasanKembali: true,
        dikembalikanPada: true,
        dikirimOleh: { select: { nama: true } },
      },
    }),
  ]);

  const status = statusUnit(barisKirim);


  const petaKalkulasi = new Map(
    kalkulasiPerPeriode.map((k) => [`${k.periodeBulan}|${k.periodeTahun}`, k._count._all])
  );
  const riwayatPeriode = riwayatPengirimanPeriode(
    periodePresensiUnit.map((p) => ({
      periodeBulan: p.bulan,
      periodeTahun: p.tahun,
      jumlahKalkulasi: petaKalkulasi.get(`${p.bulan}|${p.tahun}`) ?? 0,
    })),
    new Map(
      pengirimanUnitIni.map((p) => [
        `${p.periodeBulan}|${p.periodeTahun}`,
        { ...p, dikirimOleh: p.dikirimOleh?.nama ?? null },
      ])
    )
  );

  // --- Hitungan bahan & kalkulasi pegawai IKUT ------------------------------
  // Perubahan data TERBARU per NIP: satu perubahan saja sudah membuat angka
  // tersimpan harus dihitung ulang, jadi yang lama tidak menambah jawaban.
  const petaPerubahanTerbaru = new Map<string, Date>();
  for (const c of perubahanPegawai) {
    const ada = petaPerubahanTerbaru.get(c.nip);
    if (!ada || c.terdeteksiPada > ada) petaPerubahanTerbaru.set(c.nip, c.terdeteksiPada);
  }

  let jumlahPresensi = 0;
  let jumlahPredikat = 0;
  let jumlahTukin = 0;
  let jumlahUangMakan = 0;
  let jumlahLembur = 0;
  let jumlahBasi = 0;
  for (const p of pegawaiRows) {
    if (p.rekapPresensi.length > 0) jumlahPresensi++;
    if (p.predikatKinerja.length > 0) jumlahPredikat++;
    if (p.uangMakan.length > 0) jumlahUangMakan++;
    if (p.uangLembur.length > 0) jumlahLembur++;
    const t = p.tukinCalc[0];
    if (!t) continue; // belum ada angka = tidak ada yang bisa basi
    jumlahTukin++;
    // Aturan & alasannya ada di business-logic/kalkulasiBasi.ts - dipakai
    // juga oleh /kasubag/kalkulasi.
    const sebab = sebabPerluHitungUlang({
      calculatedAt: t.calculatedAt,
      rekapDiunggahPada: p.rekapPresensi[0]?.diunggahPada ?? null,
      predikatSyncedAt: p.predikatKinerja[0]?.sourceSyncedAt ?? null,
      perubahanDataTerakhir: petaPerubahanTerbaru.get(p.nip) ?? null,
    });
    if (sebab.length > 0) jumlahBasi++;
  }
  const totalPegawaiIkut = pegawaiRows.length;

  const keadaanLangkah = {
    totalPegawai: totalPegawaiIkut,
    jumlahPresensi,
    jumlahPredikat,
    jumlahTukin,
    jumlahBasi,
    jumlahUangMakan,
    tabelDiverifikasi: verifikasiTabel.map((v) => v.jenisTabel as JenisTabelKalkulasi),
    status,
  };
  const langkah = daftarLangkahTutupBulan(keadaanLangkah);
  const ringkas = ringkasLangkah(langkah);
  // Kartu komponen berjalan memakai keadaan yang SAMA dengan stepper, supaya
  // kartu yang hilang ("selesai") dan centang di stepper tidak berselisih.
  const kartuKomponen = daftarKartuKomponen({
    ...keadaanLangkah,
    jumlahLembur,
    tampilkanLembur: TAMPILKAN_MENU_LEMBUR,
  });
  const qPeriode = qPeriodeUnit(periodeBulan, periodeTahun, satkerEfektif);

  const keadaanKirim: KeadaanPeriode =
    status.keadaan === "BELUM_KIRIM" && jumlahTukin === 0 ? "BELUM_DIHITUNG" : status.keadaan;

  // --- Nilai kalkulasi & tren ----------------------------------------------
  const nominalTukinTotal = trendTukin.find((t) => t.periodeBulan === periodeBulan)?._sum.tukinBersih ?? 0;
  const nominalUmTotal = trendUm.find((t) => t.periodeBulan === periodeBulan)?._sum.totalUangMakan ?? 0;
  const nominalLemburTotal = trendLembur.find((t) => t.periodeBulan === periodeBulan)?._sum.totalUangLembur ?? 0;
  // Uang lembur dikeluarkan dari total selama angkanya belum ditampilkan -
  // lihat src/lib/format/tampilUangLembur.ts. Total yang memuat komponen tak
  // terlihat tidak bisa dicocokkan pembacanya dan terbaca sebagai salah hitung.
  const totalNominalPeriode =
    nominalTukinTotal + nominalUmTotal + (TAMPILKAN_NOMINAL_LEMBUR ? nominalLemburTotal : 0);
  // Potongan total untuk rincian di kartu Nilai Kalkulasi. Komponennya HARUS
  // sama dengan totalNominalPeriode - kalau tidak, rinciannya tidak menjumlah
  // ke angka besar di atasnya.
  const rincianNilai = [
    { nama: "Tunjangan Kinerja", nilai: nominalTukinTotal, kelas: "bg-seri-1" },
    { nama: "Uang Makan", nilai: nominalUmTotal, kelas: "bg-seri-4" },
    ...(TAMPILKAN_NOMINAL_LEMBUR ? [{ nama: "Uang Lembur", nilai: nominalLemburTotal, kelas: "bg-seri-7" }] : []),
  ];

  // Pembanding bulan lalu diambil dari deret tren yang SUDAH ditarik di atas -
  // tidak ada query tambahan. Januari tidak punya pembanding karena deret itu
  // cuma memuat satu tahun (lihat bulanSebelumnyaDalamTahun).
  const bulanLalu = bulanSebelumnyaDalamTahun(periodeBulan);
  //
  // KOMPONENNYA HARUS SAMA DENGAN `totalNominalPeriode` DI ATAS. Selama uang
  // lembur ditahan, bulan ini dihitung tanpa lembur - kalau bulan pembandingnya
  // tetap memuat lembur, selisihnya menunjukkan penurunan belanja yang tidak
  // pernah terjadi. Dua angka yang dibandingkan harus dibentuk dari bahan yang
  // sama, atau perbandingannya tidak berarti apa-apa.
  const totalNominalBulanLalu =
    bulanLalu === null
      ? null
      : (trendTukin.find((t) => t.periodeBulan === bulanLalu)?._sum.tukinBersih ?? 0) +
        (trendUm.find((t) => t.periodeBulan === bulanLalu)?._sum.totalUangMakan ?? 0) +
        (TAMPILKAN_NOMINAL_LEMBUR
          ? trendLembur.find((t) => t.periodeBulan === bulanLalu)?._sum.totalUangLembur ?? 0
          : 0);
  const deltaBelanja = deltaPersen(totalNominalPeriode, totalNominalBulanLalu);

  // Pengolahan data bulanan 12 bulan (Jan - Des)
  const dataBulanan = Array.from({ length: 12 }, (_, i) => {
    const bulanIndex = i + 1;
    const itemTukin = trendTukin.find((t) => t.periodeBulan === bulanIndex);
    const itemUm = trendUm.find((u) => u.periodeBulan === bulanIndex);
    const itemLembur = trendLembur.find((l) => l.periodeBulan === bulanIndex);

    // Deret tren mengikuti aturan yang sama dengan total di atas - kalau
    // tidak, grafiknya dan angka besarnya bercerita hal yang berbeda.
    const nominalBulan =
      (itemTukin?._sum.tukinBersih ?? 0) +
      (itemUm?._sum.totalUangMakan ?? 0) +
      (TAMPILKAN_NOMINAL_LEMBUR ? itemLembur?._sum.totalUangLembur ?? 0 : 0);
    const pegawaiBulan = itemTukin?._count.id ?? 0;

    return {
      bulan: bulanIndex,
      namaSingkat: NAMA_BULAN_SINGKAT[i],
      namaLengkap: NAMA_BULAN_LENGKAP[i],
      nominal: nominalBulan,
      pegawai: pegawaiBulan,
    };
  });

  const maxNominalBulanan = Math.max(...dataBulanan.map((d) => d.nominal), 1);

  // Tema palet 2026 dipakai di dua halaman: /ppabp dan /kasubag - lihat blok
  // `[data-tema="palet-2026"]` di globals.css. `min-h-full` supaya latar
  // menutup seluruh kolom konten, bukan cuma setinggi isinya.
  return (
    <div data-tema="palet-2026" className="min-h-full">
      <main className={`${HALAMAN} space-y-6`}>
        {/* ==================================================================
            1. SAMBUTAN - sampai mana, apa berikutnya, bagaimana komponennya.

            Tidak ada tombol kirim dan tidak ada tenggat di dashboard ini:
            gerbang kirim hidup di /kasubag/kalkulasi#kirim, dan data tenggat
            yang sah tidak ada - jam hitung mundur tanpa sumber hanya
            menciptakan urgensi palsu.
            ================================================================== */}
        <KartuSambutanUnit
          nama={namaSesi}
          satuanKerja={satkerEfektif}
          periodeLabel={periodeLabel}
          ringkas={ringkas}
          keadaanKirim={keadaanKirim}
          qPeriode={qPeriode}
          totalPegawaiAktif={totalPegawaiAktif}
          kartu={kartuKomponen}
          sisaLangkah={langkah
            .filter((l) => l.status !== "SELESAI" && l.status !== "TIDAK_BERLAKU")
            .map((l) => ({ kode: l.kode, judul: l.judul }))}
        />

        {/* ==================================================================
            2. FILTER - periode EFEKTIF, bukan isi query string, supaya
            dropdown tidak berbunyi "Semua bulan" di bawah judul yang menyebut
            satu periode. Yang seragam dengan dashboard lintas unit tinggal
            filter ringkas ini; baris pintasannya sudah dicabut dari keduanya.
            ================================================================== */}
        <div
          className="gj-masuk flex flex-wrap items-center justify-between gap-x-6 gap-y-3"
          style={{ animationDelay: "70ms" }}
        >
          <FilterBar
            ringkas
            satkerTerkunci={satkerTerkunciUntukAkun(authUser)}
            satuanKerjaList={satuanKerjaList}
            bulan={String(periodeBulan)}
            tahun={String(periodeTahun)}
            satker={satkerEfektif}
          />
        </div>

        {/* ==================================================================
            3. STEPPER - selebar halaman, langkah berjajar ke samping.
            Panel "Perlu perhatian" dicabut (permintaan user 2026-10-27);
            alasan pengembalian PPABP & angka basi tetap tampil sebagai
            catatan di langkah Kirim & Hitung.
            ================================================================== */}
        <StepperTutupBulan
          langkah={langkah}
          periodeLabel={periodeLabel}
          qPeriode={qPeriode}
          bolehExportRekap={bolehExportRekap}
        />


        {/* ==================================================================
            4. NILAI KALKULASI + TREN 12 BULAN
            ================================================================== */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div
            className="gj-masuk flex flex-col justify-between rounded-2xl border border-line bg-surface p-5 shadow-xs lg:col-span-4"
            style={{ animationDelay: "225ms" }}
          >
            <div className="flex items-center justify-between">
              {/* "Belanja" diganti "Nilai Kalkulasi" karena angkanya berasal
                  dari kalkulasi yang TIDAK disaring status - sama dengan
                  grafik tren, dan dalam istilah anggaran "belanja" berarti
                  yang sudah direalisasikan. Sudah dikirim ke PPABP atau belum
                  dijawab lencana status di kartu sambutan. */}
              <h2 className="text-sm font-bold text-ink-2">Nilai Kalkulasi</h2>
              <div className="rounded-lg bg-green-tint p-1.5 text-green">
                <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="mt-4">
              <div className="font-mono text-3xl font-extrabold text-ink">
                <AngkaNaik nilai={totalNominalPeriode} sebagai="rupiah-ringkas" tundaMs={225} />
              </div>
              {/* Penanda perubahan cuma dirender kalau MEMANG ada pembandingnya.
                  Bulan tanpa data pembanding sengaja tidak menampilkan "0%" -
                  itu akan terbaca "tidak berubah" padahal artinya "tidak
                  diketahui". Lihat deltaPersen(). */}
              {deltaBelanja ? (
                <p className="mt-1 flex items-center gap-1 text-xs" title={formatRupiahPenuh(totalNominalPeriode)}>
                  <span
                    className={`font-bold ${
                      deltaBelanja.arah === "naik"
                        ? "text-green"
                        : deltaBelanja.arah === "turun"
                          ? "text-red"
                          : "text-muted"
                    }`}
                  >
                    {deltaBelanja.arah === "naik" ? "▲" : deltaBelanja.arah === "turun" ? "▼" : "="}{" "}
                    <span className="font-mono">{deltaBelanja.persen}%</span>
                  </span>
                  <span className="text-muted">vs {NAMA_BULAN_LENGKAP[(bulanLalu ?? 1) - 1]}</span>
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted" title={formatRupiahPenuh(totalNominalPeriode)}>
                  Periode {periodeBulan}/{periodeTahun}
                </p>
              )}
            </div>

            {/* RINCIAN TOTAL di sisa ruang kartu: dari mana angka di atas
                berasal. Batangnya potongan dari SATU total yang sama
                (saling lepas, jumlahnya 100%), angka mutlaknya ikut tertulis.
                Lembur TIDAK ikut selama nominalnya ditahan - sama dengan
                totalnya. */}
            <div className="mt-6 border-t border-line-2 pt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Rincian</p>
              {totalNominalPeriode > 0 && (
                <div aria-hidden="true" className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-line-2">
                  {rincianNilai.map((r) =>
                    r.nilai > 0 ? (
                      <div key={r.nama} className={`h-full ${r.kelas}`} style={{ width: `${(r.nilai / totalNominalPeriode) * 100}%` }} />
                    ) : null
                  )}
                </div>
              )}
              <ul className="mt-3 space-y-2">
                {rincianNilai.map((r) => (
                  <li key={r.nama} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 text-ink-2">
                      <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${r.kelas}`} />
                      {r.nama}
                    </span>
                    <span className="flex items-baseline gap-2" title={formatRupiahPenuh(r.nilai)}>
                      <span className="font-mono font-bold text-ink">{formatRupiah(r.nilai)}</span>
                      {totalNominalPeriode > 0 && (
                        <span className="w-10 text-right font-mono text-xs text-muted">
                          {persenTeks(r.nilai, totalNominalPeriode)}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">
                Semua status, termasuk yang belum dikirim.
                {!TAMPILKAN_NOMINAL_LEMBUR && " Uang lembur belum masuk hitungan."}
              </p>
            </div>
          </div>

          <div
            className="gj-masuk flex flex-col justify-between rounded-2xl border border-line bg-surface p-5 shadow-xs lg:col-span-8"
            style={{ animationDelay: "250ms" }}
          >
            <div className="flex items-center justify-between pb-3 border-b border-line-2">
              <div>
                <h2 className="text-sm font-bold text-ink">Tren Kalkulasi Belanja Unit</h2>
                {/* Keterangan status ini WAJIB ada selama grafiknya tidak
                    memfilter apa pun - lihat catatan di query tren di atas. */}
                <p className="text-xs text-muted">
                  Tukin + uang makan {periodeTahun}, semua status
                </p>
              </div>
              <span className="rounded-xl border border-line bg-surface-2 px-3 py-1 text-xs font-bold text-ink">
                Tahun {periodeTahun}
              </span>
            </div>

            <div className="mt-4 flex flex-1 flex-col justify-end">
              <div className="grid h-44 grid-cols-12 items-end gap-1.5 sm:gap-2.5 pt-4">
                {dataBulanan.map((d, i) => {
                  const tinggiPersen = tinggiBatangPersen(d.nominal, maxNominalBulanan);
                  const isSelected = d.bulan === periodeBulan;

                  return (
                    <div key={d.bulan} className="group relative flex flex-col items-center h-full justify-end">
                      {/* Garis bidik tegak - menyambungkan batang yang sedang
                          disentuh dengan tooltipnya. Di grafik 12 kolom rapat,
                          tooltip yang mengambang sendirian menyisakan keraguan
                          batang mana yang sedang dibaca. */}
                      <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-biru/30 group-hover:block" />

                      <div className="pointer-events-none absolute -top-10 left-1/2 z-20 hidden -translate-x-1/2 rounded-lg bg-navy-deep px-2.5 py-1 text-[10px] font-bold text-white shadow-md whitespace-nowrap group-hover:block">
                        {d.namaLengkap}: {d.nominal > 0 ? formatRupiah(d.nominal) : "Rp 0"}
                        {/* Jumlah pegawainya ikut disebut supaya bulan yang
                            rendah bisa dibedakan: belanjanya memang kecil,
                            atau kalkulasinya yang baru sebagian dibuat. */}
                        {d.pegawai > 0 && (
                          <span className="font-medium text-white/70"> &bull; {d.pegawai} pegawai</span>
                        )}
                      </div>

                      <div className="relative flex h-full w-full max-w-[28px] items-end rounded-t-lg bg-line-2/70 p-0.5">
                        <div
                          style={
                            {
                              // Tinggi dikirim lewat custom property supaya
                              // @keyframes bisa membacanya - nilai `to` sebuah
                              // keyframe tidak bisa mengambil dari inline style
                              // biasa. Kelas .gj-batang yang memakainya.
                              "--tinggi-batang": `${tinggiPersen}%`,
                              // Berurutan kiri ke kanan; mulai sesudah panelnya
                              // sendiri selesai masuk, supaya tidak terbaca
                              // sebagai dua gerakan bertabrakan.
                              animationDelay: `${660 + i * 45}ms`,
                            } as React.CSSProperties
                          }
                          // min-h-[4px] menjaga batang yang sungguhan kecil
                          // tetap terlihat TANPA membohongi proporsinya. Bulan
                          // bernilai nol tidak mendapatkannya: yang tampil
                          // tinggal jalur latarnya yang kosong.
                          className={`gj-batang w-full rounded-md transition-all duration-300 ${
                            d.nominal > 0 ? "min-h-[4px]" : ""
                          } ${
                            isSelected
                              ? "bg-gradient-to-t from-navy to-biru shadow-sm ring-2 ring-biru/40"
                              : d.nominal > 0
                              ? "bg-biru/70 hover:bg-biru"
                              : "bg-line hover:bg-muted/30"
                          }`}
                        />
                      </div>

                      <span
                        className={`mt-2 text-[10px] font-bold ${
                          isSelected ? "text-navy font-black underline underline-offset-2" : "text-muted"
                        }`}
                      >
                        {d.namaSingkat}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-line-2 pt-3 text-xs text-muted">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-navy" />
                  <span>Bulan Terpilih ({NAMA_BULAN_SINGKAT[periodeBulan - 1]})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-biru/70" />
                  <span>Bulan Lainnya</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Progres pengiriman SELURUH unit TIDAK ditampilkan di sini (keputusan
            user 2026-10-28, mencabut keputusan 2026-09-02): Kasubag TU hanya
            melihat unitnya sendiri. Papan semua unit milik PPABP, di
            /ppabp/adk. Yang tersisa menjawab "periode mana untuk unit saya". */}
        <RiwayatKirimPeriode riwayat={riwayatPeriode} satuanKerja={satkerEfektif} />

        {/* ==================================================================
            5. STATUS APPROVAL PEGAWAI (7 kolom) + DOKUMEN UNIT (5 kolom)
            ================================================================== */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div
            className="gj-masuk rounded-2xl border border-line bg-surface p-5 shadow-xs lg:col-span-7"
            style={{ animationDelay: "420ms" }}
          >
            <div className="flex items-center justify-between pb-3 border-b border-line-2">
              <div>
                <h2 className="text-sm font-bold text-ink">Status Approval Pegawai Unit Terkini</h2>
                <p className="text-xs text-muted">Daftar perhitungan Tukin periode berjalan</p>
              </div>
              <Link
                href={`/kasubag/pegawai?satker=${encodeURIComponent(satkerEfektif)}`}
                className="text-xs font-semibold text-biru hover:underline"
              >
                Lihat Semua ({totalPegawaiAktif}) &rarr;
              </Link>
            </div>

            <div className="mt-4 divide-y divide-line-2">
              {tukinRows.length === 0 && (
                <div className="py-8 text-center text-sm text-muted">
                  Belum ada data kalkulasi Tukin pada periode {periodeBulan}/{periodeTahun}.
                </div>
              )}
              {tukinRows.map((row) => {
                const rowStatus = row.status;
                const isApproved = rowStatus === "APPROVED" || rowStatus === "COCOK" || rowStatus === "DIKIRIM";
                const isTertolak = rowStatus === "SELISIH";
                const isProses = rowStatus === "SANGGAH";

                const badgeColor = isApproved
                  ? "bg-green-tint text-green"
                  : isTertolak
                  ? "bg-red-tint text-red"
                  : isProses
                  ? "bg-teal-tint text-navy"
                  : "bg-line text-muted";

                const badgeText = isApproved
                  ? "Disetujui"
                  : isTertolak
                  ? "Ditolak"
                  : isProses
                  ? "Proses"
                  : "Draft";

                return (
                  <div key={row.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-ink">{row.pegawai.nama}</p>
                      <p className="truncate text-[11px] text-muted">
                        NIP {row.pegawai.nip} &bull; Kelas {row.pegawai.kelasJabatan ?? "-"}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <p className="font-mono text-xs font-bold text-ink">{formatRupiahPenuh(row.tukinBersih)}</p>
                        <p className="text-[10px] text-muted">Tukin Bersih</p>
                      </div>
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ${badgeColor}`}>
                        {badgeText}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            className="gj-masuk rounded-2xl border border-line bg-surface p-5 shadow-xs lg:col-span-5"
            style={{ animationDelay: "480ms" }}
          >
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-line-2">
              <div>
                <h2 className="text-sm font-bold text-ink">Dokumen unit</h2>
                <p className="text-xs text-muted">SK pendukung perhitungan</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-line-2 bg-surface-2 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-muted">SK KGB Unit</span>
                  <span className="font-mono text-sm font-extrabold text-ink">{countKgb}</span>
                </div>
                <Link
                  href={`/kasubag/sk-kgb?satker=${encodeURIComponent(satkerEfektif)}`}
                  className="mt-2 block text-[11px] font-semibold text-biru hover:underline"
                >
                  Kelola SK KGB &rarr;
                </Link>
              </div>

              <div className="rounded-xl border border-line-2 bg-surface-2 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-muted">SK Hukdis</span>
                  <span className="font-mono text-sm font-extrabold text-ink">{countHukdis}</span>
                </div>
                <Link
                  href={`/kasubag/sk-hukuman-disiplin?satker=${encodeURIComponent(satkerEfektif)}`}
                  className="mt-2 block text-[11px] font-semibold text-biru hover:underline"
                >
                  Kelola Hukdis &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
