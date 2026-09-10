// ============================================================================
// RINCIAN JAM KERJA HARIAN - bentuk yang dipakai petugas di "Jam Absensi.xlsx"
//
// PURE (lihat "Konvensi kode" di CLAUDE.md).
//
// Menjawab pertanyaan yang BERBEDA dari tabel presensi Gajihub: bukan "apa
// yang dilanggar", tapi "jam kerja hari itu terpenuhi atau tidak". Petugas
// masih memakai bentuk ini tiap periode, jadi selama masa transisi Gajihub
// harus bisa menampilkannya supaya keduanya bisa diadu.
//
// Rumusnya dibongkar dari berkas asli, bukan dikarang - diuji ke 1.133 baris
// (48 pegawai Biro Keuangan, Juli 2026), kecocokan 1.092-1.133 per kolom.
// Istirahat Senin-Kamis 60 menit, Jumat 90 menit (Pasal 9 ayat (2)).
//
// PERINGATAN 1 - "KEKURANGAN JAM KERJA" ADALAH "PULANG CEPAT" (sejak
// 2026-09-09). Keduanya satu angka, dihitung satu tempat:
// `batasCheckoutMenit` di presensiPdfKeRekap.ts.
//   Pulang cepat, Pasal 13 ayat (3) = batas kewajiban hari itu - checkout
//   Batas itu BERGESER ikut checkin (Pasal 9 ayat (1): paling sedikit 7,5 jam)
//   dan berhenti di jam pulang wajib + toleransi (Pasal 9 ayat (3)).
//   Masuk 08:15 lalu pulang 16:00 = kurang 45 menit, ditagih 0,01%/menit.
//
//   Yang DICABUT 2026-08-07 dan tetap tidak boleh kembali adalah kolom
//   TERSENDIRI `total_menit_kekurangan_jam_kerja` sebagai pelanggaran KEEMPAT.
//   Batas yang bergeser sudah mencakup pulang cepat lama sebagai kasus khusus
//   (datang 07:30 -> batasnya persis jam pulang wajib), jadi menagih keduanya
//   berarti memotong menit yang sama dua kali. Satu angka, satu ayat.
//
// PERINGATAN 2 - "JAM TOLERANSI PULANG" BUKAN JAM MULAI LEMBUR. Di berkas
// petugas, 17:00 adalah BATAS ATAS kewajiban checkout. Lembur mulai berjalan
// di jam pulang wajib (16:00 / Jumat 16:30).
// ============================================================================

import {
  ISTIRAHAT_MENIT,
  JADWAL_KERJA_DEFAULT,
  JAM_TAP_PULANG_HILANG,
  batasCheckoutMenit,
  tapKetukanGanda,
  tapKeluarMustahil,
  tapMasukMustahil,
  type JadwalKerja,
} from "./presensiPdfKeRekap";
import { TARIF_POTONGAN_PASAL_13 } from "./tukin";

/**
 * Pindah ke presensiPdfKeRekap.ts supaya mesin potongan dan tabel ini memakai
 * angka istirahat yang SAMA. Diteruskan dari sini karena jalur impor lama
 * masih dipakai - bukan salinan kedua.
 */
export { ISTIRAHAT_MENIT };

export interface InputRincianJamKerja {
  /** "YYYY-MM-DD" - dibawa apa adanya ke keluaran, tidak dipakai berhitung. */
  tanggalIso: string;
  /** 0 = Minggu ... 6 = Sabtu. */
  indeksHari: number;
  /**
   * Sabtu/Minggu ATAU tanggal merah. Kalau true, seluruh kolom kewajiban
   * bernilai null - tidak ada jam kerja yang harus dipenuhi, jadi tidak ada
   * yang bisa kurang.
   */
  hariLibur: boolean;
  jamMasukMenit: number | null;
  jamKeluarMenit: number | null;
  /**
   * Jam hasil koreksi petugas SELALU dipercaya - itu keterangan yang sudah
   * diverifikasi manusia terhadap foto & geotag, bukan tebakan atas ketukan
   * yang hilang. Aturan yang sama persis dipakai mesin yang membayar.
   */
  masukDikoreksi?: boolean;
  keluarDikoreksi?: boolean;
}

