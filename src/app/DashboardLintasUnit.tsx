import Link from "next/link";
import { prisma } from "../lib/prisma";
import type { AuthUser } from "../auth/permissions";
import { FilterBar } from "./FilterBar";
import { resolveSatkerEfektif, resolveSatuanKerjaListUntukFilter, satkerTerkunciUntukAkun } from "./dashboardScope";
import { kunciKirim, tallyKirim, type HasilTallyKirim } from "./tallyKirim";
import { TAMPILKAN_NOMINAL_LEMBUR } from "./tampilUangLembur";
import { HALAMAN } from "./layoutHalaman";
import { AngkaNaik } from "./AngkaNaik";
import { NAMA_BULAN } from "./bulan";
import { sapaanNama } from "./sapaan";

const formatRupiah = (nilai: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0, notation: "compact" }).format(nilai);

const formatRupiahPenuh = (nilai: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(nilai);

const persenDari = (bagian: number, dari: number) => (dari > 0 ? Math.round((bagian / dari) * 100) : 0);

/**
 * Kartu angka pokok - bentuknya sama persis dengan dashboard Kasubag TU:
 * label kecil + ikon bernuansa di kanan, angka besar monospace, keterangan
 * satu baris di bawahnya.
 *
 * `nilai` sengaja diterima sebagai ANGKA, bukan teks yang sudah diformat -
 * `AngkaNaik` perlu angkanya untuk menghitung naik, dan pemformatan yang
 * dikerjakan pemanggil berarti tiap kartu bisa memformat dengan cara berbeda.
 */
function KartuKpi({
  label,
  nilai,
  sebagai = "angka",
  keterangan,
  ikon,
  nuansa,
  warnaAngka = "text-ink",
  tundaMs,
  judulHover,
}: {
  label: string;
  nilai: number;
  sebagai?: "angka" | "rupiah-ringkas";
  keterangan: string;
  ikon: React.ReactNode;
  /** Kelas latar + teks kotak ikon, mis. "bg-teal-tint text-navy". */
  nuansa: string;
  warnaAngka?: string;
  tundaMs: number;
  judulHover?: string;
}) {
  return (
    <div
      // `h-full` + `group-hover` dipakai kartu yang dibungkus <Link>: tanpa
      // h-full kartunya berhenti setinggi isinya di dalam tautan, jadi lebih
      // pendek daripada tetangganya di grid yang sama.
      className="gj-masuk flex h-full flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-xs transition hover:shadow-sm group-hover:border-biru"
      style={{ animationDelay: `${tundaMs}ms` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted">{label}</span>
        <div className={`rounded-lg p-1.5 ${nuansa}`}>{ikon}</div>
      </div>
      <div className="mt-3">
        <div className={`font-mono text-2xl font-extrabold ${warnaAngka}`}>
          <AngkaNaik nilai={nilai} sebagai={sebagai} tundaMs={tundaMs} />
        </div>
        <p className="mt-0.5 text-[11px] text-muted" title={judulHover}>
          {keterangan}
        </p>
      </div>
    </div>
  );
}

/** Satu baris progres pengiriman per jenis pembayaran. */
function BarisProgres({
  inisial,
  nama,
  tally,
  kelasKotak,
  kelasBar,
  kelasPersen,
  tundaMs,
}: {
  inisial: string;
  nama: string;
  tally: HasilTallyKirim;
  kelasKotak: string;
  kelasBar: string;
  kelasPersen: string;
  tundaMs: number;
}) {
  const persen = persenDari(tally.terkirim, tally.total);
  return (
    <div className="rounded-xl border border-line-2 bg-surface-2 p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`flex size-8 items-center justify-center rounded-lg text-xs font-bold text-white ${kelasKotak}`}>
            {inisial}
          </div>
          <div>
            <h3 className="text-xs font-bold text-ink">{nama}</h3>
            <p className="text-[11px] text-muted">
              {tally.terkirim} terkirim &bull; {tally.dikembalikan} dikembalikan &bull; {tally.belumKirim} belum
              dikirim
            </p>
          </div>
        </div>
        <span className={`font-mono text-sm font-black ${kelasPersen}`}>{persen}%</span>
      </div>
      <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-line">
        <div
          className={`gj-bar h-full rounded-full ${kelasBar}`}
          style={{ "--lebar-bar": `${persen}%`, animationDelay: `${tundaMs}ms` } as React.CSSProperties}
        />
      </div>
    </div>
  );
}

/**
 * Dashboard lintas unit - dipakai bareng PPABP (langkah 4d) dan PIMPINAN
 * (langkah 4f), role matrix eksplisit bilang "dashboard lintas unit SAMA
 * seperti PPABP" buat Pimpinan, cuma beda read-only. `readOnly=true`
 * (Pimpinan) menyembunyikan link ke halaman AKSI (Rekonsiliasi, Export ADK,
 * Kelola Anggaran Realisasi, dan seluruh pintasan data pokok - semuanya butuh
 * izin PPABP/ADMIN yang Pimpinan tidak punya; kalau tetap ditautkan, Pimpinan
 * bakal mentok "Akses ditolak" di halaman tujuan) - angka "Rekonsiliasi perlu
 * ditangani" TETAP ditampilkan buat Pimpinan, cuma tidak jadi tautan, supaya
 * visibilitasnya utuh sesuai role matrix "dashboard yang SAMA".
 *
 * BENTUKNYA MENGIKUTI DASHBOARD KASUBAG TU (permintaan user 2026-09-10):
 * sapaan + lencana keadaan, baris filter ringkas + pintasan tanpa kartu,
 * kartu KPI ber-ikon dengan angka yang naik, lalu panel-panel ber-kepala
 * bergaris. Yang ditampilkan TIDAK bertambah maupun berkurang - seluruh angka
 * di sini sama persis dengan bentuk sebelumnya.
 *
 * PAPAN PROGRES UNIT SENGAJA TIDAK DITARIK KE SINI walau dashboard Kasubag TU
 * punya. Papan itu sudah berdiri di /ppabp/adk LENGKAP dengan tombol
 * "Kembalikan ke unit"; menyalinnya ke sini berarti dua papan untuk satu
 * keadaan, dan yang satu bisa bertindak sementara yang lain tidak.
 */
export async function DashboardLintasUnit({
  searchParams,
  authUser,
  readOnly,
  nama,
}: {
  searchParams: { bulan?: string; tahun?: string; satker?: string };
  authUser: AuthUser;
  readOnly: boolean;
  /** Nama pemilik sesi, buat sapaan di kepala halaman. */
  nama: string;
}) {
  const { bulan, tahun, satker } = searchParams;

  const satkerEfektif = resolveSatkerEfektif(authUser, satker);
  const satuanKerjaRows = await prisma.pegawai.findMany({
    distinct: ["satuanKerja"],
    select: { satuanKerja: true },
    orderBy: { satuanKerja: "asc" },
  });
  const satuanKerjaList = resolveSatuanKerjaListUntukFilter(authUser, satuanKerjaRows.map((r) => r.satuanKerja));

  let periodeBulan = bulan ? Number(bulan) : undefined;
  let periodeTahun = tahun ? Number(tahun) : undefined;
  if (!periodeBulan || !periodeTahun) {
    const terbaru = await prisma.tukinCalculation.findFirst({
      orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }],
      select: { periodeBulan: true, periodeTahun: true },
    });
    periodeBulan = periodeBulan ?? terbaru?.periodeBulan;
    periodeTahun = periodeTahun ?? terbaru?.periodeTahun;
  }

  const filterSatker = satkerEfektif ? { pegawai: { satuanKerja: satkerEfektif } } : {};
  // Hanya AKTIF - pensiunan tetap disimpan (berhak atas tukin bulan yang
  // sudah dikerjakan) tapi tidak boleh ikut menggelembungkan hitungan pegawai.
  const totalPegawai = await prisma.pegawai.count({
    where: { statusPegawai: "AKTIF", ...(satkerEfektif ? { satuanKerja: satkerEfektif } : {}) },
  });

  const [tukinRows, umRows, lemburRows] = periodeBulan && periodeTahun
    ? await Promise.all([
        prisma.tukinCalculation.findMany({
          where: { periodeBulan, periodeTahun, ...filterSatker },
          // satuanKerja dibutuhkan buat mencocokkan baris ke pengiriman unitnya.
          include: { pegawai: { select: { satuanKerja: true } } },
        }),
        prisma.uangMakan.findMany({
          where: { periodeBulan, periodeTahun, ...filterSatker },
          // satuanKerja dibutuhkan buat mencocokkan baris ke pengiriman unitnya.
          include: { pegawai: { select: { satuanKerja: true } } },
        }),
        prisma.uangLembur.findMany({
          where: { periodeBulan, periodeTahun, ...filterSatker },
          // satuanKerja dibutuhkan buat mencocokkan baris ke pengiriman unitnya.
          include: { pegawai: { select: { satuanKerja: true } } },
        }),
      ])
    : [[], [], []];

  // Keadaan tiap baris = keadaan PENGIRIMAN unitnya. Satu query untuk
  // ketiga domain sekaligus - pengirimannya memang satu per unit per periode,
  // bukan per jenis pembayaran.
  const pengiriman =
    periodeBulan && periodeTahun
      ? await prisma.pengirimanUnit.findMany({
          where: { periodeBulan, periodeTahun },
          select: { satuanKerja: true, status: true },
        })
      : [];
  const petaKirim = new Map(
    pengiriman.map((p) => [kunciKirim(p.satuanKerja, periodeBulan!, periodeTahun!), p.status])
  );
  const kunci = (r: { pegawai: { satuanKerja: string }; periodeBulan: number; periodeTahun: number }) =>
    kunciKirim(r.pegawai.satuanKerja, r.periodeBulan, r.periodeTahun);

  const tallyTukin = tallyKirim(tukinRows.map(kunci), petaKirim);
  const tallyUm = tallyKirim(umRows.map(kunci), petaKirim);
  const tallyLembur = tallyKirim(lemburRows.map(kunci), petaKirim);

  const totalNominal =
    tukinRows.reduce((a, r) => a + r.tukinBersih, 0) +
    umRows.reduce((a, r) => a + r.totalUangMakan, 0) +
    lemburRows.reduce((a, r) => a + r.totalUangLembur, 0);

  const totalDikembalikan = tallyTukin.dikembalikan + tallyUm.dikembalikan + tallyLembur.dikembalikan;
  const totalBelumKirim = tallyTukin.belumKirim + tallyUm.belumKirim + tallyLembur.belumKirim;

  const anggaranRows = periodeBulan && periodeTahun
    ? await prisma.anggaranRealisasi.findMany({
        where: { periodeBulan, periodeTahun, ...(satkerEfektif ? { satuanKerja: satkerEfektif } : {}) },
      })
    : [];
  const totalPagu = anggaranRows.reduce((a, r) => a + r.pagu, 0);
  const totalRealisasi = anggaranRows.reduce((a, r) => a + r.realisasi, 0);
  const persenRealisasi = persenDari(totalRealisasi, totalPagu);

  const selisihMenunggu = await prisma.reconciliationStatus.count({
    where: {
      status: { in: ["SELISIH", "SANGGAH"] },
      ...(periodeBulan && periodeTahun ? { periodeBulan, periodeTahun } : {}),
    },
  });

  // Lencana keadaan di kepala halaman - DITURUNKAN dari angka yang sudah
  // dihitung di atas, bukan query tambahan. Urutannya sengaja: yang
  // dikembalikan lebih mendesak daripada yang belum dikirim, karena unitnya
  // sudah pernah menyerahkan lalu ditolak.
  const adaData = tallyTukin.total + tallyUm.total + tallyLembur.total > 0;
  const keadaan = !adaData
    ? { label: "Belum ada kalkulasi", kelas: "bg-line text-muted" }
    : totalDikembalikan > 0
      ? { label: `${totalDikembalikan} dikembalikan ke unit`, kelas: "bg-red-tint text-red" }
      : totalBelumKirim > 0
        ? { label: `${totalBelumKirim} belum dikirim unit`, kelas: "bg-gold-tint text-gold-deep" }
        : { label: "Semua unit sudah kirim", kelas: "bg-green-tint text-green" };

  const periodeTeks =
    periodeBulan && periodeTahun ? `${NAMA_BULAN[periodeBulan - 1]} ${periodeTahun}` : "belum ada data";

  // Pintasan ke halaman data pokok. SEMUANYA butuh izin PPABP/ADMIN, jadi
  // seluruh barisnya ditahan buat Pimpinan - bukan ditampilkan lalu ditolak
  // di halaman tujuan.
  const pintasan = [
    { href: "/ppabp/adk", label: "Export ADK" },
    { href: "/ppabp/gaji-induk", label: "Gaji Induk" },
    { href: "/ppabp/rekening", label: "Rekening Pegawai" },
    { href: "/ppabp/basis-data-gaji", label: "Basis Data Gaji" },
    { href: "/ppabp/anggaran", label: "Anggaran & Realisasi" },
    { href: "/ppabp/usulan-role", label: "Usulan Role" },
  ];

  return (
    <main className={`${HALAMAN} space-y-6`}>
      {/* ====================================================================
          1. KEPALA HALAMAN & TOMBOL AKSI
          ==================================================================== */}
      <div className="gj-masuk flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
              Halo, {sapaanNama(nama)}{" "}
              {/* Emoji dibungkus aria-hidden: pembaca layar melafalkannya
                  ("melambaikan tangan") di tengah kalimat sapaan, dan itu
                  mengganggu tanpa menambah arti apa pun. */}
              <span aria-hidden="true">👋</span>
            </h1>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${keadaan.kelas}`}>
              {keadaan.label}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-muted">
            Ringkasan {satkerEfektif ?? "seluruh satuan kerja"} periode{" "}
            <span className="font-semibold text-ink">{periodeTeks}</span>.
          </p>
        </div>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/ppabp/rekonsiliasi"
              className="btn btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold shadow-sm"
            >
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              Rekonsiliasi
              {selisihMenunggu > 0 && (
                <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-bold">{selisihMenunggu}</span>
              )}
            </Link>
            <Link
              href={
                periodeBulan && periodeTahun ? `/ppabp/adk?bulan=${periodeBulan}&tahun=${periodeTahun}` : "/ppabp/adk"
              }
              className="btn btn-ghost inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-2"
            >
              <svg className="size-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export ADK
            </Link>
          </div>
        )}
      </div>

      {/* ====================================================================
          2. FILTER + PINTASAN - SATU BARIS, TANPA KARTU

          Bentuk yang sama dengan dashboard unit: filter bukan pekerjaan utama
          di halaman ini, jadi tidak pantas menghabiskan satu kartu penuh.

          BEDA DARI DASHBOARD UNIT: satuan kerja di sini TIDAK dikunci - itu
          justru kendali terpentingnya, karena PPABP memproses seluruh unit.
          Kuncinya tetap ditanyakan ke `satkerTerkunciUntukAkun` supaya kalau
          suatu saat ada role lintas-unit yang dibatasi, halaman ini ikut
          sendiri.
          ==================================================================== */}
      <div
        className="gj-masuk flex flex-wrap items-center justify-between gap-x-6 gap-y-3"
        style={{ animationDelay: "70ms" }}
      >
        <FilterBar
          ringkas
          satkerTerkunci={satkerTerkunciUntukAkun(authUser)}
          satuanKerjaList={satuanKerjaList}
          bulan={bulan}
          tahun={tahun}
          satker={satker}
        />

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-muted">Shortcut:</span>
            {pintasan.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink transition hover:border-biru hover:text-biru"
              >
                {p.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ====================================================================
          3. ANGKA POKOK
          ==================================================================== */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        <KartuKpi
          label="Pegawai Aktif"
          nilai={totalPegawai}
          keterangan={satkerEfektif ? "Di satuan kerja terpilih" : "Seluruh satuan kerja"}
          nuansa="bg-teal-tint text-navy"
          tundaMs={170}
          ikon={
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        />

        {/* "Nilai Kalkulasi", BUKAN "Belanja" - angkanya dari baris kalkulasi
            yang TIDAK disaring status, sementara dalam istilah anggaran
            "belanja" berarti yang sudah direalisasikan. Yang sudah benar-benar
            terealisasi ada di panel Anggaran vs Realisasi di bawah. */}
        <KartuKpi
          label="Nilai Kalkulasi"
          nilai={totalNominal}
          sebagai="rupiah-ringkas"
          keterangan={`Tukin + uang makan + lembur, ${periodeTeks}`}
          judulHover={formatRupiahPenuh(totalNominal)}
          nuansa="bg-green-tint text-green"
          tundaMs={225}
          ikon={
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />

        <KartuKpi
          label="Dikembalikan"
          nilai={totalDikembalikan}
          keterangan="Kalkulasi yang ditolak ke unit"
          warnaAngka={totalDikembalikan > 0 ? "text-red" : "text-ink"}
          nuansa="bg-red-tint text-red"
          tundaMs={280}
          ikon={
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6M3 10l6-6" />
            </svg>
          }
        />

        <KartuKpi
          label="Belum Dikirim"
          nilai={totalBelumKirim}
          keterangan="Masih ditahan di unit"
          warnaAngka={totalBelumKirim > 0 ? "text-gold-deep" : "text-ink"}
          nuansa="bg-gold-tint text-gold-deep"
          tundaMs={335}
          ikon={
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />

        {/* Pimpinan tetap melihat ANGKANYA, cuma tidak jadi tautan - halaman
            rekonsiliasi butuh izin PPABP/ADMIN. */}
        {readOnly ? (
          <KartuKpi
            label="Rekonsiliasi"
            nilai={selisihMenunggu}
            keterangan="Perlu ditangani PPABP"
            warnaAngka={selisihMenunggu > 0 ? "text-gold-deep" : "text-ink"}
            nuansa="bg-biru/10 text-biru"
            tundaMs={390}
            ikon={
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            }
          />
        ) : (
          <Link href="/ppabp/rekonsiliasi" className="group block h-full">
            <KartuKpi
              label="Rekonsiliasi"
              nilai={selisihMenunggu}
              keterangan="Perlu ditangani, klik untuk membuka"
              warnaAngka={selisihMenunggu > 0 ? "text-gold-deep" : "text-ink"}
              nuansa="bg-biru/10 text-biru"
              tundaMs={390}
              ikon={
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              }
            />
          </Link>
        )}
      </div>

      {/* ====================================================================
          4. PROGRES PENGIRIMAN & ANGGARAN
          ==================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div
          className="gj-masuk rounded-2xl border border-line bg-surface p-5 shadow-xs lg:col-span-7"
          style={{ animationDelay: "420ms" }}
        >
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-line-2">
            <div>
              <h2 className="text-sm font-bold text-ink">Progres Pengiriman Unit</h2>
              <p className="text-xs text-muted">Berapa baris yang sudah sampai ke PPABP</p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-muted">{periodeTeks}</span>
          </div>

          <div className="mt-4 space-y-4">
            {!adaData ? (
              <p className="py-8 text-center text-sm text-muted">
                Belum ada kalkulasi pada periode {periodeTeks}.
              </p>
            ) : (
              <>
                <BarisProgres
                  inisial="TK"
                  nama="Tunjangan Kinerja"
                  tally={tallyTukin}
                  kelasKotak="bg-biru"
                  kelasBar="bg-biru"
                  kelasPersen="text-biru"
                  tundaMs={620}
                />
                <BarisProgres
                  inisial="UM"
                  nama="Uang Makan"
                  tally={tallyUm}
                  kelasKotak="bg-green"
                  kelasBar="bg-green"
                  kelasPersen="text-green"
                  tundaMs={700}
                />
                {/* Baris Uang Lembur ditahan selama angkanya belum disetujui -
                    lihat src/app/tampilUangLembur.ts. */}
                {TAMPILKAN_NOMINAL_LEMBUR && (
                  <BarisProgres
                    inisial="UL"
                    nama="Uang Lembur"
                    tally={tallyLembur}
                    kelasKotak="bg-gold-deep"
                    kelasBar="bg-gold-deep"
                    kelasPersen="text-gold-deep"
                    tundaMs={780}
                  />
                )}
              </>
            )}
          </div>
        </div>

        <div
          className="gj-masuk flex flex-col justify-between rounded-2xl border border-line bg-surface p-5 shadow-xs lg:col-span-5"
          style={{ animationDelay: "480ms" }}
        >
          <div>
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-line-2">
              <div>
                <h2 className="text-sm font-bold text-ink">Anggaran vs Realisasi</h2>
                <p className="text-xs text-muted">Pagu dan serapan periode ini</p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-muted">Belanja Pegawai</span>
            </div>

            {anggaranRows.length === 0 ? (
              <p className="mt-4 py-8 text-center text-sm text-muted">
                Belum ada data Anggaran &amp; Realisasi untuk periode/satker ini.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Realisasi</p>
                    <p className="font-mono text-2xl font-extrabold text-ink" title={formatRupiahPenuh(totalRealisasi)}>
                      {formatRupiah(totalRealisasi)}
                    </p>
                  </div>
                  <span className="rounded-full bg-teal-tint px-2.5 py-0.5 text-xs font-bold text-navy">
                    {persenRealisasi}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-line">
                  <div
                    className="gj-bar h-full rounded-full bg-navy"
                    style={
                      { "--lebar-bar": `${Math.min(100, persenRealisasi)}%`, animationDelay: "760ms" } as React.CSSProperties
                    }
                  />
                </div>
                <p className="text-[11px] text-muted" title={formatRupiahPenuh(totalPagu)}>
                  dari pagu {formatRupiah(totalPagu)}
                </p>
              </div>
            )}
          </div>

          {!readOnly && (
            <Link
              href="/ppabp/anggaran"
              className="mt-4 block rounded-xl bg-teal-tint/60 p-3 text-center text-xs font-bold text-navy transition hover:bg-teal-tint"
            >
              Kelola Anggaran &amp; Realisasi &rarr;
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
