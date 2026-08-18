// ============================================================================
// UANG LEMBUR CALCULATION
//
// Pendapatan lembur terdiri dari DUA komponen terpisah (SBM 2026 halaman -13-):
//   1. Uang lembur       - item 23.1, satuan OJ (orang/JAM)
//   2. Uang makan lembur - item 23.2, satuan OH (orang/HARI)
//
// Satuannya BEDA, dan itu inti perhitungannya: uang lembur dikali JAM, uang
// makan lembur dikali HARI. Karena itu total jam sebulan saja TIDAK CUKUP
// buat menghitung uang makan lembur - harus tahu berapa HARI yang lemburnya
// memenuhi syarat.
//
// SYARAT UANG MAKAN LEMBUR - ini ADA di SBM 2026 halaman -51- (penjelasan
// item 23.2), bukan sekadar kebijakan internal:
//   "Uang makan lembur diperuntukkan bagi Pegawai Aparatur Sipil Negara
//    setelah bekerja lembur paling kurang 2 (dua) jam SECARA BERTURUT-TURUT
//    dan diberikan paling banyak 1 (satu) kali per hari."
// Dua hal penting dari kalimat itu:
//   1. 2 jam harus BERTURUT-TURUT, bukan akumulasi sehari. Lembur 1 jam pagi
//      + 1 jam sore TIDAK memenuhi syarat walau totalnya 2 jam. Engine ini
//      tidak bisa memastikannya sendiri (inputnya sudah berupa jumlah hari
//      yang memenuhi syarat) - yang menentukan adalah pihak yang mengisi
//      rekap, dan itu ditegaskan di template & halaman uploadnya.
//   2. Paling banyak 1 kali per hari - otomatis terpenuhi karena satuannya
//      memang per hari.
//
// LEMBUR HARI LIBUR / TANGGAL MERAH: tarif per jamnya dikali
// PENGALI_LEMBUR_HARI_LIBUR. PERHATIAN - pengali itu BUKAN dari SBM (kata
// "libur" tidak muncul sama sekali di SBM 2026); lihat catatan lengkapnya di
// tarifSbm.ts.
//
// WFH/WFA TIDAK DAPAT LEMBUR (aturan user 2026-07-29): pegawai yang bekerja
// dari rumah tidak dihitung lembur walau jam absen keluarnya melewati jam
// kerja. Engine ini tidak melihat data harian, jadi penyaringannya dilakukan
// saat pengisian rekap (jam lembur yang dilaporkan HARUS sudah mengecualikan
// hari WFH/WFA). Yang bisa dilakukan di sini cuma pengecekan silang: kalau
// ada klaim jam lembur padahal hari WFO-nya nol, itu janggal dan ditandai.
//
// Tarif tidak dihardcode di sini - lihat src/business-logic/tarifSbm.ts.
//
// TODO(confirm):
// - Batas maksimal jam lembur per bulan TIDAK disebut di SBM. Angka 40 jam
//   di bawah adalah asumsi lama yang MASIH belum dikonfirmasi ke Biro
//   Keuangan/DJA - jangan dianggap resmi.
// - Pengali lembur hari libur (2x) BELUM punya rujukan pasal - lihat
//   PENGALI_LEMBUR_HARI_LIBUR di tarifSbm.ts.
// - Apakah uang MAKAN lembur ikut naik di hari libur belum ditegaskan;
//   sekarang tidak (PENGALI_MAKAN_LEMBUR_HARI_LIBUR = 1).
// - Syarat "2 jam BERTURUT-TURUT" tidak bisa diverifikasi engine ini -
//   bergantung pada kebenaran pengisian rekap.
// ============================================================================

import type { UangLemburInput, UangLemburResult } from "../types/index";
import { PENGALI_LEMBUR_HARI_LIBUR, PENGALI_MAKAN_LEMBUR_HARI_LIBUR } from "./tarifSbm";

