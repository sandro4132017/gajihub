import {
  RiAwardLine,
  RiCalculatorLine,
  RiCalendarCheckLine,
  RiQuillPenLine,
  RiSendPlaneLine,
} from "react-icons/ri";
import type { IconType } from "react-icons";
import type { KodeLangkah } from "../../business-logic/langkahTutupBulan";

/** Ikon tiap langkah - SATU peta untuk stepper & kartu sambutan, sama dengan sidebar. */
export const IKON_LANGKAH: Record<KodeLangkah, IconType> = {
  PRESENSI: RiCalendarCheckLine,
  PREDIKAT: RiAwardLine,
  HITUNG: RiCalculatorLine,
  PERIKSA: RiQuillPenLine,
  KIRIM: RiSendPlaneLine,
};

/**
 * Tujuan tiap langkah tutup bulan. Dipakai dua tempat (tombol utama di kartu
 * sambutan dan baris di stepper) supaya keduanya tidak pernah menunjuk halaman
 * yang berbeda untuk langkah yang sama.
 *
 * PERIKSA (kini: tanda tangan SPTJM) menuju Tahap 3 halaman kalkulasi;
 * KIRIM ke panel `#kirim`.
 */
export function qPeriodeUnit(bulan: number, tahun: number, satker: string): string {
  return `bulan=${bulan}&tahun=${tahun}&satker=${encodeURIComponent(satker)}`;
}

export function tautanLangkah(kode: KodeLangkah, q: string): string {
  switch (kode) {
    case "PRESENSI":
      return `/tukin/presensi?${q}`;
    case "PREDIKAT":
      return `/tukin/predikat-kinerja?${q}`;
    case "HITUNG":
      return `/kasubag/kalkulasi?${q}`;
    case "PERIKSA":
      return `/kasubag/kalkulasi?${q}#tahap-3`;
    case "KIRIM":
      return `/kasubag/kalkulasi?${q}#kirim`;
  }
}

/** Label tombol utama menurut langkah yang sedang AKTIF. */
export const LABEL_TOMBOL_LANGKAH: Record<KodeLangkah, string> = {
  PRESENSI: "Tarik presensi",
  PREDIKAT: "Lengkapi predikat",
  HITUNG: "Hitung unit",
  PERIKSA: "Tanda tangani SPTJM",
  KIRIM: "Kirim rekap",
};
