import type { Role, User } from "@prisma/client";
import { SESSION_MAX_AGE_DETIK, buatTokenSesi } from "./session";
import { LABEL_ROLE } from "./roleLabel";

/**
 * Opsi cookie sesi - SATU definisi, dipakai bareng login kata sandi (Server Action)
 * dan login SSO (Route Handler). Dua salinan opsi cookie pasti berbeda cepat
 * atau lambat, dan bedanya muncul sebagai "login berhasil tapi langsung
 * logout lagi" yang sangat sulit ditelusuri.
 */
function cookieSecure(): boolean {
  return process.env.COOKIE_SECURE?.trim().replace(/^["']|["']$/g, "") === "true";
}

export const OPSI_COOKIE_SESI = {
  httpOnly: true,
  // BUKAN process.env.NODE_ENV === "production" - `next start` SELALU
  // set NODE_ENV=production terlepas dari ada/tidaknya HTTPS, jadi kalau
  // dipakai di situ cookie Secure bakal ke-set walau server jalan HTTP
  // biasa (browser diam-diam MENOLAK nyimpen cookie Secure lewat koneksi
  // non-HTTPS - user kelihatan "berhasil login" tapi langsung logout
  // lagi di request berikutnya). COOKIE_SECURE eksplisit di .env,
  // default false - set "true" begitu server ini sudah pakai HTTPS asli.
  secure: cookieSecure(),
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_MAX_AGE_DETIK,
} as const;

/**
 * Opsi cookie dengan umur sampai batas mutlak sesi (`exp`, ms epoch). Satu-satunya
 * yang berubah dari OPSI_COOKIE_SESI adalah maxAge - secure/sameSite/path tetap
 * dari sumber yang sama, termasuk jalur HTTP internal (COOKIE_SECURE kosong).
 */
export function opsiCookieSampai(exp: number, now = Date.now()) {
  return { ...OPSI_COOKIE_SESI, secure: cookieSecure(), maxAge: Math.max(1, Math.ceil((exp - now) / 1000)) };
}

/**
 * Menerbitkan token sesi untuk satu akun `User`.
 *
 * INI TITIK PENTING DALAM PERPINDAHAN KE SSO: yang berubah waktu SSO
 * dipasang hanyalah CARA MEMBUKTIKAN IDENTITAS (kata sandi akun uji coba vs Naco).
 * Setelah identitas terbukti, keduanya bermuara ke fungsi ini, dan seluruh
 * lapisan di atasnya - peran, otorisasi (`src/auth/permissions.ts`), scope
 * satuan kerja, multi-role - tidak berubah sama sekali.
 */
export async function buatTokenUntukUser(
  user: Pick<User, "id" | "nip" | "nama" | "role" | "satuanKerja"> & { sesiVersi?: number },
  jabatan?: string | null,
  roleAktif?: Role,
  /** Hanya untuk ganti role: teruskan `lp` sesi berjalan agar 8 jam tidak terulang. */
  loginPada?: number
): Promise<string> {
  const role = roleAktif ?? user.role;
  return buatTokenSesi({
    userId: user.id,
    nip: user.nip,
    nama: user.nama,
    role,
    satuanKerja: user.satuanKerja,
    jabatan: jabatan || LABEL_ROLE[role],
    v: user.sesiVersi ?? 0,
    lp: loginPada,
  });
}
