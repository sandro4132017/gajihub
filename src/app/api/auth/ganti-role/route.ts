import { NextResponse, type NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "../../../../lib/prisma";
import { SESSION_COOKIE_NAME } from "../../../../auth/session";
import { OPSI_COOKIE_SESI, buatTokenUntukUser } from "../../../../auth/sesiCookie";
import { getSessionAccount } from "../../../../auth/getSessionAccount";
import { daftarRoleTersedia, LANDING_ROLE } from "../../../../auth/roleAktif";
import { LABEL_ROLE } from "../../../../auth/roleLabel";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let body: { role?: string } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Format request tidak valid." }, { status: 400 });
    }

    const roleTujuan = String(body.role ?? "") as Role;
    if (!roleTujuan) {
      return NextResponse.json({ ok: false, error: "Role tujuan wajib dipilih." }, { status: 400 });
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
        { ok: false, error: `Akun kamu tidak punya role ${LABEL_ROLE[roleTujuan] ?? roleTujuan}.` },
        { status: 403 }
      );
    }

    const token = await buatTokenUntukUser(user, akun.jabatan, roleTujuan);
    const destination = LANDING_ROLE[roleTujuan] ?? "/saya";

    const res = NextResponse.json({ ok: true, redirect: destination });
    res.cookies.set(SESSION_COOKIE_NAME, token, OPSI_COOKIE_SESI);
    return res;
  } catch (error) {
    console.error("[API Ganti Role Error]", error);
    return NextResponse.json(
      { ok: false, error: `Gagal ganti role: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
