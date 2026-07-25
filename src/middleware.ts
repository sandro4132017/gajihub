// Melindungi semua halaman dashboard - harus login (lihat src/auth/) buat
// buka halaman apapun selain /login. Sengaja gate SELURUH dashboard (bukan
// cuma tombol approve) karena datanya menyangkut nominal gaji/tukin pegawai.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifikasiTokenSesi } from "./auth/session";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifikasiTokenSesi(token) : null;
  const isLoginPage = request.nextUrl.pathname === "/login";

  if (!session && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (session && isLoginPage) {
    return NextResponse.redirect(new URL("/tukin", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
