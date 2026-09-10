import { prisma } from "../lib/prisma";
import { NAMA_BULAN } from "./bulan";
import type { BarisSumber } from "./SumberAcuan";

/**
 * Asal-usul tiap data yang dipakai menghitung, beserta KAPAN diambilnya.
 *
 * ADA UNTUK MENUTUP SATU SALAH SANGKA yang muncul di rapat: orang mengira
 * Gajihub membaca aplikasi lain secara langsung setiap kali halaman dibuka.
 * Yang sebenarnya terjadi - dan ini berlaku untuk SEMUA data di sini -
 * Gajihub menyimpan SALINAN yang diambil pada satu waktu tertentu, lalu
 * memakai salinan itu sampai ada penarikan berikutnya.
 *
 * Bedanya menentukan siapa yang harus bertindak. Kalau seseorang memperbaiki
 * jam presensinya di e-Presensi sore ini, angka di Gajihub TIDAK ikut berubah
 * sampai ada yang menarik ulang periode itu. Tanpa keterangan waktu di layar,
 * yang terjadi adalah orang menunggu sesuatu yang tidak akan datang sendiri.
 *
 * Cap waktunya diambil dari kolom yang MEMANG dicatat tiap kali data masuk -
 * bukan dari waktu halaman dibuka.
 */

export interface BarisSumberData {
  /** "Kehadiran", "Kinerja", "Data pegawai". */
  nama: string;
  /** Apa yang dicakup salinan ini, mis. "Agustus 2026". */
  cakupan: string;
  /** Sistem asalnya - SIAP, e-Presensi, e-Kinerja BKN. */
  sistemSumber: string;
  /** Bagaimana data itu sampai ke Gajihub. */
  caraMasuk: string;
  /** Kapan salinan ini diambil. null = belum ada sama sekali. */
  diambilPada: Date | null;
  jumlah: number;
  dari: number;
  href: string;
  labelAksi: string;
}

/**
 * Nilai `sourceSystem` apa adanya dari database -> cara masuknya.
 *
 * Dicocokkan dengan `startsWith`, bukan daftar tertutup: nilainya ditulis
 * bebas oleh masing-masing importer, dan nilai baru yang belum dikenal lebih
 * baik tampil apa adanya daripada membuat seluruh baris kosong.
 */
function caraMasukDari(sourceSystem: string): string {
  if (sourceSystem.startsWith("e-Presensi")) return "Ditarik dari database e-Presensi (baca saja)";
  if (sourceSystem.startsWith("SIAP")) return "Ditarik dari database SIAP (baca saja)";
  if (sourceSystem.startsWith("e-Kinerja")) return "Diunggah dari berkas Rekap Penilaian";
  if (sourceSystem.toLowerCase().includes("manual")) return "Diketik atau diunggah manual";
  if (sourceSystem.toLowerCase().includes("pdf")) return "Diunggah dari berkas PDF";
  return sourceSystem;
}

function sistemDari(sourceSystem: string): string {
  if (sourceSystem.startsWith("e-Presensi")) return "e-Presensi";
  if (sourceSystem.startsWith("SIAP")) return "SIAP";
  if (sourceSystem.startsWith("e-Kinerja")) return "e-Kinerja BKN";
  return sourceSystem;
}

/** Gabungkan beberapa asal jadi satu keterangan, terbanyak lebih dulu. */
function ringkasAsal(rows: { sourceSystem: string; jumlah: number }[]): { sistem: string; cara: string } {
  if (rows.length === 0) return { sistem: "-", cara: "belum ada data" };
  const urut = [...rows].sort((a, b) => b.jumlah - a.jumlah);
  const sistem = [...new Set(urut.map((r) => sistemDari(r.sourceSystem)))].join(" & ");
  const cara = [...new Set(urut.map((r) => caraMasukDari(r.sourceSystem)))].join(" & ");
  return { sistem, cara };
}

