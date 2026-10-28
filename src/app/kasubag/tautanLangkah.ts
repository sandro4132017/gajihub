import {
  RiAwardLine,
  RiCalculatorLine,
  RiCalendarCheckLine,
  RiCheckboxMultipleLine,
  RiSendPlaneLine,
} from "react-icons/ri";
import type { IconType } from "react-icons";
import type { KodeLangkah } from "../../business-logic/langkahTutupBulan";

/** Ikon tiap langkah - SATU peta untuk stepper & kartu sambutan, sama dengan sidebar. */
export const IKON_LANGKAH: Record<KodeLangkah, IconType> = {
  PRESENSI: RiCalendarCheckLine,
  PREDIKAT: RiAwardLine,
  HITUNG: RiCalculatorLine,
  PERIKSA: RiCheckboxMultipleLine,
  KIRIM: RiSendPlaneLine,
};

/**
 * Tujuan tiap langkah tutup bulan. Dipakai dua tempat (tombol utama di kartu
 * sambutan dan baris di stepper) supaya keduanya tidak pernah menunjuk halaman
 * yang berbeda untuk langkah yang sama.
 *
 * PERIKSA dan KIRIM sama-sama bermuara di panel `#kirim` pada halaman
 * kalkulasi: centang tabel dan tombol Kirim hidup di panel itu.
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
    case "KIRIM":
      return `/kasubag/kalkulasi?${q}#kirim`;
  }
}

/** Label tombol utama menurut langkah yang sedang AKTIF. */
export const LABEL_TOMBOL_LANGKAH: Record<KodeLangkah, string> = {
  PRESENSI: "Tarik presensi",
  PREDIKAT: "Lengkapi predikat",
  HITUNG: "Hitung unit",
  PERIKSA: "Periksa tabel",
  KIRIM: "Kirim rekap",
};
