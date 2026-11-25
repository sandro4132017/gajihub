import { prisma } from "./prisma";
import { muatHariLiburPeriode } from "./hariLibur";
import {
  jumlahTapTidakWajarDitagih,
  type HariTapTidakWajar,
} from "../business-logic/rincianJamKerjaHarian";

const menitDariWaktu = (w: Date | null) => (w === null ? null : w.getUTCHours() * 60 + w.getUTCMinutes());

/**
 * Jumlah hari tap tidak wajar yang ditagih, per pegawai satu unit. Masukannya
 * sama dengan halaman `/tukin/presensi/[nip]`: jam koreksi petugas menimpa jam
 * mesin, tanggal merah dari kalender libur, tanggal kendala e-Presensi batal.
 */
export async function hitungTapTidakWajarUnit(
  pegawaiIds: readonly string[],
  satuanKerja: string,
  bulan: number,
  tahun: number
): Promise<Map<string, number>> {
  const hasil = new Map<string, number>();
  if (pegawaiIds.length === 0) return hasil;
  const awal = new Date(Date.UTC(tahun, bulan - 1, 1));
  const akhir = new Date(Date.UTC(tahun, bulan, 1));
  const ids = [...pegawaiIds];

  const [harian, koreksi, kendala, hariLibur] = await Promise.all([
    prisma.presensiHarian.findMany({
      where: { pegawaiId: { in: ids }, tanggal: { gte: awal, lt: akhir } },
      select: { pegawaiId: true, tanggal: true, statusKehadiran: true, jamMasuk: true, jamKeluar: true },
    }),
    prisma.koreksiPresensiHarian.findMany({
      where: { pegawaiId: { in: ids }, tanggal: { gte: awal, lt: akhir } },
      select: { pegawaiId: true, tanggal: true, jamMasuk: true, jamKeluar: true },
    }),
    prisma.kendalaEpresensi.findMany({
      where: { tanggal: { gte: awal, lt: akhir }, OR: [{ satuanKerja: null }, { satuanKerja }] },
      select: { tanggal: true },
    }),
    muatHariLiburPeriode(bulan, tahun),
  ]);

  const tanggalKendala = new Set(kendala.map((k) => k.tanggal.toISOString().slice(0, 10)));
  const petaKoreksi = new Map(koreksi.map((k) => [`${k.pegawaiId}|${k.tanggal.toISOString().slice(0, 10)}`, k]));
  const perPegawai = new Map<string, HariTapTidakWajar[]>();
  for (const h of harian) {
    const iso = h.tanggal.toISOString().slice(0, 10);
    const k = petaKoreksi.get(`${h.pegawaiId}|${iso}`);
    const daftar = perPegawai.get(h.pegawaiId) ?? [];
    daftar.push({
      tanggalIso: iso,
      indeksHari: h.tanggal.getUTCDay(),
      statusKehadiran: h.statusKehadiran,
      hariLibur: hariLibur.has(iso),
      jamMasukMenit: menitDariWaktu(k?.jamMasuk ?? h.jamMasuk),
      jamKeluarMenit: menitDariWaktu(k?.jamKeluar ?? h.jamKeluar),
      masukDikoreksi: k?.jamMasuk != null,
      keluarDikoreksi: k?.jamKeluar != null,
      dikecualikanKendala: tanggalKendala.has(iso),
    });
    perPegawai.set(h.pegawaiId, daftar);
  }
  for (const [id, daftar] of perPegawai) hasil.set(id, jumlahTapTidakWajarDitagih(daftar));
  return hasil;
}
