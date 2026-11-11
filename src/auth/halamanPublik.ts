/**
 * Halaman yang boleh dibuka tanpa login (tujuan QR verifikasi TTE). Dipakai
 * layout untuk TIDAK mengalihkan pengunjung ke /api/auth/keluar walau ia
 * membawa cookie basi - cookie basi di halaman ini tidak berbahaya, dan
 * pengunjung QR tidak perlu login. Daftarnya cermin pengecualian di middleware.
 */
export function halamanPublikTanpaSesi(path: string | null | undefined): boolean {
  return !!path && (path === "/tte/verify" || path.startsWith("/tte/verify/"));
}
