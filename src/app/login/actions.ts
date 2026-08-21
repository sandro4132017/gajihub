"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { SESSION_COOKIE_NAME } from "../../auth/session";
// Opsi cookie & penerbitan token dipakai bareng login SSO (Route Handler)
// - lihat src/auth/sesiCookie.ts. Dua salinan opsi cookie pasti berbeda
// cepat atau lambat, dan gejalanya "login berhasil tapi langsung logout".
import { OPSI_COOKIE_SESI, buatTokenUntukUser } from "../../auth/sesiCookie";
import { getSessionAccount } from "../../auth/getSessionAccount";
import { daftarRoleTersedia, LANDING_ROLE } from "../../auth/roleAktif";
import { LABEL_ROLE } from "../../auth/roleLabel";


// TODO(legal-confirm): password = NIP itu sengaja (bukan bug) - permintaan
// eksplisit sebagai solusi SEMENTARA sampai SSO Kemnaker tersambung. Ini
// BUKAN otentikasi yang aman (NIP bukan rahasia) - lihat catatan panjang di
// src/auth/session.ts. WAJIB diganti begitu SSO tersedia.

export interface LoginFormState {
  error?: string;
}

export async function loginAction(
  _state: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  const nip = String(formData.get("nip") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();

  if (!nip || !password) {
    return { error: "NIP dan password wajib diisi." };
  }
  if (password !== nip) {
    return { error: "NIP atau password salah." };
  }

  const user = await prisma.user.findUnique({ where: { nip } });
  if (!user || !user.aktif) {
    return { error: "NIP atau password salah." };
  }

  // Jabatan buat ditampilkan & dicatat di ApprovalLog - ambil dari data
  // Pegawai kalau NIP-nya cocok (sekarang ada 5.069 data pegawai asli),
  // fallback ke label role kalau tidak ketemu.
  const pegawai = await prisma.pegawai.findUnique({ where: { nip } });
  const jabatan = pegawai?.jabatan ?? LABEL_ROLE[user.role];

  const token = await buatTokenUntukUser(user, jabatan);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, OPSI_COOKIE_SESI);

  // Login SELALU mulai dari role UTAMA akun (bukan role tambahan yang
  // terakhir dipakai) - role tambahan dipilih sendiri lewat menu "Ganti
  // role" setelah masuk.
  redirect(LANDING_ROLE[user.role]);
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
    return { error: `Akun kamu tidak punya role ${LABEL_ROLE[roleTujuan] ?? roleTujuan}.` };
  }

  const token = await buatTokenUntukUser(user, akun.jabatan, roleTujuan);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, OPSI_COOKIE_SESI);

  // Diarahkan ke "rumah" role yang baru - kalau tetap di halaman lama,
  // hampir pasti langsung kena "Akses ditolak" (mis. dari /admin ganti ke
  // role Pegawai).
  redirect(LANDING_ROLE[roleTujuan]);
}
