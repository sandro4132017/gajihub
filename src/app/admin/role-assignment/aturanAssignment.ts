import type { Role } from "@prisma/client";

/**
 * Aturan murni untuk mengubah / membuat akun lewat Kelola Assignment Role.
 * Dasar: temuan pentest Pusdatik 6 Nov 2026 (F-01) - satu sesi Admin tidak
 * boleh bisa menaikkan dirinya sendiri atau memberi ADMIN tanpa disengaja.
 */

/** Kolom akun yang dikirim ke browser - sengaja minimal, tanpa kolom internal lain. */
export type BarisAkun = {
  id: string;
  nip: string;
  nama: string;
  role: Role;
  rolesTambahan: Role[];
  satuanKerja: string | null;
  aktif: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function idSah(nilai: string): boolean {
  return UUID.test(nilai);
}

export type HasilPeriksa = { ok: true } | { ok: false; error: string };

const adaAdmin = (role: Role, rolesTambahan: readonly Role[]) =>
  role === "ADMIN" || rolesTambahan.includes("ADMIN");

/**
 * Periksa permintaan ubah akun yang sudah ada.
 * - Akun sendiri tidak boleh diubah (mencegah kunci diri / naik pangkat sendiri).
 * - Memberi ADMIN yang BELUM dimiliki akun itu wajib dikonfirmasi (`konfirmasiAdmin === "ya"`).
 */
export function periksaUbahAssignment(p: {
  aktorId: string;
  aktorNip: string;
  targetUserId: string;
  targetNip?: string;
  roleSebelum?: { role: Role; rolesTambahan: readonly Role[] };
  roleBaru: Role;
  rolesTambahanBaru: readonly Role[];
  konfirmasiAdmin: string;
}): HasilPeriksa {
  if (!idSah(p.targetUserId)) return { ok: false, error: "Akun yang dipilih tidak dikenali." };
  if (p.targetUserId === p.aktorId || (p.targetNip !== undefined && p.targetNip === p.aktorNip)) {
    return {
      ok: false,
      error: "Akun kamu sendiri tidak bisa diubah dari sini. Minta Admin lain untuk mengubahnya.",
    };
  }
  const sudahAdmin = p.roleSebelum ? adaAdmin(p.roleSebelum.role, p.roleSebelum.rolesTambahan) : false;
  if (adaAdmin(p.roleBaru, p.rolesTambahanBaru) && !sudahAdmin && p.konfirmasiAdmin !== "ya") {
    return { ok: false, error: "Centang konfirmasi dulu sebelum memberi akses Admin." };
  }
  return { ok: true };
}

/** Periksa permintaan membuat akun baru. */
export function periksaBuatAkun(p: {
  pegawaiId: string;
  role: Role;
  konfirmasiAdmin: string;
}): HasilPeriksa {
  if (!idSah(p.pegawaiId)) return { ok: false, error: "Pegawai yang dipilih tidak dikenali." };
  if (p.role === "ADMIN" && p.konfirmasiAdmin !== "ya") {
    return { ok: false, error: "Centang konfirmasi dulu sebelum memberi akses Admin." };
  }
  return { ok: true };
}