export interface BarisRincianJamKerja {
  tanggalIso: string;
  indeksHari: number;
  hariLibur: boolean;
  jamMasukMenit: number | null;
  jamKeluarMenit: number | null;
  /** Menit istirahat hari itu. null di hari libur. */
  istirahatMenit: number | null;
  /** 07:30 - null di hari libur. */
  jamMasukWajibMenit: number | null;
  /** 08:30 = jam masuk wajib + toleransi Pasal 9 ayat (3). */
  jamToleransiMasukMenit: number | null;
  /** 16:00, Jumat 16:30. */
  jamPulangWajibMenit: number | null;
  /** 17:00, Jumat 17:30 = jam pulang wajib + toleransi yang sama. */
  jamToleransiPulangMenit: number | null;
  /** checkin + 7,5 jam + istirahat. null kalau tidak ada ketukan masuk. */
  jamHarusPulangMenit: number | null;
  /**
   * Sesudah toleransi 60 menit - angka yang SAMA dengan yang dibayarkan.
   * `null` kalau ketukannya tidak dipercaya (lihat `tapTidakWajar`).
   */
  menitTerlambat: number | null;
  /** (checkout - checkin) - istirahat. null kalau salah satu ketukan hilang. */
  menitKerja: number | null;
  /** Lihat peringatan di kepala file: ini BUKAN pulang cepat. */
  kekuranganJamKerjaMenit: number | null;
  /** Terlambat + kekurangan. null kalau kekurangannya tidak bisa dihitung. */
  totalMenitKekuranganHarian: number | null;
  /**
   * Batas checkout yang dipakai menghitung kekurangan, supaya angkanya bisa
   * ditelusuri tanpa menghitung ulang di kepala.
   */
  batasCheckoutMenit: number | null;
  /**
   * Ketukannya tidak dipercaya mesin yang membayar - mustahil sebagai
   * kedatangan, mustahil sebagai kepulangan, atau satu tap tersalin ke dua
   * kolom. Kalau true SELURUH kolom turunan bernilai null, karena angka apa
   * pun yang dihitung darinya BUKAN angka yang ditagih: hari itu ditagih 1%
   * Pasal 13 ayat (2), bukan per menit.
   *
   * Ini yang membuat tabel tidak lagi memajang "terlambat 896 menit" untuk
   * baris yang sebenarnya dipotong 0 menit.
   */
  tapTidakWajar: boolean;
}

/**
 * Susun satu baris rincian jam kerja.
 *
 * Toleransi masuk DAN toleransi pulang sama-sama diturunkan dari
 * `jadwal.toleransiTerlambatMenit`, bukan dua konstanta terpisah: di berkas
 * petugas keduanya memang 60 menit (08:30 dan 17:00 / 17:30), dan Pasal 9
 * ayat (3) cuma menyebut satu angka toleransi. Kalau suatu saat keduanya harus
 * berbeda, di sinilah tempat memecahnya.
 */
