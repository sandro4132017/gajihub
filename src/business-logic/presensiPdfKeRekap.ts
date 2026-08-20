// ============================================================================
// LAPORAN PDF e-Presensi -> REKAP BULANAN (BarisRekapPresensi)
//
// Modul ini PURE (lihat "Konvensi kode" di CLAUDE.md). Masukannya hasil
// parsePdfPresensi(), keluarannya bentuk yang SAMA PERSIS dengan hasil upload
// template Excel (BarisRekapPresensi di rekapPresensi.ts) - jadi jalur simpan,
// validasi, dan kalkulasi Tukin/uang makan/uang lembur yang sudah ada tidak
// perlu diubah sama sekali.
//
// -------------------------------------------------------------------------
// KOLOM "POTONGAN" DI PDF TIDAK DIPAKAI SEBAGAI NOMINAL
// -------------------------------------------------------------------------
// Instruksi eksplisit user: angkanya tidak sesuai Permenaker 15/2024, jadi
// potongan dihitung ulang di sini dari FAKTA presensi (tanggal, status, jam
// masuk, jam keluar) memakai hitungPotonganKehadiranPersen di tukin.ts.
//
// Dan memang terbukti tidak konsisten. Dari 3 file asli (46 laporan, 1.145
// baris) ada 238 kedatangan lewat 07:30 yang TIDAK diberi catatan
// keterlambatan sama sekali oleh e-Presensi - termasuk yang telat 84 menit -
// sementara yang telat 1 menit justru dicatat. KONSEKUENSINYA: potongan hasil
// hitungan Gajihub akan LEBIH BESAR dari yang tertera di PDF untuk sebagian
// pegawai. Itu memang yang diminta, tapi jangan sampai kaget waktu diadu.
//
// Satu-satunya hal yang DIAMBIL dari kolom itu adalah penanda "lupa presensi"
// - itu FAKTA (pegawai tidak menekan presensi), bukan nominal, dan tidak ada
// di kolom lain mana pun. Lihat LUPA_PRESENSI di bawah.
//
// -------------------------------------------------------------------------
// JADWAL KERJA - SEKARANG PUNYA DASAR HUKUM (Pasal 9 Permenaker 15/2024)
// -------------------------------------------------------------------------
// Ketiga angka di JADWAL_KERJA_DEFAULT dulu diturunkan dari DATA dan ditandai
// TODO(confirm) "belum ada dokumen resmi jam kerja Kemnaker". Dokumennya
// sekarang ada, dan angkanya COCOK SEMUA:
//
//   ayat (1) "paling sedikit 7,5 jam untuk 1 hari dan 37,5 untuk 1 minggu"
//            -> jamKerjaPerHari = 7.5
//   ayat (2) "Senin s.d. Kamis, hadir pukul 07.30 sampai dengan pukul 16.00;
//             hari Jumat, hadir pukul 07.30 sampai dengan pukul 16.30"
//            -> jamMasukWajibMenit 07:30, jamPulangWajibMenit 16:00 / 16:30
//   ayat (3) "diberikan toleransi waktu sebanyak 60 menit"
//            -> toleransiTerlambatMenit = 60
//
// Penurunan dari data (di bawah) DIBIARKAN sebagai catatan sejarah: angka
// yang sama muncul dari dua jalan yang tidak saling menyalin, dan itu
// menguatkan keduanya.
//
// TODO(confirm) YANG TERSISA - ayat (4): "Ketentuan mengenai Hari Kerja dan
// Jam Kerja ... dapat DIKECUALIKAN sesuai dengan ketentuan peraturan
// perundang-undangan." Jadwal di sini berlaku seragam untuk SEMUA satker;
// kalau ada unit yang dikecualikan (mis. shift, UPT tertentu), jadwalnya
// harus dibedakan per satker dan JADWAL_KERJA_DEFAULT tidak lagi cukup.
//
// -------------------------------------------------------------------------
// Penurunan dari data (dilakukan sebelum dokumennya didapat):
// -------------------------------------------------------------------------
// - Jam masuk 07:30: dicek ke 101 baris yang punya catatan "Keterlambatan N
//   menit" di 3 file asli. 101 dari 101 cocok persis dengan
//   (jam masuk - 07:30). Nol selisih.
// - Jam pulang 16:00 (Senin-Kamis) & 16:30 (Jumat): dicek ke sebaran jam
//   presensi pulang WFO. Puncaknya tepat di 16:00 untuk Senin-Kamis dan tepat
//   di 16:30 untuk Jumat, dan hampir tidak ada yang pulang sebelum jam itu
//   (Jumat: 2 dari 29). Pola khas orang menunggu gerbang presensi terbuka.
// - 7,5 jam/hari: "Kewajiban Jam Kerja" di PDF selalu kelipatan 7,5
//   (172,5 = 23 hari, 150 = 20 hari, 112,5 = 15 hari).
// ============================================================================

import type { BarisRekapPresensi } from "./rekapPresensi";
import type { BarisPresensiPdf, LaporanPresensiPdf } from "./presensiPdf";
import type { JenisCuti } from "../types/index";
import { uraiJenisCuti, LABEL_JENIS_CUTI } from "./jenisCuti";

export type KategoriHari =
  | "WFO"
  | "WFH_WFA"
  | "DINAS_LUAR"
  | "DIKLAT"
  | "LEMBUR"
  | "UPACARA"
  | "CUTI"
  | "IZIN"
  | "SAKIT"
  | "TUGAS_BELAJAR"
  | "TIDAK_HADIR"
  | "TIDAK_PRESENSI"
  | "TIDAK_DIKENALI";

export interface JadwalKerja {
  jamMasukWajibMenit: number;
  /** Indeks 0 = Minggu ... 6 = Sabtu. null = bukan hari kerja. */
  jamPulangWajibMenit: (number | null)[];
  jamKerjaPerHari: number;
  /**
   * Menit toleransi yang DIKURANGKAN dari keterlambatan SETIAP HARI (bukan
   * ambang all-or-nothing, dan bukan dari total sebulan) sebelum potongan
   * Pasal 13 ayat (3) dihitung.
   *
   * Lihat TOLERANSI_TERLAMBAT_MENIT di bawah untuk dasar angkanya.
   */
  toleransiTerlambatMenit: number;
}

const MENIT = (jam: number, menit: number) => jam * 60 + menit;

/** Kebalikan MENIT - buat catatan yang dibaca manusia, mis. 1020 -> "17:00". */
const jamTeks = (menit: number) =>
  `${String(Math.floor(menit / 60)).padStart(2, "0")}:${String(menit % 60).padStart(2, "0")}`;

/**
 * TOLERANSI KETERLAMBATAN 60 MENIT PER HARI.
 *
 * DASAR HUKUMNYA SUDAH ADA - Pasal 9 ayat (3) Permenaker 15/2024, dikutip
 * langsung: "Jam Kerja sebagaimana dimaksud pada ayat (2) diberikan toleransi
 * waktu sebanyak 60 (enam puluh) menit."
 *
 * Ini MENUTUP TODO(confirm) lama yang berbunyi "yang masih terbuka adalah
 * dasar hukumnya, bukan angkanya - mintakan ke Biro OSDMA/Hukum". Angka 60
 * yang dulu diturunkan dari data ternyata memang angka yang tertulis di
 * pasalnya. Yang TETAP tidak diatur pasal itu adalah BENTUK penerapannya
 * (pengurangan per hari vs ambang all-or-nothing) - itu masih dari data:
 * lihat tabel di bawah, pengurangan per hari cocok 44/48, ambang cuma 22/48.
 *
 * Angkanya DIBUKTIKAN ke praktik yang berjalan, bukan diasumsikan. Rincian
 * tukin manual Biro Keuangan & BMN periode Juli 2026 (48 pegawai, file
 * "excel rincian tunkin Juli 2026 _Rokeu") diadu ke data presensi harian
 * Gajihub untuk beberapa nilai toleransi sekaligus:
 *
 *     toleransi    cocok persis    total menit
 *        0             5/48          23.325
 *       30            11/48          11.244
 *       60            44/48           4.407   <- rincian manual: 4.495
 *       90            23/48           2.364
 *
 * 60 menit menang telak, dan bentuknya PENGURANGAN per hari - bukan ambang.
 * Varian "kalau lewat 60 menit dihitung penuh" hanya cocok 22/48. Contoh yang
 * cocok sampai ke satuan menit: keterlambatan harian 67,61,59,59,59,57,42,36,35
 * menit -> (67-60) + (61-60) = 8 menit, sama persis dengan rincian manual.
 *
 * Sumbernya juga konsisten dengan kolom `sistem_kerja.toleransi` = 60 di
 * database e-Presensi untuk WFO/WFH/WFA. Dulu Gajihub memakai 0 dan karena
 * itu memotong 5,2x lebih besar dari perhitungan manual (selisih Rp 941.133
 * untuk satu unit dalam satu bulan, Gajihub membayar LEBIH KECIL).
 *
 * Jadi TIGA sumber yang saling bebas menunjuk angka yang sama: teks Pasal 9
 * ayat (3), kolom `sistem_kerja.toleransi` di e-Presensi, dan rincian tukin
 * manual Biro Keuangan.
 */
export const TOLERANSI_TERLAMBAT_MENIT = 60;

