import { prisma } from "../lib/prisma";
import { pegawaiBukanUji } from "../lib/dataUji";

/**
 * Periode default halaman - dipakai kalau user membuka halaman TANPA ?bulan=&tahun=.
 *
 * BAWAANNYA BULAN BERJALAN (keputusan user 2026-11-25: filter harus "real
 * time"). Menggantikan aturan 2026-08-18 yang memilih periode terbaru yang
 * datanya ada DAN bulannya sudah lewat.
 *
 * Konsekuensi yang diterima: (1) angka bulan berjalan belum final - presensi
 * baru terisi sampai hari ini, jadi potongan, hari uang makan, dan jam lembur
 * masih bisa berubah sampai bulannya tutup; (2) halaman yang datanya terbit
 * belakangan (predikat kinerja, rekap terkirim untuk ADK) bisa terbuka kosong
 * di awal bulan. Bulan lain tetap dibuka lewat filter.
 *
 * Aturannya bergerak sendiri mengikuti jam server. TIDAK ADA bulan yang
 * di-hardcode di sini.
 */
export type Periode = { bulan: number; tahun: number };

/**
 * PURE. `tersedia` boleh tidak urut - urutannya ditentukan di sini, bukan oleh
 * pemanggil, supaya dua pemanggil tidak bisa memberi jawaban berbeda untuk data
 * yang sama.
 */
export function pilihPeriodeDefault(
  // Dipertahankan supaya pemanggil tidak berubah; tidak lagi menentukan hasil.
  _tersedia: Periode[],
  sekarang: Periode
): Periode {
  return sekarang;
}

/** Periode berjalan menurut jam server. Dipisah supaya gampang di-stub di test. */
export function periodeSekarang(waktu = new Date()): Periode {
  return { bulan: waktu.getMonth() + 1, tahun: waktu.getFullYear() };
}

/**
 * Resolusi periode dari query string + data yang benar-benar ada.
 *
 * Angka dari query string dipakai APA ADANYA kalau waras (bulan 1-12, tahun 4
 * digit) - user yang sudah memilih periode tidak boleh dipindahkan diam-diam,
 * termasuk ke periode kosong: kalau dia membuka Agustus dan Agustus memang
 * kosong, itu jawaban yang benar.
 */
export function resolvePeriode(
  bulan: string | undefined,
  tahun: string | undefined,
  tersedia: Periode[],
  waktu = new Date()
): Periode {
  const b = Number(bulan);
  const t = Number(tahun);
  const bulanSah = Number.isInteger(b) && b >= 1 && b <= 12;
  const tahunSah = Number.isInteger(t) && t >= 1000 && t <= 9999;
  if (bulanSah && tahunSah) return { bulan: b, tahun: t };

  const nowP = periodeSekarang(waktu);
  const dipilih = pilihPeriodeDefault(tersedia, nowP);
  // Salah satu terisi, satunya tidak: yang terisi tetap menang, sisanya diambil
  // dari periode default. Kalau tidak, ?bulan=7 tanpa tahun akan diam-diam
  // berpindah bulan juga.
  return {
    bulan: bulanSah ? b : dipilih.bulan,
    tahun: tahunSah ? t : dipilih.tahun,
  };
}

// --- Pengambil daftar periode per jenis data (I/O, bukan pure) ---
//
// Masing-masing halaman bertanya ke tabel yang memang jadi isi halaman itu.
// Sengaja TIDAK disatukan jadi satu "periode terbaru" global: /tukin/presensi
// punya data untuk 8 periode sementara kalkulasi cuma 2, dan memakai angka yang
// sama untuk keduanya akan memindahkan salah satunya ke periode kosong.

/** Periode yang punya rekap presensi (opsional: cuma untuk satu satuan kerja). */
export async function periodePunyaRekapPresensi(satuanKerja?: string): Promise<Periode[]> {
  const rows = await prisma.rekapPresensiPeriode.findMany({
    distinct: ["periodeBulan", "periodeTahun"],
    select: { periodeBulan: true, periodeTahun: true },
    where: { pegawai: satuanKerja ? { satuanKerja, ...pegawaiBukanUji(satuanKerja) } : pegawaiBukanUji() },
  });
  return rows.map((r) => ({ bulan: r.periodeBulan, tahun: r.periodeTahun }));
}

