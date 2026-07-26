"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "../../lib/prisma";
import { buatTokenSesi, SESSION_COOKIE_NAME } from "../../auth/session";
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

  const token = await buatTokenSesi({
    userId: user.id,
    nip: user.nip,
    nama: user.nama,
    role: user.role,
    satuanKerja: user.satuanKerja,
    jabatan,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
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
  });

  redirect(user.role === "PEGAWAI" ? "/saya" : "/tukin");
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