const BATAS_DEFAULT_JAM_LEMBUR_PER_BULAN = 40; // TODO(confirm): tidak diatur di SBM
const MINIMAL_JAM_LEMBUR_DAPAT_MAKAN = 2; // SBM hal. -51-, penjelasan item 23.2

/**
 * Uang lembur dibayar per JAM PENUH - sisa menit yang tidak genap satu jam
 * TIDAK dibayar (aturan user 2026-08-06). Lembur 1 jam 59 menit dibayar 1 jam,
 * bukan 2 jam dan bukan 1,98 jam.
 *
 * PERHATIKAN DI MANA PEMBULATAN INI TERJADI - ini menentukan hasilnya.
 * Fungsi ini menerima TOTAL jam sebulan, jadi yang dibulatkan adalah totalnya.
 * Kalau pegawai lembur 1j59m pada dua hari berbeda:
 *   - dibulatkan per HARI  : 1 + 1            = 2 jam  <- lebih tepat
 *   - dibulatkan per BULAN : floor(3,97)      = 3 jam  <- yang terjadi di sini
 * Jadi pembulatan di sini bersifat JARING PENGAMAN, bukan tempat yang ideal.
 * Idealnya sisa menit sudah dipangkas per hari SAAT REKAP DIISI - jalur PDF
 * e-Presensi sudah melakukannya per blok lembur (lihat presensiPdfKeRekap.ts),
 * sementara pengisian manual lewat template bergantung pada pengisinya.
 *
 * TODO(confirm): belum ada rujukan pasal/SBM untuk pembulatan ke bawah ini -
 * SBM 2026 item 23.1 cuma menetapkan besaran per jam tanpa menyebut perlakuan
 * sisa menit. Aturannya datang dari user, bukan dokumen.
 */
function bulatkanKeJamPenuh(jam: number): number {
  return Math.floor(jam);
}

/**
 * Hitung berapa HARI yang berhak uang makan lembur dari rincian jam lembur
 * per hari. Dipisah jadi fungsi sendiri supaya pemanggil yang PUNYA rincian
 * harian bisa menurunkannya sendiri, sementara pemanggil yang cuma punya
 * rekap bulanan mengisi `jumlahHariMakanLembur` langsung.
 *
 * Contoh: [1, 2, 3.5, 0.5] -> 2 hari (yang 2 jam dan yang 3,5 jam).
 */
export function hitungHariBerhakMakanLembur(rincianJamPerHari: number[]): number {
  return rincianJamPerHari.filter((jam) => jam >= MINIMAL_JAM_LEMBUR_DAPAT_MAKAN).length;
}

