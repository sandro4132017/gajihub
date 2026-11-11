import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, batasMutlakMs, terbitkanUlang } from "../../../../auth/session";
import { opsiCookieSampai } from "../../../../auth/sesiCookie";
import { getSessionAccount } from "../../../../auth/getSessionAccount";

export const dynamic = "force-dynamic";

/**
 * Detak interaksi dari DetakSesi: hanya dikirim bila pengguna benar-benar
 * berinteraksi. Memverifikasi sesi (termasuk versi di database) lalu menerbitkan
 * ulang cookie dengan `ak` = sekarang. Batas mutlak 8 jam tidak bergeser.
 */
export async function POST() {
  const akun = await getSessionAccount();
  if (!akun) return new NextResponse(null, { status: 401 });

  const sekarang = Date.now();
  // `akun` memuat payload sesi (role sudah divalidasi database); rolesTersedia
  // bukan bagian token.
  const { rolesTersedia: _rt, ...payload } = akun;
  const token = await terbitkanUlang(payload, sekarang);
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(SESSION_COOKIE_NAME, token, opsiCookieSampai(batasMutlakMs(payload), sekarang));
  return res;
}
