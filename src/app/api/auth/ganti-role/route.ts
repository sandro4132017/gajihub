import { NextResponse, type NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "../../../../lib/prisma";
import { SESSION_COOKIE_NAME, batasMutlakMs } from "../../../../auth/session";
import { opsiCookieSampai, buatTokenUntukUser } from "../../../../auth/sesiCookie";
import { getSessionAccount } from "../../../../auth/getSessionAccount";
import { daftarRoleTersedia, LANDING_ROLE } from "../../../../auth/roleAktif";
import { pesanGalatUntukLayar } from "../../../../lib/koneksi/galatSumber";
import { LABEL_ROLE } from "../../../../auth/roleLabel";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let body: { role?: string } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Permintaan tidak terbaca. Muat ulang halaman lalu coba lagi." }, { status: 400 });
    }

    const roleTujuan = String(body.role ?? "") as Role;
    if (!roleTujuan) {
      return NextResponse.json({ ok: false, error: "Pilih peran tujuan." }, { status: 400 });
    }

    const akun = await getSessionAccount();
    if (!akun) {
      return NextResponse.json({ ok: false, error: "Sesi login sudah habis - silakan login ulang." }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { nip: akun.nip } });
    if (!user || !user.aktif) {
      return NextResponse.json({ ok: false, error: "Akun tidak aktif - silakan login ulang." }, { status: 403 });
    }

    if (!daftarRoleTersedia(user).includes(roleTujuan)) {
      return NextResponse.json(
        { ok: false, error: `Akun kamu tidak punya peran ${LABEL_ROLE[roleTujuan] ?? roleTujuan}.` },
        { status: 403 }
      );
    }

    // Waktu login (lp) sesi berjalan DIWARISKAN: ganti role tidak mengulang
    // batas mutlak 8 jam. Versi diambil dari SESI BERJALAN (akun.v, yang baru
    // lolos pencocokan ke database), bukan dari query kedua: kalau sesi dicabut
    // di antara dua query, token baru tidak boleh menghidupkannya lagi.
    const token = await buatTokenUntukUser({ ...user, sesiVersi: akun.v }, akun.jabatan, roleTujuan, akun.lp);
    const destination = LANDING_ROLE[roleTujuan] ?? "/saya";

    const res = NextResponse.json({ ok: true, redirect: destination });
    res.cookies.set(SESSION_COOKIE_NAME, token, opsiCookieSampai(batasMutlakMs(akun)));
    return res;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: pesanGalatUntukLayar("api.auth.gantiRole", error, "Gagal ganti peran") },
      { status: 500 }
    );
  }
}

