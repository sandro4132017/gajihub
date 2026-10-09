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

/**
 * Generate nomor dokumen default sesuai template resmi naskah dinas Kemnaker (Opsi A)
 */
export function generateNomorSptjmDefault(
  jenis: JenisSptjm,
  bulan: number,
  tahun: number
): string {
  const romawi = BULAN_ROMAWI[Math.max(0, Math.min(11, bulan - 1))] || "X";
  // Nomor kode klasifikasi arsip naskah dinas Kemnaker: KU.02 (Keuangan)
  switch (jenis) {
    case "SPTJM_LEMBUR":
      return `1/2903/KU.02/${romawi}/${tahun}`;
    case "SPTJM_TUKIN":
      return `1/3059/KU.02/${romawi}/${tahun}`;
    case "SPTJM_UANG_MAKAN":
      return `1/3106/KU.02/${romawi}/${tahun}`;
    default:
      return `1/3000/KU.02/${romawi}/${tahun}`;
  }
}

