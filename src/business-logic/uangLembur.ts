// ============================================================================
// UANG LEMBUR CALCULATION
//
// DUA komponen terpisah (SBM 2026 hal. -13-), dan satuannya BEDA:
//   1. Uang lembur       - item 23.1, per JAM
//   2. Uang makan lembur - item 23.2, per HARI
// Karena itu total jam sebulan TIDAK CUKUP untuk menghitung uang makan
// lembur - harus tahu berapa HARI yang memenuhi syarat.
//
// SYARAT UANG MAKAN LEMBUR (SBM 2026 hal. -51-, penjelasan item 23.2):
//   "...setelah bekerja lembur paling kurang 2 (dua) jam SECARA BERTURUT-TURUT
//    dan diberikan paling banyak 1 (satu) kali per hari."
// "Berturut-turut" berarti lembur 1 jam pagi + 1 jam sore TIDAK memenuhi
// syarat walau totalnya 2 jam. Engine ini tidak bisa memastikannya sendiri
// (inputnya sudah berupa jumlah hari yang memenuhi syarat) - yang menentukan
// pengisi rekap, dan itu ditegaskan di template & halaman uploadnya.
//
// LEMBUR HARI LIBUR: tarif per jam dikali PENGALI_LEMBUR_HARI_LIBUR.
//
// LEMBUR HARI KERJA HANYA UNTUK HARI BERSTATUS WFO (aturan user 2026-09-02).
// WFH/WFA, cuti, diklat, dinas luar, tugas belajar, sakit, dan izin semuanya
// TIDAK berhak. Penyaringan sesungguhnya terjadi PER HARI di
// presensiPdfKeRekap.ts - jam lembur pada hari yang bukan WFO tidak pernah
// sampai ke sini. Yang bisa dicek di modul ini cuma silang tingkat bulan:
// ada klaim jam lembur padahal hari WFO sebulan itu nol.
//
// Syarat WFO TIDAK berlaku di hari libur - lihat alasan lengkapnya di
// presensiPdfKeRekap.ts blok "4. Lembur".
//
// Tarif tidak dihardcode di sini - lihat src/business-logic/tarifSbm.ts.
//
// TODO(confirm):
// - Batas 40 jam/bulan TIDAK disebut di SBM - asumsi lama, belum dikonfirmasi
//   ke Biro Keuangan/DJA.
// - Pengali hari libur (2x) BELUM punya rujukan pasal - kata "libur" tidak
//   muncul sama sekali di SBM 2026. Lihat tarifSbm.ts.
// - Apakah uang MAKAN lembur ikut naik di hari libur belum ditegaskan;
//   sekarang tidak (PENGALI_MAKAN_LEMBUR_HARI_LIBUR = 1).
// ============================================================================

import type { UangLemburInput, UangLemburResult } from "../types/index";
import {
  PENGALI_LEMBUR_HARI_LIBUR,
  PENGALI_LEMBUR_JAM_BERIKUTNYA,
  PENGALI_LEMBUR_JAM_PERTAMA,
  PENGALI_MAKAN_LEMBUR_HARI_LIBUR,
} from "./tarifSbm";

/**
 * TIDAK ADA PLAFON BULANAN BAWAAN (keputusan user 2026-09-21).
 *
 * Dulu 40 jam/bulan. Dicabut bersama batas harian & mingguan begitu terbukti
 * SBM tidak mengatur batas jam lembur sama sekali - lihat catatan panjang di
 * presensiPdfKeRekap.ts. Memotong tanpa dasar tertulis berarti mengurangi
 * pembayaran atas nama aturan yang tidak ada.
 *
 * `batasMaksimalJamLembur` di input TETAP ADA dan masih memotong kalau diisi.
 * Jalur itu dipakai job lama dan akan berguna kalau suatu saat plafon benar-
 * benar ditetapkan. Yang berubah: tidak ada plafon kalau tidak diminta.
 */
const MINIMAL_JAM_LEMBUR_DAPAT_MAKAN = 2; // SBM hal. -51-, penjelasan item 23.2

