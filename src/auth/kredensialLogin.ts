import { isNipDummy } from "../lib/dataUji";
import { cocokkanPassword, pembatasPenguji, type KonfigPenguji, type PembatasPenguji } from "./akunPenguji";

/**
 * Keputusan jalur login berbasis kata sandi - dipakai bareng oleh Server
 * Action login dan Route Handler /api/auth/login supaya aturannya tidak bisa
 * berbeda di dua tempat. Tanpa I/O (satu-satunya keadaan: pembatas percobaan
 * akun penguji di memori, yang bisa diganti saat test).
 *
 * Jalur:
 * - DEV     : username + kata sandi akun uji coba dari konfigurasi server.
 * - PENGUJI : akun penguji Pusdatik (lihat akunPenguji.ts), di mode jaringan
 *             apa pun, selama konfigurasinya aktif.
 * - NIP     : hanya saat Mode INTERNAL / ALLOW_NIP_LOGIN, dan kata sandinya
 *             SAMA dengan NIP itu sendiri. Tidak ada kata sandi induk yang
 *             membuka NIP orang lain.
 * NIP berawalan 9999 (data uji) tidak bisa masuk lewat jalur NIP.
 */

export interface KonfigLogin {
  devUser?: string;
  devPass?: string;
  /** Mode INTERNAL atau ALLOW_NIP_LOGIN=true. */
  modeInternal: boolean;
  /** Hasil konfigPenguji(); null/kosong = akun penguji mati. */
  penguji?: KonfigPenguji | null;
}

export type KeputusanLogin =
  | { jenis: "DEV" }
  | { jenis: "PENGUJI" }
  | { jenis: "NIP"; nip: string };

/** Buang tanda kutip pembungkus nilai konfigurasi (gaya .env). */
export function bersihkanNilaiEnv(v: string | undefined): string | undefined {
  return v?.trim().replace(/^["']|["']$/g, "");
}

export function putuskanLogin(
  input: { username: string; password: string },
  konfig: KonfigLogin,
  now: Date = new Date(),
  pembatas: PembatasPenguji = pembatasPenguji
): KeputusanLogin | null {
  const { devUser, devPass, modeInternal, penguji } = konfig;

  if (devUser && devPass && input.username === devUser && input.password === devPass) {
    return { jenis: "DEV" };
  }

  if (penguji) {
    // Verifikasi scrypt SELALU dijalankan (hasilnya dibuang bila username
    // bukan milik penguji atau akun terkunci) supaya waktu respons tidak
    // membedakan username yang benar dari yang salah.
    const sandiCocok = cocokkanPassword(input.password, penguji.passHash);
    if (input.username === penguji.user) {
      if (pembatas.terkunci(now.getTime())) {
        // Ke pengguna tampil sama persis dengan salah sandi biasa; jejaknya
        // hanya di log server, tanpa username maupun kata sandi.
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

  const nip = input.username.replace(/[ .\-]/g, "");
  const passClean = input.password.replace(/[ .\-]/g, "");
  if (modeInternal && /^\d{18}$/.test(nip) && passClean === nip && !isNipDummy(nip)) {
    return { jenis: "NIP", nip };
  }

  return null;
}
