// Tipe & penamaan dokumen TTE lembur (Surat Tugas harian, SPKL bulanan).
// Murni: tanpa I/O, aman diimpor dari klien.

import { BULAN_ROMAWI, NAMA_BULAN } from "./sptjmTypes";

/**
 * Batas waktu menunggu BSrE pada panggilan sign jalur lembur. Jalur lembur
 * berjalan di dalam transaksi database (SPKL bulanan: BATAS_TRANSAKSI_MS =
 * 180 dtk) yang juga memuat pemeriksaan sertifikat (maks. 2 x 8 dtk) dan
 * pembuatan PDF, jadi 60 dtk di sini menyisakan ruang yang jelas.
 */
export const BATAS_WAKTU_SIGN_LEMBUR_MS = 60_000;

export type JenisDokumenLembur = "SURAT_TUGAS_LEMBUR" | "SPKL_BULANAN";

export const JENIS_DOKUMEN_LEMBUR: readonly JenisDokumenLembur[] = [
  "SURAT_TUGAS_LEMBUR",
  "SPKL_BULANAN",
];

export function apakahJenisLembur(jenis: string): jenis is JenisDokumenLembur {
  return (JENIS_DOKUMEN_LEMBUR as readonly string[]).includes(jenis);
}

// TODO(confirm): nomor agenda dan format nomor di bawah adalah dummy yang
// mengikuti pola sptjmTypes.ts. Template asli memakai klasifikasi KP.08.01
// untuk Surat Tugas dan KU.02 untuk SPKL; nomor agenda sebenarnya diberikan
// persuratan.
export const DEFAULT_NOMOR_AGENDA_LEMBUR: Record<JenisDokumenLembur, string> = {
  SURAT_TUGAS_LEMBUR: "1000",
  SPKL_BULANAN: "1771",
};

const KLASIFIKASI_LEMBUR: Record<JenisDokumenLembur, string> = {
  SURAT_TUGAS_LEMBUR: "KP.08.01",
  SPKL_BULANAN: "KU.02",
};

function romawi(bulan: number): string {
  return BULAN_ROMAWI[Math.max(0, Math.min(11, bulan - 1))] || "X";
}

/** TODO(confirm): format & nomor agenda Surat Tugas lembur. */
export function generateNomorSuratTugasLemburDefault(bulan: number, tahun: number): string {
  return `1/${DEFAULT_NOMOR_AGENDA_LEMBUR.SURAT_TUGAS_LEMBUR}/${KLASIFIKASI_LEMBUR.SURAT_TUGAS_LEMBUR}/${romawi(bulan)}/${tahun}`;
}

/** TODO(confirm): format & nomor agenda SPKL bulanan. */
export function generateNomorSpklDefault(bulan: number, tahun: number): string {
  return `1/${DEFAULT_NOMOR_AGENDA_LEMBUR.SPKL_BULANAN}/${KLASIFIKASI_LEMBUR.SPKL_BULANAN}/${romawi(bulan)}/${tahun}`;
}

function bersihkanNama(teks: string): string {
  return teks.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Nama berkas Surat Tugas lembur harian, mis. "Surat Tugas Lembur 2026-10-14 Nama Unit.pdf". */
export function generateNamaFileSuratTugasLembur(tanggalIso: string, satuanKerja: string): string {
  return `Surat Tugas Lembur ${bersihkanNama(tanggalIso)} ${bersihkanNama(satuanKerja)}.pdf`;
}

/** Nama berkas SPKL bulanan, mis. "SPKL - Oktober 2026 Nama Unit.pdf". */
export function generateNamaFileSpkl(bulan: number, tahun: number, satuanKerja: string): string {
  const namaBulan = NAMA_BULAN[Math.max(0, Math.min(11, bulan - 1))] || "Oktober";
  return `SPKL - ${namaBulan} ${tahun} ${bersihkanNama(satuanKerja)}.pdf`;
}

export function generateNamaFileLembur(
  jenis: JenisDokumenLembur,
  satuanKerja: string,
  bulan: number,
  tahun: number,
  tanggalIso?: string,
): string {
  return jenis === "SURAT_TUGAS_LEMBUR"
    ? generateNamaFileSuratTugasLembur(tanggalIso ?? `${tahun}-${String(bulan).padStart(2, "0")}`, satuanKerja)
    : generateNamaFileSpkl(bulan, tahun, satuanKerja);
}
