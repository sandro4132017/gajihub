import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifikasiTokenSesi } from "./auth/session";
import { LANDING_ROLE } from "./auth/roleAktif";
import { asalPublik } from "./auth/asalPublik";

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
  const session = token ? await verifikasiTokenSesi(token) : null;
  const path = request.nextUrl.pathname;
  const isLoginPage = path === "/login";
  const isRuteSso = path === "/login/sso" || path.startsWith("/login/sso/");
  const isRuteAuthApi = path === "/api/auth" || path.startsWith("/api/auth/");
  const isRuteMesin = (RUTE_MESIN as readonly string[]).includes(path);

  // Server Action menangani otorisasi & streaming RSC di tingkat handler
  if (request.headers.has("next-action")) {
    return NextResponse.next();
  }

  if (!session && !isLoginPage && !isRuteSso && !isRuteAuthApi && !isRuteMesin) {
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
