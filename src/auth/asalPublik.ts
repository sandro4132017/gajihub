import { isModeInternal } from "./modeJaringan";
import { ALAMAT_RESMI, hostTepercayaUntukPengalihan } from "./asalTepercaya";

function isAlamatLokal(host: string): boolean {
  const h = host.split(":")[0].toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "[::1]" ||
    !h.includes(".") ||
    h.endsWith(".local") ||
    h.endsWith(".rokeubmn.id") ||
    h.endsWith(".internal") ||
    h.endsWith(".intranet") ||
    h.endsWith(".lan") ||
    h.startsWith("192.168.") ||
    h.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)
  );
}

/**
 * Protokol yang dipakai BROWSER untuk host ini.
 *
 * Urutannya: `X-Forwarded-Proto` kalau proxy mengirimnya; kalau tidak, host
 * bernama domain tanpa port (bukan alamat lokal) dianggap HTTPS; sisanya
 * protokol permintaan yang diterima server.
 *
 * KENAPA DOMAIN DIANGGAP HTTPS: proxy Pusdatik di depan
 * gajihub.kemnaker.go.id menerima HTTPS dari browser, meneruskannya ke VPS
 * sebagai HTTP, dan TIDAK mengirim `X-Forwarded-Proto`. Protokol permintaan
 * yang dilihat server jadi "http:", lalu setiap pengalihan dari middleware
 * menunjuk ke http://gajihub.kemnaker.go.id/... - yang diblokir browser
 * sebagai mixed content. Alamat lokal (IP 192.168.x, localhost,
 * *.rokeubmn.id) memang dilayani lewat HTTP, jadi tetap mengikuti
 * permintaannya.
 */
function protokolUntuk(host: string, proto: string | undefined, asalPermintaan: string): string {
  if (proto) return proto;
  // Port eksplisit (mis. :8080) berarti diakses langsung, bukan lewat proxy
  // TLS di 443 - protokolnya tidak ditebak.
  if (!isAlamatLokal(host) && !host.includes(":")) return "https";
  try {
    return new URL(asalPermintaan).protocol.replace(/:$/, "");
  } catch {
    return "http";
  }
}

/**
 * Header dari proxy dipercaya hanya kalau bentuknya sah. Nilai lain (protokol
 * selain http/https, host berisi karakter di luar nama domain/IP) diabaikan
 * seolah tidak dikirim: membangun URL dari nilai itu melempar galat dan
 * menggagalkan permintaan, dan host sembarang bisa membelokkan pengalihan.
 */
export function protoSah(nilai: string | null): string | undefined {
  const p = nilai?.split(",")[0].trim().toLowerCase();
  return p === "http" || p === "https" ? p : undefined;
}

export function hostSah(nilai: string | null): string | undefined {
  const h = nilai?.split(",")[0].trim();
  if (!h) return undefined;
  return /^(?:[a-z0-9-]+(?:\.[a-z0-9-]+)*|\[[0-9a-f:.]+\])(?::\d{1,5})?$/i.test(h) ? h : undefined;
}

/**
 * Alamat PUBLIK / INTERNAL aplikasi ini - yang dilihat browser, bukan yang dilihat server.
 *
 * Mengikuti toggle Mode Jaringan (`NETWORK_MODE` = "INTERNAL" | "PUBLIC"):
 * - Saat Mode INTERNAL aktif (akses publik diputus Pusdatik): selalu mempertahankan
 *   host/IP yang diakses pengguna tanpa pernah mengalihkan ke NACO_REDIRECT_URI publik.
 * - Saat Mode PUBLIC aktif (akses publik dibuka): mengarahkan ke origin NACO_REDIRECT_URI
 *   resmi (https://gajihub.kemnaker.go.id) kecuali diakses langsung dari localhost/IP lokal.
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

  // Host dari header dikirim klien: hanya yang ada di daftar tepercaya yang
  // boleh jadi dasar URL pengalihan (OWASP CWE-601, temuan pentest F-03).
  const host = [headers.get("x-forwarded-host"), headers.get("host")]
    .map(hostSah)
    .find((h) => hostTepercayaUntukPengalihan(h));
  const proto = protoSah(headers.get("x-forwarded-proto"));

  // 2. Jika Mode Jaringan INTERNAL aktif ATAU host merupakan alamat lokal/intranet,
  // pertahankan alamat yang sedang diakses browser agar tidak terlempar ke domain publik yang mati.
  if (host && (isModeInternal() || isAlamatLokal(host))) {
    return `${protokolUntuk(host, proto, asalPermintaan)}://${host}`;
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

  // 4. Host tepercaya dari header proxy
  if (host) {
    return `${protokolUntuk(host, proto, asalPermintaan)}://${host}`;
  }

  // 5. Origin permintaan - `req.url` di `next start` dibangun dari header Host,
  // jadi dipakai hanya bila hostnya sendiri tepercaya.
  try {
    const url = new URL(asalPermintaan);
    if (hostTepercayaUntukPengalihan(url.host)) return url.origin;
  } catch {
    /* jatuh ke alamat resmi */
  }

  // 6. Alamat resmi
  return ALAMAT_RESMI;
}
