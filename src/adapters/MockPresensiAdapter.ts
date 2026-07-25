import type { PresensiAdapter } from "./DataSourceAdapter";
import type { RekapKehadiranPeriode } from "../types/index";

/**
 * Mock implementation - kehadiran sempurna secara default, kecuali NIP
 * yang sengaja di-seed dengan skenario tertentu untuk keperluan demo/testing
 * (misal skenario alpha, terlambat, cuti).
 */
export class MockPresensiAdapter implements PresensiAdapter {
  async getRekapKehadiranPeriode(
    nip: string,
    periodeBulan: number,
    periodeTahun: number
  ): Promise<RekapKehadiranPeriode> {
    // Skenario demo: NIP yang diakhiri "003" disimulasikan sering terlambat
    // dan lembur lebih banyak.
    if (nip.endsWith("003")) {
      return {
        pegawaiId: nip,
        periodeBulan,
        periodeTahun,
        jumlahHariAlpha: 0,
        jumlahTidakPresensi: 1,
        totalMenitTerlambat: 45,
        ikutUpacaraBendera: true,
        jumlahHariKerja: 22,
        jumlahHariHadir: 21,
        totalJamLembur: 12,
      };
    }

    return {
      pegawaiId: nip,
      periodeBulan,
      periodeTahun,
      jumlahHariAlpha: 0,
      jumlahTidakPresensi: 0,
      totalMenitTerlambat: 0,
      ikutUpacaraBendera: true,
      jumlahHariKerja: 22,
      jumlahHariHadir: 22,
      totalJamLembur: 6,
    };
  }
}
