import type { Role, User } from "@prisma/client";
import { buatTokenSesi } from "./session";
import { LABEL_ROLE } from "./roleLabel";

/**
 * Opsi cookie sesi - SATU definisi, dipakai bareng login NIP (Server Action)
 * dan login SSO (Route Handler). Dua salinan opsi cookie pasti berbeda cepat
 * atau lambat, dan bedanya muncul sebagai "login berhasil tapi langsung
 * logout lagi" yang sangat sulit ditelusuri.
 */
export const OPSI_COOKIE_SESI = {
  httpOnly: true,
  // BUKAN process.env.NODE_ENV === "production" - `next start` SELALU
  // set NODE_ENV=production terlepas dari ada/tidaknya HTTPS, jadi kalau
  // dipakai di situ cookie Secure bakal ke-set walau server jalan HTTP
  // biasa (browser diam-diam MENOLAK nyimpen cookie Secure lewat koneksi
  // non-HTTPS - user kelihatan "berhasil login" tapi langsung logout
  // lagi di request berikutnya). COOKIE_SECURE eksplisit di .env,
  // default false - set "true" begitu server ini sudah pakai HTTPS asli.
  secure: process.env.COOKIE_SECURE === "true",
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 8,
} as const;

/**
 * Menerbitkan token sesi untuk satu akun `User`.
 *
 * INI TITIK PENTING DALAM PERPINDAHAN KE SSO: yang berubah waktu SSO
 * dipasang hanyalah CARA MEMBUKTIKAN IDENTITAS (password NIP vs Naco).
 * Setelah identitas terbukti, keduanya bermuara ke fungsi ini, dan seluruh
 * lapisan di atasnya - peran, otorisasi (`src/auth/permissions.ts`), scope
 * satuan kerja, multi-role - tidak berubah sama sekali.
 */
export async function buatTokenUntukUser(
  user: Pick<User, "id" | "nip" | "nama" | "role" | "satuanKerja">,
  jabatan?: string | null,
  roleAktif?: Role
): Promise<string> {
  return buatTokenSesi({
    userId: user.id,
    nip: user.nip,
    nama: user.nama,
    role: roleAktif ?? user.role,
    satuanKerja: user.satuanKerja,
    jabatan: jabatan || LABEL_ROLE[roleAktif ?? user.role],
  });
}
