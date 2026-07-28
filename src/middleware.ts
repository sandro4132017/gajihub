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
  const isLoginPage = request.nextUrl.pathname === "/login";

  if (!session && !isLoginPage) {
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
