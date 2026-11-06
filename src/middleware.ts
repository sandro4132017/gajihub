import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  verifikasiTokenSesi,
  type SessionPayload,
} from "./auth/session";
import { LANDING_ROLE } from "./auth/roleAktif";
import { asalPublik } from "./auth/asalPublik";
import { hostAsalTepercaya } from "./auth/asalTepercaya";
import { hostSah } from "./auth/asalPublik";

/**
 * Route MESIN - diautentikasi header rahasia di dalam handler-nya sendiri,
 * bukan lewat cookie sesi. Tanpa pengecualian ini, permintaan bot dialihkan ke
 * /login dan yang diterima botnya halaman HTML dengan status 200 - gagal yang
 * paling sulit ditelusuri, karena tidak terlihat seperti gagal.
 *
 * DAFTARNYA SENGAJA EKSPLISIT & DICOCOKKAN PERSIS, bukan awalan `/api/`:
 * `/api/kabar` memuat aktivitas per unit dan HARUS tetap bersesi. Mengecualikan
 * seluruh `/api/` berarti satu route baru yang lupa memeriksa izinnya langsung
 * terbuka ke internet.
 *
 * Diekspor supaya bisa dijaga test - lihat `src/__tests__/middlewareMatcher.test.ts`.
 * Tiap penambahan di sini WAJIB disertai pemeriksaan izin di handler-nya.
 */
export const RUTE_MESIN = ["/api/pengingat-absen"] as const;

/**
 * Berkas privat (`/berkas/...`) boleh dibingkai OLEH HALAMAN GAJIHUB SENDIRI:
 * pratinjau PDF SPTJM dan lampiran banding ditampilkan lewat <iframe> di
 * halaman aplikasi. Asal lain tetap tidak bisa membingkainya (anti-clickjacking).
 * Selain itu semua halaman tetap DENY.
 */
export function nilaiXFrameOptions(path: string): "DENY" | "SAMEORIGIN" {
  return path.startsWith("/berkas/") ? "SAMEORIGIN" : "DENY";
}

function asalNaco(): string {
  const dasar = process.env.NACO_BASE_URL?.trim() || "https://account.kemnaker.go.id";
  try {
    return new URL(dasar).origin;
  } catch {
    return "https://account.kemnaker.go.id";
  }
}

/**
 * Content-Security-Policy (temuan pentest F-07).
 * - 'unsafe-inline' pada script/style dipertahankan: Next menyuntik skrip
 *   inline untuk hidrasi dan belum memakai nonce; 'unsafe-eval' hanya di dev.
 * - `frame-ancestors`: berkas privat (/berkas/) boleh dibingkai halaman sendiri
 *   untuk pratinjau PDF, selain itu tidak boleh dibingkai siapa pun.
 * - `form-action` menyertakan asal Naco karena pengalihan SSO.
 * - Tanpa `upgrade-insecure-requests`: akses lewat IP internal memakai HTTP.
 */
export function kebijakanCsp(path: string, dev = process.env.NODE_ENV === "development"): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "frame-src 'self'",
    `frame-ancestors ${path.startsWith("/berkas/") ? "'self'" : "'none'"}`,
    // Berkas di /berkas/ (PDF) dirender penampil PDF bawaan browser, yang
    // diperlakukan sebagai objek - 'none' di situ bisa membuat pratinjau kosong.
    `object-src ${path.startsWith("/berkas/") ? "'self'" : "'none'"}`,
    "base-uri 'self'",
    `form-action 'self' ${asalNaco()}`,
  ].join("; ");
}

/**
 * Lapis kedua penahan CSRF (temuan pentest F-05): permintaan yang mengubah data
 * dan membawa `Origin` dari luar daftar tepercaya DAN beda host dengan host
 * yang diakses ditolak. Origin "null" ditolak; tanpa Origin dibiarkan
 * (klien non-browser, dan cookie SameSite=Lax tetap menjaga).
 */
const METODE_UBAH = new Set(["POST", "PUT", "PATCH", "DELETE"]);
export function originLintasSitus(method: string, headers: Headers): boolean {
  if (!METODE_UBAH.has(method.toUpperCase())) return false;
  const origin = headers.get("origin");
  if (origin === null) return false;
  if (origin === "null") return true;
  if (hostAsalTepercaya(origin)) return false;
  let hostOrigin: string;
  try {
    hostOrigin = new URL(origin).host.toLowerCase();
  } catch {
    return true;
  }
  const hostPermintaan = [headers.get("x-forwarded-host"), headers.get("host")]
    .map(hostSah)
    .filter((h): h is string => !!h)
    .map((h) => h.toLowerCase());
  return !hostPermintaan.includes(hostOrigin);
}

function terapkanHeaderKeamanan(res: NextResponse, path = ""): NextResponse {
  res.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload"
  );
  res.headers.set("X-Frame-Options", nilaiXFrameOptions(path));
  res.headers.set("Content-Security-Policy", kebijakanCsp(path));
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // Mencegah cache browser untuk halaman data/aplikasi sensitif (WAS Plugin 112553)
  if (!res.headers.has("Cache-Control")) {
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  }
  res.headers.set("Pragma", "no-cache");
  return res;
}

