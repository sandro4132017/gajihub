function isAlamatLokal(host: string): boolean {
  const h = host.split(":")[0].toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "[::1]" ||
    h.endsWith(".local") ||
    h.startsWith("192.168.") ||
    h.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)
  );
}

/**
 * Alamat PUBLIK aplikasi ini - yang dilihat browser, bukan yang dilihat server.
 *
 * WAJIB dipakai untuk setiap redirect yang keluar dari Route Handler maupun Middleware.
 * Di belakang reverse proxy, `req.url` berisi alamat INTERNAL (mis. http://localhost:3002
 * atau http://192.168.221.44:3002), sehingga `new URL(path, req.url)` menghasilkan Location
 * internal yang tidak bisa dijangkau browser pengguna di internet atau melanggar HTTPS/HSTS.
 *
 * Urutan sumber:
 *   1. Jika sedang di mode development (npm run dev) -> selalu pakai asal permintaan lokal.
 *   2. Jika request langsung ke localhost / direct IP lokal (tanpa proxy HTTPS) -> pertahankan alamat lokal.
 *   3. Asal NACO_REDIRECT_URI -> alamat publik yang paling sahih dan terdaftar resmi di balik proxy.
 *   4. Header X-Forwarded-Host & X-Forwarded-Proto dari reverse proxy.
 *   5. Header Host dari request.
 *   6. Asal permintaan (req.url) sebagai fallback saat jalan langsung tanpa proxy.
 */
export function asalPublik(headers: Headers, asalPermintaan: string): string {
  // 1. Pada mode development (next dev), selalu gunakan origin lokal
  if (process.env.NODE_ENV === "development") {
    try {
      return new URL(asalPermintaan).origin;
    } catch {
      /* jatuh ke bawah */
    }
  }

  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  const proto = headers.get("x-forwarded-proto")?.split(",")[0].trim();

  // 2. Jika akses langsung ke localhost atau IP lokal (dan BUKAN dari reverse proxy HTTPS),
  // pertahankan alamat lokal tersebut agar akses dev / direct IP tidak dialihkan ke domain publik.
  if (host && isAlamatLokal(host) && proto !== "https") {
    try {
      const reqProto = new URL(asalPermintaan).protocol;
      return `${reqProto}//${host}`;
    } catch {
      return `http://${host}`;
    }
  }

  // 3. Di server produksi di balik reverse proxy domain publik:
  // Asal NACO_REDIRECT_URI adalah alamat publik resmi (https://gajihub.kemnaker.go.id).
  const dariRedirect = process.env.NACO_REDIRECT_URI?.trim();
  if (dariRedirect) {
    try {
      return new URL(dariRedirect).origin;
    } catch {
      // Nilainya bukan URL sah - jatuh ke sumber berikutnya, jangan melempar.
    }
  }

  // 4. Header dari proxy
  if (host) {
    if (proto) return `${proto}://${host}`;
    try {
      return `${new URL(asalPermintaan).protocol}//${host}`;
    } catch {
      /* jatuh ke bawah */
    }
  }

  // 5. Fallback terakhir ke URL asal permintaan
  return new URL(asalPermintaan).origin;
}