export function rincianJamKerjaHari(
  input: InputRincianJamKerja,
  jadwal: JadwalKerja = JADWAL_KERJA_DEFAULT
): BarisRincianJamKerja {
  const { tanggalIso, indeksHari, hariLibur, jamMasukMenit, jamKeluarMenit } = input;

  const jamPulangWajibMenit = hariLibur ? null : (jadwal.jamPulangWajibMenit[indeksHari] ?? null);
  const istirahatMenit = jamPulangWajibMenit === null ? null : (ISTIRAHAT_MENIT[indeksHari] ?? null);

  // Hari libur (termasuk tanggal merah) tidak punya kewajiban apa pun - satu
  // keputusan yang sama dengan yang dipegang mesin potongan.
  if (jamPulangWajibMenit === null || istirahatMenit === null) {
    return {
      tanggalIso,
      indeksHari,
      hariLibur: true,
      jamMasukMenit,
      jamKeluarMenit,
      istirahatMenit: null,
      jamMasukWajibMenit: null,
      jamToleransiMasukMenit: null,
      jamPulangWajibMenit: null,
      jamToleransiPulangMenit: null,
      jamHarusPulangMenit: null,
      menitTerlambat: 0,
      menitKerja: null,
      kekuranganJamKerjaMenit: null,
      totalMenitKekuranganHarian: null,
      batasCheckoutMenit: null,
      tapTidakWajar: false,
    };
  }

  const jamMasukWajibMenit = jadwal.jamMasukWajibMenit;
  const jamToleransiMasukMenit = jamMasukWajibMenit + jadwal.toleransiTerlambatMenit;
  const jamToleransiPulangMenit = jamPulangWajibMenit + jadwal.toleransiTerlambatMenit;

  // KETUKAN YANG TIDAK DIPERCAYA -> tidak ada satu pun angka turunan.
  // Predikatnya SAMA PERSIS dengan yang dipakai mesin yang membayar (fungsi
  // yang sama, bukan salinan), jadi tabel ini tidak bisa lagi berbeda darinya.
  const tapTidakWajar =
    tapMasukMustahil(jamMasukMenit, jamPulangWajibMenit, input.masukDikoreksi) ||
    tapKeluarMustahil(jamKeluarMenit, jadwal, input.keluarDikoreksi) ||
    tapKetukanGanda(jamMasukMenit, jamKeluarMenit, input.masukDikoreksi, input.keluarDikoreksi);

  if (tapTidakWajar) {
    return {
      tanggalIso,
      indeksHari,
      hariLibur: false,
      jamMasukMenit,
      jamKeluarMenit,
      istirahatMenit,
      jamMasukWajibMenit,
      jamToleransiMasukMenit,
      jamPulangWajibMenit,
      jamToleransiPulangMenit,
      // Jam & menit turunan SENGAJA null - bukan 0. Nol berarti "diperiksa,
      // tidak ada pelanggaran"; yang benar di sini "tidak bisa dihitung".
      jamHarusPulangMenit: null,
      menitTerlambat: null,
      menitKerja: null,
      kekuranganJamKerjaMenit: null,
      totalMenitKekuranganHarian: null,
      batasCheckoutMenit: null,
      tapTidakWajar: true,
    };
  }

  const jamHarusPulangMenit =
    jamMasukMenit === null ? null : jamMasukMenit + Math.round(jadwal.jamKerjaPerHari * 60) + istirahatMenit;

  const menitTerlambat = jamMasukMenit === null ? 0 : Math.max(0, jamMasukMenit - jamToleransiMasukMenit);

  const menitKerja =
    jamMasukMenit === null || jamKeluarMenit === null ? null : jamKeluarMenit - jamMasukMenit - istirahatMenit;

  // Rumusnya ada di presensiPdfKeRekap.ts - fungsi yang SAMA dipakai mesin
  // yang membayar. Tabel ini menampilkan angka yang benar-benar dipotong,
  // bukan hitungan sejajar yang bisa menyimpang diam-diam.
  const batasCheckout = batasCheckoutMenit(jamMasukMenit, jamPulangWajibMenit, istirahatMenit, jadwal);

  const kekuranganJamKerjaMenit =
    jamKeluarMenit === null ? null : Math.max(0, batasCheckout - jamKeluarMenit);

  return {
    tanggalIso,
    indeksHari,
    hariLibur: false,
    jamMasukMenit,
    jamKeluarMenit,
    istirahatMenit,
    jamMasukWajibMenit,
    jamToleransiMasukMenit,
    jamPulangWajibMenit,
    jamToleransiPulangMenit,
    jamHarusPulangMenit,
    menitTerlambat,
    menitKerja,
    kekuranganJamKerjaMenit,
    totalMenitKekuranganHarian:
      kekuranganJamKerjaMenit === null ? null : menitTerlambat + kekuranganJamKerjaMenit,
    batasCheckoutMenit: batasCheckout,
    tapTidakWajar: false,
  };
}

/** Pelanggaran Pasal 13 pada SATU hari - bahan kolom persentase potongan. */
export interface PelanggaranHarian {
  /** Pasal 13 ayat (1) - 3%. */
  hariAlpha: boolean;
  /** Pasal 13 ayat (2) - 1% per KETUKAN yang hilang, bisa 2 dalam sehari. */
  kejadianTidakPresensi: number;
  /** Ketiganya Pasal 13 ayat (3) - 0,01% per menit. */
  menitTerlambat: number;
  menitPulangCepat: number;
  menitMeninggalkanKantor: number;
  /** Pasal 13 ayat (4) - 3%. */
  tidakIkutUpacara: boolean;
}

/**
 * Persentase potongan komponen kehadiran untuk SATU hari, sebagai PECAHAN dari
 * bobot kehadiran (0,0099 = 0,99%) - satuan yang sama dengan keluaran
 * `hitungPotonganKehadiranPersen`, supaya keduanya bisa dijumlahkan & diadu
 * tanpa konversi.
 *
 * Tarifnya diambil dari `TARIF_POTONGAN_PASAL_13`, BUKAN ditulis ulang. Angka
 * salinan di lapisan tampilan berbahaya: orang membaca rincian yang tidak
 * sesuai dengan potongan yang benar-benar dikenakan.
 *
 * `menitPulangCepat` yang masuk ke sini SUDAH diukur ke batas kewajiban 7,5
 * jam (lihat kepala file) - jadi kolom "kekurangan jam kerja" di tabel tidak
 * boleh ditambahkan lagi di sini. Satu angka, satu ayat.
 */
