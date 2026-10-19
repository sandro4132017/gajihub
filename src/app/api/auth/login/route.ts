import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { SESSION_COOKIE_NAME } from "../../../../auth/session";
import { OPSI_COOKIE_SESI, buatTokenUntukUser } from "../../../../auth/sesiCookie";
import { LANDING_ROLE } from "../../../../auth/roleAktif";
import { LABEL_ROLE } from "../../../../auth/roleLabel";
import { isModeInternal } from "../../../../auth/modeJaringan";

export const dynamic = "force-dynamic";

/**
 * Route Handler untuk login dev / jaringan internal.
 *
 * Menggunakan standar JSON POST request biasa agar 100% kompatibel dan kebal
 * terhadap masalah CSRF Server Action, reverse proxy Pusdatik FortiWeb, maupun
 * streaming header yang sering terjadi di lingkungan jaringan khusus instansi.
 */
export async function POST(req: NextRequest) {
  try {
    let body: { username?: string; password?: string } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Format payload tidak valid." }, { status: 400 });
    }

    const inputUsername = String(body.username ?? "").trim();
    const inputPassword = String(body.password ?? "").trim();

    if (!inputUsername || !inputPassword) {
      return NextResponse.json({ ok: false, error: "Username dan password wajib diisi." }, { status: 400 });
    }

    const devUser = process.env.DEV_AUTH_USER?.trim().replace(/^["']|["']$/g, "");
    const devPass = process.env.DEV_AUTH_PASS?.trim().replace(/^["']|["']$/g, "");
    const modeInternal = isModeInternal() || process.env.ALLOW_NIP_LOGIN === "true";

    const isDevLogin = Boolean(devUser && devPass && inputUsername === devUser && inputPassword === devPass);
    const nipKandidat = inputUsername.replace(/[ .\-]/g, "");
    const isNipFormat = /^\d{18}$/.test(nipKandidat);
    const passClean = inputPassword.replace(/[ .\-]/g, "");
    const isNipLogin = Boolean(
      modeInternal &&
        isNipFormat &&
        (passClean === nipKandidat || (devPass && inputPassword === devPass))
    );

    if (!isDevLogin && !isNipLogin) {
      return NextResponse.json(
        {
          ok: false,
          error: modeInternal
            ? "Username/NIP atau password salah."
            : "Username atau password salah. (Mode Akses Publik aktif: login umum wajib menggunakan Akun SIAP ID / SSO Kemnaker).",
        },
        { status: 401 }
      );
    }

    const targetNip = isDevLogin
      ? process.env.DEV_AUTH_NIP?.trim().replace(/^["']|["']$/g, "")
      : nipKandidat;

    if (!targetNip) {
      return NextResponse.json(
        { ok: false, error: "DEV_AUTH_NIP belum dikonfigurasi di environment (.env)." },
        { status: 500 }
      );
    }

    let user = await prisma.user.findUnique({ where: { nip: targetNip } });
    const pegawai = await prisma.pegawai.findUnique({ where: { nip: targetNip } });

    if (!user) {
      if (isDevLogin) {
        user = await prisma.user.create({
          data: {
            nip: targetNip,
            nama: pegawai?.nama || "Alpha Sandro Adithyaswara",
            role: "ADMIN",
            satuanKerja: pegawai?.satuanKerja || null,
            rolesTambahan: ["PEGAWAI", "KASUBAG_TU", "OSDMA", "PPABP", "PIMPINAN"],
            aktif: true,
          },
        });
      } else if (pegawai) {
        user = await prisma.user.create({
          data: {
            nip: targetNip,
            nama: pegawai.nama,
            role: "PEGAWAI",
            satuanKerja: pegawai.satuanKerja || null,
            rolesTambahan: [],
            aktif: true,
          },
        });
      } else {
        return NextResponse.json(
          { ok: false, error: `NIP ${targetNip} tidak ditemukan di data pegawai Gajihub.` },
          { status: 401 }
        );
      }
    } else if (!user.aktif) {
      return NextResponse.json(
        { ok: false, error: `Akun dengan NIP ${targetNip} berstatus nonaktif di database.` },
        { status: 403 }
      );
    }

    const jabatan = pegawai?.jabatan ?? LABEL_ROLE[user.role];

    const token = await buatTokenUntukUser(user, jabatan);
    const destination = LANDING_ROLE[user.role] ?? "/admin";

    const res = NextResponse.json({ ok: true, redirect: destination });
    res.cookies.set(SESSION_COOKIE_NAME, token, OPSI_COOKIE_SESI);
    return res;
  } catch (error) {
    console.error("[API Login Dev Error]", error);
    return NextResponse.json(
      {
        ok: false,
        error: `Gagal login: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 }
    );
  }
}

