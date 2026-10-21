// ============================================================================
// ASAL (ORIGIN) YANG BOLEH MENJALANKAN SERVER ACTION.
//
// Next memeriksa header `Origin` permintaan Server Action terhadap host yang
// diterimanya - penahan CSRF bawaannya. Di balik proxy Pusdatik, browser
// mengirim `Origin: https://gajihub.kemnaker.go.id` sementara aplikasi
// menerima `Host: localhost:3002`, jadi keduanya tidak cocok dan SELURUH
// Server Action ditolak. Penanganannya di `src/middleware.ts`: menyelaraskan
// `x-forwarded-host` dengan host dari Origin.
//
// MASALAHNYA, penyelarasan itu dulu dilakukan untuk ORIGIN APA PUN. Artinya
// penahan CSRF-nya ikut mati: siapa pun yang mengirim `Origin: https://situs-
// penyerang.example` membuat kedua header itu cocok dengan sendirinya, dan
// Next mengizinkannya. (Cookie sesi ber-SameSite=Lax masih menahan POST lintas
// situs, jadi ini lapis kedua - bukan lubang yang langsung bisa dipakai - tapi
// lapis yang memang tidak boleh hilang.)
//
// Daftar di bawah membatasi penyelarasan itu HANYA untuk asal yang memang
// milik kita, dan isinya WAJIB sama dengan `allowedOrigins` di
// `next.config.mjs` - dijaga test, karena dua daftar yang harus sama pasti
// berbeda cepat atau lambat.
// ============================================================================

/** Host yang sah menjalankan Server Action. Sama persis dengan `allowedOrigins`. */
export const ASAL_TEPERCAYA: readonly string[] = [
  "gajihub.kemnaker.go.id",
  "gajihub.kemnaker.go.id:443",
  "*.kemnaker.go.id",
  "gajihubkemnaker.go.id",
  "gajihubkemnaker.go.id:443",
  "gajihubkemnakergoid",
  "gajihub.rokeubmn.id",
  "gajihub.rokeubmn.id:443",
  "*.rokeubmn.id",
  "192.168.221.44:3000",
  "192.168.221.44:3002",
  "192.168.221.44:80",
  "192.168.221.44",
  "192.168.221.11",
  "192.168.63.15:3000",
  "192.168.63.15:3002",
  "192.168.63.15",
  "192.168.232.173:3000",
  "192.168.232.173:3002",
  "192.168.232.173",
  "localhost",
  "localhost:80",
  "localhost:3000",
  "localhost:3001",
  "localhost:3002",
  "127.0.0.1",
  "127.0.0.1:80",
  "127.0.0.1:3000",
  "127.0.0.1:3001",
  "127.0.0.1:3002",
];

/**
 * Apakah host ini ada di daftar?
 *
 * Pola `*.contoh.id` cocok untuk SUBDOMAIN-nya saja ("a.contoh.id"), bukan
 * untuk "contoh.id" telanjang maupun "bukancontoh.id" - host induk yang
 * memang dipakai sudah disebut sendiri di daftar.
 */
function hostTepercaya(host: string): boolean {
  const h = host.toLowerCase();
  return ASAL_TEPERCAYA.some((pola) => {
    const p = pola.toLowerCase();
    if (!p.startsWith("*.")) return p === h;
    const akhiran = p.slice(1); // "*.contoh.id" -> ".contoh.id"
    return h.endsWith(akhiran) && h.length > akhiran.length;
  });
}

/**
 * Baca header `Origin` dan jawab: bolehkah asal ini diselaraskan?
 *
 * Mengembalikan host-nya kalau boleh, `null` kalau tidak - termasuk untuk
 * Origin yang kosong, bernilai "null" (sandbox/iframe), atau bukan URL.
 */
export function hostAsalTepercaya(headerOrigin: string | null): string | null {
  if (!headerOrigin || headerOrigin === "null") return null;
  let url: URL;
  try {
    url = new URL(headerOrigin);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return hostTepercaya(url.host) ? url.host : null;
}
