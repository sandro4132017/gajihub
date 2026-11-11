// Pemeriksaan basis data yang dipakai kedua jalur koreksi jam presensi.

import { prisma } from "./prisma";
import { statusUnit } from "../business-logic/pengirimanUnit";
import { periodeDariTanggal } from "../business-logic/koreksiPresensi";

/**
 * Apakah rekap unit pada periode TANGGAL yang dikoreksi sudah terkirim
 * (terkunci). Periode diturunkan dari tanggal, bukan dari input form.
 */
export async function rekapUnitTerkunciUntukTanggal(satuanKerja: string, tanggal: Date): Promise<boolean> {
  const { bulan, tahun } = periodeDariTanggal(tanggal);
  const pengiriman = await prisma.pengirimanUnit.findUnique({
    where: { satuanKerja_periodeBulan_periodeTahun: { satuanKerja, periodeBulan: bulan, periodeTahun: tahun } },
  });
  return statusUnit(pengiriman).terkunci;
}