export function hitungUangLembur(input: UangLemburInput): UangLemburResult {
  const anomali: string[] = [];
  const batasMaksimal = input.batasMaksimalJamLembur ?? BATAS_DEFAULT_JAM_LEMBUR_PER_BULAN;

  if (input.totalJamLembur < 0) {
    anomali.push("totalJamLembur tidak boleh negatif.");
  }
  if (input.totalJamLembur + (input.totalJamLemburHariLibur ?? 0) > batasMaksimal) {
    anomali.push(
      `Total jam lembur (${input.totalJamLembur + (input.totalJamLemburHariLibur ?? 0)}) melebihi batas maksimal (${batasMaksimal} jam/bulan) - kelebihan jam tidak dibayarkan, perlu verifikasi ke atasan langsung.`
    );
  }
  if ((input.totalJamLemburHariLibur ?? 0) < 0) {
    anomali.push("totalJamLemburHariLibur tidak boleh negatif.");
  }
  // WFH/WFA tidak dapat lembur - lihat catatan di kepala file. Klaim jam
  // lembur tanpa satu pun hari WFO berarti lemburnya diklaim dari hari
  // WFH/WFA, yang memang tidak diakui.
  if (input.jumlahHariWfo !== undefined && input.jumlahHariWfo === 0 && input.totalJamLembur + (input.totalJamLemburHariLibur ?? 0) > 0) {
    anomali.push(
      "Ada klaim jam lembur padahal pegawai ini tidak punya hari WFO sama sekali pada periode ini - lembur dari hari WFH/WFA tidak diakui. Periksa ulang rekapnya."
    );
  }
  if (input.tarifPerJam <= 0) {
    anomali.push("tarifPerJam harus lebih besar dari 0.");
  }

  const jamHariLiburMentah = Math.max(0, input.totalJamLemburHariLibur ?? 0);
  const jamHariKerjaMentah = Math.max(0, input.totalJamLembur);

  // Sisa menit yang tidak genap satu jam dipangkas DULU, sebelum batas
  // maksimal diterapkan - jam yang memang tidak dibayar tidak sepantasnya
  // ikut menghabiskan kuota 40 jam.
  const jamHariLiburPenuh = bulatkanKeJamPenuh(jamHariLiburMentah);
  const jamHariKerjaPenuh = bulatkanKeJamPenuh(jamHariKerjaMentah);

  // Batas maksimal berlaku ke TOTAL jam (kerja + libur). Jam hari libur
  // diprioritaskan tidak dipotong karena tarifnya lebih tinggi - kalau
  // sampai kena batas, yang dikurangi jam hari kerjanya dulu.
  const jamLemburHariLibur = Math.min(jamHariLiburPenuh, batasMaksimal);
  const jamLemburHariKerja = Math.max(0, Math.min(jamHariKerjaPenuh, batasMaksimal - jamLemburHariLibur));
  const jamLemburDihitung = jamLemburHariKerja + jamLemburHariLibur;

  // --- Komponen 1: uang lembur (per JAM), hari libur dikali pengali ---
  const uangLembur =
    jamLemburHariKerja * input.tarifPerJam +
    jamLemburHariLibur * input.tarifPerJam * PENGALI_LEMBUR_HARI_LIBUR;

  // --- Komponen 2: uang makan lembur (per HARI, syarat >= 2 jam berturut-turut) ---
  const hariMakanKerja = Math.max(0, input.jumlahHariMakanLembur ?? 0);
  const hariMakanLibur = Math.max(0, input.jumlahHariMakanLemburHariLibur ?? 0);
  const hariMakanLembur = hariMakanKerja + hariMakanLibur;
  const tarifMakanLembur = input.tarifMakanLemburPerHari ?? 0;

  if (hariMakanLembur > 0 && tarifMakanLembur <= 0) {
    anomali.push(
      "Ada hari yang berhak uang makan lembur tapi tarif uang makan lemburnya belum diisi - uang makan lembur dihitung 0."
    );
  }
  // Penjagaan konsistensi: n hari yang masing-masing >= 2 jam berarti total
  // jamnya minimal 2n. Kalau kurang, salah satu datanya keliru.
  const totalJamMentah = jamHariKerjaMentah + jamHariLiburMentah;
  if (hariMakanLembur * MINIMAL_JAM_LEMBUR_DAPAT_MAKAN > totalJamMentah) {
    anomali.push(
      `Jumlah hari berhak uang makan lembur (${hariMakanLembur} hari) tidak konsisten dengan total jam lembur (${totalJamMentah} jam) - ${hariMakanLembur} hari x minimal ${MINIMAL_JAM_LEMBUR_DAPAT_MAKAN} jam seharusnya minimal ${hariMakanLembur * MINIMAL_JAM_LEMBUR_DAPAT_MAKAN} jam.`
    );
  }

  const uangMakanLembur =
    hariMakanKerja * tarifMakanLembur +
    hariMakanLibur * tarifMakanLembur * PENGALI_MAKAN_LEMBUR_HARI_LIBUR;

  return {
    pegawaiId: input.pegawaiId,
    periodeBulan: input.periodeBulan,
    periodeTahun: input.periodeTahun,
    jamLemburDihitung,
    jamLemburHariKerja,
    jamLemburHariLibur,
    jumlahHariMakanLembur: hariMakanLembur,
    uangLembur,
    uangMakanLembur,
    totalUangLembur: uangLembur + uangMakanLembur,
    anomali,
  };
}
