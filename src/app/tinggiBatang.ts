/**
 * Tinggi batang grafik dalam PERSEN terhadap batang tertinggi.
 *
 * Sengaja dipisah jadi fungsi sendiri dan diuji, walau isinya cuma satu
 * pembagian. Versi sebelumnya ditulis inline di JSX sebagai
 *
 *     nominal > 0 ? Math.max(12, Math.round((nominal / maks) * 100)) : 6
 *
 * dan lantai 12% itu MEMBOHONGI perbandingannya: bulan yang nilainya 1% dari
 * bulan tertinggi tetap digambar setinggi 12%, dan bulan yang nilainya NOL
 * digambar 6% - jadi terlihat seolah ada belanja padahal tidak ada sama
 * sekali. Di grafik yang menyentuh angka pembayaran, itu bukan sekadar pilihan
 * gaya. Lantainya sudah dicabut; supaya batang yang sungguhan kecil tidak
 * hilang sama sekali, tingginya dijaga di CSS lewat `min-height` beberapa
 * piksel - itu menjaga keterlihatan TANPA mengubah proporsi yang dihitung di
 * sini, karena min-height tidak ikut naik sebanding.
 *
 * Bulan tanpa data mengembalikan 0: yang tampil tinggal jalur latar batangnya
 * yang memang selalu digambar, dan kosong terbaca sebagai kosong.
 */
export function tinggiBatangPersen(nominal: number, maksimum: number): number {
  if (!Number.isFinite(nominal) || nominal <= 0) return 0;
  if (!Number.isFinite(maksimum) || maksimum <= 0) return 0;
  // Dijepit di 100: pemanggil menghitung `maksimum` dari deret yang sama, tapi
  // kalau suatu saat ia datang dari sumber lain, batang yang melebihi 100%
  // akan tumbuh keluar dari jalurnya alih-alih penuh.
  return Math.min(100, Math.round((nominal / maksimum) * 100));
}
