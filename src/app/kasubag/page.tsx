import Link from "next/link";
import { prisma } from "../../lib/prisma";
import { canViewDashboardUnit, canExportRekapUnit } from "../../auth/permissions";
import { AksesDitolak } from "../AksesDitolak";
import { FilterBar } from "../FilterBar";
import { resolveSatuanKerjaListUntukFilter, satkerTerkunciUntukAkun } from "../dashboardScope";
import { kunciKirim, tallyKirim } from "../tallyKirim";
import { rangkumProgres } from "../../business-logic/pengirimanUnit";
import { PapanProgres } from "./kirim/PapanProgres";
import { ambilAksesUnit } from "./access";
import { AngkaNaik } from "../AngkaNaik";
import { langkahTutupBulan } from "../../business-logic/langkahTutupBulan";
import { bulanSebelumnyaDalamTahun, deltaPersen } from "../../business-logic/deltaPeriode";
import { tinggiBatangPersen } from "../tinggiBatang";
import { TAMPILKAN_MENU_LEMBUR, TAMPILKAN_NOMINAL_LEMBUR } from "../tampilUangLembur";

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

/**
 * Nama untuk sapaan - maksimal dua kata.
 *
 * Nama dari SIAP sering panjang dan bergelar ("IRVAN GANEVA, M.M. , S.Ds"),
 * dan sapaan yang memuat seluruhnya justru terbaca kaku. Dua kata pertama
 * menangani mayoritas nama Indonesia dengan wajar.
 *
 * HURUF BESARNYA TIDAK DIUBAH. Banyak nama di SIAP tersimpan kapital penuh,
 * dan menurunkannya jadi Title Case akan merusak nama yang memang ditulis
 * begitu ("LA ODE", singkatan gelar) - proyek ini sudah punya aturan bahwa
 * nama pegawai tidak dikarang ulang.
 */
