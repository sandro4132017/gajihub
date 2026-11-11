import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { SESSION_COOKIE_NAME } from "../../../../auth/session";
import { getSessionAccount } from "../../../../auth/getSessionAccount";

export const dynamic = "force-dynamic";

/**
 * Keluar = cookie dibuang DAN versi sesi akun dinaikkan, sehingga cookie yang
 * sama yang masih tersimpan di perangkat lain / salinan mana pun tidak berlaku
 * lagi. Konsekuensinya disengaja: SEMUA perangkat akun itu ikut keluar
 * (termasuk akun penguji yang dipakai bersama).
 *
 * Kegagalan database TIDAK boleh menahan logout: cookie tetap dihapus.
 */
export async function POST() {
  try {
    const akun = await getSessionAccount();
    if (akun) {
      await prisma.user.update({
        where: { nip: akun.nip },
        data: { sesiVersi: { increment: 1 } },
        select: { id: true },
      });
    }
  } catch (err) {
    // Tanpa NIP/nama di log.
    console.error("[logout] versi sesi gagal dinaikkan:", err instanceof Error ? err.name : "galat");
  }
  const res = NextResponse.json({ ok: true, redirect: "/login" });
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}
