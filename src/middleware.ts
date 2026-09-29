import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifikasiTokenSesi } from "./auth/session";
import { LANDING_ROLE } from "./auth/roleAktif";

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

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifikasiTokenSesi(token) : null;
  const path = request.nextUrl.pathname;
  const isLoginPage = path === "/login";
  const isRuteSso = path === "/login/sso" || path.startsWith("/login/sso/");

  const isRuteMesin = (RUTE_MESIN as readonly string[]).includes(path);

  if (!session && !isLoginPage && !isRuteSso && !isRuteMesin) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (session && isLoginPage) {
    return NextResponse.redirect(new URL(LANDING_ROLE[session.role], request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|\\.well-known/|.*\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|woff2?)$).*)",
  ],
};
