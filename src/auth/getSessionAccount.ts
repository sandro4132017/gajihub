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
//      login sama sekali, dan token dengan versi lama (User.sesiVersi sudah
//      naik karena logout / sesi diputus Admin) ditolak;
//   3. satuanKerja dibaca dari database (bukan dari cookie yang bisa basi).
// Ini menutup celah "role/satuanKerja basi di cookie" untuk SEMUA halaman
// sekaligus - sebelumnya cuma Server Action penting yang fetch ulang User.
import { cookies } from "next/headers";
import type { Role, User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { SESSION_COOKIE_NAME, verifikasiTokenSesi, type SessionPayload } from "./session";
import { daftarRoleTersedia, resolveRoleAktif } from "./roleAktif";
import { konfigPenguji } from "./akunPenguji";
import { NIP_PENGUJI } from "../lib/dataUji";

/**
 * Isi sesi yang sudah divalidasi ke database. `role` = role AKTIF (sudah
 * dipastikan dimiliki akun), `rolesTersedia` = semua role yang boleh dipilih
 * lewat menu "Ganti role".
 */
export interface SesiAktif extends SessionPayload {
  rolesTersedia: Role[];
}

/** Alasan sesi ditolak oleh database; "tidak-ada" = tidak ada cookie / token tak sah. */
export type AlasanSesiDitolak = "tidak-ada" | "dicabut" | "nonaktif";

export type HasilSesi =
  | { ok: true; sesi: SesiAktif }
  | { ok: false; alasan: AlasanSesiDitolak };

async function bacaCookieSesi(): Promise<SessionPayload | typeof PENGUJI_DIMATIKAN | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifikasiTokenSesi(token);
  // Sesi akun penguji ikut mati begitu konfigurasinya dikosongkan atau
  // melewati batas berlaku, tanpa menunggu cookie 8 jamnya habis.
  if (payload && payload.nip === NIP_PENGUJI && !konfigPenguji(process.env)) return PENGUJI_DIMATIKAN;
  return payload;
}

const PENGUJI_DIMATIKAN = Symbol("penguji-dimatikan");

/**
 * Sama dengan getSessionAccount tetapi menyebut ALASAN penolakan, supaya
 * layout bisa mengirim pengunjung ke /login dengan pesan yang tepat.
 * Satu query; versi sesi (`sesiVersi`) dibandingkan dengan `payload.v`.
 */
export async function periksaSesiRinci(): Promise<HasilSesi> {
  const payload = await bacaCookieSesi();
  if (!payload) return { ok: false, alasan: "tidak-ada" };
  // Cookie sah tetapi akun penguji sudah dimatikan: dicabut, cookie harus dibuang.
  if (payload === PENGUJI_DIMATIKAN) return { ok: false, alasan: "dicabut" };

  const user = await prisma.user.findUnique({
    where: { nip: payload.nip },
    select: { role: true, rolesTambahan: true, satuanKerja: true, aktif: true, sesiVersi: true },
  });
  // Cookie sah tetapi akunnya sudah tidak ada: diperlakukan dicabut supaya
  // cookie dibuang (kalau tidak, /login memantul balik ke landing).
  if (!user) return { ok: false, alasan: "dicabut" };
  if (!user.aktif) return { ok: false, alasan: "nonaktif" };
  if (payload.v !== user.sesiVersi) return { ok: false, alasan: "dicabut" };

  return {
    ok: true,
    sesi: {
      ...payload,
      role: resolveRoleAktif(user, payload.role),
      satuanKerja: user.satuanKerja,
      rolesTersedia: daftarRoleTersedia(user),
    },
  };
}

export async function getSessionAccount(): Promise<SesiAktif | null> {
  const hasil = await periksaSesiRinci();
  return hasil.ok ? hasil.sesi : null;
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
  if (!payload || payload === PENGUJI_DIMATIKAN) return null;

  const user = await prisma.user.findUnique({ where: { nip: payload.nip } });
  if (!user || !user.aktif) return null;
  // Versi beda = sesi dicabut (logout / Admin memutus semua sesi).
  if (payload.v !== user.sesiVersi) return null;

  return { ...user, role: resolveRoleAktif(user, payload.role) };
}
