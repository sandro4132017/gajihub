// ============================================================================
// Pemetaan hasil rekap presensi -> bentuk yang disimpan di database.
//
// Satu-satunya tempat pemetaan ini, dipakai jalur tarik langsung dari
// database e-Presensi (tombol di /tukin/presensi dan
// src/jobs/importPresensiEpresensi.ts). Jalur upload PDF yang dulu ikut
// memakainya sudah dicabut (keputusan user 2026-10-27).
//
// Kalau pemetaan ini disalin, cepat atau lambat salinannya berbeda - dan
// bedanya baru ketahuan setelah ada pegawai yang statusnya salah tercatat.
// PURE: tidak ada I/O di sini.
// ============================================================================

import type { KategoriHari } from "./presensiPdfKeRekap";

/**
 * KategoriHari (hasil analisis) -> nilai enum StatusKehadiran di schema.prisma.
 *
 * Perhatikan dua yang namanya BEDA dan itu disengaja:
 * - WFH_WFA -> "WFH": skema tidak memisahkan WFA, keduanya diperlakukan sama
 *   (tarif uang makannya juga sama - SBM 2026 item 22.1).
 * - TIDAK_HADIR -> "ALPHA": istilah skema untuk hari tanpa keterangan, yang
 *   kena potongan 3% per hari (Pasal 13 ayat (1)).
 */
export const STATUS_HARIAN: Record<KategoriHari, string> = {
  WFO: "WFO",
  WFH_WFA: "WFH",
  DINAS_LUAR: "DINAS_LUAR",
  DIKLAT: "DIKLAT",
  LEMBUR: "LEMBUR",
  UPACARA: "UPACARA",
  CUTI: "CUTI",
  IZIN: "IZIN",
  SAKIT: "SAKIT",
  TUGAS_BELAJAR: "TUGAS_BELAJAR",
  TIDAK_HADIR: "ALPHA",
  TIDAK_PRESENSI: "TIDAK_PRESENSI",
  TIDAK_DIKENALI: "TIDAK_DIKENALI",
};

/** Tanggal disimpan sebagai tengah malam UTC supaya tidak bergeser hari. */
export function tanggalUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function menitKeWaktu(iso: string, menit: number | null): Date | null {
  if (menit === null) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, Math.floor(menit / 60), menit % 60));
}
