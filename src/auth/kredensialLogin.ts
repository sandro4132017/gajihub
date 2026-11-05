import { createHash, timingSafeEqual } from "node:crypto";
import {
  buatPembatas,
  cocokkanPassword,
  konfigPenguji,
  pembatasPenguji,
  type KonfigPenguji,
  type PembatasPenguji,
} from "./akunPenguji";

/**
 * Keputusan jalur login berbasis kata sandi - dipakai bareng oleh Server
 * Action login dan Route Handler /api/auth/login supaya aturannya tidak bisa
 * berbeda di dua tempat. Tanpa I/O (satu-satunya keadaan: pembatas percobaan
 * di memori, yang bisa diganti saat test).
 *
 * Hanya dua jalur kata sandi. Tidak ada login memakai NIP, dan tidak ada kata
 * sandi induk yang membuka akun orang lain; pegawai masuk lewat SSO.
 * - DEV     : username + kata sandi akun uji coba dari konfigurasi server.
 * - PENGUJI : akun penguji Pusdatik (lihat akunPenguji.ts), di mode jaringan
 *             apa pun, selama konfigurasinya aktif.
 * Tiap akun punya pembatas sendiri: 5 gagal dalam 15 menit -> terkunci 15 menit.
 */

export interface KonfigLogin {
  devUser?: string;
  devPass?: string;
  /** Hasil konfigPenguji(); null/kosong = akun penguji mati. */
  penguji?: KonfigPenguji | null;
}

export type KeputusanLogin = { jenis: "DEV" } | { jenis: "PENGUJI" };

/** Buang tanda kutip pembungkus nilai konfigurasi (gaya .env). */
export function bersihkanNilaiEnv(v: string | undefined): string | undefined {
  return v?.trim().replace(/^["']|["']$/g, "");
}

/**
 * Apakah ada akun berkata sandi yang aktif (akun uji coba lengkap dengan
 * sandinya, atau akun penguji). Bila tidak, halaman login hanya menampilkan SSO.
 */
export function adaLoginKataSandi(env: Record<string, string | undefined>, now: Date = new Date()): boolean {
  const devAktif = Boolean(bersihkanNilaiEnv(env.DEV_AUTH_USER) && bersihkanNilaiEnv(env.DEV_AUTH_PASS));
  return devAktif || konfigPenguji(env, now) !== null;
}

/** Pembatas akun dev - terpisah dari pembatas penguji. */
export const pembatasDev = buatPembatas();

/** Perbandingan waktu-tetap; panjang berbeda aman karena dibandingkan lewat digest. */
function samaAman(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function putuskanLogin(
  input: { username: string; password: string },
  konfig: KonfigLogin,
  now: Date = new Date(),
  pembatas: PembatasPenguji = pembatasPenguji,
  pembatasAkunDev: PembatasPenguji = pembatasDev
): KeputusanLogin | null {
  const { devUser, devPass, penguji } = konfig;

  if (devUser && devPass && input.username === devUser) {
    const sandiCocok = samaAman(input.password, devPass);
    if (pembatasAkunDev.terkunci(now.getTime())) {
      // Ke pengguna tampil sama persis dengan salah sandi biasa; jejaknya
      // hanya di log server, tanpa username maupun kata sandi.
      console.warn("[login] akun uji coba terkunci karena terlalu banyak percobaan salah");
      return null;
    }
    if (sandiCocok) {
      pembatasAkunDev.reset();
      return { jenis: "DEV" };
    }
    pembatasAkunDev.catatGagal(now.getTime());
    return null;
  }

  if (penguji) {
    // Verifikasi scrypt SELALU dijalankan (hasilnya dibuang bila username
    // bukan milik penguji atau akun terkunci) supaya waktu respons tidak
    // membedakan username yang benar dari yang salah.
    const sandiCocok = cocokkanPassword(input.password, penguji.passHash);
    if (input.username === penguji.user) {
      if (pembatas.terkunci(now.getTime())) {
        console.warn("[login] akun penguji terkunci karena terlalu banyak percobaan salah");
        return null;
      }
      if (sandiCocok) {
        pembatas.reset();
        return { jenis: "PENGUJI" };
      }
      pembatas.catatGagal(now.getTime());
      return null;
    }
  }

  return null;
}
