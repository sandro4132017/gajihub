// ============================================================================
// KONVERSI PREDIKAT KINERJA KE PERSEN
// Permenaker 15/2024 Pasal 6 ayat (3) menyerahkan pedoman konversi ini ke
// Keputusan Sekretaris Jenderal terpisah - sekarang sudah ada salinannya:
// Lampiran Kepsekjen 82 Tahun 2025 tentang Tunjangan Kinerja Berdasarkan
// Predikat Kinerja (halaman -7-, "TABEL BESARAN TUNJANGAN KINERJA
// BERDASARKAN KOMPONEN CAPAIAN KINERJA").
//
// Tabel itu mencantumkan nilai rupiah kolom "Sangat Baik/Baik",
// "Perlu Perbaikan", "Kurang/Sangat Kurang" untuk tiap kelas jabatan (bukan
// persentase langsung) - persentase di bawah diturunkan dengan membagi nilai
// itu terhadap (tukin pokok kelas jabatan x 70%), dan hasilnya KONSISTEN
// PERSIS di semua 17 baris kelas jabatan:
//   Sangat Baik / Baik      -> 100%
//   Perlu Perbaikan         -> 85%
//   Kurang / Sangat Kurang  -> 60%
//
// Dokumen tidak eksplisit menyebut 5 label predikat SKP standar (Sangat
// Baik/Baik/Cukup/Kurang/Sangat Kurang dari PermenPANRB 6/2022) satu per
// satu - cuma nama kolom gabungan. TODO(confirm): "Perlu Perbaikan" di sini
// diasumsikan sama dengan predikat "Cukup"/"Butuh Perbaikan" di SKP -
// konfirmasi ke Biro OSDMA kalau ada istilah resmi yang berbeda.
// ============================================================================

export type PredikatKinerja =
  | "SANGAT_BAIK"
  | "BAIK"
  | "PERLU_PERBAIKAN"
  | "KURANG"
  | "SANGAT_KURANG";

const PERSEN_PER_PREDIKAT: Record<PredikatKinerja, number> = {
  SANGAT_BAIK: 100,
  BAIK: 100,
  PERLU_PERBAIKAN: 85,
  KURANG: 60,
  SANGAT_KURANG: 60,
};

export function konversiPredikatKeNilaiPersen(predikat: PredikatKinerja): number {
  return PERSEN_PER_PREDIKAT[predikat];
}
