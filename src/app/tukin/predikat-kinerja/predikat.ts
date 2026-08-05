/**
 * Label & daftar opsi predikat kinerja, dipakai bareng halaman (server) dan
 * form kelola (client) supaya keduanya tidak bisa berbeda isi.
 *
 * Persentasenya mengikuti Lampiran Kepsekjen 82 Tahun 2025 - lihat
 * src/business-logic/konversiPredikat.ts yang jadi sumber angkanya. Angka di
 * sini CUMA buat ditampilkan; yang disimpan ke database selalu dihitung ulang
 * di server lewat konversiPredikatKeNilaiPersen.
 */

export const LABEL_PREDIKAT: Record<string, string> = {
  SANGAT_BAIK: "Sangat Baik",
  BAIK: "Baik",
  PERLU_PERBAIKAN: "Perlu Perbaikan",
  KURANG: "Kurang",
  SANGAT_KURANG: "Sangat Kurang",
};

/** Urutan dari terbaik ke terburuk, dengan dampaknya ke tukin ikut ditampilkan. */
export const OPSI_PREDIKAT = [
  { value: "SANGAT_BAIK", label: "Sangat Baik", keterangan: "100% dari bobot kinerja" },
  { value: "BAIK", label: "Baik", keterangan: "100% dari bobot kinerja" },
  { value: "PERLU_PERBAIKAN", label: "Perlu Perbaikan", keterangan: "85% dari bobot kinerja" },
  { value: "KURANG", label: "Kurang", keterangan: "60% dari bobot kinerja" },
  { value: "SANGAT_KURANG", label: "Sangat Kurang", keterangan: "60% dari bobot kinerja" },
];

/** Warna chip mengikuti dampaknya ke tukin: 100% hijau, 85% kuning, 60% merah. */
export function kelasChipPredikat(predikat: string): string {
  if (predikat === "SANGAT_BAIK" || predikat === "BAIK") return "chip-ok";
  if (predikat === "PERLU_PERBAIKAN") return "chip-wait";
  return "chip-danger";
}

/** Apakah baris ini hasil ketikan manusia, bukan file resmi dari BKN? */
export function adalahInputManual(inputMethod: string): boolean {
  return inputMethod === "MANUAL_ENTRY" || inputMethod === "MANUAL_EDIT";
}

export function labelSumber(inputMethod: string): string {
  if (inputMethod === "MANUAL_ENTRY") return "ditambah manual";
  if (inputMethod === "MANUAL_EDIT") return "dikoreksi manual";
  if (inputMethod === "MANUAL_UPLOAD") return "upload manual";
  return "API";
}
