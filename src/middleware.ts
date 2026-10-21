import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  verifikasiTokenSesi,
  type SessionPayload,
} from "./auth/session";
import { LANDING_ROLE } from "./auth/roleAktif";
import { asalPublik } from "./auth/asalPublik";
import { hostAsalTepercaya } from "./auth/asalTepercaya";

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

function terapkanHeaderKeamanan(res: NextResponse): NextResponse {
  res.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload"
  );
  res.headers.set("X-Frame-Options", "DENY");
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
      return NextResponse.next({ request: { headers: reqHeaders } });
    }

    // Asal DI LUAR daftar sengaja TIDAK diselaraskan. Menyelaraskannya berarti
    // membuat Origin dan Host cocok dengan sendirinya - penahan CSRF bawaan
    // Next jadi selalu lolos, untuk situs mana pun. Biarkan Next yang memutus.
    return NextResponse.next();
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

  return terapkanHeaderKeamanan(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|\\.well-known/|.*\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|woff2?)$).*)",
  ],
};
