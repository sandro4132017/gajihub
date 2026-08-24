// Melindungi semua halaman dashboard - harus login (lihat src/auth/) buat
// buka halaman apapun selain /login. Sengaja gate SELURUH dashboard (bukan
// cuma tombol approve) karena datanya menyangkut nominal gaji/tukin pegawai.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifikasiTokenSesi } from "./auth/session";
// Cuma konstanta + type - aman dipakai di Edge runtime (tidak menarik
// Prisma Client ataupun modul Node manapun).
import { LANDING_ROLE } from "./auth/roleAktif";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifikasiTokenSesi(token) : null;
  const path = request.nextUrl.pathname;
  const isLoginPage = path === "/login";
  // Rute SSO (/login/sso dan /login/sso/callback) HARUS bisa diakses tanpa
  // sesi - memang di situlah sesinya dibuat. Dipisah dari `isLoginPage`
  // karena keduanya menjawab pertanyaan berbeda: yang ini "boleh dibuka
  // tanpa login?", yang satunya "sudah login tapi masih di halaman login?".
  const isRuteSso = path === "/login/sso" || path.startsWith("/login/sso/");

  if (!session && !isLoginPage && !isRuteSso) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (session && isLoginPage) {
    // Diarahkan ke "rumah" role AKTIF sesi, bukan selalu /tukin - /tukin
    // bahkan tidak ada di menu OSDMA/PIMPINAN/ADMIN (lihat LANDING_ROLE).
    return NextResponse.redirect(new URL(LANDING_ROLE[session.role], request.url));
  }
  return NextResponse.next();
}

export const config = {
  // icon.svg dikecualikan sama seperti favicon.ico - file convention Next.js
  // (src/app/icon.svg) buat favicon tab browser, harus bisa dimuat SEBELUM
  // login juga (browser minta favicon terlepas dari status auth) - kelewatan
  // waktu file itu ditambahkan, ketahuan karena browser yang belum login
  // dapat redirect ke /login (HTML) bukan gambar ikonnya.
  //
  // BERKAS DI public/ JUGA DIKECUALIKAN, dan itu masalah yang sama persis
  // berulang: middleware ini berjalan untuk SEMUA permintaan, termasuk
  // gambar. Ilustrasi di halaman login sempat dibalas 307 ke /login - halaman
  // login tidak bisa memuat gambarnya sendiri karena harus login dulu.
  //
  // Dikecualikan LEWAT DAFTAR EKSTENSI, bukan "apa pun yang mengandung
  // titik": seluruh rute aplikasi ini tidak berekstensi (termasuk Route
  // Handler seperti /ppabp/adk/tukin yang mengalirkan berkas ADK), jadi
  // daftar yang sempit ini tidak bisa tanpa sengaja membuka halaman berdata
  // gaji kalau nanti ada rute baru.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|woff2?)$).*)",
  ],
};
