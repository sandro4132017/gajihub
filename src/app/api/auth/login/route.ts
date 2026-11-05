import { NextResponse, type NextRequest } from "next/server";
import type { Pegawai, User } from "@prisma/client";
import { prisma } from "../../../../lib/prisma";
import { SESSION_COOKIE_NAME } from "../../../../auth/session";
import { OPSI_COOKIE_SESI, buatTokenUntukUser } from "../../../../auth/sesiCookie";
import { LANDING_ROLE } from "../../../../auth/roleAktif";
import { LABEL_ROLE } from "../../../../auth/roleLabel";
import { pesanGalatUntukLayar } from "../../../../lib/koneksi/galatSumber";
import { ssoAktif } from "../../../../auth/sso";
import { bersihkanNilaiEnv, putuskanLogin } from "../../../../auth/kredensialLogin";
import { konfigPenguji } from "../../../../auth/akunPenguji";
import {
  JABATAN_PENGUJI,
  PESAN_PENGUJI_BELUM_SIAP,
  PESAN_PENGUJI_NONAKTIF,
  cariAkunPenguji,
} from "../../../../auth/akunPengujiDb";

export const dynamic = "force-dynamic";

/**
 * Route Handler untuk login berkata sandi: akun uji coba dan akun penguji.
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
      return NextResponse.json({ ok: false, error: "Permintaan masuk tidak terbaca. Muat ulang halaman lalu coba lagi." }, { status: 400 });
    }

    const inputUsername = String(body.username ?? "").trim();
    const inputPassword = String(body.password ?? "").trim();

    if (!inputUsername || !inputPassword) {
      return NextResponse.json({ ok: false, error: "Username dan password wajib diisi." }, { status: 400 });
    }

    const keputusan = putuskanLogin(
      { username: inputUsername, password: inputPassword },
      {
        devUser: bersihkanNilaiEnv(process.env.DEV_AUTH_USER),
        devPass: bersihkanNilaiEnv(process.env.DEV_AUTH_PASS),
        penguji: konfigPenguji(process.env),
      }
    );

    if (!keputusan) {
      return NextResponse.json(
        {
          ok: false,
          error: ssoAktif()
            ? "Username atau password salah. Pegawai masuk memakai Akun Kemnaker (SIAP ID)."
            : "Username atau password salah.",
        },
        { status: 401 }
      );
    }

    const isPenguji = keputusan.jenis === "PENGUJI";

    let user: User | null;
    let pegawai: Pegawai | null;

    if (isPenguji) {
      const akunPenguji = await cariAkunPenguji();
      if (akunPenguji.status === "belum") {
        return NextResponse.json({ ok: false, error: PESAN_PENGUJI_BELUM_SIAP }, { status: 401 });
      }
      if (akunPenguji.status === "nonaktif") {
        return NextResponse.json({ ok: false, error: PESAN_PENGUJI_NONAKTIF }, { status: 403 });
      }
      user = akunPenguji.user;
      pegawai = akunPenguji.pegawai;
    } else {
      const targetNip = bersihkanNilaiEnv(process.env.DEV_AUTH_NIP);

      if (!targetNip) {
        console.error("[login] DEV_AUTH_NIP kosong");
        return NextResponse.json(
          { ok: false, error: "Akun uji coba belum siap dipakai. Laporkan ke Admin Gajihub." },
          { status: 500 }
        );
      }

      user = await prisma.user.findUnique({ where: { nip: targetNip } });
      pegawai = await prisma.pegawai.findUnique({ where: { nip: targetNip } });

      if (!user) {
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
      } else if (!user.aktif) {
        return NextResponse.json(
          { ok: false, error: `Akun dengan NIP ${targetNip} sedang dinonaktifkan. Hubungi Admin Gajihub.` },
          { status: 403 }
        );
      }
    }

    const jabatan = isPenguji ? JABATAN_PENGUJI : (pegawai?.jabatan ?? LABEL_ROLE[user.role]);

    const token = await buatTokenUntukUser(user, jabatan);
    const destination = LANDING_ROLE[user.role] ?? "/admin";

    const res = NextResponse.json({ ok: true, redirect: destination });
    res.cookies.set(SESSION_COOKIE_NAME, token, OPSI_COOKIE_SESI);
    return res;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: pesanGalatUntukLayar("api.auth.login", error, "Gagal login") },
      { status: 500 }
    );
  }
}