/**
 * Uang lembur dibayar per JAM PENUH - sisa menit yang tidak genap satu jam
 * TIDAK dibayar (aturan user 2026-08-06). Lembur 1 jam 59 menit dibayar 1 jam,
 * bukan 2 jam dan bukan 1,98 jam.
 *
 * METODE A - PEMANGKASANNYA PER HARI, DAN TERJADI DI HULU.
 * Keputusan user 2026-09-18. `presensiPdfKeRekap.ts` memangkas sisa menit di
 * hari itu juga, jadi total sebulan yang sampai ke sini sudah berupa jumlahan
 * jam penuh. Bedanya bukan soal rapi-rapian: lembur 1j59m pada dua hari
 * berbeda jadi 1 + 1 = 2 jam, bukan floor(3,97) = 3 jam. Terukur ke Juli 2026
 * pada jalur akhir pekan: 3.379,5 jam mentah -> 3.249 jam kalau dipangkas per
 * bulan, 3.197 jam per hari. Selisih 52 jam.
 *
 * `bulatkanKeJamPenuh` di bawah SEKARANG JARING PENGAMAN, bukan tempat
 * pemangkasan utama - atas jumlahan bilangan bulat ia tidak mengubah apa pun.
 * Yang masih dijaganya: rekap yang diisi manual lewat template Excel, yang
 * angkanya bergantung pengisinya dan bisa datang berkoma.
 *
 * JANGAN memindahkannya kembali ke pemangkasan bulanan tanpa mengubah hulunya
 * juga - dua tempat memangkas dengan cara berbeda tidak pernah menghasilkan
 * angka yang sama, dan selisihnya rupiah.
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
  const batasMaksimal = input.batasMaksimalJamLembur ?? Number.POSITIVE_INFINITY;

  if (input.totalJamLembur < 0) {
    anomali.push("Total jam lembur hari kerja tidak boleh bernilai negatif.");
  }
  const totalJamMentahSemua = input.totalJamLembur + (input.totalJamLemburHariLibur ?? 0);
  if (totalJamMentahSemua > batasMaksimal) {
    anomali.push(
      `Total jam lembur ${input.totalJamLembur + (input.totalJamLemburHariLibur ?? 0)} jam melebihi batas maksimal ${batasMaksimal} jam per bulan\u2014kelebihannya tidak dibayarkan. Perlu verifikasi ke atasan langsung.`
    );
  }
  if ((input.totalJamLemburHariLibur ?? 0) < 0) {
    anomali.push("Total jam lembur hari libur tidak boleh bernilai negatif.");
  }
  // Silang tingkat bulan - lihat catatan di kepala file. Klaim lembur HARI
  // KERJA tanpa satu pun hari WFO berarti lemburnya diklaim dari hari yang
  // tidak berhak. Sengaja hanya menguji `totalJamLembur` (hari kerja):
  // lembur HARI LIBUR memang tidak mensyaratkan WFO, jadi memasukkannya ke
  // sini akan menuduh anomali pada pegawai yang cuma lembur di akhir pekan.
  if (input.jumlahHariWfo !== undefined && input.jumlahHariWfo === 0 && input.totalJamLembur > 0) {
    anomali.push(
      "Ada klaim jam lembur hari kerja padahal pegawai ini sama sekali tidak punya hari WFO pada periode ini. Lembur hari kerja hanya untuk pegawai yang WFO\u2014periksa ulang rekapnya."
    );
  }
  if (input.tarifPerJam <= 0) {
    anomali.push("Tarif lembur per jam belum diisi atau tidak lebih besar dari nol.");
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
  // HARI KERJA: jam pertama tiap hari 1,5x, jam berikutnya 2x. Dijumlah
  // sebulan bentuknya tarif x (2J - 0,5D) - J total jam, D jumlah hari lembur.
  //
  // Turunannya: tiap hari menyumbang 1,5 + 2(jam_hari - 1) = 2 x jam_hari -
  // 0,5. Dijumlah D hari jadi 2J - 0,5D. Bentuk ini dipakai supaya rincian
  // harian tidak perlu ikut masuk ke mesin ini.
  //
  // TANPA D TIDAK MENEBAK. Rekap yang datang dari template Excel cuma membawa
  // total jam; memakai D = 1 akan memberi satu potongan setengah tarif untuk
  // sebulan penuh (membayar lebih), memakai D = J akan menganggap tiap hari
  // cuma satu jam (membayar kurang). Dua-duanya salah diam-diam, jadi yang
  // dilakukan: bayar 1x tarif SBM polos dan katakan alasannya.
  const hariLemburKerja = input.jumlahHariLemburHariKerja;
  const pengaliDiketahui = hariLemburKerja !== undefined && hariLemburKerja > 0;
  if (jamLemburHariKerja > 0 && !pengaliDiketahui) {
    anomali.push(
      "Jumlah HARI lembur hari kerja belum tersimpan di sistem, jadi pengali jam pertama (1,5x) tidak bisa diterapkan—jam lembur hari kerja dibayar 1x tarif SBM, LEBIH RENDAH dari semestinya. Angka ini belum final; laporkan ke pengelola aplikasi."
    );
  }
  const uangLemburHariKerja = pengaliDiketahui
    ? input.tarifPerJam *
      (PENGALI_LEMBUR_JAM_BERIKUTNYA * jamLemburHariKerja -
        (PENGALI_LEMBUR_JAM_BERIKUTNYA - PENGALI_LEMBUR_JAM_PERTAMA) *
          Math.min(hariLemburKerja!, jamLemburHariKerja))
    : jamLemburHariKerja * input.tarifPerJam;

  const uangLembur =
    uangLemburHariKerja + jamLemburHariLibur * input.tarifPerJam * PENGALI_LEMBUR_HARI_LIBUR;

  // --- Komponen 2: uang makan lembur (per HARI, syarat >= 2 jam berturut-turut) ---
  const hariMakanKerja = Math.max(0, input.jumlahHariMakanLembur ?? 0);
  const hariMakanLibur = Math.max(0, input.jumlahHariMakanLemburHariLibur ?? 0);
  const hariMakanLembur = hariMakanKerja + hariMakanLibur;
  const tarifMakanLembur = input.tarifMakanLemburPerHari ?? 0;

  if (hariMakanLembur > 0 && tarifMakanLembur <= 0) {
    anomali.push(
      "Ada hari yang berhak uang makan lembur, tetapi tarif uang makan lemburnya belum diisi\u2014uang makan lemburnya dihitung nol."
    );
  }
  // Penjagaan konsistensi: n hari yang masing-masing >= 2 jam berarti total
  // jamnya minimal 2n. Kalau kurang, salah satu datanya keliru.
  const totalJamMentah = jamHariKerjaMentah + jamHariLiburMentah;
  if (hariMakanLembur * MINIMAL_JAM_LEMBUR_DAPAT_MAKAN > totalJamMentah) {
    anomali.push(
      `Jumlah hari yang berhak uang makan lembur (${hariMakanLembur} hari) tidak konsisten dengan total jam lemburnya (${totalJamMentah} jam): ${hariMakanLembur} hari dikali minimal ${MINIMAL_JAM_LEMBUR_DAPAT_MAKAN} jam seharusnya paling sedikit ${hariMakanLembur * MINIMAL_JAM_LEMBUR_DAPAT_MAKAN} jam.`
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