/**
 * Jam keluar TEPAT 23:59 - isian OTOMATIS e-Presensi ketika tap pulang tidak
 * pernah masuk, bukan ketukan sungguhan.
 *
 * Dibuktikan sebarannya: 3.320 baris jatuh persis di menit yang sama
 * sementara 456 tersebar di 59 menit lain sepanjang jam 23. Manusia tidak
 * menekan tombol serentak di satu menit.
 *
 * SENGAJA 23:59 PERSIS, bukan "jam 23 ke atas": 23:50-23:58 masih mungkin
 * kepulangan sungguhan (lembur), dan Juli 2026 memang ada 54 baris di sana.
 * Nilai ini sudah lebih dulu diperlakukan begitu di jalur rekap manual &
 * pembandingnya - konstantanya disatukan di sini supaya tidak ada dua ambang.
 */
export const JAM_TAP_PULANG_HILANG = 23 * 60 + 59;

/**
 * Selisih maksimal (menit) antara jam masuk & jam keluar yang masih dibaca
 * sebagai SATU ketukan tersalin ke dua kolom, bukan hari kerja sungguhan.
 *
 * Dipakai bareng jalur rekap manual (dulu punya salinan sendiri di
 * `rekapAbsensiManual.ts`). Dua ambang untuk satu hal cepat atau lambat
 * berbeda, dan bedanya baru ketahuan setelah angkanya dipakai membayar.
 */
export const AMBANG_KETUKAN_GANDA_MENIT = 2;

/**
 * TIDAK ADA JEDA SEBELUM LEMBUR - JANGAN DIPASANG LAGI TANPA DASAR BARU.
 *
 * Lembur di hari kerja dihitung TEPAT dari jam pulang wajib. Keterangan user
 * (2026-08-19), dengan contohnya sendiri: "semisal pegawai absen pulang jam
 * 16:00 terus dia mau lembur sampai jam 20:00, dari jam 16 ke 17 itu udah
 * kehitung 1 jam lembur" - jadi 16:00-20:00 = 4 jam, bukan 3.
 *
 * Sempat dipasang jeda 1 jam pada 2026-08-18 (JEDA_SEBELUM_LEMBUR_MENIT = 60,
 * "jam 4-5 nya tidak termasuk") lalu DICABUT sehari kemudian setelah user
 * memberi contoh di atas. Dicatat di sini karena keduanya sama-sama datang dari
 * keterangan lisan dan gampang tertukar lagi - dasar tertulisnya SAMA-SAMA
 * belum ada (lihat C1 di docs/permintaan-data-dan-konfirmasi-osdma.md).
 *
 * Akibat yang perlu disadari: syarat 2 jam berturut-turut untuk uang makan
 * lembur (SBM 2026 item 23.2) ikut diukur dari jam pulang wajib, jadi pulang
 * 18:00 sudah memenuhi - sewaktu ada jeda, batas itu baru tercapai pukul 19:00.
 */

export const JADWAL_KERJA_DEFAULT: JadwalKerja = {
  jamMasukWajibMenit: MENIT(7, 30),
  //        Minggu Senin        Selasa       Rabu         Kamis        Jumat         Sabtu
  jamPulangWajibMenit: [null, MENIT(16, 0), MENIT(16, 0), MENIT(16, 0), MENIT(16, 0), MENIT(16, 30), null],
  jamKerjaPerHari: 7.5,
  toleransiTerlambatMenit: TOLERANSI_TERLAMBAT_MENIT,
};

/**
 * Kategori yang PUNYA kewajiban jam kerja - hanya ini yang bisa kena potongan
 * terlambat / pulang cepat (Pasal 13 ayat (3)).
 *
 * Dinas Keluar, Diklat, dan Lembur SENGAJA tidak masuk: jam presensinya
 * mengikuti kegiatan/perjalanan dinas, bukan jam kantor - di file asli banyak
 * baris Dinas Keluar dengan jam masuk 09:00-10:00 yang jelas bukan
 * keterlambatan. e-Presensi sendiri juga tidak pernah menandainya terlambat.
 *
 * TODO(confirm): WFH/WFA DIMASUKKAN di sini karena Permenaker tidak
 * membedakan tempat kerja - kewajiban jam kerjanya sama. Belum ada penegasan
 * resmi, dan data uji tidak bisa memutuskan (e-Presensi juga tidak konsisten
 * menandai WFO yang terlambat). Kalau ternyata WFH/WFA dikecualikan, cukup
 * hapus dari daftar ini.
 */
const KATEGORI_WAJIB_JAM_KERJA: KategoriHari[] = ["WFO", "WFH_WFA"];

/** Kategori yang mewajibkan presensi masuk & pulang (Pasal 13 ayat (2)). */
const KATEGORI_WAJIB_PRESENSI: KategoriHari[] = [
  "WFO",
  "WFH_WFA",
  "DINAS_LUAR",
  "DIKLAT",
  "LEMBUR",
  "UPACARA",
];

/** Berhak uang makan (SBM 2026 item 22.1) - lihat uangMakan.ts. */
const KATEGORI_UANG_MAKAN: KategoriHari[] = ["WFO", "WFH_WFA"];

/**
 * Penanda "pegawai tidak menekan presensi" di kolom Potongan. Yang diambil
 * cuma FAKTA-nya; angka persen di kalimat yang sama diabaikan.
 *
 * Ini tidak bisa disimpulkan dari jamnya saja - di file asli, presensi yang
 * terlewat muncul dalam dua bentuk: sel jam kosong, ATAU jam terisi 23:59 /
 * jam masuk & pulang selisih satu menit di sore hari (satu ketukan disalin ke
 * dua kolom). Tanpa penanda ini, pelanggaran Pasal 13 ayat (2) hilang.
 */
const LUPA_PRESENSI = /lupa presensi|tidak melakukan presensi|tidak presensi/i;

/** Ambang "jelas bukan ketukan presensi pagi" - dipakai buat menyaring anomali. */
const AMBANG_TERLAMBAT_JANGGAL_MENIT = 240;

export interface RincianHariPdf {
  /** yyyy-mm-dd, tanggal apa adanya dari file (tanpa konversi zona waktu). */
  tanggalIso: string;
  namaHari: string | null;
  kategori: KategoriHari;
  statusTeks: string;
  jenisCuti: string | null;
  jamMasukMenit: number | null;
  jamKeluarMenit: number | null;
  menitTerlambat: number;
  menitPulangCepat: number;
  kejadianTidakPresensi: number;
  /**
   * Berapa kejadian Pasal 13 ayat (2) yang DIBATALKAN karena tanggal ini
   * ditandai kendala e-Presensi (Pasal 10 ayat (2)). `kejadianTidakPresensi`
   * di atas sudah bersih dari angka ini - yang ini disimpan supaya
   * pembatalannya bisa dilihat, bukan menghilang tanpa jejak.
   */
  kejadianDikecualikanKendala: number;
  jamLembur: number;
  hariLibur: boolean;
  berhakMakanLembur: boolean;
}

export interface BarisDibuang {
  tanggalIso: string;
  statusTeks: string;
  alasan: string;
}

export interface SelisihRingkasan {
  label: string;
  sumberPdf: number;
  gajihub: number;
}

export interface HasilRekapDariPdf {
  nip: string | null;
  nama: string | null;
  periodeBulan: number | null;
  periodeTahun: number | null;
  rekap: BarisRekapPresensi;
  hari: RincianHariPdf[];
  dibuang: BarisDibuang[];
  /** Beda antara Summary Presensi di PDF dan hitungan Gajihub. */
  selisihRingkasan: SelisihRingkasan[];
  /** Hal yang WAJIB dilihat manusia sebelum kalkulasi dijalankan. */
  catatan: string[];
  /**
   * Total kejadian Pasal 13 ayat (2) yang dibatalkan karena tanggalnya
   * ditandai kendala e-Presensi. 0 kalau tidak ada penanda yang kena.
   */
  kejadianDikecualikanKendala: number;
  /** Tanggal yang jam presensinya diperbaiki manusia, bukan dari e-Presensi. */
  tanggalDikoreksiManual: string[];
}

