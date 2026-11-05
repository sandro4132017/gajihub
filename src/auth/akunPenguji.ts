import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Akun penguji Pusdatik: satu akun uji dengan kata sandi sendiri, hanya aktif
 * di server yang konfigurasinya diisi. Di server tanpa konfigurasi ini, akun
 * tidak ada sama sekali.
 *
 * Konfigurasi (variabel lingkungan):
 * - PENGUJI_USER            nama pengguna
 * - PENGUJI_PASS_HASH       hash kata sandi, format `scrypt:N:r:p:salt:hash`
 *                           (base64url, tanpa karakter `$`). Kata sandinya
 *                           sendiri tidak pernah disimpan di server.
 * - PENGUJI_BERLAKU_SAMPAI  opsional, YYYY-MM-DD, berlaku sampai 23:59:59 WIB.
 *                           Format rusak = akun mati (gagal-aman).
 */

export const PREFIKS_HASH = "scrypt";
const PARAM_BAWAAN = { N: 16384, r: 8, p: 1 } as const;
const PANJANG_HASH = 32;
const PANJANG_SALT = 16;
const OFFSET_WIB_MS = 7 * 60 * 60 * 1000;

export interface KonfigPenguji {
  user: string;
  passHash: string;
  /** Batas akhir berlaku (UTC); null = tanpa batas. */
  berlakuSampai: Date | null;
}

export type EnvPenguji = Record<string, string | undefined>;

function bersih(v: string | undefined): string {
  return (v ?? "").trim().replace(/^["']|["']$/g, "");
}

/** `YYYY-MM-DD` -> akhir hari itu (23:59:59 WIB) dalam UTC; null bila tidak sah. */
export function akhirHariWib(tanggal: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tanggal);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utc = new Date(Date.UTC(y, mo - 1, d, 23, 59, 59));
  if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== mo - 1 || utc.getUTCDate() !== d) return null;
  return new Date(utc.getTime() - OFFSET_WIB_MS);
}

interface HashTerurai {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function uraiHash(teks: string): HashTerurai | null {
  const bagian = teks.split(":");
  if (bagian.length !== 6 || bagian[0] !== PREFIKS_HASH) return null;
  const [N, r, p] = [Number(bagian[1]), Number(bagian[2]), Number(bagian[3])];
  const pangkatDua = Number.isInteger(N) && N >= 1024 && N <= 1 << 17 && (N & (N - 1)) === 0;
  if (!pangkatDua) return null;
  if (!Number.isInteger(r) || r < 1 || r > 8) return null;
  if (!Number.isInteger(p) || p < 1 || p > 4) return null;
  const salt = Buffer.from(bagian[4], "base64url");
  const hash = Buffer.from(bagian[5], "base64url");
  if (salt.length < 8 || hash.length < 16) return null;
  return { N, r, p, salt, hash };
}

/** Buat hash baru dari kata sandi (dipakai test; skrip tools/buat-hash-penguji.mjs memakai format yang sama). */
export function buatHashPenguji(password: string, salt: Buffer = randomBytes(PANJANG_SALT)): string {
  const { N, r, p } = PARAM_BAWAAN;
  const hash = scryptSync(password, salt, PANJANG_HASH, { N, r, p, maxmem: 256 * N * r });
  return [PREFIKS_HASH, N, r, p, salt.toString("base64url"), hash.toString("base64url")].join(":");
}

export function cocokkanPassword(password: string, teksHash: string): boolean {
  const t = uraiHash(teksHash);
  if (!t) return false;
  try {
    const turunan = scryptSync(password, t.salt, t.hash.length, { N: t.N, r: t.r, p: t.p, maxmem: 256 * t.N * t.r });
    return timingSafeEqual(turunan, t.hash);
  } catch {
    return false;
  }
}

/**
 * Konfigurasi akun penguji yang AKTIF saat ini, atau null (tidak diisi, hash
 * rusak, tanggal rusak, atau sudah lewat batas berlaku).
 */
export function konfigPenguji(env: EnvPenguji, now: Date = new Date()): KonfigPenguji | null {
  const user = bersih(env.PENGUJI_USER);
  const passHash = bersih(env.PENGUJI_PASS_HASH);
  if (!user || !passHash || !uraiHash(passHash)) return null;

  const tanggal = bersih(env.PENGUJI_BERLAKU_SAMPAI);
  let berlakuSampai: Date | null = null;
  if (tanggal) {
    berlakuSampai = akhirHariWib(tanggal);
    if (!berlakuSampai) return null;
    if (now.getTime() > berlakuSampai.getTime()) return null;
  }
  return { user, passHash, berlakuSampai };
}

// ---------------------------------------------------------------------------
// Pembatas percobaan: 5 gagal dalam 15 menit -> terkunci 15 menit. Disimpan
// di memori proses (hilang saat restart).
// ---------------------------------------------------------------------------

export const BATAS_GAGAL = 5;
export const JENDELA_MS = 15 * 60 * 1000;
export const KUNCI_MS = 15 * 60 * 1000;

export interface PembatasPenguji {
  terkunci(now: number): boolean;
  catatGagal(now: number): void;
  reset(): void;
}

export function buatPembatas(): PembatasPenguji {
  let gagal: number[] = [];
  let kunciSampai = 0;
  return {
    terkunci(now) {
      return now < kunciSampai;
    },
    catatGagal(now) {
      gagal = gagal.filter((t) => now - t < JENDELA_MS);
      gagal.push(now);
      if (gagal.length >= BATAS_GAGAL) {
        kunciSampai = now + KUNCI_MS;
        gagal = [];
      }
    },
    reset() {
      gagal = [];
      kunciSampai = 0;
    },
  };
}

/** Pembatas bersama untuk proses server ini. */
export const pembatasPenguji = buatPembatas();
