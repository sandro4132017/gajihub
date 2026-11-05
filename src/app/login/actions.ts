"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Pegawai, Role, User } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { SESSION_COOKIE_NAME } from "../../auth/session";
// Opsi cookie & penerbitan token dipakai bareng login SSO (Route Handler)
// - lihat src/auth/sesiCookie.ts. Dua salinan opsi cookie pasti berbeda
// cepat atau lambat, dan gejalanya "login berhasil tapi langsung logout".
import { OPSI_COOKIE_SESI, buatTokenUntukUser } from "../../auth/sesiCookie";
import { getSessionAccount } from "../../auth/getSessionAccount";
import { daftarRoleTersedia, LANDING_ROLE } from "../../auth/roleAktif";
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
    const jabatan = isPenguji ? JABATAN_PENGUJI : (pegawai?.jabatan ?? LABEL_ROLE[user.role]);

    const token = await buatTokenUntukUser(user, jabatan);

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, OPSI_COOKIE_SESI);

    urlTujuan = LANDING_ROLE[user.role];
  } catch (error) {
    return { error: pesanGalatUntukLayar("loginAction", error, "Gagal login") };
  }

  if (urlTujuan) {
    redirect(urlTujuan);
  }

  return {};
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}

export interface GantiRoleFormState {
  error?: string;
}

/**
 * Ganti ROLE AKTIF sesi (menu di tombol akun, sidebar kiri bawah) - buat
 * kemudahan TESTING: satu penguji bisa mencoba alur lintas role tanpa
 * logout-login pakai NIP orang lain. Lihat komentar panjang di model User
 * (schema.prisma) soal batasan & TODO(confirm) production-nya.
 *
 * Yang dilakukan: cuma menerbitkan ulang cookie sesi dengan role yang
 * dipilih. TIDAK mengubah data akun sama sekali (`User.role` di database
 * tetap role utama) - jadi ini murni "ganti sudut pandang", bukan promosi/
 * demosi role.
 *
 * Role tujuan diverifikasi ULANG ke database (daftarRoleTersedia), BUKAN
 * dipercaya dari form: tanpa itu, siapa pun bisa mengirim role="ADMIN" lewat
 * DevTools dan langsung memegang kewenangan penuh.
 */
export async function gantiRoleAction(
  _state: GantiRoleFormState,
  formData: FormData
): Promise<GantiRoleFormState> {
  const roleTujuan = String(formData.get("role") ?? "") as Role;

  const akun = await getSessionAccount();
  if (!akun) return { error: "Sesi login sudah habis - silakan login ulang." };

  const user = await prisma.user.findUnique({ where: { nip: akun.nip } });
  if (!user || !user.aktif) return { error: "Akun tidak aktif - silakan login ulang." };

  if (!daftarRoleTersedia(user).includes(roleTujuan)) {
    return { error: `Akun kamu tidak punya peran ${LABEL_ROLE[roleTujuan] ?? roleTujuan}.` };
  }

  const token = await buatTokenUntukUser(user, akun.jabatan, roleTujuan);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, OPSI_COOKIE_SESI);

  // Diarahkan ke "rumah" role yang baru - kalau tetap di halaman lama,
  // hampir pasti langsung kena "Akses ditolak" (mis. dari /admin ganti ke
  // role Pegawai).
  redirect(LANDING_ROLE[roleTujuan]);
}
