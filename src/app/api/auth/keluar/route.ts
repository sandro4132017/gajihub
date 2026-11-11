import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../auth/session";
import { asalPublik } from "../../../../auth/asalPublik";

export const dynamic = "force-dynamic";

/** Alasan yang boleh dipakai layout saat database menolak sesi yang tanda tangannya sah. */
const ALASAN = ["dicabut", "nonaktif"] as const;

/**
 * Membuang cookie sesi lalu mengarahkan ke /login dengan alasannya. Dipakai
 * layout ketika cookie sah secara HMAC tetapi ditolak database - tanpa ini
 * middleware menganggap pengunjung sudah login dan /login memantulnya kembali
 * ke landing. TIDAK menaikkan versi sesi (versi sudah naik / akun nonaktif).
 */
export async function GET(req: NextRequest) {
  const alasan = req.nextUrl.searchParams.get("alasan");
  const url = new URL("/login", asalPublik(req.headers, req.url));
  if (alasan && (ALASAN as readonly string[]).includes(alasan)) url.searchParams.set("sesi", alasan);
  const res = NextResponse.redirect(url);
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}
