import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { canAjukanKalkulasiTukinMassalUnit, canExportRekapUnit } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { FilterBar } from "../../FilterBar";
import { resolveSatuanKerjaListUntukFilter } from "../../dashboardScope";
import { NAMA_BULAN } from "../../bulan";
import { periodePunyaPredikatKinerja, resolvePeriode } from "../../periodeDefault";
import { ambilAksesUnit } from "../access";
import { TUKIN_POKOK_PER_KELAS_JABATAN } from "../../../business-logic/tarifTukinPokok";
import { TARIF_POTONGAN_PASAL_13 } from "../../../business-logic/tukin";
import { rincianTukinTersimpan } from "../../../business-logic/rincianTukinTersimpan";
import { LABEL_PREDIKAT } from "../../tukin/predikat-kinerja/predikat";
import { KalkulasiMassalForm } from "./KalkulasiMassalForm";
import { KoreksiLemburForm } from "./KoreksiLemburForm";
import { Paginasi, hitungPaginasi } from "../../Paginasi";
import { BadgePejabatEselon } from "../../BadgePejabatEselon";
import { TAMPILKAN_NOMINAL_LEMBUR } from "../../tampilUangLembur";
import { PengecualianForm, BatalPengecualianForm } from "./PengecualianForm";
import {
  alasanDariKode,
  petunjukKemungkinanKeluar,
} from "../../../business-logic/pengecualianPegawai";
import {
  cekBolehKirim,
  statusUnit,
} from "../../../business-logic/pengirimanUnit";
import { KirimRekapForm } from "../kirim/KirimRekapForm";
import { HALAMAN } from "../../layoutHalaman";

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

function jenisKepegawaian(golongan: string | null): string | null {
  if (!golongan) return null;
  const g = golongan.trim().toUpperCase();
  if (/^[IVX]+\/[A-E]$/.test(g)) return "PNS";
  if (/^[IVX]+$/.test(g)) return "PPPK";
  return null;
}

function BelumAda({ judul }: { judul: string }) {
  return (
    <span className="text-muted/60" title={judul}>
      -
    </span>
  );
}