function sapaanNama(nama: string): string {
  const kata = nama.trim().split(/\s+/).filter(Boolean);
  if (kata.length === 0) return "";
  return kata.slice(0, 2).join(" ").replace(/,$/, "");
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
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
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

  // Default periode = periode Tukin paling baru yang ada datanya
  let periodeBulan = bulan ? Number(bulan) : undefined;
  let periodeTahun = tahun ? Number(tahun) : undefined;
  if (!periodeBulan || !periodeTahun) {
    const terbaru = await prisma.tukinCalculation.findFirst({
      where: { pegawai: { satuanKerja: satkerEfektif } },
      orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }],
      select: { periodeBulan: true, periodeTahun: true },
    });
    periodeBulan = periodeBulan ?? terbaru?.periodeBulan ?? new Date().getMonth() + 1;
    periodeTahun = periodeTahun ?? terbaru?.periodeTahun ?? new Date().getFullYear();
  }

  const [
    totalPegawai,
    tukinRows,
    umRows,
    lemburRows,
    trendTukin,
    trendUm,
    trendLembur,
    countPredikat,
    countBanding,
    countKgb,
    countHukdis,
    countPresensi,
  ] = await Promise.all([
    prisma.pegawai.count({
      where: { satuanKerja: satkerEfektif, statusPegawai: "AKTIF" },
    }),
    prisma.tukinCalculation.findMany({
      where: { periodeBulan, periodeTahun, pegawai: { satuanKerja: satkerEfektif } },
      include: {
        pegawai: {
          select: {
            id: true,
            nama: true,
            nip: true,
            jabatan: true,
            kelasJabatan: true,
            golongan: true,
          },
        },
      },
      orderBy: { tukinBersih: "desc" },
    }),
    prisma.uangMakan.findMany({
      where: { periodeBulan, periodeTahun, pegawai: { satuanKerja: satkerEfektif } },
    }),
    prisma.uangLembur.findMany({
      where: { periodeBulan, periodeTahun, pegawai: { satuanKerja: satkerEfektif } },
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
    // ini adalah PengirimanUnit (lihat tallyKirim),
    // bukan kolom `status` - kolom itu dipakai untuk rekonsiliasi dengan Web
    // Gaji. Memakai kolom status di sini akan memunculkan definisi "disetujui"
    // KEDUA yang berbeda dari kartu KPI di halaman yang sama. Menghitungnya
    // dengan cara yang benar berarti menarik seluruh baris setahun beserta
    // log-nya (unit 500 pegawai = ~18.000 baris tiap kali halaman dibuka),
    // dan itu tidak sepadan untuk sebuah grafik ringkasan.
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
    // Data kelengkapan dokumen pendukung
    prisma.predikatKinerja.count({
      where: { periodeBulan, periodeTahun, pegawai: { satuanKerja: satkerEfektif } },
    }),
    prisma.banding.findMany({
      where: { pegawai: { satuanKerja: satkerEfektif }, periodeBulan, periodeTahun },
      select: { status: true },
    }),
    prisma.skKgb.count({
      where: { pegawai: { satuanKerja: satkerEfektif } },
    }),
    prisma.skHukumanDisiplin.count({
      where: { pegawai: { satuanKerja: satkerEfektif } },
    }),
    // Kesiapan presensi - komponen 30% Tukin. Dashboard ini dulu cuma
    // menghitung predikat (yang 70%), jadi unit yang presensinya belum ditarik
    // tetap terlihat "siap" sampai kalkulasinya dijalankan dan hasilnya nol.
    // Ikut menumpang Promise.all yang sudah ada - tidak menambah bolak-balik
    // ke database, cuma satu query lagi di gelombang yang sama.
    prisma.rekapPresensiPeriode.count({
      where: { periodeBulan, periodeTahun, pegawai: { satuanKerja: satkerEfektif } },
    }),
  ]);

  // Keadaan tiap baris = keadaan PENGIRIMAN unit ini pada periode ini.
  // Halaman ini selalu satu unit (`satkerEfektif`), jadi seluruh baris jatuh
  // ke keadaan yang sama - dan itu memang bentuk keputusannya sekarang, bukan
  // penyederhanaan tampilan.
  const barisKirim = await prisma.pengirimanUnit.findUnique({
    where: {
      satuanKerja_periodeBulan_periodeTahun: {
        satuanKerja: satkerEfektif,
        periodeBulan,
        periodeTahun,
      },
    },
    select: { status: true },
  });
  const kunciUnit = kunciKirim(satkerEfektif, periodeBulan, periodeTahun);

  // --- Progres pengiriman SELURUH unit pada periode ini --------------------
  //
  // Kasubag TU sengaja melihat unit LAIN juga (permintaan user 2026-09-02).
  // Isinya cuma nama unit + sudah kirim atau belum - tidak ada satu pun angka
  // rupiah, jadi tidak menembus scoping data gaji yang tetap berlaku di
  // seluruh halaman lain.
  //
  // Daftar unitnya dari PEGAWAI, bukan dari baris pengiriman: unit yang belum
  // mengirim tidak punya baris, dan justru merekalah yang perlu terlihat.
  const unitAktif = await prisma.pegawai.findMany({
    where: { statusPegawai: "AKTIF" },
    distinct: ["satuanKerja"],
    select: { satuanKerja: true },
  });
  const pengirimanSemuaUnit = await prisma.pengirimanUnit.findMany({
    where: { periodeBulan, periodeTahun },
  });
  const progresUnit = rangkumProgres(
    unitAktif.map((u) => u.satuanKerja),
    new Map(pengirimanSemuaUnit.map((p) => [p.satuanKerja, p]))
  );
  const petaKirim = new Map(barisKirim ? [[kunciUnit, barisKirim.status]] : []);

  const tallyTukin = tallyKirim(tukinRows.map(() => kunciUnit), petaKirim);
  const tallyUm = tallyKirim(umRows.map(() => kunciUnit), petaKirim);
  const tallyLembur = tallyKirim(lemburRows.map(() => kunciUnit), petaKirim);

  const nominalTukinTotal = tukinRows.reduce((a, r) => a + r.tukinBersih, 0);
  const nominalUmTotal = umRows.reduce((a, r) => a + r.totalUangMakan, 0);
  const nominalLemburTotal = lemburRows.reduce((a, r) => a + r.totalUangLembur, 0);
  // Uang lembur dikeluarkan dari total selama angkanya belum ditampilkan -
  // lihat src/app/tampilUangLembur.ts. Total yang memuat komponen tak
  // terlihat tidak bisa dicocokkan pembacanya dan terbaca sebagai salah hitung.
  const totalNominalPeriode =
    nominalTukinTotal + nominalUmTotal + (TAMPILKAN_NOMINAL_LEMBUR ? nominalLemburTotal : 0);

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

  const totalKalkulasi = tallyTukin.total + tallyUm.total + tallyLembur.total;
  const totalTerkirim = tallyTukin.terkirim + tallyUm.terkirim + tallyLembur.terkirim;
  const totalBelumKirim = tallyTukin.belumKirim + tallyUm.belumKirim + tallyLembur.belumKirim;
  const totalDikembalikan = tallyTukin.dikembalikan + tallyUm.dikembalikan + tallyLembur.dikembalikan;

  // Persentase progres pengiriman. CATATAN: karena unit dikirim UTUH, nilai
  // ini praktis cuma 0 atau 100 - tidak ada keadaan "60% terkirim". Kartunya
  // dipertahankan atas permintaan user; yang dibuang cuma blok "Status
  // Approval per Komponen".
  const persenTukin = tallyTukin.total > 0 ? Math.round((tallyTukin.terkirim / tallyTukin.total) * 100) : 0;
  const persenUm = tallyUm.total > 0 ? Math.round((tallyUm.terkirim / tallyUm.total) * 100) : 0;
  const persenLembur = tallyLembur.total > 0 ? Math.round((tallyLembur.terkirim / tallyLembur.total) * 100) : 0;

  // Status Siklus
  let statusSiklusLabel = "Belum dihitung";
  let statusSiklusBg = "bg-line text-muted";
  if (totalKalkulasi > 0) {
    if (totalTerkirim === totalKalkulasi) {
      statusSiklusLabel = "Terkirim & terkunci";
      statusSiklusBg = "bg-green-tint text-green font-bold";
    } else if (totalDikembalikan > 0) {
      statusSiklusLabel = "Dikembalikan PPABP";
      statusSiklusBg = "bg-red-tint text-red font-bold";
    } else {
      // Tidak ada keadaan antara lagi: rekap unit itu sudah dikirim atau
      // belum. Dulu ada "Proses Approval" karena jenjang 1 bisa selesai
      // sementara jenjang 2 belum - jenjangnya sudah tidak ada.
      statusSiklusLabel = "Belum dikirim ke PPABP";
      statusSiklusBg = "bg-gold-tint text-gold-deep font-bold";
    }
  }

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

  // Dokumen & Kesiapan
  const persenPredikat = totalPegawai > 0 ? Math.min(100, Math.round((countPredikat / totalPegawai) * 100)) : 0;
  const persenPresensi = totalPegawai > 0 ? Math.min(100, Math.round((countPresensi / totalPegawai) * 100)) : 0;

  // Aturan urutannya PURE & teruji di src/business-logic/langkahTutupBulan.ts -
  // yang di sini cuma merangkainya jadi kalimat & tautan.
  const langkah = langkahTutupBulan({
    totalPegawai,
    jumlahRekapPresensi: countPresensi,
    jumlahPredikat: countPredikat,
    jumlahKalkulasi: tukinRows.length,
  });
  const qPeriode = `bulan=${periodeBulan}&tahun=${periodeTahun}&satker=${encodeURIComponent(satkerEfektif)}`;
  const langkahBerikutnya = !langkah
    ? null
    : langkah.jenis === "PRESENSI"
      ? {
          pesan: `Rekap presensi baru ada untuk ${langkah.sudah} dari ${langkah.dari} pegawai. Komponen kehadiran (30%) belum bisa dihitung utuh.`,
          tautan: `/tukin/presensi?${qPeriode}`,
          label: "Tarik presensi",
        }
      : langkah.jenis === "PREDIKAT"
        ? {
            pesan: `Predikat kinerja baru ada untuk ${langkah.sudah} dari ${langkah.dari} pegawai. Komponen kinerja (70%) belum bisa dihitung utuh.`,
            tautan: `/tukin/predikat-kinerja?${qPeriode}`,
            label: "Unggah predikat",
          }
        : {
            pesan: `Bahan lengkap. Kalkulasi Tukin baru dibuat untuk ${langkah.sudah} dari ${langkah.dari} pegawai.`,
            tautan: `/kasubag/kalkulasi?${qPeriode}`,
            label: "Hitung unit",
          };
  const bandingPending = countBanding.filter((b) => b.status === "DIAJUKAN").length;
  const bandingSelesai = countBanding.filter((b) => b.status === "DISETUJUI" || b.status === "DITOLAK").length;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 space-y-6">
      {/* ====================================================================
          1. HEADER & ACTION BAR
          ==================================================================== */}
      <div className="gj-masuk flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
              Halo, {sapaanNama(namaSesi)}{" "}
              {/* Emoji dibungkus aria-hidden: pembaca layar melafalkannya
                  ("melambaikan tangan") di tengah kalimat sapaan, dan itu
                  mengganggu tanpa menambah arti apa pun. */}
              <span aria-hidden="true">👋</span>
            </h1>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusSiklusBg}`}>
              {statusSiklusLabel}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-muted">
            Ringkasan {satkerEfektif} periode{" "}
            <span className="font-semibold text-ink">
              {NAMA_BULAN_LENGKAP[periodeBulan - 1]} {periodeTahun}
            </span>
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href={`/kasubag/kalkulasi?bulan=${periodeBulan}&tahun=${periodeTahun}&satker=${encodeURIComponent(satkerEfektif)}`}
            className="btn btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold shadow-sm"
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Kalkulasi Massal
          </Link>
          <Link
            href={`/kasubag/pegawai?satker=${encodeURIComponent(satkerEfektif)}`}
            className="btn btn-ghost inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-2"
          >
            <svg className="size-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            Pegawai Unit ({totalPegawai})
          </Link>
        </div>
      </div>

      {/* ====================================================================
          2. FILTER + PINTASAN - SATU BARIS, TANPA KARTU

          Dulu keduanya dibungkus kartu, dan FilterBar bentuk panjangnya
          membawa kartu SENDIRI di dalamnya - jadi ada dua bingkai bertumpuk
          dengan dua kali padding, plus `mt-4` yang menempel di kartu dalam.
          Bagian ini menghabiskan ~150px tinggi cuma untuk tiga kendali,
          padahal filter bukan pekerjaan utama di halaman ini: periodenya
          sudah dipilihkan sistem, dan Kasubag TU tidak bisa memilih unit.

          Nilai yang ditampilkan sekarang periode EFEKTIF, bukan isi query
          string. Tanpa itu, dropdown-nya berbunyi "Semua bulan" sementara
          judul di atasnya menyebut "periode Juli 2026" - dua keterangan yang
          bertentangan di layar yang sama. Pola ini sudah dipakai di
          /kasubag/kalkulasi.
          ==================================================================== */}
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

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-muted">Shortcut:</span>
          <Link
            href={`/tukin/presensi?bulan=${periodeBulan}&tahun=${periodeTahun}`}
            className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink transition hover:border-biru hover:text-biru"
          >
            Presensi Pegawai
          </Link>
          <Link
            href="/tukin/predikat-kinerja"
            className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink transition hover:border-biru hover:text-biru"
          >
            Predikat Kinerja
          </Link>
          <Link
            href={`/kasubag/banding?satker=${encodeURIComponent(satkerEfektif)}`}
            className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink transition hover:border-biru hover:text-biru"
          >
            Verifikasi Banding {bandingPending > 0 && <span className="ml-1 rounded-full bg-gold px-1.5 py-0.2 text-[10px] text-white">{bandingPending}</span>}
          </Link>
          <Link
            href={`/kasubag/sk-kgb?satker=${encodeURIComponent(satkerEfektif)}`}
            className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink transition hover:border-biru hover:text-biru"
          >
            SK KGB
          </Link>
          <Link
            href={`/kasubag/sk-hukuman-disiplin?satker=${encodeURIComponent(satkerEfektif)}`}
            className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink transition hover:border-biru hover:text-biru"
          >
            SK Hukuman Disiplin
          </Link>
        </div>
      </div>

      {/* ====================================================================
          TUTUP BULAN UNIT - satu tempat buat "apa langkah saya sekarang" dan
          "ambil berkasnya".

          Dashboard ini sebelumnya menjawab "bagaimana keadaannya" dengan
          sangat lengkap, tapi tidak pernah menjawab "jadi saya harus apa" -
          dan kedua berkas rekap harus dicari di dua halaman berbeda.

          SENGAJA TIDAK menarik halaman kerjanya ke sini. Presensi punya
          sinkronisasi + dua jalur unggah, Kalkulasi punya tabel 25+ kolom dan
          tombol yang mengunci pengiriman satu unit penuh. Yang ada di
          sini cuma penunjuk arah dan unduhan.
          ==================================================================== */}
      <div
        className="gj-masuk mt-4 rounded-2xl border border-line bg-surface p-5 shadow-xs"
        style={{ animationDelay: "120ms" }}
      >
        <div className="flex items-center justify-between pb-3 border-b border-line-2">
          <h2 className="text-sm font-bold text-ink">Penutupan Periode Unit</h2>
          <span className="text-xs font-semibold text-muted">
            {NAMA_BULAN_LENGKAP[periodeBulan - 1]} {periodeTahun}
          </span>
        </div>

        {/* Panel langkah cuma muncul kalau MEMANG ada yang kurang - baris
            "semua beres" yang selalu tampil berubah jadi hiasan yang tidak
            dibaca lagi, lalu peringatan sungguhan ikut tidak terbaca. */}
        {langkahBerikutnya && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold bg-gold/10 p-3.5">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-gold text-xs font-bold text-white">
                !
              </div>
              <div>
                <h3 className="text-xs font-bold text-ink">Langkah berikutnya</h3>
                <p className="mt-0.5 text-[11px] text-ink-2">{langkahBerikutnya.pesan}</p>
              </div>
            </div>
            <Link href={langkahBerikutnya.tautan} className="btn btn-secondary btn-sm text-xs">
              {langkahBerikutnya.label}
            </Link>
          </div>
        )}

        {/* Unduhan tetap ada walau datanya belum lengkap - rekap separuh justru
            yang dipakai menelusuri SIAPA yang belum masuk. Yang membedakan
            lengkap atau tidak sudah disebut di panel di atas. */}
        {bolehExportRekap && (
          <div className="mt-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Unduh rekap unit</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a
                href={`/tukin/presensi/export?bulan=${periodeBulan}&tahun=${periodeTahun}&satker=${encodeURIComponent(satkerEfektif)}`}
                className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-biru hover:text-biru"
              >
                Rekap Presensi (Excel)
              </a>
              <a
                href={`/kasubag/kalkulasi/export?bulan=${periodeBulan}&tahun=${periodeTahun}&satker=${encodeURIComponent(satkerEfektif)}`}
                className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-biru hover:text-biru"
              >
                Rekap Tukin (Excel)
              </a>
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Berkas untuk diperiksa &amp; diarsipkan - memuat semua status, termasuk yang belum disetujui.
              Berkas setoran ke Web Gaji (ADK) tetap dibuat PPABP.
            </p>
          </div>
        )}
      </div>

      {/* ====================================================================
          3. TOP SECTION: KPI METRICS (LEFT) + MONTHLY ACTIVITY CHART (RIGHT)
          ==================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* KPI Grid (6 Cards / 2 Columns) */}
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:col-span-6">
          {/* Card 1: Total Pegawai */}
          <div
            className="gj-masuk flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-xs transition hover:shadow-sm"
            style={{ animationDelay: "170ms" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted">Pegawai Aktif</span>
              <div className="rounded-lg bg-teal-tint p-1.5 text-navy">
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
            <div className="mt-3">
              <div className="font-mono text-2xl font-extrabold text-ink">
                <AngkaNaik nilai={totalPegawai} tundaMs={170} />
              </div>
              <p className="mt-0.5 text-[11px] text-muted">Tergabung di unit kerja</p>
            </div>
          </div>

          {/* Card 2: Total Belanja Periode */}
          <div
            className="gj-masuk flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-xs transition hover:shadow-sm"
            style={{ animationDelay: "225ms" }}
          >
            <div className="flex items-center justify-between">
              {/* "Belanja" diganti "Nilai Kalkulasi" karena angkanya berasal
                  dari tukinRows/umRows/lemburRows yang TIDAK disaring status -
                  sama dengan grafik tren, dan dalam istilah anggaran "belanja"
                  berarti yang sudah direalisasikan. Sudah dikirim ke PPABP
                  atau belum dijawab lencana status di kepala halaman. */}
              <span className="text-xs font-bold text-muted">Nilai Kalkulasi</span>
              <div className="rounded-lg bg-green-tint p-1.5 text-green">
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="mt-3">
              <div className="font-mono text-2xl font-extrabold text-ink">
                <AngkaNaik nilai={totalNominalPeriode} sebagai="rupiah-ringkas" tundaMs={225} />
              </div>
              {/* Penanda perubahan cuma dirender kalau MEMANG ada pembandingnya.
                  Bulan tanpa data pembanding sengaja tidak menampilkan "0%" -
                  itu akan terbaca "tidak berubah" padahal artinya "tidak
                  diketahui". Lihat deltaPersen(). */}
              {deltaBelanja ? (
                <p className="mt-0.5 flex items-center gap-1 text-[11px]" title={formatRupiahPenuh(totalNominalPeriode)}>
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
                    {deltaBelanja.persen}%
                  </span>
                  <span className="text-muted">vs {NAMA_BULAN_LENGKAP[(bulanLalu ?? 1) - 1]}</span>
                </p>
              ) : (
                <p className="mt-0.5 text-[11px] text-muted" title={formatRupiahPenuh(totalNominalPeriode)}>
                  Periode {periodeBulan}/{periodeTahun}
                </p>
              )}
            </div>
          </div>

          {/* KARTU "Unit sudah kirim" DIHAPUS (2026-09-02, koreksi user).
              Isinya persis sama dengan donat "Ringkasan" di samping papan
              Progres pengiriman unit beberapa baris di bawah: pembilang yang
              sama, penyebut yang sama, cincin yang sama. Dua gambar untuk satu
              angka bukan penegasan - yang terjadi orang membandingkan keduanya
              mencari bedanya, lalu ragu waktu tidak menemukan apa-apa.

              Yang dipertahankan yang di bawah, karena ia menyebut KETIGA
              keadaan (terkirim / dikembalikan / belum kirim) berikut jumlah &
              persennya, sementara kartu ini cuma menyebut yang terkirim. */}

          {/* Card 4: Progres Tukin + Sparkline */}
          <div
            className="gj-masuk flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-xs transition hover:shadow-sm"
            style={{ animationDelay: "335ms" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted">Progres Tukin</span>
              <span className="rounded-full bg-teal-tint px-2 py-0.5 text-[10px] font-bold text-navy">
                {persenTukin}%
              </span>
            </div>
            <div className="mt-2">
              <div className="font-mono text-xl font-black text-ink">
                <AngkaNaik nilai={persenTukin} tundaMs={335} />%
              </div>
              {/* Mini SVG Sparkline */}
              <div className="mt-1 h-6 w-full">
                <svg className="h-full w-full overflow-visible" viewBox="0 0 100 24" preserveAspectRatio="none">
                  <path
                    d="M0,20 Q15,18 30,12 T60,8 T100,2"
                    pathLength="1"
                    className="gj-garis"
                    style={{ animationDelay: "560ms" }}
                    fill="none"
                    stroke="#13416B"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M0,20 Q15,18 30,12 T60,8 T100,2 L100,24 L0,24 Z"
                    className="gj-muncul"
                    style={{ animationDelay: "900ms" }}
                    fill="rgba(19,65,107,0.08)"
                  />
                </svg>
              </div>
              <p className="text-[10px] text-muted">{tallyTukin.terkirim} dari {tallyTukin.total} pegawai</p>
            </div>
          </div>

          {/* Card 5: Progres Uang Makan + Sparkline */}
          <div
            className="gj-masuk flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-xs transition hover:shadow-sm"
            style={{ animationDelay: "390ms" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted">Uang Makan</span>
              <span className="rounded-full bg-biru/10 px-2 py-0.5 text-[10px] font-bold text-biru">
                {persenUm}%
              </span>
            </div>
            <div className="mt-2">
              <div className="font-mono text-xl font-black text-ink">
                <AngkaNaik nilai={persenUm} tundaMs={390} />%
              </div>
              {/* Mini SVG Sparkline */}
              <div className="mt-1 h-6 w-full">
                <svg className="h-full w-full overflow-visible" viewBox="0 0 100 24" preserveAspectRatio="none">
                  <path
                    d="M0,18 Q20,16 40,10 T80,6 T100,2"
                    pathLength="1"
                    className="gj-garis"
                    style={{ animationDelay: "640ms" }}
                    fill="none"
                    stroke="#3F72AF"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M0,18 Q20,16 40,10 T80,6 T100,2 L100,24 L0,24 Z"
                    className="gj-muncul"
                    style={{ animationDelay: "980ms" }}
                    fill="rgba(63,114,175,0.08)"
                  />
                </svg>
              </div>
              <p className="text-[10px] text-muted">{tallyUm.terkirim} dari {tallyUm.total} pegawai</p>
            </div>
          </div>

          {/* Card 6: Progres Uang Lembur - tunduk saklar di
              src/app/tampilUangLembur.ts. Grid menata ulang sendiri. */}
          {/* Kartu ini mengukur PROGRES PENGIRIMAN, bukan rupiah - tidak ada
              satu pun angka uang di dalamnya, cuma "berapa dari berapa
              pegawai". Karena itu ia ikut saklar MENU, bukan NOMINAL: menahan
              rupiah bukan alasan menyembunyikan progres pengumpulan jamnya. */}
          {TAMPILKAN_MENU_LEMBUR && (
          <div
            className="gj-masuk flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-xs transition hover:shadow-sm"
            style={{ animationDelay: "445ms" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted">Uang Lembur</span>
              <span className="rounded-full bg-gold-tint px-2 py-0.5 text-[10px] font-bold text-gold-deep">
                {persenLembur}%
              </span>
            </div>
            <div className="mt-2">
              <div className="font-mono text-xl font-black text-ink">
                <AngkaNaik nilai={persenLembur} tundaMs={445} />%
              </div>
              {/* Mini SVG Sparkline */}
              <div className="mt-1 h-6 w-full">
                <svg className="h-full w-full overflow-visible" viewBox="0 0 100 24" preserveAspectRatio="none">
                  <path
                    d="M0,22 Q25,20 50,14 T80,6 T100,4"
                    pathLength="1"
                    className="gj-garis"
                    style={{ animationDelay: "720ms" }}
                    fill="none"
                    stroke="#C8871F"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M0,22 Q25,20 50,14 T80,6 T100,4 L100,24 L0,24 Z"
                    className="gj-muncul"
                    style={{ animationDelay: "1060ms" }}
                    fill="rgba(200,135,31,0.08)"
                  />
                </svg>
              </div>
              <p className="text-[10px] text-muted">{tallyLembur.terkirim} dari {tallyLembur.total} pegawai</p>
            </div>
          </div>
          )}

        </div>

        {/* Right Column: Monthly Activity & Trend Chart */}
        <div
          className="gj-masuk flex flex-col justify-between rounded-2xl border border-line bg-surface p-5 shadow-xs lg:col-span-6"
          style={{ animationDelay: "200ms" }}
        >
          <div className="flex items-center justify-between pb-3 border-b border-line-2">
            <div>
              <h2 className="text-sm font-bold text-ink">Tren Kalkulasi Belanja Unit</h2>
              {/* Keterangan status ini WAJIB ada selama grafiknya tidak
                  memfilter apa pun - lihat catatan di query tren di atas. */}
              <p className="text-xs text-muted">
                Tukin + uang makan + uang lembur {periodeTahun}, semua status
              </p>
            </div>
            <span className="rounded-xl border border-line bg-surface-2 px-3 py-1 text-xs font-bold text-ink">
              Tahun {periodeTahun}
            </span>
          </div>

          {/* Bar Chart Container */}
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

                    {/* Tooltip Hover */}
                    <div className="pointer-events-none absolute -top-10 left-1/2 z-20 hidden -translate-x-1/2 rounded-lg bg-navy-deep px-2.5 py-1 text-[10px] font-bold text-white shadow-md whitespace-nowrap group-hover:block">
                      {d.namaLengkap}: {d.nominal > 0 ? formatRupiah(d.nominal) : "Rp 0"}
                      {/* Jumlah pegawainya ikut disebut supaya bulan yang rendah
                          bisa dibedakan: belanjanya memang kecil, atau kalkulasinya
                          yang baru sebagian dibuat. Angkanya sudah ikut ditarik
                          groupBy di atas (_count.id), bukan query tambahan. */}
                      {d.pegawai > 0 && (
                        <span className="font-medium text-white/70"> &bull; {d.pegawai} pegawai</span>
                      )}
                    </div>

                    {/* Bar Background Track */}
                    <div className="relative flex h-full w-full max-w-[28px] items-end rounded-t-lg bg-line-2/70 p-0.5">
                      {/* Active Bar Fill */}
                      <div
                        style={
                          {
                            // Tinggi dikirim lewat custom property supaya
                            // @keyframes bisa membacanya - nilai `to` sebuah
                            // keyframe tidak bisa mengambil dari inline style
                            // biasa. Kelas .gj-batang yang memakainya.
                            "--tinggi-batang": `${tinggiPersen}%`,
                            // Berurutan kiri ke kanan. 45ms x 12 batang = 0,5
                            // detik untuk yang terakhir - cukup terbaca sebagai
                            // gerakan, masih jauh dari terasa lambat.
                            //
                            // Awalannya menunggu panel grafiknya sendiri selesai
                            // masuk (jeda 200ms + durasi .gj-masuk 460ms): batang
                            // yang tumbuh selagi panelnya masih bergeser naik
                            // terbaca sebagai dua gerakan bertabrakan, bukan satu.
                            animationDelay: `${660 + i * 45}ms`,
                          } as React.CSSProperties
                        }
                        // min-h-[4px] menjaga batang yang sungguhan kecil tetap
                        // terlihat TANPA membohongi proporsinya - beda dari lantai
                        // 12% yang dulu dipakai, karena min-height tidak ikut naik
                        // sebanding. Bulan bernilai nol tidak mendapatkannya sama
                        // sekali: yang tampil tinggal jalur latarnya yang kosong.
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

                    {/* Month Label */}
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

      {/* Papan yang menjawab "unit mana saja yang sudah kirim bulan ini".
          Read-only di sini: tombol "Kembalikan ke unit" hanya untuk PPABP,
          dan `bolehKembalikan={false}` menutupnya di sisi tampilan sementara
          Server Action-nya tetap menolak siapa pun selain PPABP. */}
      <PapanProgres
        progres={progresUnit}
        periodeBulan={periodeBulan}
        periodeTahun={periodeTahun}
        bolehKembalikan={false}
        satkerSorot={satkerEfektif}
      />

      {/* ====================================================================
          4. MIDDLE SECTION: KESIAPAN DATA UNIT
          ==================================================================== */}
      <div className="grid grid-cols-1 gap-6">
        {/* Card: Kesiapan Data & Dokumen Unit */}
        <div
          className="gj-masuk rounded-2xl border border-line bg-surface p-5 shadow-xs"
          style={{ animationDelay: "360ms" }}
        >
          <div className="flex items-center justify-between pb-3 border-b border-line-2">
            <h2 className="text-sm font-bold text-ink">Kesiapan Data & Dokumen Unit</h2>
            <span className="text-xs font-semibold text-muted">Persyaratan Payroll</span>
          </div>

          <div className="mt-4 space-y-4">
            {/* Rekap Presensi - komponen 30%.
                DITARUH SEBELUM predikat dengan sengaja: urutannya mengikuti
                alur bulanan (presensi ditarik lebih dulu), dan panel ini dulu
                melompatinya - unit yang presensinya belum masuk tetap terlihat
                siap karena yang ditampilkan cuma predikat. */}
            <div className="rounded-xl border border-line-2 bg-surface-2 p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-biru text-white text-xs font-bold">
                    RP
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-ink">Rekap Presensi e-Presensi</h3>
                    <p className="text-[11px] text-muted">{countPresensi} dari {totalPegawai} pegawai terekap</p>
                  </div>
                </div>
                <span className="font-mono text-sm font-black text-biru">{persenPresensi}%</span>
              </div>
              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-line">
                <div
                  className="gj-bar h-full rounded-full bg-biru"
                  style={{ "--lebar-bar": `${persenPresensi}%`, animationDelay: "620ms" } as React.CSSProperties}
                />
              </div>
            </div>

            {/* Predikat Kinerja BKN */}
            <div className="rounded-xl border border-line-2 bg-surface-2 p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-green text-white text-xs font-bold">
                    PK
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-ink">Predikat Kinerja e-Kinerja BKN</h3>
                    <p className="text-[11px] text-muted">{countPredikat} dari {totalPegawai} pegawai terunggah</p>
                  </div>
                </div>
                <span className="font-mono text-sm font-black text-green">{persenPredikat}%</span>
              </div>
              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-line">
                <div
                  className="gj-bar h-full rounded-full bg-green"
                  style={{ "--lebar-bar": `${persenPredikat}%`, animationDelay: "700ms" } as React.CSSProperties}
                />
              </div>
            </div>

            {/* Verifikasi Banding Presensi */}
            <div className="rounded-xl border border-line-2 bg-surface-2 p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-biru text-white text-xs font-bold">
                    VB
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-ink">Verifikasi Banding Presensi Unit</h3>
                    <p className="text-[11px] text-muted">
                      {bandingPending} menunggu verifikasi &bull; {bandingSelesai} selesai
                    </p>
                  </div>
                </div>
                <Link
                  href={`/kasubag/banding?satker=${encodeURIComponent(satkerEfektif)}`}
                  className="btn btn-ghost btn-sm text-xs font-semibold text-biru"
                >
                  Buka Banding
                </Link>
              </div>
            </div>

            {/* SK KGB & Hukuman Disiplin */}
            <div className="grid grid-cols-2 gap-3 pt-1">
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
      </div>

      {/* ====================================================================
          5. BOTTOM SECTION: RECENT EMPLOYEE APPROVAL & UNIT SUMMARY
          ==================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Card: Status Approval Pegawai Terkini (7 Cols) */}
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
              Lihat Semua ({totalPegawai}) &rarr;
            </Link>
          </div>

          <div className="mt-4 divide-y divide-line-2">
            {tukinRows.length === 0 && (
              <div className="py-8 text-center text-sm text-muted">
                Belum ada data kalkulasi Tukin pada periode {periodeBulan}/{periodeTahun}.
              </div>
            )}
            {tukinRows.slice(0, 5).map((row) => {
              const status = row.status;
              const isApproved = status === "APPROVED" || status === "COCOK" || status === "DIKIRIM";
              const isTertolak = status === "SELISIH";
              const isProses = status === "SANGGAH";

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

        {/* Right Card: Layanan & Tindakan Cepat (5 Cols) */}
        <div
          className="gj-masuk rounded-2xl border border-line bg-surface p-5 shadow-xs lg:col-span-5 flex flex-col justify-between"
          style={{ animationDelay: "480ms" }}
        >
          <div>
            {/* Kepala kartu ini HARUS dua baris seperti kartu di sebelahnya
                ("Status Approval Pegawai Unit Terkini" + keterangannya).
                Keduanya sebaris di grid yang sama, jadi kepala satu baris di
                sini membuat garis pemisah dan seluruh isi kartu turun ~15px
                lebih tinggi daripada tetangganya - selisih yang kecil tapi
                langsung kelihatan karena dua kartunya bersebelahan. */}
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-line-2">
              <div>
                <h2 className="text-sm font-bold text-ink">Ringkasan Tindakan Unit</h2>
                <p className="text-xs text-muted">Yang perlu dikerjakan periode ini</p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-muted">Tugas Kasubag TU</span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3">
                <div className="mt-0.5 rounded-lg bg-teal-tint p-1.5 text-navy">
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs font-bold text-ink">Kalkulasi Massal Periode Ini</h3>
                  <p className="text-[11px] text-muted">
                    {totalBelumKirim > 0
                      ? `${totalBelumKirim} kalkulasi belum dikirim ke PPABP.`
                      : "Semua kalkulasi periode ini sudah dikirim."}
                  </p>
                  <Link
                    href={`/kasubag/kalkulasi?bulan=${periodeBulan}&tahun=${periodeTahun}&satker=${encodeURIComponent(satkerEfektif)}`}
                    className="mt-2 inline-block text-xs font-bold text-biru hover:underline"
                  >
                    Buka Kalkulasi Massal &rarr;
                  </Link>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3">
                <div className="mt-0.5 rounded-lg bg-gold-tint p-1.5 text-gold-deep">
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs font-bold text-ink">Banding Kehadiran Pegawai</h3>
                  <p className="text-[11px] text-muted">
                    {bandingPending > 0
                      ? `Terdapat ${bandingPending} pengajuan banding dari pegawai yang perlu diverifikasi unit.`
                      : "Tidak ada permohonan banding kehadiran yang tertunda."}
                  </p>
                  <Link
                    href={`/kasubag/banding?satker=${encodeURIComponent(satkerEfektif)}`}
                    className="mt-2 inline-block text-xs font-bold text-biru hover:underline"
                  >
                    Periksa Sanggahan & Banding &rarr;
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-teal-tint/60 p-3 text-center text-xs font-medium text-navy">
            Unit Kerja: <span className="font-bold">{satkerEfektif}</span>
          </div>
        </div>
      </div>
    </main>
  );
}
