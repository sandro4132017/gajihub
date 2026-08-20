// ============================================================================
// RINCIAN JAM KERJA HARIAN - bentuk yang dipakai petugas di "Jam Absensi.xlsx"
//
// PURE (lihat "Konvensi kode" di CLAUDE.md). Tidak menyentuh database maupun
// berkas; semua masukan lewat parameter.
//
// KENAPA ADA
// ----------
// Tabel presensi Gajihub menjawab "apa yang dilanggar" (telat, pulang cepat).
// Berkas rekap petugas menjawab pertanyaan yang BERBEDA: "jam kerja hari itu
// terpenuhi atau tidak" - lewat kolom Jam Harus Checkout, Menit Kerja, dan
// Kekurangan Jam Kerja. Petugas masih memakai bentuk itu tiap periode, jadi
// selama masa transisi Gajihub harus bisa menampilkannya juga - kalau tidak,
// tidak ada cara mengadu keduanya selain membuka Excel di sebelah layar.
//
// RUMUSNYA DIBONGKAR DARI BERKAS ASLI, BUKAN DIKARANG. Diuji ke seluruh 1.133
// baris sheet "Master Presensi" (48 pegawai Biro Keuangan, Juli 2026):
//
//   Jumlah Menit Kekurangan Harian = Terlambat + Kekurangan     1.133/1.133
//   Terlambat  = checkin - Jam Toleransi Masuk (08:30)          1.125/1.133
//   Menit Kerja = (checkout - checkin) - istirahat              1.124/1.133
//   Kekurangan = min(max(harusCheckout, jamPulang), tolPulang)
//                - checkout                                     1.099/1.133
//   Jam Harus Checkout = checkin + 7,5 jam + istirahat          1.092/1.133
//
// Istirahat Senin-Kamis 60 menit, Jumat 90 menit - persis Pasal 9 ayat (2),
// dan itu juga yang membuktikan jendela jam dinding Gajihub (07:30-16:00 /
// 16:30) memang sudah memuat istirahat di dalamnya: 510 - 60 = 450 = 7,5 jam,
// dan 540 - 90 = 450.
//
// ----------------------------------------------------------------------------
// PERINGATAN YANG MENENTUKAN: "KEKURANGAN JAM KERJA" BUKAN "PULANG CEPAT"
// ----------------------------------------------------------------------------
// Keduanya bersatuan menit dan terdengar mirip, tapi mengukur hal berbeda:
//
//   Pulang cepat (Pasal 13 ayat (3), YANG DIBAYARKAN)
//       = jam pulang wajib - checkout        <- patokan TETAP 16:00 / 16:30
//   Kekurangan jam kerja (berkas petugas, TABEL INI)
//       = batas kewajiban hari itu - checkout <- patokan BERGESER ikut checkin
//
// Bedanya baru muncul pada orang yang datang terlambat. Masuk 09:00 lalu
// pulang 16:00: pulang cepat 0 menit (dia pulang tepat waktu), kekurangan jam
// kerja 60 menit (kewajibannya bergeser ke 17:00). Yang MEMBAYAR adalah kolom
// pulang cepat; kekurangan jam kerja di sini murni penjelas.
//
// Kolom "kekurangan jam kerja" pernah masuk mesin potongan pada 2026-08-06
// dan DICABUT sehari kemudian - Pasal 13 ayat (3) menyebut tepat tiga
// pelanggaran dan kolom itu bukan salah satunya, lagipula secara aritmatika
// ia AKIBAT dari terlambat & pulang cepat sehingga menagihnya berarti memotong
// menit yang sama dua kali. Lihat InputPotonganKehadiran di tukin.ts.
// JANGAN mengalirkan angka dari modul ini ke sana.
//
// ----------------------------------------------------------------------------
// "JAM TOLERANSI PULANG" BUKAN JAM MULAI LEMBUR
// ----------------------------------------------------------------------------
// Di berkas petugas, 17:00 adalah BATAS ATAS kewajiban checkout: orang yang
// datang sangat terlambat tidak dituntut pulang lewat jam itu. Lembur TIDAK
// ada hubungannya dengan kolom ini - jam lembur mulai berjalan di jam pulang
// wajib (16:00 / Jumat 16:30), bukan di jam toleransinya.
//
// Sempat ada jeda 1 jam sebelum lembur (2026-08-18) yang membuat kedua angka
// itu kebetulan sama, dan itu memang membingungkan - jedanya DICABUT
// 2026-08-19. Lihat "TIDAK ADA JEDA SEBELUM LEMBUR" di presensiPdfKeRekap.ts.
// ============================================================================

import { JADWAL_KERJA_DEFAULT, JAM_TAP_PULANG_HILANG, type JadwalKerja } from "./presensiPdfKeRekap";
import { TARIF_POTONGAN_PASAL_13 } from "./tukin";

/**
 * Waktu istirahat yang dipotong dari rentang masuk-pulang, per hari
 * (indeks 0 = Minggu). Pasal 9 ayat (2): Senin-Kamis 60 menit, Jumat 90 menit.
 * Sabtu & Minggu null - tidak ada kewajiban jam kerja yang perlu dipotong.
 */
export const ISTIRAHAT_MENIT: readonly (number | null)[] = [null, 60, 60, 60, 60, 90, null];

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
  /** Sesudah toleransi 60 menit - angka yang SAMA dengan yang dibayarkan. */
  menitTerlambat: number;
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
    };
  }

  const jamMasukWajibMenit = jadwal.jamMasukWajibMenit;
  const jamToleransiMasukMenit = jamMasukWajibMenit + jadwal.toleransiTerlambatMenit;
  const jamToleransiPulangMenit = jamPulangWajibMenit + jadwal.toleransiTerlambatMenit;

  const jamHarusPulangMenit =
    jamMasukMenit === null ? null : jamMasukMenit + Math.round(jadwal.jamKerjaPerHari * 60) + istirahatMenit;

  const menitTerlambat = jamMasukMenit === null ? 0 : Math.max(0, jamMasukMenit - jamToleransiMasukMenit);

  const menitKerja =
    jamMasukMenit === null || jamKeluarMenit === null ? null : jamKeluarMenit - jamMasukMenit - istirahatMenit;

  // Batas kewajiban checkout hari itu: paling cepat jam pulang wajib, bergeser
  // maju kalau orangnya datang terlambat, TAPI tidak pernah melewati jam
  // toleransi pulang. Bentuk min(max(...)) ini yang cocok 1.099/1.133 ke
  // berkas petugas - dua bentuk lain yang diuji (tanpa cap, dan tanpa max)
  // cocok jauh lebih sedikit.
  const batasCheckoutMenit =
    jamHarusPulangMenit === null
      ? jamPulangWajibMenit
      : Math.min(Math.max(jamHarusPulangMenit, jamPulangWajibMenit), jamToleransiPulangMenit);

  const kekuranganJamKerjaMenit =
    jamKeluarMenit === null ? null : Math.max(0, batasCheckoutMenit - jamKeluarMenit);

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
    batasCheckoutMenit,
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
 * SENGAJA TIDAK memakai "kekurangan jam kerja" - lihat kepala file.
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
