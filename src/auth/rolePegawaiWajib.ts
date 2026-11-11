// Aturan: setiap akun yang NIP-nya ada di tabel Pegawai WAJIB punya role
// PEGAWAI (keputusan user), supaya ia selalu bisa membuka halaman data
// dirinya lewat menu "Ganti role" walau role utamanya PPABP / Kasubag TU / dst.
// Pure function, tanpa I/O - dipakai semua jalur yang menulis role akun dan
// job `lengkapi:role-pegawai`.
import type { Role } from "@prisma/client";

export interface RoleAkun {
  role: Role;
  rolesTambahan: readonly Role[];
}

/**
 * Role tambahan yang sudah dilengkapi.
 * - punyaDataPegawai && role utama != PEGAWAI -> PEGAWAI ada di tambahan
 *   (ditambahkan di AKHIR bila belum ada; urutan lainnya dipertahankan).
 * - role utama PEGAWAI -> PEGAWAI dibuang dari tambahan (sudah role utama).
 * - Duplikat dibuang; hasil selalu array baru; idempoten.
 * - Tanpa data Pegawai: tambahan tidak ditambah apa pun.
 */
export function lengkapiRolePegawai(akun: RoleAkun, punyaDataPegawai: boolean): Role[] {
  const hasil: Role[] = [];
  for (const r of akun.rolesTambahan ?? []) {
    if (r === akun.role || hasil.includes(r)) continue;
    hasil.push(r);
  }
  if (punyaDataPegawai && akun.role !== "PEGAWAI" && !hasil.includes("PEGAWAI")) hasil.push("PEGAWAI");
  return hasil;
}

/** true kalau akun ini melanggar aturan (ada data Pegawai tapi tidak punya role PEGAWAI). */
export function kekuranganRolePegawai(akun: RoleAkun, punyaDataPegawai: boolean): boolean {
  return punyaDataPegawai && akun.role !== "PEGAWAI" && !(akun.rolesTambahan ?? []).includes("PEGAWAI");
}
