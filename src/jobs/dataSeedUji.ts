// ============================================================================
// Data uji untuk akun penguji Pusdatik - bagian MURNI (tanpa database).
//
// Semua isi di sini PALSU: NIP berawalan 9999, nama fiktif, angka gaji bulat
// buatan. Tidak ada satu pun nilai yang berasal dari pegawai sungguhan.
// Kelas jabatan dan golongan memakai nilai yang sah menurut tabel di kode
// (TUKIN_POKOK_PER_KELAS_JABATAN kelas 1-17; golongan format "III/c") supaya
// kalkulasi di unit uji berjalan, tetapi tetap data uji - bukan keputusan
// pembayaran siapa pun.
// ============================================================================

import { SATKER_DUMMY, NIP_PENGUJI, SUMBER_DUMMY, isNipDummy } from "../lib/dataUji";

export type SkenarioUji = "NORMAL" | "TERLAMBAT" | "CUTI" | "TANPA_PREDIKAT" | "LEMBUR";

export interface PegawaiUji {
  nip: string;
  nama: string;
  jabatan: string;
  golongan: string;
  kelasJabatan: number;
  skenario: SkenarioUji;
  /** Gaji pokok palsu, bulat. */
  gajiPokok: number;
}

export const DAFTAR_PEGAWAI_UJI: readonly PegawaiUji[] = [
  { nip: NIP_PENGUJI, nama: "Tim Pusdatik", jabatan: "Tim Pusdatik", golongan: "III/c", kelasJabatan: 9, skenario: "NORMAL", gajiPokok: 4_000_000 }, // sensitive-ok
  { nip: "999900000000000002", nama: "Uji Coba Terlambat", jabatan: "Analis Uji", golongan: "III/b", kelasJabatan: 8, skenario: "TERLAMBAT", gajiPokok: 3_800_000 }, // sensitive-ok
  { nip: "999900000000000003", nama: "Uji Coba Cuti", jabatan: "Analis Uji", golongan: "III/a", kelasJabatan: 7, skenario: "CUTI", gajiPokok: 3_600_000 }, // sensitive-ok
  { nip: "999900000000000004", nama: "Uji Coba Tanpa Predikat", jabatan: "Pelaksana Uji", golongan: "II/c", kelasJabatan: 6, skenario: "TANPA_PREDIKAT", gajiPokok: 3_000_000 }, // sensitive-ok
  { nip: "999900000000000005", nama: "Uji Coba Lembur", jabatan: "Pelaksana Uji", golongan: "II/b", kelasJabatan: 5, skenario: "LEMBUR", gajiPokok: 2_800_000 }, // sensitive-ok
];

export { SATKER_DUMMY };

/** Periode bawaan seed = bulan sebelum `sekarang` (bulan yang sudah tutup). */
export function periodeBawaanUji(sekarang: Date): { bulan: number; tahun: number } {
  const bulan = sekarang.getMonth(); // 0-11 = bulan sebelumnya dalam hitungan 1-12
  return bulan === 0 ? { bulan: 12, tahun: sekarang.getFullYear() - 1 } : { bulan, tahun: sekarang.getFullYear() };
}

