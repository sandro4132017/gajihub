import { NextResponse } from "next/server";
import { konfigurasiSso, urlOtorisasi } from "../../../auth/sso";

export const dynamic = "force-dynamic";

/**
 * Langkah 1 SSO - memberangkatkan browser ke halaman login Naco.
 *
 * Route Handler (GET), bukan Server Action, supaya tombolnya bisa berupa
 * tautan biasa dan tetap jalan tanpa JavaScript - konsisten dengan filter GET
 * dan form approval di seluruh aplikasi ini.
 */

/** Cookie penampung `state`, umurnya sependek alur login. */
export const COOKIE_STATE_SSO = "gajihub_sso_state";
const UMUR_STATE_DETIK = 10 * 60;

export async function GET() {
  const cfg = konfigurasiSso();
  if (!cfg) {
    return NextResponse.redirect(
      new URL("/login?sso=belum-dikonfigurasi", process.env.NACO_REDIRECT_URI ?? "http://localhost:3000")
    );
  }

  // `state` menahan CSRF login: tanpa ini, alamat callback bisa dipanggil
  // siapa saja dengan kode milik orang lain, dan korbannya berakhir masuk
  // sebagai akun penyerang. Nilainya disimpan di cookie httpOnly lalu
  // dicocokkan ulang di callback.
  const state = crypto.randomUUID();

  const res = NextResponse.redirect(urlOtorisasi(cfg, state));
  res.cookies.set(COOKIE_STATE_SSO, state, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    maxAge: UMUR_STATE_DETIK,
  });
  return res;
}
