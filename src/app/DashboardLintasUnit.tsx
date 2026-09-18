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
  // TANPA KARTU BERBINGKAI DI DALAM KARTU (dipadatkan 2026-09-16). Kotak
  // ber-latar di dalam panel yang juga berlatar menambah dua garis dan
  // padding ganda untuk tiga baris teks; tingginya berlipat tanpa satu pun
  // angka bertambah.
  //
  // "Dikembalikan" cuma disebut kalau ADA. Nol yang selalu ditulis membuat
  // mata melewatinya, dan justru angka inilah yang paling perlu terbaca waktu
  // akhirnya tidak nol.
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white ${kelasKotak}`}>
            {inisial}
          </span>
          <h3 className="truncate text-xs font-bold text-ink">{nama}</h3>
        </div>
        <span className={`shrink-0 font-mono text-xs font-black ${kelasPersen}`}>{persen}%</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className={`gj-bar h-full rounded-full ${kelasBar}`}
          style={{ "--lebar-bar": `${persen}%`, animationDelay: `${tundaMs}ms` } as React.CSSProperties}
        />
      </div>
      <p className="mt-1 text-[11px] text-muted">
        {tally.terkirim} terkirim &middot; {tally.belumKirim} belum dikirim
        {tally.dikembalikan > 0 && (
          <span className="font-semibold text-red"> &middot; {tally.dikembalikan} dikembalikan</span>
        )}
      </p>
    </div>
  );
}

/**
 * Dashboard lintas unit - dipakai bareng PPABP (langkah 4d) dan PIMPINAN
 * (langkah 4f), role matrix eksplisit bilang "dashboard lintas unit SAMA
 * seperti PPABP" buat Pimpinan, cuma beda read-only. `readOnly=true`
 * (Pimpinan) menyembunyikan link ke halaman AKSI (Rekonsiliasi, Export ADK,
 * Kelola Anggaran Realisasi - semuanya butuh izin PPABP/ADMIN yang Pimpinan
 * tidak punya; kalau tetap ditautkan, Pimpinan bakal mentok "Akses ditolak"
 * di halaman tujuan) - angka "Rekonsiliasi perlu
 * ditangani" TETAP ditampilkan buat Pimpinan, cuma tidak jadi tautan, supaya
 * visibilitasnya utuh sesuai role matrix "dashboard yang SAMA".
 *
 * BENTUKNYA MENGIKUTI DASHBOARD KASUBAG TU (permintaan user 2026-09-10):
 * sapaan + lencana keadaan, baris filter ringkas, kartu KPI ber-ikon dengan
 * angka yang naik, lalu panel-panel ber-kepala bergaris. Baris pintasan yang
 * dulu menemani filter sudah dicabut dari KEDUA dashboard (2026-09-16) -
 * keseragaman itu disengaja, jangan dikembalikan sebelah saja. Yang ditampilkan TIDAK bertambah maupun berkurang - seluruh angka
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

  // "SEMUA BULAN" DIHORMATI, tidak lagi diam-diam diganti periode terbaru.
  //
  // Dulu nilai kosong apa pun jatuh ke periode terbaru, jadi memilih "Semua
  // bulan" di filter menghasilkan angka SATU periode - filternya menjanjikan
  // sesuatu yang tidak ia lakukan, dan tidak ada apa pun di layar yang
  // memberi tahu bahwa yang tampil bukan yang diminta.
  //
  // Yang membedakan "belum pernah dipilih" dari "sengaja dikosongkan" adalah
  // BENTUK nilainya, dan bedanya pasti: `undefined` berarti parameternya tidak
  // ada di URL sama sekali (halaman dibuka polos lewat menu), sementara `""`
  // berarti form filter mengirimkannya dalam keadaan kosong - SearchableSelect
  // selalu merender input tersembunyinya, jadi "Semua bulan" tetap terkirim
  // sebagai `?bulan=`. Hanya yang pertama yang boleh dijatuhkan ke bawaan;
  // halaman polos yang menampilkan seluruh riwayat sekaligus bukan tampilan
  // pembuka yang berguna.
  let periodeBulan = bulan ? Number(bulan) : undefined;
  let periodeTahun = tahun ? Number(tahun) : undefined;
  if (bulan === undefined && tahun === undefined) {
    const terbaru = await prisma.tukinCalculation.findFirst({
      orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }],
      select: { periodeBulan: true, periodeTahun: true },
    });
    periodeBulan = terbaru?.periodeBulan;
    periodeTahun = terbaru?.periodeTahun;
  }

  // Dirakit dari yang BENAR-BENAR terisi. Bulan kosong + tahun terisi berarti
  // seluruh bulan di tahun itu; dua-duanya kosong berarti seluruh riwayat.
  const filterPeriode: { periodeBulan?: number; periodeTahun?: number } = {};
  if (periodeBulan) filterPeriode.periodeBulan = periodeBulan;
  if (periodeTahun) filterPeriode.periodeTahun = periodeTahun;

  const filterSatker = satkerEfektif ? { pegawai: { satuanKerja: satkerEfektif } } : {};
  // Hanya AKTIF - pensiunan tetap disimpan (berhak atas tukin bulan yang
  // sudah dikerjakan) tapi tidak boleh ikut menggelembungkan hitungan pegawai.
  const totalPegawai = await prisma.pegawai.count({
    where: { statusPegawai: "AKTIF", ...(satkerEfektif ? { satuanKerja: satkerEfektif } : {}) },
  });

  const [tukinRows, umRows, lemburRows] = await Promise.all([
    prisma.tukinCalculation.findMany({
      where: { ...filterPeriode, ...filterSatker },
      // satuanKerja dibutuhkan buat mencocokkan baris ke pengiriman unitnya.
      include: { pegawai: { select: { satuanKerja: true } } },
    }),
    prisma.uangMakan.findMany({
      where: { ...filterPeriode, ...filterSatker },
      include: { pegawai: { select: { satuanKerja: true } } },
    }),
    prisma.uangLembur.findMany({
      where: { ...filterPeriode, ...filterSatker },
      include: { pegawai: { select: { satuanKerja: true } } },
    }),
  ]);

  // Keadaan tiap baris = keadaan PENGIRIMAN unitnya. Satu query untuk
  // ketiga domain sekaligus - pengirimannya memang satu per unit per periode,
  // bukan per jenis pembayaran.
  const pengiriman = await prisma.pengirimanUnit.findMany({
    where: filterPeriode,
    select: { satuanKerja: true, status: true, periodeBulan: true, periodeTahun: true },
  });
  // Dikunci dengan periode BARISNYA SENDIRI, bukan periode terpilih. Dulu
  // keduanya selalu sama sehingga tidak ada bedanya; begitu "semua bulan"
  // benar-benar berlaku, memakai periode terpilih akan membuat seluruh
  // pengiriman tertumpuk di satu kunci dan tally-nya salah total.
  const petaKirim = new Map(
    pengiriman.map((p) => [kunciKirim(p.satuanKerja, p.periodeBulan, p.periodeTahun), p.status])
  );
  const kunci = (r: { pegawai: { satuanKerja: string }; periodeBulan: number; periodeTahun: number }) =>
    kunciKirim(r.pegawai.satuanKerja, r.periodeBulan, r.periodeTahun);

  // --- Sebaran pengiriman PER UNIT (bahan donat) -------------------------
  //
  // Dihitung dari pasangan UNIT x PERIODE, bukan dari baris pegawai: yang
  // ditagih PPABP adalah unitnya. Periodenya diambil dari periode yang
  // benar-benar ada kalkulasinya dalam cakupan filter - kalau diambil dari
  // kalender, unit akan dihitung "belum kirim" untuk bulan yang memang belum
  // waktunya, dan angkanya jadi tidak berarti apa-apa.
  const periodeCakupan = [...new Set(tukinRows.map((r) => `${r.periodeTahun}|${r.periodeBulan}`))];
  const unitCakupan = satkerEfektif ? [satkerEfektif] : satuanKerjaList;
  const kunciUnitPeriode = unitCakupan.flatMap((u) =>
    periodeCakupan.map((p) => {
      const [t, b] = p.split("|");
      return kunciKirim(u, Number(b), Number(t));
    })
  );
  const tallyUnit = tallyKirim(kunciUnitPeriode, petaKirim);

  // Yang PALING bisa ditindaklanjuti: unit yang kalkulasinya sudah ada tapi
  // belum dikirim - tinggal ditagih. Beda dari unit yang belum menghitung
  // sama sekali, yang urusannya jauh lebih panjang.
  const unitPunyaKalkulasi = new Set(tukinRows.map((r) => kunci(r)));
  const siapKirimBelumDikirim = [...unitPunyaKalkulasi].filter((k) => !petaKirim.has(k)).length;

  const tallyTukin = tallyKirim(tukinRows.map(kunci), petaKirim);
  const tallyUm = tallyKirim(umRows.map(kunci), petaKirim);
  const tallyLembur = tallyKirim(lemburRows.map(kunci), petaKirim);

  const totalNominal =
    tukinRows.reduce((a, r) => a + r.tukinBersih, 0) +
    umRows.reduce((a, r) => a + r.totalUangMakan, 0) +
    lemburRows.reduce((a, r) => a + r.totalUangLembur, 0);

  // SATU DEFINISI, SATU ANGKA - dihitung per UNIT, bukan per baris pegawai.
  //
  // Bentuk lamanya menjumlahkan baris dari TIGA jenis pembayaran sekaligus
  // (tukin + uang makan + lembur), lalu menyebutnya "belum dikirim unit". Dua
  // hal salah sekaligus: satuannya baris tapi ditulis unit, dan satu pegawai
  // yang sama ikut terhitung sampai tiga kali. Hasilnya angka yang tidak
  // menjawab pertanyaan apa pun - 108 di kepala halaman berdampingan dengan
  // 167 di panel progres, dua-duanya benar menurut rumusnya sendiri, dan yang
  // membacanya wajar menyimpulkan dashboardnya rusak.
  //
  // Sekarang keduanya memakai `tallyUnit` yang sama dengan panel di bawah.
  // Kalau suatu saat perlu angka per BARIS lagi, beri nama yang menyebut
  // satuannya - jangan pakai ulang nama ini.
  const totalDikembalikan = tallyUnit.dikembalikan;
  const totalBelumKirim = tallyUnit.belumKirim;
  const satuanUnit = periodeCakupan.length > 1 ? "unit-periode" : "unit";
  const persenUnitTerkirim = persenDari(tallyUnit.terkirim, kunciUnitPeriode.length);

  const anggaranRows = await prisma.anggaranRealisasi.findMany({
    where: { ...filterPeriode, ...(satkerEfektif ? { satuanKerja: satkerEfektif } : {}) },
  });
  const totalPagu = anggaranRows.reduce((a, r) => a + r.pagu, 0);
  const totalRealisasi = anggaranRows.reduce((a, r) => a + r.realisasi, 0);
  const persenRealisasi = persenDari(totalRealisasi, totalPagu);

  const selisihMenunggu = await prisma.reconciliationStatus.count({
    where: {
      status: { in: ["SELISIH", "SANGGAH"] },
      ...(periodeBulan && periodeTahun ? { periodeBulan, periodeTahun } : {}),
    },
  });

  // LENCANA KEADAAN DICABUT dari kepala halaman (permintaan user 2026-09-16).
  // Di samping nama, angka itu terbaca seperti pemberitahuan pribadi padahal
  // ia keadaan dashboard - dan isinya sama persis dengan kartu KPI "Belum
  // Dikirim" beberapa sentimeter di bawahnya.
  const adaData = tallyTukin.total + tallyUm.total + tallyLembur.total > 0;

  // Labelnya menyebut apa yang BENAR-BENAR sedang dihitung. Menulis satu nama
  // bulan sementara angkanya menjumlahkan sembilan periode adalah cara paling
  // cepat membuat orang memakai angka yang salah.
  const periodeTeks =
    periodeBulan && periodeTahun
      ? `${NAMA_BULAN[periodeBulan - 1]} ${periodeTahun}`
      : periodeTahun
        ? `Semua bulan ${periodeTahun}`
        : periodeBulan
          ? `${NAMA_BULAN[periodeBulan - 1]} semua tahun`
          : "Semua periode";

  return (
    <main className={`${HALAMAN} space-y-6`}>
      {/* ====================================================================
          1. KEPALA HALAMAN & TOMBOL AKSI
          ==================================================================== */}
      <div className="gj-masuk flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
            Halo, {sapaanNama(nama)}{" "}
            {/* Emoji dibungkus aria-hidden: pembaca layar melafalkannya
                ("melambaikan tangan") di tengah kalimat sapaan, dan itu
                mengganggu tanpa menambah arti apa pun. */}
            <span aria-hidden="true">👋</span>
          </h1>
          <p className="mt-0.5 text-sm font-medium text-muted">
            {satkerEfektif ?? "Seluruh satuan kerja"} &middot;{" "}
            <span className="font-semibold text-ink">{periodeTeks}</span>
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
        {/* Baris pintasan DICABUT (permintaan user 2026-09-16). Seluruh
            tujuannya sudah ada di sidebar, dan menampilkannya dua kali
            membuat baris filter ini bersaing perhatian dengan angka di
            bawahnya - padahal itu isi halamannya. */}
      </div>

      {/* ====================================================================
          3. ANGKA POKOK
          ==================================================================== */}
      {/* EMPAT KARTU, bukan lima (permintaan user 2026-09-16). Kartu
          "Rekonsiliasi" dicabut: ia bukan ukuran keadaan melainkan pintu ke
          halaman lain, dan tombolnya sudah berdiri di kanan atas LENGKAP
          dengan lencana jumlahnya - dua tempat untuk satu tombol. */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
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
          label="Belum Dikirim"
          nilai={totalBelumKirim}
          keterangan={`${satuanUnit} dari ${kunciUnitPeriode.length}, masih ditahan di unit`}
          warnaAngka={totalBelumKirim > 0 ? "text-gold-deep" : "text-ink"}
          nuansa="bg-gold-tint text-gold-deep"
          tundaMs={280}
          ikon={
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />

        <KartuKpi
          label="Dikembalikan"
          nilai={totalDikembalikan}
          keterangan={`${satuanUnit} yang ditolak kembali ke unit`}
          warnaAngka={totalDikembalikan > 0 ? "text-red" : "text-ink"}
          nuansa="bg-red-tint text-red"
          tundaMs={335}
          ikon={
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6M3 10l6-6" />
            </svg>
          }
        />

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
              <p className="text-xs text-muted">Berapa unit yang sudah menyerahkan ke PPABP</p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-muted">{periodeTeks}</span>
          </div>

          <div className="mt-3.5 space-y-3">
            {!adaData ? (
              <p className="py-8 text-center text-sm text-muted">
                Belum ada kalkulasi pada periode {periodeTeks}.
              </p>
            ) : (
              <>
                {/* BAR, BUKAN DONAT (permintaan user 2026-09-16). Donatnya
                    dicabut karena proporsinya di lapangan ekstrem - 1 dari 168
                    membuat hampir seluruh lingkaran jadi satu warna, dan
                    bentuk lingkaran itu memakan ruang seperempat panel untuk
                    menyampaikan lebih sedikit daripada satu baris angka di
                    sebelahnya.

                    Batang bertumpuk: hijau terkirim, merah dikembalikan,
                    sisanya lintasan kosong. Angkanya tetap ditulis lengkap di
                    bawah, jadi warna bukan satu-satunya pembawa arti. */}
                <div>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm text-muted">
                      <span className="font-mono text-lg font-black text-ink">{tallyUnit.terkirim}</span>
                      <span className="text-muted"> / {kunciUnitPeriode.length} {satuanUnit} terkirim</span>
                    </p>
                    <span className="shrink-0 font-mono text-sm font-black text-green">{persenUnitTerkirim}%</span>
                  </div>
                  <div className="mt-2 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-line">
                    {tallyUnit.terkirim > 0 && (
                      <div
                        className="rounded-full bg-green"
                        style={{ width: `${(tallyUnit.terkirim / kunciUnitPeriode.length) * 100}%` }}
                        title={`Terkirim: ${tallyUnit.terkirim} ${satuanUnit}`}
                      />
                    )}
                    {tallyUnit.dikembalikan > 0 && (
                      <div
                        className="rounded-full bg-red"
                        style={{ width: `${(tallyUnit.dikembalikan / kunciUnitPeriode.length) * 100}%` }}
                        title={`Dikembalikan: ${tallyUnit.dikembalikan} ${satuanUnit}`}
                      />
                    )}
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted">
                    Belum dikirim <strong className="font-semibold text-ink-2">{tallyUnit.belumKirim}</strong>
                    {tallyUnit.dikembalikan > 0 && (
                      <span className="font-semibold text-red"> &middot; dikembalikan {tallyUnit.dikembalikan}</span>
                    )}
                    {siapKirimBelumDikirim > 0 && (
                      <> &middot; {siapKirimBelumDikirim} sudah punya kalkulasi tapi belum menekan kirim</>
                    )}
                  </p>
                </div>

                <div className="border-t border-line-2 pt-3">
                  <p className="pb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                    Baris pegawai per jenis pembayaran
                  </p>
                </div>

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

        {/* `justify-between` DICABUT dari keadaan kosong (permintaan user
            2026-09-16): kartu ini setinggi kolom sebelahnya, dan mendorong
            satu kalimat "belum ada data" ke tengah ruang setinggi ~500px
            membuat bagian terkosong halaman jadi bagian terbesarnya.
            Sekarang isinya menempel ke atas dan kartunya berhenti setinggi
            isinya sendiri - `self-start` yang mencabut peregangan bawaan
            grid. */}
        <div
          className={`gj-masuk rounded-2xl border border-line bg-surface p-5 shadow-xs lg:col-span-5 ${
            anggaranRows.length === 0 ? "self-start" : "flex flex-col justify-between"
          }`}
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
              <p className="mt-3 text-sm text-muted">
                Belum ada data untuk {periodeTeks}
                {satkerEfektif ? ` di ${satkerEfektif}` : ""}.{" "}
                {!readOnly && (
                  <Link href="/ppabp/anggaran" className="font-semibold text-teal-deep underline">
                    Unggah anggaran
                  </Link>
                )}
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