/** Tanggal ISO (YYYY-MM-DD) hari Senin-Jumat pada periode itu. Libur nasional tidak dipertimbangkan. */
export function hariKerjaPeriode(bulan: number, tahun: number): string[] {
  const hasil: string[] = [];
  const jumlahHari = new Date(Date.UTC(tahun, bulan, 0)).getUTCDate();
  for (let d = 1; d <= jumlahHari; d++) {
    const hari = new Date(Date.UTC(tahun, bulan - 1, d)).getUTCDay();
    if (hari === 0 || hari === 6) continue;
    hasil.push(`${tahun}-${String(bulan).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return hasil;
}

export interface BarisHarianUji {
  tanggalIso: string;
  jamMasukMenit: number | null;
  jamKeluarMenit: number | null;
  statusKehadiran: string;
  menitTerlambat: number;
  jamLembur: number;
}

export interface RekapUji {
  jumlahHariKerja: number;
  jumlahHariHadir: number;
  jumlahHariWfo: number;
  totalMenitTerlambat: number;
  jumlahHariCuti: number;
  jenisCutiAktif: string | null;
  totalJamLembur: number;
  jumlahHariLemburHariKerja: number;
}

const MASUK = 7 * 60 + 30;
const KELUAR = 16 * 60;

/**
 * Susun presensi harian + rekap bulanan palsu untuk satu skenario. Rekap
 * diturunkan dari baris hariannya, jadi keduanya tidak bisa saling berbeda.
 */
export function susunPresensiUji(
  skenario: SkenarioUji,
  bulan: number,
  tahun: number
): { harian: BarisHarianUji[]; rekap: RekapUji } {
  const hari = hariKerjaPeriode(bulan, tahun);
  const harian: BarisHarianUji[] = hari.map((tanggalIso, i) => {
    const dasar: BarisHarianUji = {
      tanggalIso,
      jamMasukMenit: MASUK,
      jamKeluarMenit: KELUAR,
      statusKehadiran: "WFO",
      menitTerlambat: 0,
      jamLembur: 0,
    };
    if (skenario === "TERLAMBAT" && i < 3) {
      return { ...dasar, jamMasukMenit: MASUK + 20, menitTerlambat: 20 };
    }
    if (skenario === "CUTI" && i >= hari.length - 5) {
      return { ...dasar, jamMasukMenit: null, jamKeluarMenit: null, statusKehadiran: "CUTI" };
    }
    if (skenario === "LEMBUR" && i < 4) {
      return { ...dasar, jamKeluarMenit: KELUAR + 120, jamLembur: 2 };
    }
    return dasar;
  });

  const cuti = harian.filter((h) => h.statusKehadiran === "CUTI").length;
  const lembur = harian.filter((h) => h.jamLembur > 0);
  const rekap: RekapUji = {
    jumlahHariKerja: harian.length,
    jumlahHariHadir: harian.length - cuti,
    jumlahHariWfo: harian.length - cuti,
    totalMenitTerlambat: harian.reduce((a, h) => a + h.menitTerlambat, 0),
    jumlahHariCuti: cuti,
    jenisCutiAktif: cuti > 0 ? "CUTI_TAHUNAN" : null,
    totalJamLembur: lembur.reduce((a, h) => a + h.jamLembur, 0),
    jumlahHariLemburHariKerja: lembur.length,
  };
  return { harian, rekap };
}

/** Komponen gaji induk palsu, bulat. Total diturunkan dari komponen. */
export function susunGajiUji(gajiPokok: number) {
  const potonganIuranPegawai = Math.round(gajiPokok * 0.08);
  return {
    gajiPokok,
    totalPenghasilan: gajiPokok,
    potonganIuranPegawai,
    totalPotongan: potonganIuranPegawai,
    gajiBersih: gajiPokok - potonganIuranPegawai,
  };
}

/** Skenario yang SENGAJA tanpa predikat kinerja. */
export function punyaPredikatUji(skenario: SkenarioUji): boolean {
  return skenario !== "TANPA_PREDIKAT";
}

/**
 * Pagar penyiapan dan penghapusan: setiap baris pegawai yang akan disentuh
 * harus (1) ber-NIP dalam daftar uji, (2) berawalan 9999, dan (3) bertanda
 * sourceSystem DUMMY_UJI. Satu saja yang tidak, seluruh proses dibatalkan -
 * tidak ada baris pegawai sungguhan yang boleh ikut tersentuh.
 */
export function periksaTargetUji(
  baris: readonly { nip: string; sourceSystem: string }[]
): { aman: true } | { aman: false; alasan: string } {
  const diizinkan = new Set(DAFTAR_PEGAWAI_UJI.map((d) => d.nip));
  for (const b of baris) {
    if (!diizinkan.has(b.nip) || !isNipDummy(b.nip)) {
      return { aman: false, alasan: "ada pegawai di luar daftar uji" };
    }
    if (b.sourceSystem !== SUMBER_DUMMY) {
      return { aman: false, alasan: "ada pegawai ber-NIP uji yang bukan data uji" };
    }
  }
  return { aman: true };
}
