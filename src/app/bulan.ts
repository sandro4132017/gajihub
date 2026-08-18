/** Tahun paling awal yang dipakai Gajihub - data periode di sistem ini mulai 2026. */
export const TAHUN_PERIODE_AWAL = 2026;

/** Batas bawah tahun terakhir di dropdown. Lihat catatan di daftarTahunPeriode(). */
const TAHUN_PERIODE_AKHIR_MINIMAL = 2030;

/**
 * Pilihan tahun buat filter periode (2026-2030). Daftar pendek disengaja:
 * memilih dari beberapa opsi lebih cepat & tidak bisa salah ketik dibanding
 * mengisi angka bebas.
 *
 * Batas atasnya IKUT tahun berjalan kalau suatu saat sudah melewati 2030 -
 * kalau dipatok mati di 2030, pada 2031 tahun berjalan hilang dari dropdown
 * dan filternya tidak bisa dipakai sama sekali TANPA pesan error apa pun
 * (cara gagal yang paling sulit ditebak penyebabnya).
 */
export function daftarTahunPeriode(tahunSekarang = new Date().getFullYear()): number[] {
  const akhir = Math.max(TAHUN_PERIODE_AKHIR_MINIMAL, tahunSekarang);
  const hasil: number[] = [];
  for (let t = TAHUN_PERIODE_AWAL; t <= akhir; t += 1) hasil.push(t);
  return hasil;
}

export const NAMA_BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
