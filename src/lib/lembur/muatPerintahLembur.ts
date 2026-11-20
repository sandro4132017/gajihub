// Pemuat perintah lembur (SPKL) dari database Gajihub. Bagian murninya di
// perintahPeriode.ts. Hanya membaca database Gajihub - tidak menyentuh SIAP
// maupun e-Presensi.

import type { Prisma, PrismaClient } from "@prisma/client";
import { SPKL_AKTIF, spklAktifUntuk } from "./gerbangSpkl";
import {
  isoDariTanggalUtc,
  kelompokkanPerintah,
  perintahUntukPegawai,
  spklBerlakuDiPeriode,
  type PerintahLemburPegawai,
} from "./perintahPeriode";

export interface PerintahLemburPeriode {
  /** Jumlah pegawai yang tunduk pada SPKL di periode ini. */
  jumlahPegawai: number;
  /** Jumlah perintah TERKIRIM yang dimuat. */
  jumlahPerintah: number;
  /** null = SPKL tidak berlaku untuk NIP itu di periode ini. */
  untukNip: (nip: string) => PerintahLemburPegawai | null;
  untukPegawaiId: (pegawaiId: string) => PerintahLemburPegawai | null;
}

const KOSONG: PerintahLemburPeriode = {
  jumlahPegawai: 0,
  jumlahPerintah: 0,
  untukNip: () => null,
  untukPegawaiId: () => null,
};

/**
 * Muat perintah lembur TERKIRIM satu periode - SATU query perintah per periode
 * (ditambah satu query daftar pegawai satker pilot), bukan per pegawai.
 * Periode yang sama sekali di luar gerbang tidak memicu query apa pun.
 */
export async function muatPerintahLemburPeriode(
  prisma: PrismaClient,
  bulan: number,
  tahun: number
): Promise<PerintahLemburPeriode> {
  const satkerAktif = SPKL_AKTIF.map((a) => a.satuanKerja).filter((s) => spklBerlakuDiPeriode(s, bulan, tahun));
  if (satkerAktif.length === 0) return KOSONG;

  const awal = new Date(Date.UTC(tahun, bulan - 1, 1));
  const akhir = new Date(Date.UTC(tahun, bulan, 1));

  // `contains`, bukan kesamaan persis: gerbang (spklAktifUntuk) memakai trim(),
  // jadi nama satker yang berspasi di tepi di database harus ikut terambil.
  // Penyaringan persisnya dilakukan di kode lewat gerbang yang sama.
  const kandidat = await prisma.pegawai.findMany({
    where: { OR: satkerAktif.map((s) => ({ satuanKerja: { contains: s } })) },
    select: { id: true, nip: true, satuanKerja: true },
  });
  const pegawai = kandidat.filter((p) => spklBerlakuDiPeriode(p.satuanKerja, bulan, tahun));
  if (pegawai.length === 0) return KOSONG;

  // Perintah dipersempit ke pegawai pilot saja - tetap SATU query.
  const anggota = await prisma.perintahLemburAnggota.findMany({
    where: {
      pegawaiId: { in: pegawai.map((p) => p.id) },
      terkirim: true,
      tanggal: { gte: awal, lt: akhir },
      perintahLembur: { status: "TERKIRIM" },
    },
    select: { pegawaiId: true, tanggal: true, jamDiperintahkan: true },
  });

  const perPegawai = kelompokkanPerintah(
    anggota.map((a) => ({
      pegawaiId: a.pegawaiId,
      tanggalIso: isoDariTanggalUtc(a.tanggal),
      jamDiperintahkan: a.jamDiperintahkan,
    }))
  );

  const perId = new Map<string, PerintahLemburPegawai>();
  const perNip = new Map<string, PerintahLemburPegawai>();
  let jumlahPerintah = 0;
  for (const p of pegawai) {
    const hasil = perintahUntukPegawai(p.satuanKerja, perPegawai.get(p.id), bulan, tahun);
    if (!hasil) continue;
    perId.set(p.id, hasil);
    perNip.set(p.nip, hasil);
    jumlahPerintah += hasil.perintah.size;
  }

  return {
    jumlahPegawai: perId.size,
    jumlahPerintah,
    untukNip: (nip) => perNip.get(nip) ?? null,
    untukPegawaiId: (id) => perId.get(id) ?? null,
  };
}

type DbPerintah = Pick<PrismaClient, "perintahLemburAnggota"> | Pick<Prisma.TransactionClient, "perintahLemburAnggota">;

/**
 * Perintah TERKIRIM satu pegawai untuk SATU tanggal. `berlaku:false` = SPKL
 * tidak berlaku (satker/tanggal di luar gerbang) dan TIDAK ada query.
 * `jamDiperintahkan` null = SPKL berlaku tapi tanpa perintah (dibayar 0).
 */
export async function muatPerintahHari(
  db: DbPerintah,
  pegawai: { id: string; satuanKerja: string | null },
  tanggalIso: string
): Promise<{ berlaku: false } | { berlaku: true; jamDiperintahkan: number | null }> {
  if (!spklAktifUntuk(pegawai.satuanKerja, tanggalIso)) return { berlaku: false };
  const [y, m, d] = tanggalIso.split("-").map(Number);
  const baris = await db.perintahLemburAnggota.findFirst({
    where: {
      pegawaiId: pegawai.id,
      tanggal: new Date(Date.UTC(y, m - 1, d)),
      terkirim: true,
      perintahLembur: { status: "TERKIRIM" },
    },
    select: { jamDiperintahkan: true },
  });
  return { berlaku: true, jamDiperintahkan: baris?.jamDiperintahkan ?? null };
}

/**
 * Perintah TERKIRIM satu pegawai untuk satu periode (tampilan & sinkronisasi
 * ulang rekap); null = SPKL tidak berlaku, tanpa query.
 */
export async function muatPerintahPegawaiPeriode(
  db: DbPerintah,
  pegawai: { id: string; satuanKerja: string | null },
  bulan: number,
  tahun: number
): Promise<PerintahLemburPegawai | null> {
  if (!spklBerlakuDiPeriode(pegawai.satuanKerja, bulan, tahun)) return null;
  const baris = await db.perintahLemburAnggota.findMany({
    where: {
      pegawaiId: pegawai.id,
      terkirim: true,
      tanggal: { gte: new Date(Date.UTC(tahun, bulan - 1, 1)), lt: new Date(Date.UTC(tahun, bulan, 1)) },
      perintahLembur: { status: "TERKIRIM" },
    },
    select: { tanggal: true, jamDiperintahkan: true },
  });
  const peta = kelompokkanPerintah(
    baris.map((b) => ({
      pegawaiId: pegawai.id,
      tanggalIso: isoDariTanggalUtc(b.tanggal),
      jamDiperintahkan: b.jamDiperintahkan,
    }))
  );
  return perintahUntukPegawai(pegawai.satuanKerja, peta.get(pegawai.id), bulan, tahun);
}
