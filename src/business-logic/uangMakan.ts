// ============================================================================
// UANG MAKAN CALCULATION
//
// Tarifnya TIDAK dihardcode di sini - diterima sebagai parameter, karena
// besarannya diatur Standar Biaya Masukan (SBM) yang terbit tiap tahun
// anggaran. Tabel tarif resminya ada di src/business-logic/tarifSbm.ts
// (SBM 2026 item 22.1: Gol I/II Rp 35.000, Gol III Rp 37.000, Gol IV
// Rp 41.000 per orang/hari).
//
// SIAPA YANG BERHAK (aturan dari user, ditegaskan 2026-07-29):
//   BERHAK      : hari kerja dengan status WFO, dan WFH/WFA
//   TIDAK BERHAK: Diklat, Dinas Keluar
// Jadi jumlah hari yang dibayar BUKAN "jumlah hari hadir" secara umum -
// pegawai yang seharian ikut diklat atau dinas luar tetap tercatat hadir,
// tapi uang makannya tidak dibayarkan (konsumsinya sudah ditanggung
// kegiatan/perjalanan dinas yang bersangkutan).
//
// TODO(confirm): status kehadiran lain yang belum ditegaskan perlakuannya -
// IZIN, SAKIT, CUTI, dan TUGAS BELAJAR. Semuanya saat ini TIDAK dihitung
// (karena bukan WFO/WFH/WFA), yang konsisten dengan prinsip "uang makan
// mengikuti kehadiran kerja", tapi belum ada penegasan tertulisnya.
// ============================================================================

import type { UangMakanInput, UangMakanResult } from "../types/index";

export function hitungUangMakan(input: UangMakanInput): UangMakanResult {
  const anomali: string[] = [];

  const { jumlahHariWfo, jumlahHariWfhWfa, jumlahHariKerja, tarifHarianUangMakan } = input;

  if (jumlahHariWfo < 0 || jumlahHariWfhWfa < 0) {
    anomali.push("Jumlah hari WFO/WFH/WFA tidak boleh negatif.");
  }
  if (tarifHarianUangMakan <= 0) {
    anomali.push("tarifHarianUangMakan harus lebih besar dari 0.");
  }

  const hariBerhak = Math.max(0, jumlahHariWfo) + Math.max(0, jumlahHariWfhWfa);

  if (hariBerhak > jumlahHariKerja) {
    anomali.push(
      `Hari berhak uang makan (${hariBerhak}) melebihi jumlah hari kerja (${jumlahHariKerja}) - kemungkinan data presensi tidak konsisten dengan kalender kerja.`
    );
  }

  // Di-clamp ke hari kerja: tidak mungkin dibayar lebih banyak dari hari
  // kerja yang tersedia dalam periode itu.
  const hariDibayar = Math.min(hariBerhak, Math.max(0, jumlahHariKerja));
  const totalUangMakan = hariDibayar * tarifHarianUangMakan;

  return {
    pegawaiId: input.pegawaiId,
    periodeBulan: input.periodeBulan,
    periodeTahun: input.periodeTahun,
    jumlahHariDibayar: hariDibayar,
    totalUangMakan,
    anomali,
  };
}
