// ============================================================================
// Nama pegawai sebagaimana DICETAK di dokumen resmi - SPTJM, slip gaji,
// naskah dinas.
//
// PURE, nol I/O.
//
// TANPA GELAR, dan itu keputusan user 2026-10-20. Gelarnya memang ada di SIAP
// (GELARDEPAN / GELARBELAKANG) dan sudah ikut ditarik ke kolom `gelarDepan` /
// `gelarBelakang`, tapi TIDAK dipakai di nama cetak. Alasannya sederhana:
// bentuk gelarnya di SIAP tidak seragam - urutannya bisa terbalik
// ("M.M. , S.Sos."), titiknya kadang ada kadang tidak ("SE.", "MS", "Ir"), dan
// merapikannya berarti menebak maksud penulisnya satu per satu. Nama saja
// selalu benar.
//
// Kolomnya SENGAJA DIBIARKAN TERISI, bukan dihapus: datanya sudah ada, tidak
// memakan apa pun, dan kalau suatu saat gelar memang diperlukan di layar lain,
// sumbernya tinggal dipakai - tanpa migrasi lagi.
//
// SATU-SATUNYA yang dikerjakan di sini: menjudulkan nama yang di SIAP
// tersimpan KAPITAL SEMUA. Tanpa itu, SPTJM mencetak
// "ALPHA SANDRO ADITHYASWARA" - benar orangnya, tapi bukan bentuk yang dipakai
// naskah dinas.
// ============================================================================

export interface SumberNamaPegawai {
  nama: string;
}

/**
 * Jadikan Title Case HANYA kalau tidak ada satu pun huruf kecil.
 *
 * Sebagian nama di SIAP sudah rapi ("Yassierli", "Afriansyah Noor") dan
 * menjudulkannya ulang justru merusak. Jadi yang diubah hanya nama yang TIDAK
 * punya satu pun huruf kecil - tanda bahwa itu memang tersimpan kapital semua.
 *
 * Apostrof SENGAJA tidak memicu kapital: bentuk yang lazim di nama Indonesia
 * adalah "Nur'aini", bukan "Nur'Aini".
 */
export function judulkanNama(nama: string): string {
  const bersih = nama.replace(/\s+/g, " ").trim();
  // Ada huruf kecil = sudah ditulis dengan sengaja, jangan disentuh.
  if (/[a-z]/.test(bersih)) return bersih;

  return bersih
    .toLowerCase()
    .replace(
      /(^|[\s-])([a-z])/g,
      (_, pemisah: string, huruf: string) => pemisah + huruf.toUpperCase()
    );
}

/** Nama pegawai untuk dicetak di dokumen resmi. Tanpa gelar - lihat kepala berkas. */
export function namaCetakPegawai(p: SumberNamaPegawai): string {
  return judulkanNama(p.nama ?? "");
}

export interface SumberNamaBergelar extends SumberNamaPegawai {
  gelarDepan?: string | null;
  gelarBelakang?: string | null;
}

function rapikanSpasi(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Nama BERGELAR untuk SPKL (lembur): "<gelar depan> <nama>, <gelar belakang>".
 *
 * PENGECUALIAN TERCATAT atas aturan "tanpa gelar" di kepala berkas: keputusan
 * user 2026-11-20 - SPKL mengikuti template resminya, yang mencetak gelar pada
 * penanda tangan dan daftar pegawai. Gelar dipakai APA ADANYA dari SIAP (hanya
 * spasi dirapikan, titik/urutan tidak ditebak). Dokumen lain tetap memakai
 * `namaCetakPegawai`.
 */
export function namaBergelarSpkl(p: SumberNamaBergelar): string {
  const depan = rapikanSpasi(p.gelarDepan);
  const belakang = rapikanSpasi(p.gelarBelakang).replace(/^,\s*/, "");
  const nama = judulkanNama(p.nama ?? "");
  return `${depan ? depan + " " : ""}${nama}${belakang ? ", " + belakang : ""}`;
}