function normal(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

export function kategoriDariStatus(statusTeks: string): { kategori: KategoriHari; jenisCuti: string | null } {
  const s = normal(statusTeks);
  if (s === "") return { kategori: "TIDAK_DIKENALI", jenisCuti: null };

  // "Cuti" dicek DULUAN: "Cuti - Cuti Sakit <1 bulan" mengandung kata "sakit",
  // dan kalau urutannya dibalik dia akan salah masuk kategori SAKIT.
  if (s.startsWith("cuti")) {
    const pisah = statusTeks.indexOf("-");
    const jenis = pisah >= 0 ? statusTeks.slice(pisah + 1).replace(/\s+/g, " ").trim() : null;
    return { kategori: "CUTI", jenisCuti: jenis === "" ? null : jenis };
  }
  if (s.includes("tugas belajar")) return { kategori: "TUGAS_BELAJAR", jenisCuti: null };
  if (s.includes("tidak presensi")) return { kategori: "TIDAK_PRESENSI", jenisCuti: null };
  if (s.includes("tidak hadir") || s.includes("alpha") || s.includes("alfa")) {
    return { kategori: "TIDAK_HADIR", jenisCuti: null };
  }
  if (s.includes("upacara")) return { kategori: "UPACARA", jenisCuti: null };
  if (s.includes("lembur")) return { kategori: "LEMBUR", jenisCuti: null };
  if (s.includes("dinas")) return { kategori: "DINAS_LUAR", jenisCuti: null };
  if (s.includes("diklat") || s.includes("pelatihan")) return { kategori: "DIKLAT", jenisCuti: null };
  if (s.includes("wfo")) return { kategori: "WFO", jenisCuti: null };
  if (s.includes("wfh") || s.includes("wfa")) return { kategori: "WFH_WFA", jenisCuti: null };
  if (s.includes("izin")) return { kategori: "IZIN", jenisCuti: null };
  if (s.includes("sakit")) return { kategori: "SAKIT", jenisCuti: null };
  return { kategori: "TIDAK_DIKENALI", jenisCuti: null };
}

const NAMA_HARI = ["minggu", "senin", "selasa", "rabu", "kamis", "jumat", "sabtu"];

/**
 * Indeks hari (0=Minggu). Pakai nama hari dari FILE kalau ada - itu yang
 * dipakai e-Presensi sendiri - dan baru jatuh ke perhitungan dari tanggal
 * kalau namanya tidak terbaca.
 */
function indeksHari(baris: { namaHari: string | null; tanggal: number | null; bulan: number | null; tahun: number | null }): number | null {
  if (baris.namaHari) {
    const idx = NAMA_HARI.indexOf(normal(baris.namaHari).replace(/'/g, ""));
    if (idx >= 0) return idx;
  }
  if (baris.tanggal !== null && baris.bulan !== null && baris.tahun !== null) {
    return new Date(Date.UTC(baris.tahun, baris.bulan - 1, baris.tanggal)).getUTCDay();
  }
  return null;
}

function tanggalIso(b: BarisPresensiPdf): string | null {
  if (b.tanggal === null || b.bulan === null || b.tahun === null) return null;
  const dd = String(b.tanggal).padStart(2, "0");
  const mm = String(b.bulan).padStart(2, "0");
  return `${b.tahun}-${mm}-${dd}`;
}

function bulatkan2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Turunkan rekap bulanan dari satu laporan PDF.
 *
 * Urutannya: kelompokkan per TANGGAL -> buang entri ganda -> tentukan
 * kategori hari -> hitung potongan & lembur -> jumlahkan.
 */
export function rekapDariLaporanPdf(
  laporan: LaporanPresensiPdf,
  jadwal: JadwalKerja = JADWAL_KERJA_DEFAULT,
  /**
   * Tanggal ISO yang ditandai kendala e-Presensi untuk pegawai INI (Pasal 10
   * ayat (2)) - lihat `tanggalKendalaUntukSatker` di `kendalaEpresensi.ts`.
   *
   * Pengecualiannya ditaruh DI SINI, di fungsi yang sama yang menghitung
   * kejadiannya - bukan dikurangkan belakangan di lapisan kalkulasi. Kalau
   * dipisah, penghitung dan pembatal bisa memakai aturan yang sedikit
   * berbeda, dan selisihnya baru ketahuan setelah uangnya terkirim.
   */
  tanggalKendala: ReadonlySet<string> = new Set(),
  /**
   * Jam hasil koreksi petugas absensi untuk pegawai INI, per tanggal ISO
   * (Pasal 10 ayat (2)) - lihat model `KoreksiPresensiHarian`.
   *
   * Nilai null pada salah satu kolom berarti "tidak dikoreksi": jam dari
   * e-Presensi dipakai apa adanya untuk kolom itu.
   */
  koreksiJam: ReadonlyMap<string, { jamMasukMenit: number | null; jamKeluarMenit: number | null }> = new Map(),
  /**
   * Tanggal merah & cuti bersama (ISO "YYYY-MM-DD" -> keterangannya).
   *
   * DITARUH DI SINI, bukan dikurangkan belakangan, dengan alasan yang sama
   * dengan `tanggalKendala`: satu tanggal libur berpengaruh ke TIGA hal
   * sekaligus (pengali lembur 2x, jumlahHariKerja yang membatasi uang makan,
   * dan potongan Pasal 13), jadi kalau ditangani di luar sini ketiganya bisa
   * memakai daftar tanggal yang sedikit berbeda.
   *
   * KOSONG = perilaku persis seperti sebelum kalender ini ada: hari libur cuma
   * Sabtu & Minggu. Jadi tabel yang belum diisi tidak mengubah apa pun.
   */
  hariLiburNasional: ReadonlyMap<string, string> = new Map()
): HasilRekapDariPdf {
  const catatan: string[] = [...laporan.peringatan];
  const dibuang: BarisDibuang[] = [];
  let dikecualikanKendalaTotal = 0;
  const adaKoreksiJam = new Set<string>();

  // --- 1. Kelompokkan per tanggal --------------------------------------------
  const perTanggal = new Map<string, BarisPresensiPdf[]>();
  for (const b of laporan.baris) {
    const iso = tanggalIso(b);
    if (iso === null) {
      dibuang.push({ tanggalIso: "-", statusTeks: b.statusTeks, alasan: `tanggal tidak terbaca ("${b.tanggalTeks}")` });
      continue;
    }
    if (!perTanggal.has(iso)) perTanggal.set(iso, []);
    perTanggal.get(iso)!.push(b);
  }

  const hari: RincianHariPdf[] = [];
  const hitung = {
    wfo: 0,
    wfhWfa: 0,
    diklat: 0,
    dinasLuar: 0,
    upacara: 0,
    cuti: 0,
    izin: 0,
    sakit: 0,
    tugasBelajar: 0,
    tidakHadir: 0,
    tidakDikenali: 0,
    hariLembur: 0,
    akhirPekan: 0,
  };
  let menitTerlambatTotal = 0;
  let menitPulangCepatTotal = 0;
  let kejadianTidakPresensi = 0;
  // Jenis cuti yang muncul di periode ini, beserta jumlah harinya.
  const cutiPerJenis = new Map<JenisCuti, number>();
  // Per jenis: bulan ke-berapa -> jumlah hari. Dua tingkat karena satu jenis
  // cuti bisa BERGANTI bulan di tengah periode - nyata di data Juli 2026:
  // seorang pegawai tercatat "Cuti Besar II" 18 hari lalu "Cuti Besar III"
  // 15 hari dalam bulan yang sama.
  const cutiBulanPerJenis = new Map<JenisCuti, Map<number, number>>();
  const cutiTakDikenali = new Set<string>();
  let jamLemburKerja = 0;
  let jamLemburLibur = 0;
  let hariMakanLemburKerja = 0;
  let hariMakanLemburLibur = 0;

  const tanggalUrut = [...perTanggal.keys()].sort();

  for (const iso of tanggalUrut) {
    const semua = perTanggal.get(iso)!;
    const idxHari = indeksHari(semua[0]);
    const namaHari = semua[0].namaHari;
    // Tanggal merah diperlakukan SAMA PERSIS dengan Sabtu/Minggu: tidak ada
    // kewajiban jam kerja, jadi jam pulang wajibnya dinolkan juga. Satu
    // keputusan di sini otomatis merambat ke pengali lembur, batas hari uang
    // makan, dan seluruh potongan Pasal 13 yang sudah dijaga `!hariLibur`.
    const keteranganLibur = hariLiburNasional.get(iso) ?? null;
    const jamPulangWajib =
      keteranganLibur !== null || idxHari === null ? null : jadwal.jamPulangWajibMenit[idxHari];
    const hariLibur = jamPulangWajib === null;

    const berkategori = semua.map((b) => ({ baris: b, ...kategoriDariStatus(b.statusTeks) }));
    const barisLembur = berkategori.filter((x) => x.kategori === "LEMBUR");
    const barisHarian = berkategori.filter((x) => x.kategori !== "LEMBUR");

    // --- 2. Buang entri ganda ------------------------------------------------
    // e-Presensi menambahkan baris "Tidak Hadir" untuk hari yang pegawainya
    // tidak menekan presensi - termasuk saat hari itu sebenarnya CUTI atau
    // DINAS KELUAR, dan bahkan saat baris "Tidak Hadir"-nya sendiri sudah ada
    // (17 tanggal di file uji punya DUA baris "Tidak Hadir" yang sama persis).
    // Kalau tidak dibuang, satu hari alpha terhitung dua kali = potongan 6%
    // padahal Pasal 13 ayat (1) cuma 3%.
    let terpilih = barisHarian[0] ?? null;
    if (barisHarian.length > 1) {
      const bukanTidakHadir = barisHarian.filter((x) => x.kategori !== "TIDAK_HADIR");
      terpilih = bukanTidakHadir[0] ?? barisHarian[0];
      for (const x of barisHarian) {
        if (x === terpilih) continue;
        dibuang.push({
          tanggalIso: iso,
          statusTeks: x.baris.statusTeks,
          alasan:
            x.kategori === "TIDAK_HADIR" && bukanTidakHadir.length > 0
              ? `entri ganda - tanggal ini sudah punya status "${terpilih.baris.statusTeks}"`
              : "entri ganda dengan status yang sama",
        });
      }
      // "Perlu dicek manual" HANYA kalau statusnya benar-benar BERBEDA.
      //
      // Sebelumnya syaratnya cuma "ada lebih dari satu baris bukan Tidak
      // Hadir", jadi dua baris yang isinya sama persis pun dilaporkan sebagai
      // "2 status berbeda" - kalimat yang membantah dirinya sendiri karena
      // kedua status yang dicantumkannya identik. Nyata di tarikan Juli 2026:
      // satu pegawai cuti menghasilkan 10-14 catatan seperti itu sendirian.
      //
      // Ini bukan sekadar rapi-rapi. Catatan di blok ini artinya "sistem
      // tidak bisa memutuskan, tolong manusia lihat" - kalau sebagian besar
      // isinya duplikat yang sebenarnya tidak ambigu, yang benar-benar perlu
      // dilihat ikut tenggelam dan pada akhirnya semuanya diabaikan.
      const statusUnik = new Set(bukanTidakHadir.map((x) => normal(x.baris.statusTeks)));
      if (statusUnik.size > 1) {
        catatan.push(
          `${iso}: ada ${statusUnik.size} status berbeda di tanggal yang sama (${[
            ...new Set(bukanTidakHadir.map((x) => x.baris.statusTeks)),
          ].join(", ")}) - dipakai yang pertama ("${terpilih.baris.statusTeks}"), sisanya diabaikan. Perlu dicek manual.`
        );
      }
    }

    // --- 3. Hitung potongan untuk hari itu -----------------------------------
    let menitTerlambat = 0;
    let menitPulangCepat = 0;
    let tidakPresensi = 0;

    if (terpilih) {
      const b = terpilih.baris;
      const kategori = terpilih.kategori;
      const lupa = LUPA_PRESENSI.test(b.potonganTeks) || kategori === "TIDAK_PRESENSI";

      // --- Koreksi jam oleh petugas absensi (Pasal 10 ayat (2)) -------------
      // Jam hasil laporan pegawai (foto + geotag + jam) menggantikan jam dari
      // e-Presensi HANYA untuk kolom yang benar-benar dikoreksi - petugas
      // boleh memperbaiki jam pulang saja tanpa menyentuh jam masuk yang
      // sudah benar.
      const koreksi = koreksiJam.get(iso);
      const jamMasukEfektif = koreksi?.jamMasukMenit ?? b.jamMasukMenit;
      const jamKeluarEfektif = koreksi?.jamKeluarMenit ?? b.jamKeluarMenit;
      const masukDikoreksi = koreksi?.jamMasukMenit != null;
      const keluarDikoreksi = koreksi?.jamKeluarMenit != null;
      if (koreksi) adaKoreksiJam.add(iso);

      // --- KETUKAN YANG MUSTAHIL SEBAGAI JAM MASUK --------------------------
      // Jam masuk yang jatuh PADA ATAU SESUDAH jam pulang wajib tidak mungkin
      // kedatangan: hari kerjanya sudah berakhir. Yang sebenarnya terjadi
      // adalah tap masuknya HILANG, dan yang tercatat cuma satu ketukan nyasar
      // di sore/malam hari - e-Presensi menyimpannya di kolom jam masuk.
      //
      // Dibaca mentah, ini menghasilkan angka yang tidak bisa dipertahankan.
      // Terukur di Juli 2026 se-kementerian: 559 baris dipotong LEBIH BESAR
      // daripada tarif alpha 3%/hari (Pasal 13 ayat (1)) - artinya datang
      // terlambat jadi lebih mahal daripada tidak masuk sama sekali - dan
      // TIDAK SATU PUN dari 559 baris itu jam masuknya sebelum pukul 12:00.
      // Yang terparah 898 menit = 8,98%, dari tap pukul 23:26. Ini juga 52,6%
      // dari SELURUH menit keterlambatan yang tercatat bulan itu.
      //
      // Aturan ini SUDAH ADA sebelumnya, tapi terkunci syarat tambahan: tap
      // sore baru ditolak kalau barisnya bertanda "lupa presensi" dari kolom
      // Potongan e-Presensi. Penanda itu TIDAK PERNAH menyala lewat jalur
      // sinkronisasi database - 0 dari 99.065 baris Juli 2026 - jadi
      // praktisnya aturannya mati. Syarat itu DICABUT; yang tersisa murni uji
      // kemustahilan, dan itu berlaku dengan atau tanpa penanda dari sumber.
      //
      // BUKAN mengoreksi Permenaker, dan bukan batas maksimal potongan: ini menolak
      // mempercayai data yang tidak mungkin. Batas atas potongan per hari
      // (usulan batas 3%) adalah keputusan KEBIJAKAN yang terpisah dan belum
      // diambil - lihat TODO(confirm) di docs/permintaan-data-dan-konfirmasi-osdma.md.
      //
      // Koreksi petugas selalu menang: jam yang sudah diverifikasi manusia
      // terhadap foto & geotag bukan tebakan atas ketukan yang hilang.
      const masukMustahil =
        !masukDikoreksi &&
        jamMasukEfektif !== null &&
        jamPulangWajib !== null &&
        jamMasukEfektif >= jamPulangWajib;

      // --- KETUKAN YANG MUSTAHIL SEBAGAI JAM PULANG -------------------------
      // Cerminan aturan di atas, dan sebelumnya TIDAK ADA di jalur ini -
      // sisi pulang cuma bersandar pada penanda "lupa presensi" dari sumber,
      // yang lewat sinkronisasi database praktis tidak pernah menyala.
      // Akibatnya asimetris: ketukan nyasar di kolom masuk ditolak, ketukan
      // nyasar di kolom pulang dipercaya.
      //
      // Dua bentuk, keduanya nyata di data Juli 2026 se-kementerian:
      //   1. jam keluar TEPAT 23:59 - isian otomatis e-Presensi (11 baris
      //      yang `menit_kerja`-nya TIDAK dinolkan, jadi lolos aturan lama).
      //   2. jam keluar pada/sebelum jam masuk wajib - orang tidak bisa
      //      pulang sebelum jam kerjanya dimulai (1 baris: keluar 06:15).
      const keluarMustahil =
        !keluarDikoreksi &&
        jamKeluarEfektif !== null &&
        (jamKeluarEfektif === JAM_TAP_PULANG_HILANG || jamKeluarEfektif <= jadwal.jamMasukWajibMenit);

      // --- SATU KETUKAN TERSALIN KE DUA KOLOM -------------------------------
      // Jam masuk & pulang berselisih semenit-dua: yang terjadi cuma SATU tap,
      // dan sisi mana yang hilang TIDAK BISA DITEBAK - ketukannya bisa pagi
      // maupun sore. Karena itu KEDUA sisinya tidak dipercaya, bukan cuma satu.
      //
      // Ini bukan kehati-hatian berlebihan. Terukur Juli 2026: 359 baris
      // berpola ini, dan 16 di antaranya LOLOS dari `masukMustahil` karena
      // ketukannya jatuh beberapa menit SEBELUM jam pulang wajib (15:58,
      // 15:59, 16:29 di hari Jumat). Dibaca sebagai kedatangan, satu tap sore
      // itu menagih ~4,5% keterlambatan sehari - lebih mahal daripada tidak
      // masuk sama sekali (3%, ayat (1)) - untuk hari yang bukti kehadirannya
      // justru ADA.
      //
      // Aturan yang sama sudah lama dipakai jalur rekap manual Excel; yang
      // dilakukan di sini memindahkannya ke mesin, supaya kedua jalur tidak
      // memperlakukan pola yang sama secara berbeda.
      const ketukanGanda =
        !masukDikoreksi &&
        !keluarDikoreksi &&
        jamMasukEfektif !== null &&
        jamKeluarEfektif !== null &&
        jamKeluarEfektif >= jamMasukEfektif &&
        jamKeluarEfektif - jamMasukEfektif <= AMBANG_KETUKAN_GANDA_MENIT;

      // TIDAK ADA potongan apa pun di hari yang memang bukan hari kerja.
      // Pasal 13 memotong pelanggaran terhadap KEWAJIBAN jam kerja - kalau
      // hari itu tidak ada kewajibannya, tidak ada yang dilanggar. Ini nyata
      // di file uji: semua baris dengan presensi pulang kosong adalah Dinas
      // Keluar di hari Sabtu (pegawai berangkat dinas di akhir pekan, tap
      // masuk di lokasi, tidak tap pulang). Menagih 1% untuk itu jelas keliru.
      //
      // KETERBATASAN: yang bisa dikenali cuma Sabtu & Minggu. Libur nasional
      // yang jatuh di hari kerja TIDAK bisa dideteksi - kalender hari libur
      // tidak ada di sistem ini, dan file PDF-nya juga tidak memuatnya.
      // Selisih antara jumlah hari hadir dan "Kewajiban Jam Kerja" dipakai
      // sebagai penanda supaya kasusnya tetap kelihatan (lihat catatan akhir).
      // KATEGORI_WAJIB_JAM_KERJA (WFO + WFH/WFA), bukan KATEGORI_WAJIB_PRESENSI.
      //
      // Diklat, Dinas Keluar, dan Lembur DIKECUALIKAN - alasannya sama persis
      // dengan yang sudah dipakai untuk terlambat & pulang cepat di blok
      // bawah: jam presensinya mengikuti kegiatan/perjalanan dinas, bukan jam
      // kantor, jadi tap yang hilang di sana bukan pelanggaran kewajiban
      // presensi kantor. Orang yang diklat seharian di luar memang sering
      // tidak tap pulang di kantornya.
      //
      // Dibuktikan ke rincian tukin manual Rokeu Juli 2026: sebelum
      // pengecualian ini, satu pegawai (Alpha Sandro) terhitung 15 kejadian
      // padahal rincian manual menulis 2 - dan 13 selisihnya SEMUANYA hari
      // Diklat. Pegawai lain (Prasetyo) terhitung 3, semuanya Dinas Keluar,
      // sementara rincian manual menulis 0.
      if (!hariLibur && (KATEGORI_WAJIB_JAM_KERJA.includes(kategori) || kategori === "TIDAK_PRESENSI")) {
        // DIHITUNG PER KETUKAN, bukan per hari - Pasal 13 ayat (2) eksplisit
        // "SETIAP KALI tidak melakukan presensi". Jadi hari yang lupa presensi
        // masuk DAN pulang memang menghasilkan 2 kejadian (2%), bukan 1%.
        if (jamMasukEfektif === null) tidakPresensi++;
        if (jamKeluarEfektif === null) tidakPresensi++;
        // Penanda dari sumber cuma dipakai kalau jamnya TERISI - kalau selnya
        // memang kosong, kejadiannya sudah terhitung di atas.
        //
        // `menitKerja === 0` adalah penanda yang sama kuatnya, dan ini yang
        // menutup kasus paling sering: tap pulang hilang, tapi e-Presensi
        // MENGISI jam keluar dengan 23:59 sehingga jamnya tidak terlihat
        // kosong. Yang menandainya cuma kolom menit_kerja yang dinolkan
        // sumbernya sendiri - dari 788 hari kerja 48 pegawai Rokeu Juli 2026,
        // 26 hari ber-menitKerja 0 dan SEMUANYA berpasangan dengan jam keluar
        // 23:59. Diadu ke rincian tukin manual: penanda ini membawa
        // kecocokan kolom "Lupa Absen" dari 34/48 jadi 44/48.
        //
        // SENGAJA hanya `=== 0`, bukan `< 450` (7,5 jam Pasal 9 ayat 1) -
        // walau ambang 450 mencocokkan 45/48. Hari yang jam kerjanya KURANG
        // tapi bukan nol adalah pulang cepat, dan itu Pasal 13 ayat (3) yang
        // bertarif PER MENIT - sudah dihitung di blok bawah dari jam
        // keluarnya. Memakai `< 450` di sini berarti hari yang sama ditagih
        // dua kali dengan dasar hukum yang berbeda.
        //
        // Kalau petugas absensi sudah memperbaiki jamnya berdasarkan laporan
        // pegawai, penanda "lupa" dari sumber TIDAK berlaku lagi: yang
        // dinyatakan hilang oleh e-Presensi sudah digantikan keterangan yang
        // diverifikasi manusia. Tanpa pengecualian ini, koreksi jam tidak
        // ada gunanya - potongannya tetap terhitung.
        //
        // `masukMustahil` masuk ke daftar penanda yang sama, dan memang di
        // sinilah tempatnya: tap masuk yang tidak ada persis bunyi ayat (2).
        // Tanpa ini, menolak ketukannya di blok bawah membuat harinya lolos
        // TANPA potongan apa pun - lebih murah daripada lupa absen biasa, dan
        // itu justru insentif yang salah.
        const sudahDiperbaiki = masukDikoreksi || keluarDikoreksi;
        // `keluarMustahil` & `ketukanGanda` masuk ke daftar yang sama dan
        // dengan alasan yang sama seperti `masukMustahil`: kalau ketukannya
        // cuma ditolak di blok bawah tanpa menyalakan ayat (2), harinya lolos
        // TANPA potongan apa pun - lebih murah daripada lupa absen biasa.
        //
        // Tetap MAKSIMAL 1 kejadian di cabang ini, walau beberapa penanda
        // menyala bersamaan. Pada ketukan ganda yang hilang memang cuma SATU
        // sisi (satu tap terbukti ada), jadi menagih 2% berarti menagih
        // ketukan yang sebenarnya dilakukan.
        if (
          tidakPresensi === 0 &&
          !sudahDiperbaiki &&
          (lupa || b.menitKerja === 0 || masukMustahil || keluarMustahil || ketukanGanda)
        ) {
          tidakPresensi++;
        }
      }

      if (!hariLibur && KATEGORI_WAJIB_JAM_KERJA.includes(kategori)) {
        // Ketukan yang ditandai "lupa presensi" tidak dipercaya sebagai jam
        // masuk/pulang sungguhan. Di file uji ada baris WFO dengan jam masuk
        // 19:46 dan jam pulang 19:47 - satu ketukan sore yang disalin ke dua
        // kolom. Membacanya mentah-mentah berarti menagih "terlambat 736
        // menit" untuk orang yang sebenarnya lupa presensi pagi (pelanggaran
        // yang beda pasalnya, dan sudah dihitung di atas).
        //
        // Jam hasil KOREKSI petugas selalu dipercaya: itu keterangan yang
        // sudah diverifikasi manusia terhadap bukti (foto, geotag, jam),
        // bukan tebakan atas ketukan yang hilang.
        const masukDipercaya = jamMasukEfektif !== null && !masukMustahil && !ketukanGanda;
        const keluarDipercaya =
          jamKeluarEfektif !== null && !keluarMustahil && !ketukanGanda && (keluarDikoreksi || !lupa);

        // Keterlambatan MENTAH (tanpa toleransi) dipakai HANYA buat deteksi
        // anomali di bawah. Ambangnya soal "ini jelas bukan ketukan pagi",
        // yang ditentukan jam berapa orangnya datang - bukan oleh kebijakan
        // toleransi. Kalau ambangnya diadu ke angka yang sudah dipotong
        // toleransi, mengubah toleransi diam-diam ikut menggeser batas
        // anomali, dan itu bukan hubungan yang diinginkan.
        let menitTerlambatMentah = 0;
        if (masukDipercaya && jamMasukEfektif !== null) {
          menitTerlambatMentah = Math.max(0, jamMasukEfektif - jadwal.jamMasukWajibMenit);
          menitTerlambat = Math.max(0, menitTerlambatMentah - jadwal.toleransiTerlambatMenit);
        }
        if (keluarDipercaya && jamKeluarEfektif !== null && jamPulangWajib !== null) {
          menitPulangCepat = Math.max(0, jamPulangWajib - jamKeluarEfektif);
        }
        // Peringatan "jam masuk janggal" tidak perlu muncul lagi kalau jamnya
        // memang sudah diperbaiki manusia - itu justru penyelesaiannya.
        if (masukMustahil) {
          catatan.push(
            `${iso}: jam masuk ${b.jamMasukTeks ?? "-"} jatuh sesudah jam pulang wajib (${jamTeks(jamPulangWajib!)}) - tidak mungkin kedatangan, jadi TIDAK ditagih sebagai keterlambatan. Dihitung 1 kejadian tidak melakukan presensi masuk (Pasal 13 ayat (2)). Kalau pegawai punya bukti jam sebenarnya, perbaiki lewat koreksi jam.`
          );
        }
        if (keluarMustahil) {
          catatan.push(
            `${iso}: jam keluar ${b.jamKeluarTeks ?? "-"} tidak mungkin kepulangan (${
              jamKeluarEfektif === JAM_TAP_PULANG_HILANG
                ? "isian otomatis e-Presensi saat tap pulang tidak masuk"
                : `lebih pagi dari jam masuk wajib ${jamTeks(jadwal.jamMasukWajibMenit)}`
            }) - TIDAK ditagih sebagai pulang cepat. Dihitung 1 kejadian tidak melakukan presensi pulang (Pasal 13 ayat (2)). Kalau pegawai punya bukti jam sebenarnya, perbaiki lewat koreksi jam.`
          );
        }
        if (ketukanGanda) {
          catatan.push(
            `${iso}: jam masuk ${b.jamMasukTeks ?? "-"} dan jam keluar ${b.jamKeluarTeks ?? "-"} cuma berselisih ${(jamKeluarEfektif ?? 0) - (jamMasukEfektif ?? 0)} menit - satu ketukan tersalin ke dua kolom, dan sisi mana yang hilang tidak bisa ditebak. Keduanya TIDAK dipakai menghitung keterlambatan/pulang cepat; hari ini dihitung 1 kejadian tidak melakukan presensi (Pasal 13 ayat (2)).`
          );
        }
        if (!masukDikoreksi && menitTerlambatMentah > AMBANG_TERLAMBAT_JANGGAL_MENIT) {
          catatan.push(
            `${iso}: jam masuk ${b.jamMasukTeks} menghasilkan keterlambatan ${menitTerlambatMentah} menit - angkanya janggal, cek apakah pegawai lupa presensi pagi.`
          );
        }
      }

      // Hari WFO/WFH di akhir pekan TIDAK dihitung sebagai hari kerja yang
      // berhak uang makan (SBM item 22.1 dasarnya hari kerja), dan "Tidak
      // Hadir" di akhir pekan bukan alpha - tidak ada kewajiban hadir.
      //
      // DIKLAT & DINAS_LUAR ikut dikecualikan sejak diadu ke rincian manual
      // Rokeu: Alpha Sandro terhitung 14 hari Diklat di Juli 2026 sementara
      // rincian manual menulis 13 - selisihnya SATU baris Diklat di Sabtu
      // 4 Juli. Alasannya sama dengan WFO/WFH: hari itu bukan hari kerja, jadi
      // tidak ada hari kerja yang "terpakai" oleh kegiatannya. Efek yang
      // paling kelihatan: 295 dari 5.089 rekap Juli menampilkan hari hadir
      // MELEBIHI hari kerja (Alpha Sandro 24 dari 23) - angka yang tidak bisa
      // dibaca sebagai benar oleh siapa pun yang mencocokkannya.
      //
      // TIDAK mengubah rupiah: uang makan dihitung dari WFO + WFH/WFA (Diklat
      // & Dinas Keluar memang tidak berhak, lihat SBM item 22.1), dan seluruh
      // potongan Pasal 13 sudah dijaga `!hariLibur` di blok-blok di atas.
      // Yang berubah hanya angka pelaporan - dan itu justru yang diadu ke
      // rincian manual.
      //
      // Kategori lain (Cuti/Izin/Sakit/Upacara/Tugas Belajar) SENGAJA tidak
      // ikut ditambahkan: di data Juli 2026 tidak ada satu pun barisnya yang
      // jatuh di akhir pekan (Dinas Keluar 540 baris, Diklat 51, sisanya nol),
      // jadi menambahkannya berarti mengubah perilaku atas kasus yang belum
      // pernah terlihat. Cuti khususnya berisiko: jumlahHariCuti ikut menjadi
      // dasar penanda PERIKSA MANUAL di hitungTukin.
      if (hariLibur && ["WFO", "WFH_WFA", "TIDAK_HADIR", "DIKLAT", "DINAS_LUAR"].includes(kategori)) {
        hitung.akhirPekan++;
        catatan.push(
          keteranganLibur !== null
            ? `${iso} (${namaHari ?? "-"}): status "${b.statusTeks}" jatuh di hari libur nasional (${keteranganLibur}) - tidak dihitung sebagai hari kerja (tidak dapat uang makan, tidak kena potongan).`
            : `${iso} (${namaHari ?? "akhir pekan"}): status "${b.statusTeks}" jatuh di akhir pekan - tidak dihitung sebagai hari kerja (tidak dapat uang makan, tidak kena potongan).`
        );
      } else {
        switch (kategori) {
          case "WFO": hitung.wfo++; break;
          case "WFH_WFA": hitung.wfhWfa++; break;
          case "DIKLAT": hitung.diklat++; break;
          case "DINAS_LUAR": hitung.dinasLuar++; break;
          case "UPACARA": hitung.upacara++; break;
          case "CUTI":
            hitung.cuti++;
            // Jenis cutinya ikut dicatat supaya potongan Pasal 14 tidak perlu
            // diketik ulang. Yang tidak dikenali dikumpulkan buat dilaporkan -
            // TIDAK ditebak, karena salah jenis = salah tarif potongan.
            {
              const j = uraiJenisCuti(terpilih.jenisCuti);
              if (j) {
                cutiPerJenis.set(j.jenis, (cutiPerJenis.get(j.jenis) ?? 0) + 1);
                if (j.bulanKeberapa !== null) {
                  const perBulan = cutiBulanPerJenis.get(j.jenis) ?? new Map<number, number>();
                  perBulan.set(j.bulanKeberapa, (perBulan.get(j.bulanKeberapa) ?? 0) + 1);
                  cutiBulanPerJenis.set(j.jenis, perBulan);
                }
              } else if (terpilih.jenisCuti) cutiTakDikenali.add(terpilih.jenisCuti);
            }
            break;
          case "IZIN": hitung.izin++; break;
          case "SAKIT": hitung.sakit++; break;
          case "TUGAS_BELAJAR": hitung.tugasBelajar++; break;
          case "TIDAK_HADIR": hitung.tidakHadir++; break;
          case "TIDAK_DIKENALI":
            hitung.tidakDikenali++;
            catatan.push(`${iso}: status "${b.statusTeks}" tidak dikenali - hari ini tidak dihitung sebagai apa pun.`);
            break;
          default: break;
        }
      }

      // --- Kendala e-Presensi (Pasal 10 ayat (2)) ----------------------------
      // Tanggal ini sudah ditandai manusia sebagai hari e-Presensi bermasalah,
      // jadi kegagalan mencatat presensi bukan kelalaian pegawainya.
      //
      // Yang dibatalkan HANYA ayat (2). Keterlambatan (ayat 3) TETAP dihitung:
      // pada kejadian nyata 15-16 Juli 2026, seluruh 1.173 kasus masih punya
      // absen MASUK yang tercatat normal - yang gagal cuma sisi pulangnya.
      // Menghapus keterlambatan juga berarti memutihkan pelanggaran yang
      // datanya justru lengkap. Ketidakhadiran (ayat 1) juga tidak disentuh -
      // orang yang memang tidak masuk tetap tidak masuk, sistem rusak atau
      // tidak.
      let dikecualikanHariIni = 0;
      if (tidakPresensi > 0 && tanggalKendala.has(iso)) {
        dikecualikanHariIni = tidakPresensi;
        tidakPresensi = 0;
        dikecualikanKendalaTotal += dikecualikanHariIni;
      }

      menitTerlambatTotal += menitTerlambat;
      menitPulangCepatTotal += menitPulangCepat;
      kejadianTidakPresensi += tidakPresensi;

      hari.push({
        tanggalIso: iso,
        namaHari,
        kategori,
        statusTeks: b.statusTeks,
        jenisCuti: terpilih.jenisCuti,
        jamMasukMenit: b.jamMasukMenit,
        jamKeluarMenit: b.jamKeluarMenit,
        menitTerlambat,
        menitPulangCepat,
        kejadianTidakPresensi: tidakPresensi,
        kejadianDikecualikanKendala: dikecualikanHariIni,
        jamLembur: 0,
        hariLibur,
        berhakMakanLembur: false,
      });
    }

    // --- 4. Lembur -----------------------------------------------------------
    // Lembur diambil HANYA dari baris berstatus "Lembur" - itu penanda bahwa
    // lemburnya memang diperintahkan. Jam pulang malam di baris WFO biasa
    // TIDAK dihitung lembur; tanpa surat perintah, itu cuma pulang telat.
    if (barisLembur.length > 0) {
      let jamHariIni = 0;
      let adaBlokDuaJam = false;
      for (const x of barisLembur) {
        const b = x.baris;
        if (b.jamMasukMenit === null || b.jamKeluarMenit === null) {
          catatan.push(
            `${iso}: baris Lembur tidak punya jam masuk/pulang lengkap - jam lemburnya tidak bisa dihitung, isi manual lewat template Excel kalau memang ada.`
          );
          if (KATEGORI_WAJIB_PRESENSI.includes("LEMBUR")) {
            // Per ketukan yang hilang - lihat catatan yang sama di atas.
            const kurang = (b.jamMasukMenit === null ? 1 : 0) + (b.jamKeluarMenit === null ? 1 : 0);
            // Kendala e-Presensi berlaku di sini juga: kalau sistemnya tidak
            // bisa dipakai, baris lembur pun tidak bisa dicatat lengkap.
            if (tanggalKendala.has(iso)) dikecualikanKendalaTotal += kurang;
            else kejadianTidakPresensi += kurang;
          }
          continue;
        }
        // Di hari kerja lembur dihitung dari JAM PULANG WAJIB, tanpa jeda -
        // jam pulang wajib 16:00 lalu pulang 20:00 = 4 jam. Lihat catatan
        // "TIDAK ADA JEDA SEBELUM LEMBUR" di kepala file.
        //
        // Di hari libur tidak ada jam kerja yang harus diselesaikan dulu, jadi
        // lembur dihitung penuh dari jam masuk.
        //
        // TODO(confirm) - BATASNYA JAM DINDING, BUKAN "7,5 JAM SUDAH TERPENUHI".
        // Bedanya cuma terasa kalau pegawainya datang terlambat: yang masuk
        // 10:00 lalu lembur sampai 20:00 dapat 3 jam lembur, SAMA PERSIS
        // dengan yang masuk 07:30 dan lembur di rentang yang sama, padahal
        // jam kerja hariannya masih kurang 2,5 jam. Yang pertama tetap kena
        // potongan Pasal 13 ayat (3) atas keterlambatannya - tapi potongan itu
        // di TUNJANGAN KINERJA, sementara uang lemburnya utuh.
        //
        // SENGAJA TIDAK diperbaiki sepihak: Permenaker 15/2024 tidak mengatur
        // lembur sama sekali, dan SBM 2026 cuma menetapkan TARIF (Pasal 4-nya
        // melempar tata cara ke PMK Pelaksanaan Anggaran). Jadi aturan "tutup
        // dulu jam kerja harian" ada di dokumen yang memang belum kami punya -
        // dokumen YANG SAMA yang dibutuhkan buat pengali 2x hari libur dan
        // batas 40 jam/bulan. Lihat C1 di
        // docs/permintaan-data-dan-konfirmasi-osdma.md.
        //
        // Sekarang DORMAN: dari 1.109 hari lembur di database, NOL yang juga
        // punya keterlambatan (1.088 di antaranya akhir pekan, tempat jam
        // pulang wajib memang null). Bangun lagi begitu jalur SPL ada -
        // di ADK asli Rokeu Juni 2026, 109 dari 111 entri lembur justru
        // jatuh di HARI KERJA.
        const mulai =
          jamPulangWajib === null ? b.jamMasukMenit : Math.max(b.jamMasukMenit, jamPulangWajib);
        const durasi = Math.max(0, b.jamKeluarMenit - mulai);
        if (durasi === 0) {
          // Ada surat perintah lemburnya, tapi nol jam yang dibayar. Tanpa
          // catatan ini pegawainya cuma melihat lembur Rp 0 tanpa sebab.
          if (jamPulangWajib !== null && b.jamKeluarMenit <= jamPulangWajib) {
            catatan.push(
              `${iso}: ada baris Lembur, tapi jam pulangnya ${b.jamKeluarTeks ?? "-"} - belum melewati jam pulang wajib ${jamTeks(jamPulangWajib)}. Jam lembur yang dibayar 0.`
            );
          }
          continue;
        }
        jamHariIni += durasi / 60;
        // Syarat SBM 2026 item 23.2: minimal 2 jam BERTURUT-TURUT. Satu baris
        // = satu rentang masuk-pulang, jadi durasinya memang berturut-turut.
        if (durasi >= 120) adaBlokDuaJam = true;
      }

      if (jamHariIni > 0) {
        hitung.hariLembur++;
        const jam = bulatkan2(jamHariIni);
        if (hariLibur) {
          jamLemburLibur += jam;
          if (adaBlokDuaJam) hariMakanLemburLibur++;
        } else {
          jamLemburKerja += jam;
          if (adaBlokDuaJam) hariMakanLemburKerja++;
          catatan.push(
            `${iso} (${namaHari ?? "hari kerja"}): lembur ${jam} jam dihitung sebagai lembur HARI KERJA (tarif 1x). Kalau tanggal itu libur nasional, tarifnya 2x dan perlu dikoreksi manual - kalender libur nasional tidak ada di sistem ini.`
          );
        }
        const rincian = hari.find((h) => h.tanggalIso === iso);
        if (rincian) {
          rincian.jamLembur = jam;
          rincian.berhakMakanLembur = adaBlokDuaJam;
        } else {
          hari.push({
            tanggalIso: iso,
            namaHari,
            kategori: "LEMBUR",
            statusTeks: barisLembur[0].baris.statusTeks,
            jenisCuti: null,
            jamMasukMenit: barisLembur[0].baris.jamMasukMenit,
            jamKeluarMenit: barisLembur[0].baris.jamKeluarMenit,
            menitTerlambat: 0,
            menitPulangCepat: 0,
            kejadianTidakPresensi: 0,
            kejadianDikecualikanKendala: 0,
            jamLembur: jam,
            hariLibur,
            berhakMakanLembur: adaBlokDuaJam,
          });
        }
      }
    }
  }

  // --- 5. Rakit rekap bulanan -------------------------------------------------
  const kewajiban = laporan.ringkasanSumber.kewajibanJamKerja;
  const jumlahHariKerja =
    kewajiban !== null && jadwal.jamKerjaPerHari > 0 ? Math.round(kewajiban / jadwal.jamKerjaPerHari) : 0;

  const jumlahHariHadir = hitung.wfo + hitung.wfhWfa + hitung.diklat + hitung.dinasLuar;

  // Jenis cuti dengan hari terbanyak. Map mempertahankan urutan penyisipan,
  // jadi kalau seri, yang lebih dulu muncul di bulan itu yang menang.
  const jenisCutiTerbanyak =
    [...cutiPerJenis.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Bulan ke-berapa untuk jenis yang menang di atas. Kalau satu jenis
  // mencakup dua bulan sekaligus (mis. Cuti Besar II lalu III), dipakai yang
  // HARINYA TERBANYAK - kalau seri, yang nomornya lebih kecil (lebih
  // menguntungkan pegawai, karena tarif potongannya menaik).
  //
  // Pembagian proporsional antar bulan SENGAJA tidak dilakukan: Pasal 14
  // memberi satu persentase per periode pembayaran, dan cara membagi cuti
  // yang pindah bulan di tengah periode masih open item (lihat item 3 di
  // "Yang BELUM ada", CLAUDE.md). Kasusnya dilaporkan sebagai catatan.
  let bulanCutiKeberapa: number | null = null;
  if (jenisCutiTerbanyak) {
    const perBulan = cutiBulanPerJenis.get(jenisCutiTerbanyak);
    if (perBulan && perBulan.size > 0) {
      bulanCutiKeberapa = [...perBulan.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    }
  }

  const rekap: BarisRekapPresensi = {
    nip: laporan.nip ?? "",
    jumlahHariAlpha: hitung.tidakHadir,
    jumlahTidakPresensi: kejadianTidakPresensi,
    totalMenitTerlambat: menitTerlambatTotal,
    totalMenitPulangCepat: menitPulangCepatTotal,
    // Tidak ada datanya di export ini - PDF cuma punya satu pasang jam masuk
    // & pulang per hari, tidak mencatat keluar-masuk di tengah jam kerja.
    // Dibiarkan 0, BUKAN ditebak. Kalau satker punya catatannya, isi lewat
    // template Excel yang sudah ada.
    totalMenitMeninggalkanKantor: 0,
    // Blok "Kekurangan Jam Kerja" di PDF DIBACA (presensiPdf.ts) tapi tidak
    // pernah jadi potongan - Pasal 13 ayat (3) cuma menyebut terlambat,
    // pulang cepat, dan meninggalkan kantor, dan ketiganya sudah dihitung
    // per hari di atas. Kolom potongannya sudah dicabut 2026-08-07.
    // Status "Upacara Bendera" di PDF artinya pegawai IKUT upacara. Yang
    // TIDAK ikut tidak punya baris apa pun, dan tanggal upacara juga tidak
    // tercatat di file - jadi pelanggaran Pasal 13 ayat (4) tidak bisa
    // diturunkan dari sini sama sekali.
    jumlahTidakIkutUpacara: 0,
    jumlahHariKerja,
    jumlahHariHadir,
    jumlahHariWfo: hitung.wfo,
    jumlahHariWfhWfa: hitung.wfhWfa,
    jumlahHariDiklat: hitung.diklat,
    jumlahHariDinasLuar: hitung.dinasLuar,
    // Status "Tugas Belajar" memang muncul di export ini (kategoriDariStatus
    // sudah mengenalinya), jadi penandanya bisa diturunkan langsung - tidak
    // perlu diketik manual. Yang memakainya: pengali 80% di tukin.ts.
    jumlahHariTugasBelajar: hitung.tugasBelajar,

    // --- Cuti (Pasal 14) ---
    // Jenis dengan hari TERBANYAK yang dipakai kalau ada lebih dari satu di
    // bulan yang sama - `cutiAktif` di engine memang tunggal. Kasus banyak
    // jenis dilaporkan sebagai catatan, bukan diputuskan diam-diam.
    //
    // `bulanCutiKeberapa` diturunkan dari NAMA jenis cutinya ("Cuti Besar II",
    // "Cuti Sakit Bulan III") - lihat bulanCutiDariLabel() di jenisCuti.ts.
    // Tetap null kalau nomornya memang tidak disebut sumbernya; pemakainya
    // (tukin.ts) memperlakukan null sebagai bulan pertama, dan catatan di
    // bawah memberi tahu user kalau itu yang terjadi pada jenis cuti yang
    // tarifnya bertingkat.
    jenisCutiAktif: jenisCutiTerbanyak,
    bulanCutiKeberapa,
    jumlahHariCuti: hitung.cuti,
    totalJamLembur: bulatkan2(jamLemburKerja),
    totalJamLemburHariLibur: bulatkan2(jamLemburLibur),
    jumlahHariMakanLembur: hariMakanLemburKerja,
    jumlahHariMakanLemburHariLibur: hariMakanLemburLibur,
  };

  // --- 6. Cek silang dengan Summary Presensi bawaan PDF -----------------------
  // INFORMASI SAJA, bukan penentu. Yang dipakai Gajihub selalu TABEL DETAIL -
  // itu catatan per hari yang bisa ditelusuri, sementara blok "Summary
  // Presensi" cuma angka jadi.
  //
  // Selisih bukan berarti salah baca. Ada dua sebab yang sudah terbukti:
  // (1) dedup entri ganda - summary-nya ikut menghitung baris ganda, dan
  // (2) blok summary di export lama memang tidak sinkron dengan tabelnya
  //     sendiri. Contoh nyata di file uji Juli 2025: satu pegawai punya 16
  //     baris "Tidak Hadir" dan 12 baris "WFO" di tabel, tapi summary-nya
  //     menulis "Tidak Hadir : 1" dan "WFO : 1" - dan "Kekurangan Jam Kerja"
  //     -nya bahkan negatif (-97,5). Di export 2026 summary-nya sudah cocok.
  const s = laporan.ringkasanSumber;
  const selisihRingkasan: SelisihRingkasan[] = [];
  const banding = (label: string, sumber: number | null, gajihub: number) => {
    if (sumber === null) return;
    if (sumber !== gajihub) selisihRingkasan.push({ label, sumberPdf: sumber, gajihub });
  };
  banding("WFO", s.wfo, hitung.wfo);
  banding("WFH + WFA", s.wfh === null && s.wfa === null ? null : (s.wfh ?? 0) + (s.wfa ?? 0), hitung.wfhWfa);
  banding("Dinas Keluar", s.dinasKeluar, hitung.dinasLuar);
  banding("Diklat", s.diklat, hitung.diklat);
  banding("Tidak Hadir", s.tidakHadir, hitung.tidakHadir);
  banding("Cuti", s.cuti, hitung.cuti);
  banding("Izin", s.izin, hitung.izin);
  banding("Tugas Belajar", s.tugasBelajar, hitung.tugasBelajar);
  banding("Upacara Bendera", s.upacaraBendera, hitung.upacara);
  banding("Lembur", s.lembur, hitung.hariLembur);

  // Summary yang jumlahnya jauh di bawah banyaknya baris detail = blok
  // summary-nya tidak terisi benar (lihat contoh Juli 2025 di atas). Perlu
  // dibilang eksplisit, kalau tidak daftar "selisih" di bawah malah bikin
  // ragu pada angka yang justru benar.
  const totalRingkasan =
    (s.wfo ?? 0) + (s.wfh ?? 0) + (s.wfa ?? 0) + (s.dinasKeluar ?? 0) + (s.diklat ?? 0) +
    (s.tidakHadir ?? 0) + (s.cuti ?? 0) + (s.izin ?? 0) + (s.tugasBelajar ?? 0) +
    (s.upacaraBendera ?? 0) + (s.lembur ?? 0);
  // Kalau SELURUH blok ringkasan kosong, berarti sumbernya memang tidak punya
  // "Summary Presensi" buat dibandingkan - mis. jalur tarik langsung dari
  // database e-Presensi (src/jobs/importPresensiEpresensi.ts). Tanpa penjagaan
  // ini, semua nilai null dibaca sebagai 0 dan peringatan "summary tidak
  // sinkron" muncul untuk SETIAP pegawai, padahal tidak ada summary yang
  // dibandingkan.
  const adaRingkasan = [
    s.wfo, s.wfh, s.wfa, s.dinasKeluar, s.diklat, s.tidakHadir,
    s.cuti, s.izin, s.tugasBelajar, s.upacaraBendera, s.lembur,
  ].some((v) => v !== null);
  const ringkasanTidakDipercaya =
    adaRingkasan && laporan.baris.length >= 5 && totalRingkasan * 2 < laporan.baris.length;
  if (ringkasanTidakDipercaya) {
    catatan.push(
      `Blok "Summary Presensi" di file ini tidak sinkron dengan tabel detailnya sendiri (summary menghitung ${totalRingkasan} hari, tabelnya ${laporan.baris.length} baris) - masalah yang memang ada di export e-Presensi versi lama. Yang dipakai Gajihub adalah TABEL DETAIL, jadi angka di bawah tetap sah.`
    );
  }

  if (dibuang.some((d) => d.alasan.startsWith("entri ganda"))) {
    const jumlah = dibuang.filter((d) => d.alasan.startsWith("entri ganda")).length;
    catatan.push(
      `${jumlah} baris entri ganda dibuang (satu tanggal muncul lebih dari sekali di file). Ini penyebab hitungan Gajihub bisa berbeda dari "Summary Presensi" di PDF - summary itu ikut menghitung baris gandanya.`
    );
  }
  if (hitung.upacara > 0) {
    catatan.push(
      `${hitung.upacara} hari berstatus "Upacara Bendera" TIDAK dihitung sebagai hari kerja WFO (upacara kenegaraan sering jatuh di hari libur - contoh 1 Juni). Kalau tanggal itu sebenarnya hari kerja, hari tersebut kehilangan hak uang makannya dan perlu dikoreksi manual.`
    );
  }
  if (hitung.cuti + hitung.izin + hitung.sakit + hitung.tugasBelajar > 0) {
    catatan.push(
      `Ada ${hitung.cuti} hari cuti, ${hitung.izin} izin, ${hitung.sakit} sakit, ${hitung.tugasBelajar} tugas belajar. Hari-hari ini tidak dihitung alpha dan tidak dapat uang makan.`
    );
  }
  if (cutiTakDikenali.size > 0) {
    catatan.push(
      `Jenis cuti tidak dikenali: ${[...cutiTakDikenali].join(", ")}. Hari-harinya tetap terhitung sebagai cuti, TAPI potongan Pasal 14-nya tidak bisa ditentukan - isi kolom "Jenis Cuti" lewat template kalau memang perlu dipotong.`
    );
  }
  if (cutiPerJenis.size > 1) {
    catatan.push(
      `Ada lebih dari satu jenis cuti di periode ini (${[...cutiPerJenis.entries()]
        .map(([j, n]) => `${LABEL_JENIS_CUTI[j]} ${n} hari`)
        .join(", ")}). Yang dipakai untuk potongan Pasal 14 adalah yang harinya terbanyak - periksa manual kalau bukan itu yang dimaksud.`
    );
  }
  // Tarif 50%/75%/90% untuk cuti sakit & cuti besar ditentukan oleh BULAN KE
  // BERAPA cuti berjalan. Sumber e-Presensi biasanya menyebutnya di nama
  // jenisnya ("Cuti Besar II"), jadi peringatan ini cuma muncul kalau
  // nomornya memang tidak ada - bukan setiap kali ada cuti seperti dulu.
  if (jenisCutiTerbanyak === "CUTI_SAKIT" || jenisCutiTerbanyak === "CUTI_BESAR") {
    if (bulanCutiKeberapa === null) {
      catatan.push(
        `${LABEL_JENIS_CUTI[jenisCutiTerbanyak]} terdeteksi, tapi BULAN KE BERAPA cuti ini berjalan tidak disebut di sumbernya - padahal itu yang menentukan potongannya (bulan I/II/III). Cuti ini diperlakukan sebagai BULAN PERTAMA; isi kolom "Bulan Cuti Ke" lewat template kalau ternyata bukan.`
      );
    } else {
      const perBulan = cutiBulanPerJenis.get(jenisCutiTerbanyak);
      if (perBulan && perBulan.size > 1) {
        catatan.push(
          `${LABEL_JENIS_CUTI[jenisCutiTerbanyak]} berpindah bulan di tengah periode ini (${[...perBulan.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([b, n]) => `bulan ke-${b}: ${n} hari`)
            .join(", ")}). Potongan Pasal 14 dihitung memakai bulan ke-${bulanCutiKeberapa} (harinya terbanyak) - pembagian proporsional antar bulan belum diatur, periksa manual kalau nilainya besar.`
        );
      }
    }
  }
  if (jumlahHariKerja > 0 && jumlahHariHadir > jumlahHariKerja) {
    catatan.push(
      // Sabtu & Minggu SUDAH tidak bisa jadi penyebabnya (dikecualikan di blok
      // penghitungan). Yang tersisa cuma libur nasional yang jatuh di hari
      // kerja - itu memang tidak bisa dikenali sistem ini, jadi catatan ini
      // sekarang jauh lebih jarang muncul dan lebih layak dipercaya.
      `Hari hadir (${jumlahHariHadir}) melebihi hari kerja (${jumlahHariKerja} hari, dari "Kewajiban Jam Kerja" ${kewajiban} jam di PDF). Kemungkinan besar ada LIBUR NASIONAL di hari kerja - kalender libur nasional tidak ada di sistem ini, jadi harinya tetap terbaca sebagai hari hadir. Hak uang makan tetap dibatasi ${jumlahHariKerja} hari.`
    );
  }

  // Pengecualian kendala e-Presensi WAJIB kelihatan, bukan cuma mengubah
  // angka diam-diam. Ini yang dibaca orang yang bertanya "kenapa potongan
  // orang ini hilang padahal jam pulangnya kosong".
  if (dikecualikanKendalaTotal > 0) {
    const tanggalKena = hari
      .filter((h) => h.kejadianDikecualikanKendala > 0)
      .map((h) => h.tanggalIso)
      .join(", ");
    catatan.push(
      `${dikecualikanKendalaTotal} kejadian "tidak melakukan presensi" (Pasal 13 ayat (2)) TIDAK dipotong karena tanggalnya ditandai kendala e-Presensi (Pasal 10 ayat (2))${
        tanggalKena ? `: ${tanggalKena}` : ""
      }. Keterlambatan dan ketidakhadiran di tanggal itu TETAP dihitung.`
    );
  }

  // Koreksi manual WAJIB kelihatan di hasilnya - angka yang diketik manusia
  // tidak boleh menyamar sebagai angka dari e-Presensi.
  if (adaKoreksiJam.size > 0) {
    catatan.push(
      `Jam presensi pada ${adaKoreksiJam.size} tanggal (${[...adaKoreksiJam].sort().join(", ")}) DIKOREKSI MANUAL ` +
        "oleh petugas absensi berdasarkan laporan pegawai (Pasal 10 ayat (2)) - bukan angka dari e-Presensi."
    );
  }

  return {
    nip: laporan.nip,
    nama: laporan.nama,
    periodeBulan: laporan.periodeBulan,
    periodeTahun: laporan.periodeTahun,
    rekap,
    hari,
    dibuang,
    selisihRingkasan,
    catatan,
    kejadianDikecualikanKendala: dikecualikanKendalaTotal,
    tanggalDikoreksiManual: [...adaKoreksiJam].sort(),
  };
}