export function potonganHarianPersen(p: PelanggaranHarian): number {
  const t = TARIF_POTONGAN_PASAL_13;
  return (
    (p.hariAlpha ? t.perHariAlpha : 0) +
    p.kejadianTidakPresensi * t.perKejadianTidakPresensi +
    (p.menitTerlambat + p.menitPulangCepat + p.menitMeninggalkanKantor) * t.perMenit +
    (p.tidakIkutUpacara ? t.perKejadianTidakUpacara : 0)
  );
}

/**
 * Jam keluar yang DIISI SENDIRI oleh e-Presensi ketika tap pulang tidak pernah
 * masuk. Bukan tebakan: sebarannya membuktikannya - 3.320 baris jatuh persis
 * di menit yang sama sementara 456 tersebar di 59 menit lain sepanjang jam 23.
 * Manusia tidak menekan tombol serentak di satu menit.
 */
export { JAM_TAP_PULANG_HILANG };

/**
 * Berapa kejadian Pasal 13 ayat (2) pada SATU hari.
 *
 * INI REKONSTRUKSI, bukan angka tersimpan - `PresensiHarian` menyimpan jam &
 * menit pelanggaran, tapi TIDAK menyimpan cacah kejadian ayat (2). Aturannya
 * disalin dari mesin yang menghitungnya saat sinkronisasi
 * (`rekapDariLaporanPdf`), dan karena salinan bisa menyimpang, pemanggil WAJIB
 * mengadu jumlah sebulannya ke `RekapPresensiPeriode.jumlahTidakPresensi` dan
 * mengatakannya apa adanya kalau berbeda. Jangan dipakai untuk membayar.
 *
 * Yang tidak bisa direkonstruksi dan karena itu tidak dicoba: penanda "lupa
 * presensi" dari kolom Potongan e-Presensi, dan kolom `menit_kerja === 0` yang
 * dipakai mesinnya - keduanya tidak ikut tersimpan. Yang tertangkap cuma
 * bentuk yang meninggalkan jejak di jamnya sendiri.
 *
 * KETELITIANNYA TERUKUR, bukan diperkirakan. Diadu ke seluruh
 * `RekapPresensiPeriode` periode 7/2026 (117.906 baris harian, 5.089 pegawai):
 * cocok untuk 5.062 pegawai (99,5%), 8 kelebihan, 19 kekurangan, dan totalnya
 * 2.809 lawan 2.819 kejadian. Sisanya baris ganjil - mis. satu pegawai dengan
 * masuk 23:26 & keluar 23:59 di hari yang sama, yang mesinnya baca sebagai
 * kedatangan sangat terlambat sementara aturan di sini membacanya sebagai tap
 * pulang yang hilang. Untuk kasus seperti itu panelnya memang harus menyala.
 */
export function kejadianTidakPresensiHari(input: {
  /** Status hari itu mewajibkan presensi masuk & pulang (WFO/WFH/WFA). */
  wajibPresensi: boolean;
  hariLibur: boolean;
  jamMasukMenit: number | null;
  jamKeluarMenit: number | null;
  /** Tanggal ditandai kendala e-Presensi - Pasal 10 ayat (2) membatalkannya. */
  dikecualikanKendala: boolean;
  /** Petugas absensi sudah memperbaiki jamnya berdasarkan bukti pegawai. */
  dikoreksiManual: boolean;
}): number {
  if (!input.wajibPresensi || input.hariLibur) return 0;
  if (input.dikecualikanKendala) return 0;

  // Per KETUKAN, bukan per hari - ayat (2) eksplisit "setiap kali".
  let kejadian = (input.jamMasukMenit === null ? 1 : 0) + (input.jamKeluarMenit === null ? 1 : 0);

  // Tap pulang hilang tapi jamnya tidak kosong: e-Presensi mengisinya 23:59.
  // Koreksi petugas mematikannya - yang dinyatakan hilang sudah digantikan
  // keterangan yang diverifikasi manusia.
  if (kejadian === 0 && !input.dikoreksiManual && input.jamKeluarMenit === JAM_TAP_PULANG_HILANG) {
    kejadian = 1;
  }
  return kejadian;
}

/** "07:30" dari 450. null -> "-" diserahkan ke pemanggil. */
export function jamDariMenit(menit: number | null): string | null {
  if (menit === null) return null;
  return `${String(Math.floor(menit / 60)).padStart(2, "0")}:${String(menit % 60).padStart(2, "0")}`;
}
