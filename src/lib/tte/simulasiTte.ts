// ============================================================================
// PENANDA DOKUMEN HASIL SIMULASI TTE - bukan tanda tangan BSrE yang sesungguhnya.
//
// KENAPA INI ADA. Alur TTE punya jalur cadangan: kalau Esign Client BSrE tidak
// menjawab, `terapkanStempelTteSimulasi()` membubuhkan stempel tiruan supaya
// pengujian tetap menghasilkan PDF yang utuh. Jalur itu berguna, TAPI hasilnya
// dulu disimpan dengan status "TERTANDATANGANI", `signedAt` terisi, dan
// `idDokumenBsre` berawalan "BSRE-" - persis seperti dokumen yang benar-benar
// ditandatangani. Akibatnya halaman /tte/verify menyatakannya
// "TERVERIFIKASI SAH", padahal BSrE tidak pernah melihat dokumen itu.
//
// SPTJM adalah surat pernyataan TANGGUNG JAWAB MUTLAK dalam rantai pembayaran.
// Dokumen yang mengaku tertandatangani padahal tidak, adalah jenis kesalahan
// yang tidak boleh bergantung pada ingatan siapa pun. Jadi penandanya
// dititipkan ke `idDokumenBsre` - satu-satunya kolom yang tersedia tanpa
// migrasi - dan SATU fungsi di bawah ini yang menentukan jawabannya, dipakai
// bersama oleh penyimpan dan pembaca.
//
// TODO(confirm): kalau nanti ada migrasi untuk `DokumenTte`, pindahkan
// penandanya ke kolom boolean tersendiri (mis. `hasilSimulasi`). Menitipkan
// makna pada bentuk sebuah string tetap lebih rapuh daripada kolom sendiri.
// ============================================================================

/** Awalan `idDokumenBsre` untuk dokumen yang distempel simulasi. */
export const AWALAN_ID_SIMULASI = "SIMULASI-";

/** Id yang dipakai saat stempel simulasi dibubuhkan. */
export function idDokumenSimulasi(dokumenId: string): string {
  return `${AWALAN_ID_SIMULASI}${dokumenId.slice(0, 8).toUpperCase()}`;
}

/**
 * Bentuk LAMA penanda simulasi, dipakai sebelum 2026-10-20.
 *
 * Dulu id cadangannya `BSRE-` + 8 karakter pertama uuid dokumen itu sendiri.
 * Bentuk itu masih ada di baris-baris lama, dan justru bisa dikenali PERSIS
 * karena diturunkan dari id barisnya - jadi dokumen lama tidak perlu ditebak
 * maupun dibiarkan ambigu.
 */
function idDokumenSimulasiLama(dokumenId: string): string {
  return `BSRE-${dokumenId.slice(0, 8).toUpperCase()}`;
}

/**
 * Apakah dokumen ini hasil simulasi, bukan tanda tangan BSrE.
 *
 * Masukannya sengaja cuma dua kolom supaya bisa dipanggil dari mana saja -
 * Server Action, halaman verifikasi, maupun test - tanpa membawa Prisma.
 */
export function apakahHasilSimulasi(d: {
  id: string;
  idDokumenBsre: string | null;
}): boolean {
  if (!d.idDokumenBsre) return false;
  const nilai = d.idDokumenBsre.trim();
  if (nilai.startsWith(AWALAN_ID_SIMULASI)) return true;
  return nilai === idDokumenSimulasiLama(d.id);
}
