// ============================================================================
// MULTI-ROLE PER AKUN (buat kemudahan TESTING) - pure function, tanpa I/O.
//
// Satu akun boleh punya beberapa role: `role` (utama) + `rolesTambahan` (lihat
// komentar panjang di model User, schema.prisma). Role yang dipakai SAAT LOGIN
// ditentukan pilihRoleBawaan() di bawah (urutan kewenangan atas gabungan
// keduanya), BUKAN otomatis role utama.
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
 * kalau memang dimiliki akun, kalau tidak JATUH BALIK ke role bawaan login.
 *
 * Sengaja fallback (bukan melempar error): kasus paling umum adalah role
 * tambahan dicabut Admin saat sesi masih jalan - user tidak perlu diblokir,
 * cukup dikembalikan ke role bawaannya.
 */
export function resolveRoleAktif(user: PemilikRole, kandidat: Role | null | undefined): Role {
  if (kandidat && daftarRoleTersedia(user).includes(kandidat)) return kandidat;
  return pilihRoleBawaan(user);
}

/**
 * Urutan role bawaan saat login, dari yang diutamakan (keputusan user
 * 2026-11-11, tabel konfigurasi akun): Pimpinan > Kasubag TU > PPABP > OSDMA >
 * Pegawai. Contoh: Kasubag TU + PPABP masuk sebagai Kasubag TU.
 *
 * ADMIN paling akhir: dipakai hanya bila akun tidak punya role lain, supaya
 * akun Admin yang juga memegang role kerja langsung mendarat di dashboard
 * kerjanya. Role Utama (User.role) tetap dipilih manual oleh Admin dan TIDAK
 * menentukan role saat login.
 */
export const URUTAN_ROLE_BAWAAN: readonly Role[] = [
  "PIMPINAN",
  "KASUBAG_TU",
  "PPABP",
  "OSDMA",
  "PEGAWAI",
  "ADMIN",
];

/**
 * Role yang dipakai saat login (semua jalur): role pertama menurut
 * URUTAN_ROLE_BAWAAN yang dimiliki akun, dari gabungan role utama + tambahan.
 * Urutan masukan tidak berpengaruh.
 */
export function pilihRoleBawaan(user: PemilikRole): Role {
  const dimiliki = daftarRoleTersedia(user);
  return URUTAN_ROLE_BAWAAN.find((r) => dimiliki.includes(r)) ?? user.role;
}

/**
 * Halaman tujuan setelah login / setelah ganti role - satu-satunya sumber
 * kebenaran supaya keduanya tidak beda sendiri.
 *
 * Dulu login mengarahkan semua role non-PEGAWAI ke /tukin, padahal /tukin
 * bahkan tidak ada di menu OSDMA/PIMPINAN/ADMIN (lihat MENU_* di
 * src/components/layout/AppShell.tsx) - jadi mereka mendarat di halaman yang bukan
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
