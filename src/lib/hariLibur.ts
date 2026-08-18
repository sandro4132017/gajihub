// ============================================================================
// JEMBATAN KALENDER HARI LIBUR NASIONAL -> MESIN REKAP
//
// Dipakai BARENG oleh tombol sinkronisasi UI, CLI importPresensiEpresensi,
// dan jalur upload PDF - supaya ketiganya tidak bisa memakai daftar tanggal
// libur yang berbeda. Pola yang sama dengan src/lib/kendalaPresensi.ts.
//
// Mesin rekapnya sendiri (presensiPdfKeRekap.ts) tetap PURE: daftar tanggal
// masuk lewat parameter, tidak ada query di dalamnya.
// ============================================================================

import { prisma } from "./prisma";

/**
 * Tanggal merah & cuti bersama dalam satu periode, ISO "YYYY-MM-DD" ->
 * keterangannya (yang ikut tampil di catatan hasil rekap).
 *
 * Rentangnya SATU BULAN saja - baris di luar periode tidak ditarik, karena
 * pemanggilnya memang cuma menghitung satu periode.
 */
export async function muatHariLiburPeriode(
  bulan: number,
  tahun: number
): Promise<Map<string, string>> {
  const baris = await prisma.hariLiburNasional.findMany({
    where: {
      tanggal: {
        gte: new Date(Date.UTC(tahun, bulan - 1, 1)),
        lt: new Date(Date.UTC(tahun, bulan, 1)),
      },
    },
    select: { tanggal: true, keterangan: true, cutiBersama: true },
    orderBy: { tanggal: "asc" },
  });

  return new Map(
    baris.map((b) => [
      b.tanggal.toISOString().slice(0, 10),
      b.cutiBersama ? `${b.keterangan} (cuti bersama)` : b.keterangan,
    ])
  );
}