export async function ambilSumberData({
  satuanKerja,
  periodeBulan,
  periodeTahun,
}: {
  /** null = lintas satuan kerja (mis. dibuka PPABP/Admin tanpa filter unit). */
  satuanKerja: string | null;
  periodeBulan: number;
  periodeTahun: number;
}): Promise<BarisSumberData[]> {
  const filterPegawai = satuanKerja ? { satuanKerja, statusPegawai: "AKTIF" } : { statusPegawai: "AKTIF" };
  const periode = { periodeBulan, periodeTahun };
  const namaPeriode = `${NAMA_BULAN[periodeBulan - 1] ?? periodeBulan} ${periodeTahun}`;
  const qs = `?bulan=${periodeBulan}&tahun=${periodeTahun}${satuanKerja ? `&satker=${encodeURIComponent(satuanKerja)}` : ""}`;

  const [jumlahPegawai, presensi, predikat, pegawaiSumber, waktuPresensi, waktuPredikat, waktuPegawai] =
    await Promise.all([
      prisma.pegawai.count({ where: filterPegawai }),
      prisma.rekapPresensiPeriode.groupBy({
        by: ["sourceSystem"],
        where: { ...periode, pegawai: filterPegawai },
        _count: { _all: true },
      }),
      prisma.predikatKinerja.groupBy({
        by: ["sourceSystem"],
        where: { ...periode, pegawai: filterPegawai },
        _count: { _all: true },
      }),
      prisma.pegawai.groupBy({ by: ["sourceSystem"], where: filterPegawai, _count: { _all: true } }),
      // Cap waktu = yang PALING BARU. Satu periode bisa ditarik beberapa kali
      // (mis. setelah koreksi jam), dan yang ingin diketahui pembaca adalah
      // sejak kapan angka yang sedang dilihatnya berlaku.
      prisma.rekapPresensiPeriode.aggregate({
        where: { ...periode, pegawai: filterPegawai },
        _max: { diunggahPada: true },
      }),
      prisma.predikatKinerja.aggregate({
        where: { ...periode, pegawai: filterPegawai },
        _max: { sourceSyncedAt: true },
      }),
      prisma.pegawai.aggregate({ where: filterPegawai, _max: { sourceSyncedAt: true } }),
    ]);

  const cacah = (rows: { sourceSystem: string; _count: { _all: number } }[]) =>
    rows.map((r) => ({ sourceSystem: r.sourceSystem, jumlah: r._count._all }));

  const asalPresensi = ringkasAsal(cacah(presensi));
  const asalPredikat = ringkasAsal(cacah(predikat));
  const asalPegawai = ringkasAsal(cacah(pegawaiSumber));

  return [
    {
      nama: "Kehadiran",
      cakupan: namaPeriode,
      sistemSumber: asalPresensi.sistem,
      caraMasuk: asalPresensi.cara,
      diambilPada: waktuPresensi._max.diunggahPada,
      jumlah: cacah(presensi).reduce((a, r) => a + r.jumlah, 0),
      dari: jumlahPegawai,
      href: `/tukin/presensi${qs}`,
      labelAksi: "Kelola presensi",
    },
    {
      nama: "Kinerja",
      cakupan: namaPeriode,
      sistemSumber: asalPredikat.sistem,
      caraMasuk: asalPredikat.cara,
      diambilPada: waktuPredikat._max.sourceSyncedAt,
      jumlah: cacah(predikat).reduce((a, r) => a + r.jumlah, 0),
      dari: jumlahPegawai,
      href: `/tukin/predikat-kinerja${qs}`,
      labelAksi: "Kelola predikat kinerja",
    },
    {
      // TIDAK terikat periode - jabatan dan kelas jabatan berlaku sampai ada
      // SK berikutnya, bukan per bulan. Cakupannya ditulis begitu supaya tidak
      // terbaca seolah data pegawai punya versi per bulan.
      nama: "Data pegawai",
      cakupan: "Berlaku sampai sinkronisasi berikutnya",
      sistemSumber: asalPegawai.sistem,
      caraMasuk: asalPegawai.cara,
      diambilPada: waktuPegawai._max.sourceSyncedAt,
      jumlah: jumlahPegawai,
      dari: jumlahPegawai,
      href: "/pegawai",
      labelAksi: "Lihat data pegawai",
    },
  ];
}

/**
 * Ubah jadi bentuk yang dipakai ikon "i" (`SumberAcuan`).
 *
 * DI SINI, bukan di tiap halaman: pemformatan waktu dan kalimat "belum pernah
 * diambil" sempat ditulis ulang di halaman kedua, dan dua salinan kalimat yang
 * sama cepat atau lambat berbunyi berbeda untuk keadaan yang sama.
 */
export function keSumberAcuan(baris: BarisSumberData[]): BarisSumber[] {
  const waktu = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return baris.map((b) => ({
    nama: b.nama,
    sistem: b.sistemSumber === "-" ? "belum ada data" : b.sistemSumber,
    waktu: b.diambilPada
      ? `${b.cakupan} - diambil ${waktu.format(b.diambilPada)}`
      : `${b.cakupan} - belum pernah diambil`,
  }));
}
