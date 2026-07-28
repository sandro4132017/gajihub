// ============================================================================
// MULTI-ROLE PER AKUN (buat kemudahan TESTING) - pure function, tanpa I/O.
//
// Satu akun boleh punya beberapa role: `role` (utama, dipakai waktu login) +
// `rolesTambahan` (lihat komentar panjang di model User, schema.prisma).
// Pada satu waktu akun tetap berperan sebagai SATU role saja - "role aktif" -
// yang disimpan di cookie sesi (SessionPayload.role) dan bisa diganti lewat
// menu di tombol akun (sidebar).
//
// PENTING - kenapa validasi role aktif ada di sini dan WAJIB dipanggil di
// sisi server: cookie sesi memang ditandatangani (tidak bisa diedit dari
// browser), TAPI isinya bisa jadi BASI - role tambahan bisa dicabut Admin di
// tengah sesi 8 jam yang masih jalan. Jadi role aktif SELALU dicocokkan ulang
// dengan daftar role yang benar-benar dimiliki akun di database
// (lihat getSessionAccount.ts), bukan dipercaya apa adanya.
// ============================================================================

import type { Role } from "@prisma/client";

/** Subset field User yang dibutuhkan buat resolusi role - bukan full Prisma User. */
export interface PemilikRole {
  role: Role;
  rolesTambahan: Role[];
}

/**
 * Daftar role yang boleh dipakai akun ini, role UTAMA selalu paling depan.
 * Duplikat dibuang (mis. role utama ikut ke-centang lagi sebagai tambahan)
 * supaya menu "Ganti role" tidak menampilkan entri kembar.
 */
export function daftarRoleTersedia(user: PemilikRole): Role[] {
  const hasil: Role[] = [user.role];
  for (const r of user.rolesTambahan ?? []) {
    if (!hasil.includes(r)) hasil.push(r);
  }
  return hasil;
}

/** true kalau akun ini punya lebih dari satu role (menu "Ganti role" ditampilkan). */
export function punyaMultiRole(user: PemilikRole): boolean {
  return daftarRoleTersedia(user).length > 1;
}

/**
 * Role aktif yang BOLEH dipakai: kandidat (dari cookie sesi / pilihan user)
 * kalau memang dimiliki akun, kalau tidak JATUH BALIK ke role utama.
 *
 * Sengaja fallback (bukan melempar error): kasus paling umum adalah role
 * tambahan dicabut Admin saat sesi masih jalan - user tidak perlu diblokir,
 * cukup dikembalikan ke kewenangan utamanya.
 */
export function resolveRoleAktif(user: PemilikRole, kandidat: Role | null | undefined): Role {
  if (kandidat && daftarRoleTersedia(user).includes(kandidat)) return kandidat;
  return user.role;
}

/**
 * Halaman tujuan setelah login / setelah ganti role - satu-satunya sumber
 * kebenaran supaya keduanya tidak beda sendiri.
 *
 * Dulu login mengarahkan semua role non-PEGAWAI ke /tukin, padahal /tukin
 * bahkan tidak ada di menu OSDMA/PIMPINAN/ADMIN (lihat MENU_* di
 * src/app/AppShell.tsx) - jadi mereka mendarat di halaman yang bukan
 * "rumah"-nya. Sekarang tiap role diarahkan ke dashboard menu pertamanya.
 */
export const LANDING_ROLE: Record<Role, string> = {
  PEGAWAI: "/saya",
  KASUBAG_TU: "/kasubag",
  OSDMA: "/osdma",
  PPABP: "/ppabp",
  PIMPINAN: "/pimpinan",
  ADMIN: "/admin",
};
