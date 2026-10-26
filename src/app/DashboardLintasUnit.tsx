import Link from "next/link";
import { prisma } from "../lib/prisma";
import type { AuthUser } from "../auth/permissions";
import { FilterBar } from "./FilterBar";
import { resolveSatkerEfektif, resolveSatuanKerjaListUntukFilter, satkerTerkunciUntukAkun } from "./dashboardScope";
import { kunciKirim, tallyKirim, type HasilTallyKirim } from "./tallyKirim";
import { TAMPILKAN_NOMINAL_LEMBUR } from "./tampilUangLembur";
import { HALAMAN } from "./layoutHalaman";
import { NAMA_BULAN } from "./bulan";
import { sapaanNama } from "./sapaan";
import { hitungKomposisiPegawai } from "../business-logic/komposisiPegawai";
import { kelompokDariNilaiData } from "./ppabp/adk/jenisPegawaiAdk";
import {
  KartuKelengkapanData,
  KartuPieJenisKelamin,
  KartuPieGolongan,
  KartuPieInstansi,
  KartuPieJenisKepegawaian,
} from "./KartuDataPegawai";
import { KartuGrafik, Donat, Legenda, angkaId, type PotonganSeri } from "./KitGrafik";
import { TabelMonitoringSatker } from "./TabelMonitoringSatker";
import { hitungPaginasi } from "./Paginasi";
import {
  nilaiKalkulasiTampil,
  rangkumMonitoringSatker,
  saringMonitoring,
} from "../business-logic/monitoringSatker";

const formatRupiah = (nilai: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0, notation: "compact" }).format(nilai);