function selCuti(
  kunci: string,
  rekap: { jenisCutiAktif: string | null; bulanCutiKeberapa: number | null; jumlahHariCuti: number } | undefined
): string {
  if (!rekap?.jenisCutiAktif) return "";
  const bulan = rekap.bulanCutiKeberapa ?? 1;
  const jenis = rekap.jenisCutiAktif;

  const cocok =
    kunci === "GUGUR_1" ? jenis === "CUTI_SAKIT_GUGUR_KANDUNGAN" && rekap.jumlahHariCuti <= 30 :
    kunci === "GUGUR_2" ? jenis === "CUTI_SAKIT_GUGUR_KANDUNGAN" && rekap.jumlahHariCuti > 30 :
    kunci === "TAHUNAN" ? jenis === "CUTI_TAHUNAN" :
    kunci === "MELAHIRKAN" ? jenis === "CUTI_MELAHIRKAN_ANAK_1_2_3" :
    kunci === "SAKIT_1" ? jenis === "CUTI_SAKIT" && bulan === 1 :
    kunci === "SAKIT_2" ? jenis === "CUTI_SAKIT" && bulan === 2 :
    kunci === "SAKIT_3" ? jenis === "CUTI_SAKIT" && bulan === 3 :
    kunci === "SAKIT_4" ? jenis === "CUTI_SAKIT" && bulan > 3 :
    kunci === "BESAR_AP_KURANG" ? jenis === "CUTI_BESAR_KURANG_1_BULAN" || jenis === "CUTI_ALASAN_PENTING" :
    kunci === "BESAR_1" ? jenis === "CUTI_BESAR" && bulan === 1 :
    kunci === "BESAR_2" ? jenis === "CUTI_BESAR" && bulan === 2 :
    kunci === "BESAR_3" ? jenis === "CUTI_BESAR" && bulan >= 3 :
    false;

  if (!cocok) return "";
  return rekap.jumlahHariCuti > 0 ? String(rekap.jumlahHariCuti) : "v";
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
        <h1 className="text-xl font-extrabold tracking-tight text-ink">Kalkulasi Unit</h1>
        <p className="mt-1 text-sm text-muted">Pilih satuan kerja dan periode dulu.</p>
        <FilterBar satuanKerjaList={satuanKerjaList} bulan={bulan} tahun={tahun} satker={satker} />
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
    return sebab.length > 0 ? sebab.join(" & ") : null;
  };
  const jumlahPerluHitungUlang = pegawaiAktif.filter((p) => perluHitungUlang(p) !== null).length;

  const sumberPenilaian = [
    ...new Map(
      pegawaiAktif
        .map((p) => p.predikatKinerja[0])
        .filter((k): k is NonNullable<typeof k> => Boolean(k))
        .map((k) => [k.unitPenilaian ?? "(sumber tidak tercatat)", k.unitPenilaian ?? "(sumber tidak tercatat)"])
    ).values(),
  ].map((unit) => ({
    unit,
    jumlah: pegawaiAktif.filter(
      (p) => (p.predikatKinerja[0]?.unitPenilaian ?? "(sumber tidak tercatat)") === unit && p.predikatKinerja.length > 0
    ).length,
  }));

  const lengkap = belumPunyaPredikat.length === 0 && pegawaiAktif.length > 0;

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
          <h1 className="text-xl font-extrabold tracking-tight text-ink">Kalkulasi Unit</h1>
          <p className="mt-1 text-sm text-muted">
            {satkerEfektif} - Periode {NAMA_BULAN[periodeBulan - 1]} {periodeTahun}
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

      <FilterBar satuanKerjaList={satuanKerjaList} bulan={String(periodeBulan)} tahun={String(periodeTahun)} satker={satkerEfektif} />

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
      {kirimStatus.keadaan === "DIKEMBALIKAN" && (
        <div className="card mt-4 border-l-4 border-l-gold p-4">
          <p className="text-sm font-bold text-ink">
            Dikembalikan PPABP - perlu diperbaiki
          </p>
          <p className="mt-1 text-xs text-ink-2">{kirimStatus.alasanKembali}</p>
          <p className="mt-1 text-xs text-muted">
            Perbaiki dulu, lalu kirim ulang lewat panel di bawah.
          </p>
        </div>
      )}

      {/* Kelengkapan sumber data - ditaruh SEBELUM tombol hitung, supaya
          ketahuan lebih dulu daripada setelah kalkulasi terlanjur jalan. */}
      <div className="card mt-4 p-4">
        <h2 className="text-sm font-bold text-ink">Kelengkapan data periode ini</h2>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-line-2 bg-surface-2 p-3">
            <p className="text-xs font-semibold text-muted">Predikat kinerja (bobot 70%)</p>
            <p className="mt-0.5 text-sm font-bold text-ink">
              {pegawaiAktif.length - belumPunyaPredikat.length} / {pegawaiAktif.length} pegawai aktif
            </p>
            {sumberPenilaian.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-muted">
                {sumberPenilaian.map((s) => (
                  <li key={s.unit}>
                    {s.unit} - {s.jumlah} pegawai
                  </li>
                ))}
              </ul>
            )}
            <a href="/tukin/predikat-kinerja" className="mt-2 inline-block text-xs font-semibold text-brand underline">
              Kelola predikat kinerja
            </a>
          </div>

          <div className="rounded-lg border border-line-2 bg-surface-2 p-3">
            <p className="text-xs font-semibold text-muted">Rekap presensi (bobot 30%)</p>
            <p className="mt-0.5 text-sm font-bold text-ink">
              {pegawaiAktif.length - belumPunyaPresensi.length} / {pegawaiAktif.length} pegawai aktif
            </p>
            <a href="/tukin/presensi" className="mt-2 inline-block text-xs font-semibold text-brand underline">
              Kelola presensi
            </a>
          </div>
        </div>

        {/* Angka Tukin dibekukan saat dihitung. Kalau sumbernya berubah
            setelah itu, tabel di bawah menampilkan angka lama tanpa tanda -
            dan itu terbaca sebagai "koreksi saya tidak berpengaruh". */}
        {jumlahPerluHitungUlang > 0 && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-gold-tint p-3 text-xs text-ink-2 dark:border-amber-800">
            <p className="font-semibold text-ink">
              {jumlahPerluHitungUlang} pegawai perlu dihitung ulang - angka Tukin-nya sudah basi.
            </p>
            {/* Sebabnya: presensi/predikat berubah SETELAH Tukin terakhir
                dihitung (mis. presensi ditarik ulang karena koreksi jam),
                jadi angka di tabel masih yang lama. Tidak ditulis di layar -
                yang perlu diketahui pembaca cuma berapa orang dan apa yang
                harus ditekan. */}
            <p className="mt-1 text-muted">
              Baris terdampak ditandai kuning. Tekan Hitung sekarang.
            </p>
          </div>
        )}

        {belumPunyaPredikat.length > 0 && (
          <div className="mt-3 rounded-lg bg-gold-tint p-3 text-xs text-ink-2">
            <p className="font-semibold">
              {belumPunyaPredikat.length} pegawai aktif belum punya predikat kinerja periode ini.
            </p>
            {/* Sebab tersering: file dari salah satu unit penilai belum
                diupload - satu satuan kerja bisa dinilai lebih dari satu
                penilai, masing-masing dengan file berisi orang berbeda.
                Disimpan di sini, bukan di layar. */}
            <p className="mt-1 text-muted">Dilewati kalau dihitung sekarang.</p>
            <ul className="mt-2 list-disc space-y-0.5 pl-4">
              {belumPunyaPredikat.slice(0, 15).map((p) => (
                <li key={p.id}>
                  {p.nama} <span className="text-muted">({p.nip})</span>
                  {/* Jalan keluar untuk orang yang memang sudah tidak di unit
                      ini. Ditaruh tepat di sebelah namanya, bukan di halaman
                      terpisah - di sinilah orang menyadari masalahnya. */}
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
                      jumlahHariTugasBelajar:
                        p.rekapPresensi[0]?.jumlahHariTugasBelajar ?? 0,
                    })}
                  />
                </li>
              ))}
              {belumPunyaPredikat.length > 15 && (
                <li className="text-muted">...dan {belumPunyaPredikat.length - 15} pegawai lainnya</li>
              )}
            </ul>
          </div>
        )}

        {lengkap && (
          <p className="mt-3 text-xs font-semibold text-green">
            Semua pegawai aktif sudah punya predikat kinerja - siap dihitung.
          </p>
        )}
      </div>

      <KalkulasiMassalForm
        satuanKerja={satkerEfektif}
        periodeBulan={periodeBulan}
        periodeTahun={periodeTahun}
        jumlahBelumPunyaPredikat={belumPunyaPredikat.length}
        namaBulan={NAMA_BULAN[periodeBulan - 1] ?? String(periodeBulan)}
      />

      <div className="card mt-6 p-4">
        <h2 className="text-sm font-bold text-ink">Cara membaca tabel Rincian Tukin</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          Dasarnya <strong>Tunjangan Kinerja sebelum potongan</strong> (tukin pokok kelas jabatan, Lampiran Permenaker
          15/2024), dibelah sesuai <strong>Pasal 5</strong>: 70% capaian kinerja + 30% kehadiran. Kolom{" "}
          <strong>Potongan %</strong> adalah potongan Pasal 13 yang dihitung dari <em>bobot kehadiran</em>, bukan dari
          total tukin - itu sebabnya potongan 1% cuma berkurang Rp26.273 dari Rp8.757.600, bukan Rp87.576.
        </p>
        <p className="mt-2 font-mono text-xs text-ink-2">
          Tunjangan Kinerja kotor - potongan = Tukin bersih
        </p>
        <p className="mt-2 text-xs text-muted">
          Potongan dalam <strong>rupiah</strong> tidak ditampilkan di tabel ringkas - buka{" "}
          <strong>Lihat rincian lengkap</strong> kalau butuh angkanya beserta pecahan kehadiran dan kinerjanya.
        </p>
        <p className="mt-2 text-xs text-muted">
          <strong>Tidak ada kolom PPh</strong> - sama seperti rekap Excel, angkanya bruto. Pemotongan pajak bukan bagian
          dari perhitungan ini.
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* RINCIAN TUKIN - ringkas (default) atau lengkap (?rincian=1)         */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-ink">
          Rincian Tukin{tampilRinci && <span className="ml-2 text-sm font-normal text-muted">- rincian lengkap</span>}
        </h2>
        <a
          href={tampilRinci ? linkRingkas : linkRinci}
          className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface-3"
        >
          {tampilRinci ? "Tampilkan ringkas" : "Lihat rincian lengkap"}
        </a>
      </div>

      {!tampilRinci && (
        <div className="card mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
                <th className="col-nama px-4 py-2.5">Nama</th>
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
                <th className="px-4 py-2.5">
                  Jam Lembur
                  {/* Selama nominalnya belum disetujui, sub-judulnya tidak
                      boleh berbunyi "dibayar" - itu menjanjikan sesuatu yang
                      justru sedang ditahan. Jamnya sendiri memang sudah
                      dibulatkan & dibatasi, jadi "tercatat" tetap akurat. */}
                  <span className="block text-[10px] font-normal normal-case">
                    {TAMPILKAN_NOMINAL_LEMBUR ? "dibayar" : "tercatat"}
                  </span>
                </th>
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
                  <tr key={p.id} className={`border-b border-line-2 align-top ${basi ? "bg-gold-tint" : ""}`}>
                    <td className="col-nama px-4 py-2.5">
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
                    <td className="px-4 py-2.5 font-mono text-ink-2">
                      {/* Jam yang SUDAH dipangkas ke jam penuh dan sudah kena
                          batas maksimal - bukan jam mentah dari rekap presensi. */}
                      {lembur ? `${lembur.totalJamLembur} jam` : "-"}
                    </td>
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
          <Paginasi
            basePath="/kasubag/kalkulasi"
            params={paramPaginasi}
            info={paginasi}
            totalBaris={pegawaiList.length}
            labelBaris="pegawai"
          />
        </div>
      )}

      {tampilRinci && (
      <>
      <div className="card mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-[11px] font-bold uppercase tracking-wide text-muted">
              <th className={th}>No.</th>
              <th className={`col-nama ${th}`}>Nama Pegawai</th>
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
                <tr key={p.id} className={`border-b border-line-2 ${basi ? "bg-gold-tint" : ""}`}>
                  <td className={`${td} text-muted`}>{paginasi.mulai + i + 1}</td>
                  <td className="col-nama whitespace-nowrap px-3 py-2">
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
        <Paginasi
          basePath="/kasubag/kalkulasi"
          params={paramPaginasi}
          info={paginasi}
          totalBaris={pegawaiList.length}
          labelBaris="pegawai"
        />
      </div>

      <div className="card mt-3 border-amber-300 p-4 dark:border-amber-800">
        <h3 className="text-sm font-bold text-ink">Cara membaca kolom cuti</h3>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
          <li>
            <span className="font-mono">-</span> berarti <strong>rekap presensi periode ini belum ada</strong> (datanya
            tidak diketahui). Sel <strong>kosong</strong> berarti rekapnya ada dan orangnya memang tidak cuti.
          </li>
          <li>
            Angka di kolom cuti adalah <strong>jumlah hari</strong>. Tanda <span className="font-mono">v</span> berarti
            cutinya tercatat tapi jumlah harinya tidak diisi - cukup untuk cuti sakit &amp; cuti besar (yang menentukan
            potongannya bulan ke berapa, bukan harinya), tapi <strong>tidak cukup</strong> untuk cuti gugur kandungan di
            atas 1 bulan yang tarifnya 1% per hari.
          </li>
          <li>
            Kolom <strong>Bulan I / II / III</strong> ditentukan isian &quot;Bulan Cuti Ke&quot; di template rekap
            presensi. Tarikan e-Presensi <strong>tidak bisa</strong> menentukannya sendiri - satu bulan export tidak
            memberi tahu cuti itu sudah berjalan berapa lama. Selama belum diisi, cuti dianggap{" "}
            <strong>bulan pertama</strong> (cuti sakit tidak dipotong, cuti besar dipotong 50%).
          </li>
        </ul>
      </div>

          {/* ---------------------------------------------------------------- */}
          {/* Uang makan & lembur - di tampilan RINCI saja. Di tampilan ringkas */}
          {/* ketiganya sudah jadi kolom biasa di tabel utama.                  */}
          {/* ---------------------------------------------------------------- */}
          <h2 className="mt-8 text-base font-bold text-ink">
            Uang Makan &amp;{" "}
            {TAMPILKAN_NOMINAL_LEMBUR ? "Uang Lembur" : "Jam Lembur"}
          </h2>
          <p className="mt-1 text-xs text-muted">
            Di luar cakupan rekap Excel Tukin - dipisah supaya tabel di atas
            tetap sebanding kolom per kolom.
          </p>
          <div className="card mt-2 overflow-x-auto">
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
                            ? `${formatRupiah(lembur.totalUangLembur)} (${lembur.totalJamLembur} jam)`
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
            <Paginasi
              basePath="/kasubag/kalkulasi"
              params={paramPaginasi}
              info={paginasi}
              totalBaris={pegawaiList.length}
              labelBaris="pegawai"
            />
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
      <KirimRekapForm
        terkunci={kirimStatus.terkunci}
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
        alasanTertahan={
          cekBolehKirim(
            {
              totalPegawai: pegawaiAktif.length,
              jumlahKalkulasi: pegawaiAktif.filter(
                (p) => p.tukinCalc.length > 0,
              ).length,
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
    </main>
  );
}
