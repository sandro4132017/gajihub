"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Pegawai, User } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { SESSION_COOKIE_NAME } from "../../auth/session";
// Opsi cookie & penerbitan token dipakai bareng login SSO (Route Handler)
// - lihat src/auth/sesiCookie.ts. Dua salinan opsi cookie pasti berbeda
// cepat atau lambat, dan gejalanya "login berhasil tapi langsung logout".
import { OPSI_COOKIE_SESI, buatTokenUntukUser } from "../../auth/sesiCookie";
import { LANDING_ROLE, pilihRoleBawaan } from "../../auth/roleAktif";
import { LABEL_ROLE } from "../../auth/roleLabel";
import { pesanGalatUntukLayar } from "../../lib/koneksi/galatSumber";
import { ssoAktif } from "../../auth/sso";
import { bersihkanNilaiEnv, putuskanLogin } from "../../auth/kredensialLogin";
import { konfigPenguji } from "../../auth/akunPenguji";
import {
  JABATAN_PENGUJI,
  PESAN_PENGUJI_BELUM_SIAP,
  PESAN_PENGUJI_NONAKTIF,
  cariAkunPenguji,
} from "../../auth/akunPengujiDb";

// Login berkata sandi hanya untuk akun uji coba (DEV_AUTH_*) dan akun penguji.
// Tidak ada login memakai NIP; pegawai masuk lewat SSO.

export interface LoginFormState {
  error?: string;
}

export async function loginAction(
  _state: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  let urlTujuan: string | null = null;

  try {
    const inputUsername = String(formData.get("username") ?? "").trim();
    const inputPassword = String(formData.get("password") ?? "").trim();

    if (!inputUsername || !inputPassword) {
      return { error: "Username dan password wajib diisi." };
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
      return {
        error: ssoAktif()
          ? "Username atau password salah. Pegawai masuk memakai Akun Kemnaker (SIAP ID)."
          : "Username atau password salah.",
      };
    }

    const isPenguji = keputusan.jenis === "PENGUJI";

    let user: User | null;
    let pegawai: Pegawai | null;

    if (isPenguji) {
      const akunPenguji = await cariAkunPenguji();
      if (akunPenguji.status === "belum") return { error: PESAN_PENGUJI_BELUM_SIAP };
      if (akunPenguji.status === "nonaktif") return { error: PESAN_PENGUJI_NONAKTIF };
      user = akunPenguji.user;
      pegawai = akunPenguji.pegawai;
    } else {
      const targetNip = bersihkanNilaiEnv(process.env.DEV_AUTH_NIP);
      if (!targetNip) {
        console.error("[login] DEV_AUTH_NIP kosong");
        return { error: "Akun uji coba belum siap dipakai. Laporkan ke Admin Gajihub." };
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
        return { error: `Akun dengan NIP ${targetNip} sedang dinonaktifkan. Hubungi Admin Gajihub.` };
      }
    }

    // Jabatan buat ditampilkan & dicatat di ApprovalLog
    // Role bawaan login: urutan kewenangan, bukan otomatis role utama.
    const roleBawaan = pilihRoleBawaan(user);
    const jabatan = isPenguji ? JABATAN_PENGUJI : (pegawai?.jabatan ?? LABEL_ROLE[roleBawaan]);

    const token = await buatTokenUntukUser(user, jabatan, roleBawaan);

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, OPSI_COOKIE_SESI);

    urlTujuan = LANDING_ROLE[roleBawaan];
  } catch (error) {
    return { error: pesanGalatUntukLayar("loginAction", error, "Gagal login") };
  }

  if (urlTujuan) {
    redirect(urlTujuan);
  }

  return {};
}