export async function middleware(request: NextRequest) {
  // PENGAMANAN LAPIS DEPAN: Langsung drop URL scanning / fuzzing payload (baik unencoded maupun encoded)
  const rawUrl = request.url.toLowerCase();
  let decodedUrl = rawUrl;
  try {
    decodedUrl = decodeURIComponent(rawUrl).toLowerCase();
  } catch {
    // Malformed percent-encoding adalah ciri khas fuzzing/scanner
    return terapkanHeaderKeamanan(new NextResponse("Bad Request", { status: 400 }));
  }

  const payloadMencurigakan =
    rawUrl.includes("<script") ||
    decodedUrl.includes("<script") ||
    decodedUrl.includes("union select") ||
    decodedUrl.includes("etc/passwd") ||
    decodedUrl.includes("169.254.169.254") ||
    decodedUrl.includes("metadata.google.internal");

  if (payloadMencurigakan) {
    return terapkanHeaderKeamanan(new NextResponse("Bad Request", { status: 400 }));
  }

  if (originLintasSitus(request.method, request.headers)) {
    return terapkanHeaderKeamanan(new NextResponse("Forbidden", { status: 403 }));
  }

  // robots.txt harus terbaca crawler tanpa login.
  if (request.nextUrl.pathname === "/robots.txt") {
    return terapkanHeaderKeamanan(NextResponse.next(), "/robots.txt");
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  // MIDDLEWARE TIDAK BOLEH MELEMPAR. Apa pun yang dilempar di sini jadi HTTP
  // 500 untuk SETIAP permintaan yang cocok matcher - /login termasuk, jadi
  // tidak ada satu halaman pun yang bisa dibuka untuk memperbaikinya.
  //
  // Sesudah verifikasiTokenSesi dibuat tahan cookie cacat, satu-satunya sebab
  // yang tersisa adalah SESSION_SECRET yang belum diatur atau kurang dari 32
  // byte di .env server - dan itu disebut namanya di log, bukan dibiarkan
  // muncul sebagai 500 tanpa keterangan.
  let session: SessionPayload | null = null;
  try {
    session = token ? await verifikasiTokenSesi(token) : null;
  } catch (err) {
    console.error(
      "[middleware] Sesi tidak bisa diverifikasi - periksa SESSION_SECRET di .env server:",
      err instanceof Error ? err.message : err
    );
    return terapkanHeaderKeamanan(
      new NextResponse(
        "Konfigurasi sesi server belum lengkap. Hubungi pengelola aplikasi.",
        {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }
      )
    );
  }

  const path = request.nextUrl.pathname;
  const isLoginPage = path === "/login";
  const isRuteSso = path === "/login/sso" || path.startsWith("/login/sso/");
  const isRuteAuthApi = path === "/api/auth" || path.startsWith("/api/auth/");
  const isRuteVerifikasiTte = path.startsWith("/tte/verify/");
  const isRuteMesin = (RUTE_MESIN as readonly string[]).includes(path);

  // Server Action menangani otorisasi & streaming RSC di tingkat handler.
  // Di jaringan internal / VPN / reverse proxy lokal yang kerap menulis ulang Host
  // ke localhost/IP internal tanpa X-Forwarded-Host yang seragam, selaraskan
  // x-forwarded-host dengan host dari Origin agar Next.js action-handler tidak
  // melempar HTTP 500 ("An unexpected response was received from the server").
  if (request.headers.has("next-action")) {
    const originHeader = request.headers.get("origin");
    const hostTepercaya = hostAsalTepercaya(originHeader);

    if (hostTepercaya) {
      const reqHeaders = new Headers(request.headers);
      reqHeaders.set("x-forwarded-host", hostTepercaya);
      reqHeaders.set(
        "x-forwarded-proto",
        originHeader?.startsWith("https:") ? "https" : "http"
      );
      return terapkanHeaderKeamanan(NextResponse.next({ request: { headers: reqHeaders } }), path);
    }

    // Asal DI LUAR daftar sengaja TIDAK diselaraskan. Menyelaraskannya berarti
    // membuat Origin dan Host cocok dengan sendirinya - penahan CSRF bawaan
    // Next jadi selalu lolos, untuk situs mana pun. Biarkan Next yang memutus.
    return terapkanHeaderKeamanan(NextResponse.next(), path);
  }

  if (!session && !isLoginPage && !isRuteSso && !isRuteAuthApi && !isRuteVerifikasiTte && !isRuteMesin) {
    const origin = asalPublik(request.headers, request.url);
    return terapkanHeaderKeamanan(
      NextResponse.redirect(new URL("/login", origin))
    );
  }
  if (session && isLoginPage) {
    const origin = asalPublik(request.headers, request.url);
    return terapkanHeaderKeamanan(
      NextResponse.redirect(new URL(LANDING_ROLE[session.role], origin))
    );
  }

  return terapkanHeaderKeamanan(NextResponse.next(), path);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|\\.well-known/|.*\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|woff2?)$).*)",
  ],
};
