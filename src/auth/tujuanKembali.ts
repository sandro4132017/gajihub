/**
 * Alamat /login yang BERSIH saat sesi berakhir, dan kembali ke halaman semula
 * sesudah login.
 *
 * Dulu alasan sesi berakhir ditempel di alamat (`/login?sesi=menganggur`):
 * alamatnya kotor, pesannya muncul lagi tiap /login dimuat ulang atau
 * dibookmark, dan halaman yang sedang dibuka terlupa - sesudah login orang
 * dilempar ke dashboard dan harus memilih periode/unit dari awal.
 *
 * Sekarang dua cookie singkat:
 *  - COOKIE_PESAN_SESI: alasan sesi berakhir, SEKALI PAKAI. Middleware
 *    membacanya saat /login dibuka, meneruskannya ke halaman lewat header
 *    HEADER_PESAN_SESI, lalu menghapusnya.
 *  - COOKIE_KEMBALI: halaman terakhir (path + query). Dipakai SEKALI oleh
 *    login yang berhasil (form, API, SSO), lalu dihapus.
 *
 * MURNI - tanpa I/O, aman dipakai middleware (Edge).
 */

export const COOKIE_PESAN_SESI = "gajihub_pesan_sesi";
export const COOKIE_KEMBALI = "gajihub_kembali";
/** Header internal middleware -> halaman /login. Selalu ditimpa middleware. */
export const HEADER_PESAN_SESI = "x-pesan-sesi";

/** Alasan yang boleh dibawa ke /login - sama dengan kunci PESAN_SESI. */
export const ALASAN_PESAN_SESI = ["menganggur", "kedaluwarsa", "dicabut", "nonaktif", "format-lama"] as const;

export function alasanSesiSah(nilai: string | null | undefined): string | null {
  return nilai && (ALASAN_PESAN_SESI as readonly string[]).includes(nilai) ? nilai : null;
}

/** Umur cookie: pesan cukup untuk satu pengalihan; tujuan 10 menit. */
export const UMUR_PESAN_SESI_DETIK = 120;
export const UMUR_KEMBALI_DETIK = 10 * 60;

const PANJANG_MAKS = 1000;
/** Bukan halaman yang dibuka orang: login itu sendiri, API, berkas, aset. */
const AWALAN_DILARANG = ["/login", "/api", "/berkas", "/_next"];

/**
 * Tujuan kembali yang AMAN, atau null.
 *
 * Hanya alamat DI DALAM Gajihub: harus diawali satu "/" (bukan "//" atau
 * "/\" yang dibaca browser sebagai situs lain), tanpa karakter kendali, dan
 * tetap di asal yang sama setelah diurai. Tanpa penjagaan ini cookie yang
 * dipalsukan bisa membelokkan orang yang baru login ke situs lain (open
 * redirect).
 */
export function tujuanKembaliSah(nilai: string | null | undefined): string | null {
  if (!nilai || nilai.length > PANJANG_MAKS) return null;
  if (!nilai.startsWith("/") || nilai.startsWith("//") || nilai.startsWith("/\\")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(nilai)) return null;
  let url: URL;
  try {
    url = new URL(nilai, "http://gajihub.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "http://gajihub.invalid") return null;
  const path = url.pathname;
  // "/" tidak perlu diingat: login tanpa tujuan memang ke halaman awal role.
  if (path === "/") return null;
  if (AWALAN_DILARANG.some((a) => path === a || path.startsWith(`${a}/`))) return null;
  // Query dipertahankan apa adanya (encoding asli); hanya _rsc yang dibuang.
  if (url.searchParams.has("_rsc")) url.searchParams.delete("_rsc");
  return path + (url.search === "?" ? "" : url.search);
}

/**
 * Apakah permintaan ini NAVIGASI halaman yang pantas diingat sebagai tujuan
 * kembali? Bukan prefetch (link yang sekadar terlihat di layar), bukan
 * Server Action, bukan /api, bukan berkas.
 */
export function layakDiingat(request: { method: string; headers: Headers; nextUrl: { pathname: string } }): boolean {
  if (request.method.toUpperCase() !== "GET") return false;
  const h = request.headers;
  if (h.has("next-action")) return false;
  if (h.has("next-router-prefetch") || h.has("next-router-segment-prefetch") || h.get("purpose") === "prefetch") {
    return false;
  }
  const path = request.nextUrl.pathname;
  if (path === "/api" || path.startsWith("/api/") || path.startsWith("/berkas/")) return false;
  if (h.has("rsc")) return true;
  return h.get("sec-fetch-mode") === "navigate" || (h.get("accept") ?? "").includes("text/html");
}
