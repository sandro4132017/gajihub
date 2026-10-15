export type JenisSptjm = "SPTJM_TUKIN" | "SPTJM_UANG_MAKAN" | "SPTJM_LEMBUR";

export interface DataSptjmUniversal {
  jenis: JenisSptjm;
  nomorDokumen: string;
  periodeBulan: number;
  periodeTahun: number;
  tanggalDokumen?: string;
  // Data Penandatangan PPK
  namaPenandatangan?: string;
  nipPenandatangan?: string;
  jabatanPenandatangan?: string;
  satuanKerja?: string;
  unitEselon1?: string;
  // Metadata angka (opsional untuk catatan/arsip)
  jumlahPegawai?: number;
  totalNominal?: number;
}

// Backward compatibility untuk pemanggil lama
export interface DataSptjmLembur {
  nomorDokumen: string;
  satuanKerja: string;
  periodeBulan: number;
  periodeTahun: number;
  namaPenandatangan: string;
  nipPenandatangan: string;
  jabatanPenandatangan: string;
  jumlahPegawai: number;
  totalJamLembur: number;
  totalUangLembur: number;
  tanggalDokumen?: string;
}

export const BULAN_ROMAWI = [
  "I", "II", "III", "IV", "V", "VI",
  "VII", "VIII", "IX", "X", "XI", "XII",
];

export const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export const DEFAULT_NOMOR_AGENDA_SPTJM: Record<JenisSptjm, string> = {
  SPTJM_LEMBUR: "2903",
  SPTJM_TUKIN: "3059",
  SPTJM_UANG_MAKAN: "3106",
};

/**
 * Generate nomor dokumen default sesuai template resmi naskah dinas Kemnaker (Opsi A)
 */
export function generateNomorSptjmDefault(
  jenis: JenisSptjm,
  bulan: number,
  tahun: number
): string {
  const romawi = BULAN_ROMAWI[Math.max(0, Math.min(11, bulan - 1))] || "X";
  const nomorAgenda = DEFAULT_NOMOR_AGENDA_SPTJM[jenis] || "3000";
  // Nomor kode klasifikasi arsip naskah dinas Kemnaker: KU.02 (Keuangan)
  return `1/${nomorAgenda}/KU.02/${romawi}/${tahun}`;
}

/**
 * Parse nomor dokumen untuk memisahkan nomor agenda (bisa diedit)
 * dari bagian tetap (1/..., /KU.02/..., bulan romawi, dan tahun)
 */
export function parseNomorSptjm(
  nomor: string,
  bulan: number,
  tahun: number
): { nomorUrut: string; isKustom: boolean } {
  const romawi = BULAN_ROMAWI[Math.max(0, Math.min(11, bulan - 1))] || "X";
  const cleaned = nomor.trim().replace(/^NOMOR\s+/i, "");
  // Cocokkan pola standar: 1/{nomorUrut}/KU.02/{romawi}/{tahun}
  const regex = new RegExp(`^1\\/([^\\/]+)\\/KU\\.02\\/${romawi}\\/${tahun}$`, "i");
  const match = cleaned.match(regex);
  if (match) {
    return { nomorUrut: match[1], isKustom: false };
  }
  // Alternatif bila format memiliki KU.02
  const matchGeneric = cleaned.match(/^1\/([^\/]+)\/KU\.02\//i);
  if (matchGeneric) {
    return { nomorUrut: matchGeneric[1], isKustom: false };
  }
  return { nomorUrut: cleaned, isKustom: true };
}