/** Periode yang punya rincian presensi HARIAN untuk satu pegawai. */
export async function periodePunyaPresensiHarian(pegawaiId: string): Promise<Periode[]> {
  const rows = await prisma.$queryRaw<{ bulan: number; tahun: number }[]>`
    SELECT DISTINCT EXTRACT(MONTH FROM tanggal)::int AS bulan,
                    EXTRACT(YEAR  FROM tanggal)::int AS tahun
      FROM presensi_harian
     WHERE pegawai_id = ${pegawaiId}`;
  return rows.map((r) => ({ bulan: Number(r.bulan), tahun: Number(r.tahun) }));
}

/**
 * Periode yang punya predikat kinerja - dipakai halaman Kalkulasi Unit.
 *
 * KENAPA PREDIKAT, BUKAN KALKULASI: kalkulasi adalah HASIL halaman itu, jadi
 * memakainya sebagai penentu default membuat periode yang belum pernah dihitung
 * tidak akan pernah terbuka - persis periode yang paling perlu dibuka.
 * Predikat kinerja adalah komponen yang paling terakhir tersedia (presensi ada
 * untuk semua bulan), jadi periode terbaru yang punya predikat adalah periode
 * terbaru yang benar-benar bisa dihitung.
 */
export async function periodePunyaPredikatKinerja(satuanKerja?: string): Promise<Periode[]> {
  const rows = await prisma.predikatKinerja.findMany({
    distinct: ["periodeBulan", "periodeTahun"],
    select: { periodeBulan: true, periodeTahun: true },
    where: { pegawai: satuanKerja ? { satuanKerja, ...pegawaiBukanUji(satuanKerja) } : pegawaiBukanUji() },
  });
  return rows.map((r) => ({ bulan: r.periodeBulan, tahun: r.periodeTahun }));
}

/**
 * Periode yang punya kalkulasi Uang Lembur - dipakai halaman /uang-lembur.
 *
 * Bertanya ke tabel `uangLembur` sendiri, BUKAN menumpang `periodePunyaTukin`:
 * lembur dihitung dari rekap presensi yang sama, tapi barisnya cuma terbit
 * untuk pegawai yang memang punya jam lembur - jadi daftar periodenya bisa
 * lebih pendek, dan memakai daftar Tukin akan mendaratkan halaman ini di
 * periode yang belum punya satu baris lembur pun.
 */
export async function periodePunyaUangLembur(): Promise<Periode[]> {
  const rows = await prisma.uangLembur.findMany({
    distinct: ["periodeBulan", "periodeTahun"],
    select: { periodeBulan: true, periodeTahun: true },
    where: { pegawai: pegawaiBukanUji() },
  });
  return rows.map((r) => ({ bulan: r.periodeBulan, tahun: r.periodeTahun }));
}

/** Periode yang punya kalkulasi Uang Makan - dipakai halaman /uang-makan. */
export async function periodePunyaUangMakan(): Promise<Periode[]> {
  const rows = await prisma.uangMakan.findMany({
    distinct: ["periodeBulan", "periodeTahun"],
    select: { periodeBulan: true, periodeTahun: true },
    where: { pegawai: pegawaiBukanUji() },
  });
  return rows.map((r) => ({ bulan: r.periodeBulan, tahun: r.periodeTahun }));
}

/** Periode yang punya kalkulasi Tukin - dipakai halaman export ADK. */
export async function periodePunyaTukin(): Promise<Periode[]> {
  const rows = await prisma.tukinCalculation.findMany({
    distinct: ["periodeBulan", "periodeTahun"],
    select: { periodeBulan: true, periodeTahun: true },
    where: { pegawai: pegawaiBukanUji() },
  });
  return rows.map((r) => ({ bulan: r.periodeBulan, tahun: r.periodeTahun }));
}