const persenDari = (bagian: number, dari: number) => (dari > 0 ? Math.round((bagian / dari) * 100) : 0);

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
 * (Pimpinan) menyembunyikan link ke halaman AKSI (Rekonsiliasi, Export ADK -
 * keduanya butuh izin PPABP/ADMIN yang Pimpinan tidak punya; kalau tetap
 * ditautkan, Pimpinan bakal mentok "Akses ditolak" di halaman tujuan) - angka "Rekonsiliasi perlu
 * ditangani" TETAP ditampilkan buat Pimpinan, cuma tidak jadi tautan, supaya
 * visibilitasnya utuh sesuai role matrix "dashboard yang SAMA".
 *
 * BENTUKNYA MENGIKUTI DASHBOARD KASUBAG TU (permintaan user 2026-09-10):
 * sapaan + lencana keadaan, baris filter ringkas, kartu KPI ber-ikon dengan
 * angka yang naik, lalu panel-panel ber-kepala bergaris. Baris pintasan yang
 * dulu menemani filter sudah dicabut dari KEDUA dashboard (2026-09-16) -
 * keseragaman itu disengaja, jangan dikembalikan sebelah saja.
 *
 * ANGKA ANGGARAN TIDAK DITAMPILKAN DI SINI (keputusan user 2026-10-22, untuk
 * PPABP maupun Pimpinan). Pagu & realisasi punya halamannya sendiri di
 * /ppabp/anggaran, yang dibuka lewat sidebar PPABP.
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
  basePath,
}: {
  searchParams: {
    bulan?: string;
    tahun?: string;
    satker?: string;
    /** Pencarian & penyaring TABEL monitoring - bukan filter halaman. */
    q?: string;
    status?: string;
    hal?: string;
    per?: string;
  };
  authUser: AuthUser;
  readOnly: boolean;
  /** Nama pemilik sesi, buat sapaan di kepala halaman. */
  nama: string;
  /** Alamat halaman pemanggil - lihat `basePath` di TabelMonitoringSatker. */
  basePath: string;
}) {
  const { bulan, tahun, satker, q, status, hal, per } = searchParams;

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
  //
  // SATU `where`, DIPAKAI BERSAMA keempat pie komposisi dan hitungan
  // pegawai tanpa rekening. Kalau ketiganya menyusun
  // penyaringnya sendiri-sendiri, cepat atau lambat salah satunya bergeser dan
  // halaman ini menyebut dua jumlah pegawai yang berbeda - persis kekeliruan
  // yang pernah terjadi pada "belum dikirim" (lihat catatan totalBelumKirim
  // di bawah).
  const wherePegawaiAktif = {
    statusPegawai: "AKTIF",
    ...(satkerEfektif ? { satuanKerja: satkerEfektif } : {}),
  };

  // TANPA `count()` terpisah: jumlah pegawai aktif adalah `komposisi.total`,
  // dicacah dari baris yang SAMA dengan keempat pie. Dua query untuk satu
  // angka berarti dua kesempatan untuk tidak sepakat.
  const [barisPegawai, tanpaRekening] = await Promise.all([
    // Kolomnya dipilih satu per satu: lima kolom kecil untuk ~5.000 baris,
    // bukan seluruh baris Pegawai yang memuat jabatan, nomor SK, dan sidik NIK
    // yang tidak dipakai panel ini sama sekali.
    prisma.pegawai.findMany({
      where: wherePegawaiAktif,
      select: {
        golongan: true,
        jenisKelamin: true,
        kelasJabatan: true,
        statusKawin: true,
        satuanKerja: true,
        identitasWebGaji: { select: { jenisPegawai: true } },
      },
    }),
    prisma.pegawai.count({ where: { ...wherePegawaiAktif, rekening: { none: {} } } }),
  ]);

  const komposisi = hitungKomposisiPegawai(
    barisPegawai.map((b) => ({
      kelompok: kelompokDariNilaiData(b.identitasWebGaji?.jenisPegawai),
      golongan: b.golongan,
      jenisKelamin: b.jenisKelamin,
      kelasJabatan: b.kelasJabatan,
      statusKawin: b.statusKawin,
      satuanKerja: b.satuanKerja,
    }))
  );

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

  const nominalTukin = tukinRows.reduce((a, r) => a + r.tukinBersih, 0);
  const nominalUangMakan = umRows.reduce((a, r) => a + r.totalUangMakan, 0);
  const nominalUangLembur = lemburRows.reduce((a, r) => a + r.totalUangLembur, 0);

  // LEMBUR TIDAK IKUT selama TAMPILKAN_NOMINAL_LEMBUR mati, dan ini PERBAIKAN:
  // bentuk sebelumnya menjumlahkan ketiganya tanpa syarat lalu menamainya
  // "Tukin + uang makan + lembur" di kartu angka pokok - persis dua tempat
  // yang disebut saklar itu, "kartu ringkasan dashboard" dan "total belanja
  // unit". Angka yang tampil akan dikutip ke notulen, dan peringatan di
  // sebelahnya tidak ikut tersalin.
  const totalNominal = nilaiKalkulasiTampil(
    { nilaiTukin: nominalTukin, nilaiUangMakan: nominalUangMakan, nilaiUangLembur: nominalUangLembur },
    TAMPILKAN_NOMINAL_LEMBUR
  );

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

  const selisihMenunggu = await prisma.reconciliationStatus.count({
    where: {
      status: { in: ["SELISIH", "SANGGAH"] },
      ...(periodeBulan && periodeTahun ? { periodeBulan, periodeTahun } : {}),
    },
  });

  // --- BAHAN TABEL MONITORING PER SATUAN KERJA ---------------------------
  //
  // Dirakit dari baris kalkulasi yang SUDAH diambil di atas, bukan dari query
  // baru: tabel yang menanyakan ulang ke database bisa menjawab angka yang
  // berbeda dari kartu di atasnya kalau ada yang menyimpan di sela keduanya.
  const periodeCakupanObjek = periodeCakupan.map((p) => {
    const [t, b] = p.split("|");
    return { bulan: Number(b), tahun: Number(t) };
  });

  const barisMonitoring = rangkumMonitoringSatker({
    tukin: tukinRows.map((r) => ({
      satuanKerja: r.pegawai.satuanKerja,
      periodeBulan: r.periodeBulan,
      periodeTahun: r.periodeTahun,
      nilai: r.tukinBersih,
    })),
    uangMakan: umRows.map((r) => ({
      satuanKerja: r.pegawai.satuanKerja,
      periodeBulan: r.periodeBulan,
      periodeTahun: r.periodeTahun,
      nilai: r.totalUangMakan,
    })),
    uangLembur: lemburRows.map((r) => ({
      satuanKerja: r.pegawai.satuanKerja,
      periodeBulan: r.periodeBulan,
      periodeTahun: r.periodeTahun,
      nilai: r.totalUangLembur,
    })),
    petaKirim,
    unitCakupan,
    periodeCakupan: periodeCakupanObjek,
  });

  const barisTersaring = saringMonitoring(barisMonitoring, q, status);
  const infoPaginasi = hitungPaginasi(barisTersaring.length, hal, per);
  const barisHalaman = barisTersaring.slice(infoPaginasi.mulai, infoPaginasi.selesai);

  // Parameter yang harus ikut saat pindah halaman tabel. Dirakit dari yang
  // BENAR-BENAR terisi - `?bulan=&tahun=` kosong yang ikut terbawa membuat
  // "semua periode" tidak bisa dibedakan dari "belum memilih".
  const paramsTabel = new URLSearchParams();
  for (const [k, v] of Object.entries({ bulan, tahun, satker, q, status, per })) {
    if (v) paramsTabel.set(k, v);
  }

  // Potongan donat nilai kalkulasi. Lembur cuma ikut kalau saklarnya menyala -
  // dan kalau tidak, ketiadaannya DISEBUT di kartunya, bukan dibiarkan
  // terlihat seperti lembur memang nol.
  const potonganNilai: PotonganSeri[] = [
    {
      kode: "tukin",
      label: "Tunjangan Kinerja",
      jumlah: nominalTukin,
      kelasIsi: "bg-seri-1",
      kelasGaris: "stroke-seri-1",
    },
    {
      kode: "um",
      label: "Uang Makan",
      jumlah: nominalUangMakan,
      kelasIsi: "bg-seri-2",
      kelasGaris: "stroke-seri-2",
    },
    ...(TAMPILKAN_NOMINAL_LEMBUR
      ? [
          {
            kode: "lembur",
            label: "Uang Lembur",
            jumlah: nominalUangLembur,
            kelasIsi: "bg-seri-3",
            kelasGaris: "stroke-seri-3",
          },
        ]
      : []),
  ];

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
          1. KEPALA HALAMAN - SAPAAN, LALU FILTER + AKSI SEBARIS

          DUA BARIS, DAN PEMBAGIANNYA DISENGAJA. Sapaan di baris sendiri;
          filter (bulan, tahun, satuan kerja, Terapkan) dan kedua tombol aksi
          berjajar di baris berikutnya (permintaan user 2026-10-22: "jadi 1
          jajar, jangan bikin 2 baris"). Waktu sapaan ikut berbagi baris,
          kontrolnya cuma kebagian ~650px dari ~870px yang dibutuhkan - dan
          Rekonsiliasi & Export ADK selalu terlempar ke baris kedua.
          ==================================================================== */}
      <div className="gj-masuk space-y-4">
        <div className="min-w-0">
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

        <div className="flex flex-wrap items-center gap-2.5 xl:flex-nowrap">
          <FilterBar
            ringkas
            pil
            satkerTerkunci={satkerTerkunciUntukAkun(authUser)}
            satuanKerjaList={satuanKerjaList}
            bulan={bulan}
            tahun={tahun}
            satker={satker}
          />

          {!readOnly && (
            <>
              <Link
                href="/ppabp/rekonsiliasi"
                // h-10 = tinggi isian & tombol Terapkan di FilterBar (pil).
                className="btn btn-primary inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-0 text-sm font-bold shadow-sm"
              >
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                Rekonsiliasi
                {selisihMenunggu > 0 && (
                  <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-bold">
                    {selisihMenunggu}
                  </span>
                )}
              </Link>
              <Link
                href={
                  periodeBulan && periodeTahun ? `/ppabp/adk?bulan=${periodeBulan}&tahun=${periodeTahun}` : "/ppabp/adk"
                }
                className="btn btn-ghost inline-flex shrink-0 items-center gap-2 whitespace-nowrap h-10 rounded-full border border-line bg-surface px-4 py-0 text-sm font-semibold text-ink transition hover:bg-surface-2"
              >
                <svg className="size-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export ADK
              </Link>
            </>
          )}
        </div>
      </div>

      {/* ====================================================================
          2. EMPAT PIE KOMPOSISI PEGAWAI AKTIF

          Urutan kiri ke kanan ditetapkan user (2026-10-22): Pegawai Aktif,
          Instansi, Golongan, Jenis Kelamin. Kartu angka "Total Pegawai Aktif"
          DICABUT - totalnya sudah tertulis di tengah keempat cincin.

          Keempatnya menjawab "siapa yang dibayar", BUKAN "berapa yang
          dibayar" - nominal punya kartunya sendiri di baris berikutnya. Dan
          keempatnya satu-satunya di halaman ini yang TIDAK mengikuti filter
          periode, karena roster bukan besaran periodik; itu tertulis di kaki
          keterangan tiap pie.

          Pie jenis kelamin cuma dua potong - bentuk yang biasanya lebih jelas
          sebagai dua angka - tapi dipertahankan atas permintaan user.
          ==================================================================== */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <KartuPieJenisKepegawaian komposisi={komposisi} tundaMs={120} />
        <KartuPieInstansi komposisi={komposisi} tundaMs={175} />
        <KartuPieGolongan komposisi={komposisi} tundaMs={230} />
        <KartuPieJenisKelamin komposisi={komposisi} tundaMs={285} />
      </div>

      {/* ====================================================================
          3. DUA KOLOM OPERASIONAL PPABP

          Kartu "Status Dokumen & Anggaran" dicabut atas permintaan user
          (2026-10-22). Anggaran & Realisasi tetap dikelola di menu PPABP
          (grup "Data Pokok"); Pimpinan kini tidak melihat angka anggaran di
          dashboard mana pun - keputusan user.
          ==================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <KartuGrafik
          judul="Progres Pengiriman Unit"
          subjudul="Berapa unit yang sudah menyerahkan ke PPABP"
          meta={periodeTeks}
          tundaMs={360}
        >
          <div>
            <p className="font-mono text-2xl font-black leading-none text-ink">
              {angkaId(tallyUnit.terkirim)}
              <span className="text-base font-bold text-muted"> / {angkaId(kunciUnitPeriode.length)}</span>
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {satuanUnit} terkirim ({persenUnitTerkirim}%)
            </p>
          </div>

          {/* Dua lencana ini LAPIS STATUS, bukan kotak - angkanya sudah
              berwarna, dan kotak di sekelilingnya membuat tiga penekanan
              dalam satu kartu yang cuma punya satu pesan utama. */}
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-gold-tint px-2.5 py-0.5 text-[11px] font-bold text-gold-deep">
              {angkaId(totalBelumKirim)} Belum Dikirim
            </span>
            <span className="rounded-full bg-red-tint px-2.5 py-0.5 text-[11px] font-bold text-red">
              {angkaId(totalDikembalikan)} Dikembalikan
            </span>
          </div>

          <div className="mt-4 space-y-3 border-t border-line-2 pt-4">
            {!adaData ? (
              <p className="py-4 text-center text-sm text-muted">
                Belum ada kalkulasi pada periode {periodeTeks}.
              </p>
            ) : (
              <>
                <BarisProgres
                  inisial="TK"
                  nama="Tunjangan Kinerja"
                  tally={tallyTukin}
                  kelasKotak="bg-navy"
                  kelasBar="bg-navy"
                  kelasPersen="text-navy"
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

          {adaData && siapKirimBelumDikirim > 0 && (
            <p className="mt-auto pt-3 text-[11px] leading-relaxed text-muted">
              {angkaId(siapKirimBelumDikirim)} {satuanUnit} sudah punya kalkulasi tapi belum dikirim - tinggal
              ditagih.
            </p>
          )}
        </KartuGrafik>

        <KartuGrafik
          judul="Ringkasan Kalkulasi"
          subjudul="Nilai yang sedang berjalan di periode ini"
          meta={periodeTeks}
          tundaMs={420}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <dl className="min-w-[8rem] space-y-2.5 text-xs">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wider text-muted">Periode</dt>
                <dd className="font-semibold text-ink">{periodeTeks}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wider text-muted">Total Unit</dt>
                <dd className="font-mono font-bold text-ink">{angkaId(unitCakupan.length)} satker</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wider text-muted">Status Verifikasi</dt>
                <dd className={selisihMenunggu > 0 ? "font-bold text-red" : "font-bold text-green"}>
                  {selisihMenunggu > 0 ? `${angkaId(selisihMenunggu)} selisih menunggu` : "Tidak ada selisih"}
                </dd>
              </div>
            </dl>

            <Donat
              potongan={potonganNilai}
              total={totalNominal}
              angkaTengah={formatRupiah(totalNominal)}
              labelTengah="nilai kalkulasi"
              lebar={148}
            />
          </div>

          <div className="mt-4 border-t border-line-2 pt-3">
            <Legenda potongan={potonganNilai} total={totalNominal} nilaiTeks={(p) => formatRupiah(p.jumlah)} />
          </div>

          {!TAMPILKAN_NOMINAL_LEMBUR && (
            // Ketiadaan lembur DISEBUT. Donat tanpa potongan lembur dan tanpa
            // keterangan terbaca seperti lembur memang nol rupiah.
            <p className="mt-auto pt-3 text-[11px] leading-relaxed text-muted">
              Uang lembur belum masuk hitungan di atas - nominalnya masih menunggu tata cara dari Bagian
              Keuangan. Jamnya tetap terekam.
            </p>
          )}
        </KartuGrafik>
      </div>

      {/* ====================================================================
          4. TABEL MONITORING PER SATUAN KERJA
          ==================================================================== */}
      <TabelMonitoringSatker
        baris={barisHalaman}
        totalBaris={barisTersaring.length}
        info={infoPaginasi}
        params={paramsTabel}
        basePath={basePath}
        banyakPeriode={periodeCakupanObjek.length > 1}
        readOnly={readOnly}
        tundaMs={540}
        q={q}
        status={status}
      />

      {/* ====================================================================
          5. KEKURANGAN DATA YANG MENGHALANGI PEMBAYARAN

          DI PALING BAWAH, dan posisi terakhir termasuk yang paling diingat.
          Isinya keadaan roster yang berubah pelan - bukan temuan periode ini -
          jadi ia tidak boleh menyela pekerjaan berperiode di atasnya, tapi
          juga tidak boleh hilang.
          ==================================================================== */}
      <KartuKelengkapanData
        komposisi={komposisi}
        tanpaRekening={tanpaRekening}
        readOnly={readOnly}
        tundaMs={600}
      />
    </main>
  );
}
