/**
 * Sebab sebuah angka Tukin tersimpan sudah basi dan perlu dihitung ulang.
 *
 * PURE - nol I/O. Pemanggil menyerahkan cap waktu sumber-sumbernya; fungsi ini
 * hanya membandingkan. Pemanggil yang memutuskan apakah pegawai itu punya baris
 * Tukin sama sekali (kalau tidak punya, tidak ada yang bisa basi).
 */

export interface MasukanKalkulasiBasi {
  /** Kapan angka Tukin tersimpan dibekukan. */
  calculatedAt: Date;
  /** `diunggahPada` rekap presensi terbaru; `null` = tidak ada rekap. */
  rekapDiunggahPada: Date | null;
  /** `sourceSyncedAt` predikat kinerja terbaru; `null` = tidak ada predikat. */
  predikatSyncedAt: Date | null;
  /** Perubahan data kepegawaian terbaru pegawai ini; `null` = tidak ada. */
  perubahanDataTerakhir: Date | null;
}

/** Tanpa sebab = angka masih segar (`[]`). Urutan sebab tetap. */
export function sebabPerluHitungUlang(masukan: MasukanKalkulasiBasi): string[] {
  const { calculatedAt, rekapDiunggahPada, predikatSyncedAt, perubahanDataTerakhir } = masukan;
  const sebab: string[] = [];

  // SUMBER YANG HILANG DICEK LEBIH DULU, dan ini bukan kelengkapan.
  //
  // Versi pertama cuma membandingkan CAP WAKTU baris yang masih ada. Kalau
  // predikatnya DIHAPUS, baris predikat tidak ada - tidak ada yang
  // dibandingkan, jadi tidak ada sebab yang dilaporkan, sementara baris
  // Tukin-nya tetap berdiri dengan angka hasil hitungan dari predikat yang
  // sudah tidak ada.
  if (predikatSyncedAt === null) sebab.push("predikat kinerja dihapus");
  if (rekapDiunggahPada === null) sebab.push("rekap presensi dihapus");

  if (rekapDiunggahPada !== null && rekapDiunggahPada > calculatedAt) sebab.push("presensi berubah");
  if (predikatSyncedAt !== null && predikatSyncedAt > calculatedAt) sebab.push("predikat kinerja berubah");

  // DATA KEPEGAWAIAN. Kelas jabatan menentukan SELURUH tarif tukin pokok, jadi
  // kelas yang bergeser setelah kalkulasi membuat angka tersimpan salah tanpa
  // satu pun kolom lain ikut berubah.
  //
  // Sumbernya daftar perubahan, BUKAN `Pegawai.sourceSyncedAt`: kolom itu
  // distempel ulang pada setiap baris di tiap sinkronisasi, berubah atau
  // tidak. Membandingkannya dengan calculatedAt akan menyalakan peringatan
  // untuk seluruh roster setiap hari - dan peringatan yang selalu menyala
  // berhenti dibaca.
  if (perubahanDataTerakhir !== null && perubahanDataTerakhir > calculatedAt) {
    sebab.push("data kepegawaian berubah");
  }

  return sebab;
}
