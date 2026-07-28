// Server-only. Pakai di Server Component / Server Action, BUKAN middleware.ts
// (middleware pakai request.cookies langsung + verifikasiTokenSesi dari
// session.ts, karena "next/headers" tidak didukung di Edge middleware).
//
// SEJAK MULTI-ROLE: kedua fungsi di file ini SELALU mengambil baris User dari
// database, tidak lagi cuma mendekode cookie. Alasannya cookie sesi berumur 8
// jam sementara role/role tambahan/status aktif akun bisa diubah Admin di
// tengah sesi itu - jadi:
//   1. role AKTIF dari cookie dicocokkan ulang dengan role yang benar-benar
//      dimiliki akun (resolveRoleAktif) - kalau role tambahannya sudah
//      dicabut, user otomatis balik ke role utamanya, bukan tetap memegang
//      kewenangan yang sudah tidak dia punya;
//   2. akun yang sudah dinonaktifkan (aktif = false) langsung dianggap tidak
//      login sama sekali;
//   3. satuanKerja dibaca dari database (bukan dari cookie yang bisa basi).
// Ini menutup celah "role/satuanKerja basi di cookie" untuk SEMUA halaman
// sekaligus - sebelumnya cuma Server Action penting yang fetch ulang User.
import { cookies } from "next/headers";
import type { Role, User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { SESSION_COOKIE_NAME, verifikasiTokenSesi, type SessionPayload } from "./session";
import { daftarRoleTersedia, resolveRoleAktif } from "./roleAktif";

/**
 * Isi sesi yang sudah divalidasi ke database. `role` = role AKTIF (sudah
 * dipastikan dimiliki akun), `rolesTersedia` = semua role yang boleh dipilih
 * lewat menu "Ganti role".
 */
export interface SesiAktif extends SessionPayload {
  rolesTersedia: Role[];
}

async function bacaCookieSesi(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifikasiTokenSesi(token);
}

export async function getSessionAccount(): Promise<SesiAktif | null> {
  const payload = await bacaCookieSesi();
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { nip: payload.nip },
    select: { role: true, rolesTambahan: true, satuanKerja: true, aktif: true },
  });
  if (!user || !user.aktif) return null;

  return {
    ...payload,
    role: resolveRoleAktif(user, payload.role),
    satuanKerja: user.satuanKerja,
    rolesTersedia: daftarRoleTersedia(user),
  };
}

/**
 * Baris User LENGKAP dari database dengan `role` sudah diganti role AKTIF
 * sesi - dipakai Server Action yang butuh field lain (id buat relasi
 * diajukanOlehId, nama, dst) SEKALIGUS keputusan otorisasi.
 *
 * Menggantikan pola lama `getSessionAccount()` lalu
 * `prisma.user.findUnique({ where: { nip: akun.nip } })` yang tersebar di
 * banyak action: pola itu selalu memakai role UTAMA dari database, jadi kalau
 * dibiarkan, user yang sedang ganti role tetap dinilai dengan role lamanya.
 * Satu query, bukan dua.
 */
export async function ambilUserSesi(): Promise<User | null> {
  const payload = await bacaCookieSesi();
  if (!payload) return null;

  const user = await prisma.user.findUnique({ where: { nip: payload.nip } });
  if (!user || !user.aktif) return null;

  return { ...user, role: resolveRoleAktif(user, payload.role) };
}
