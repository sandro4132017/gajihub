/**
 * Alamat PUBLIK aplikasi ini - yang dilihat browser, bukan yang dilihat server.
 *
 * WAJIB dipakai untuk setiap redirect yang keluar dari Route Handler maupun Middleware.
 * Di belakang reverse proxy, `req.url` berisi alamat INTERNAL (mis. http://localhost:3002
 * atau http://192.168.221.44:3002), sehingga `new URL(path, req.url)` menghasilkan Location
 * internal yang tidak bisa dijangkau browser pengguna di internet atau melanggar HTTPS/HSTS.
 *
 * Urutan sumber:
 *   1. Asal NACO_REDIRECT_URI - alamat publik yang paling sahih dan terdaftar resmi.
 *   2. Header X-Forwarded-Host & X-Forwarded-Proto dari reverse proxy.
 *   3. Header Host dari request.
 *   4. Asal permintaan (req.url) sebagai fallback saat jalan langsung tanpa proxy.
 */
export function asalPublik(headers: Headers, asalPermintaan: string): string {
  const dariRedirect = process.env.NACO_REDIRECT_URI?.trim();
  if (dariRedirect) {
    try {
      return new URL(dariRedirect).origin;
    } catch {
      // Nilainya bukan URL sah - jatuh ke sumber berikutnya, jangan melempar.
    }
  }
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (host) {
    const proto = headers.get("x-forwarded-proto")?.split(",")[0].trim();
    if (proto) return `${proto}://${host}`;
    try {
      return `${new URL(asalPermintaan).protocol}//${host}`;
    } catch {
      /* jatuh ke bawah */
    }
  }
  return new URL(asalPermintaan).origin;
}

