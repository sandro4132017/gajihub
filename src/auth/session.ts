// ============================================================================
// AUTH - session sederhana buat login berbasis model User (7 role).
//
// Pegawai masuk lewat SSO Kemnaker. Login berkata sandi hanya untuk akun uji
// coba (DEV_AUTH_*) dan akun penguji; NIP TIDAK PERNAH dipakai sebagai
// username/password. Lihat src/auth/kredensialLogin.ts.
//
// Model AkunApprover (login approver lama) masih ada di schema tapi SUDAH
// TIDAK DIPAKAI oleh /login lagi - digantikan alur berbasis User ini.
// Belum dihapus (lihat catatan di model-nya), tapi jangan dikembangkan lagi.
//
// Cookie session ditandatangani (HMAC-SHA256) supaya tidak bisa diubah dari
// browser, TAPI tidak dienkripsi (isinya nip/nama/role/satuanKerja, bukan
// data rahasia). Pakai Web Crypto (crypto.subtle + btoa/atob) - BUKAN Node
// "crypto"/Buffer - supaya file ini jalan baik di Node (Server Action)
// MAUPUN Edge runtime (middleware.ts). Jangan import "next/headers" di sini;
// itu taruh di getSessionAccount.ts yang cuma dipakai Server Component/Action.
// ============================================================================

import type { Role } from "@prisma/client";

export const SESSION_COOKIE_NAME = "gajihub_session";

/** Batas mutlak sesi: 8 jam sejak LOGIN. Ganti role tidak mengulangnya. */
export const SESSION_MAX_AGE_DETIK = 60 * 60 * 8;

/**
 * Batas menganggur bawaan: 30 menit tanpa aktivitas. `SESI_MENGANGGUR_MENIT`
 * hanya untuk menguji (mis. 1); nilai tak valid jatuh ke 30.
 */
export const MENGANGGUR_BAWAAN_MENIT = 30;
export function batasMenganggurMs(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.SESI_MENGANGGUR_MENIT?.trim());
  const menit = Number.isFinite(n) && n > 0 ? n : MENGANGGUR_BAWAAN_MENIT;
  return menit * 60 * 1000;
}

/** Cookie baru diterbitkan paling sering sekali per jeda ini, bukan tiap permintaan. */
export const JEDA_PERPANJANG_MS = 60 * 1000;

export interface SessionPayload {
  userId: string;
  nip: string;
  nama: string;
  role: Role;
  satuanKerja: string | null;
  // Jabatan buat ditampilkan/dicatat di ApprovalLog.approverJabatan -
  // diresolve dari data Pegawai (kalau nip-nya cocok), fallback ke label
  // role kalau tidak ada. Lihat loginAction.
  jabatan: string;
  /** Versi sesi akun (User.sesiVersi) saat token terbit; beda dengan database = dicabut. */
  v: number;
  /** Waktu LOGIN (ms epoch). Dasar batas mutlak; tidak berubah selama sesi. */
  lp: number;
  /** Waktu aktivitas terakhir yang tercatat (ms epoch). Dasar batas menganggur. */
  ak: number;
}

interface SessionPayloadTersimpan extends SessionPayload {
  /** Batas mutlak = lp + 8 jam. */
  exp: number;
}

export type StatusSesi = "ok" | "tidak-ada" | "kedaluwarsa" | "menganggur" | "format-lama";

export interface HasilNilaiSesi {
  status: StatusSesi;
  payload: SessionPayload | null;
}

function getSecretKey(): string {
  const raw = process.env.SESSION_SECRET?.trim();
  const secret = raw ? raw.replace(/^["']|["']$/g, "") : "";
  if (!secret || new TextEncoder().encode(secret).length < 32) {
    throw new Error(
      "SESSION_SECRET wajib diatur dengan nilai acak minimal 32 byte."
    );
  }
  return secret;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getHmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecretKey()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export type MasukanTokenSesi = Omit<SessionPayload, "v" | "lp" | "ak"> &
  Partial<Pick<SessionPayload, "v" | "lp" | "ak">>;

async function tandatangani(tersimpan: SessionPayloadTersimpan): Promise<string> {
  const key = await getHmacKey();
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(tersimpan)));
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Token baru. `lp` bawaan = sekarang (login baru); ganti role meneruskan `lp`
 * sesi berjalan supaya batas 8 jam tidak terulang. `exp` SELALU lp + 8 jam.
 */
export async function buatTokenSesi(payload: MasukanTokenSesi, now = Date.now()): Promise<string> {
  const lp = payload.lp ?? now;
  return tandatangani({ ...payload, v: payload.v ?? 0, lp, ak: payload.ak ?? now, exp: lp + SESSION_MAX_AGE_DETIK * 1000 });
}

/** Terbitkan ulang token yang sama dengan `ak` = now; lp/exp/v dipertahankan. */
export async function terbitkanUlang(payload: SessionPayload, now = Date.now()): Promise<string> {
  return tandatangani({ ...payload, ak: now, exp: batasMutlakMs(payload) });
}

/** Perlu cookie baru bila aktivitas terakhir tercatat sudah >= 60 detik lalu. */
export function perluPerpanjang(payload: SessionPayload, now = Date.now()): boolean {
  return now - payload.ak >= JEDA_PERPANJANG_MS;
}

/** Batas mutlak sesi (ms epoch) = login + 8 jam. */
export function batasMutlakMs(payload: Pick<SessionPayload, "lp">): number {
  return payload.lp + SESSION_MAX_AGE_DETIK * 1000;
}

/**
 * Menilai token: tanda tangan, format, batas mutlak, batas menganggur.
 * Tidak melempar untuk cookie cacat (lihat catatan di bawah); hanya
 * SESSION_SECRET yang salah yang melempar.
 */
export async function nilaiTokenSesi(
  token: string | null | undefined,
  now = Date.now(),
  menganggurMs = batasMenganggurMs()
): Promise<HasilNilaiSesi> {
  if (!token) return { status: "tidak-ada", payload: null };
  const [payloadB64, signatureB64] = token.split(".");
  if (!payloadB64 || !signatureB64) return { status: "tidak-ada", payload: null };

  // getSecretKey() SENGAJA dipanggil DI LUAR try di bawah: kunci yang belum
  // diatur adalah salah konfigurasi server, bukan cookie yang cacat, jadi harus
  // tetap melempar supaya penyebabnya terbaca - bukan diam-diam jadi "tidak
  // ada sesi".
  const key = await getHmacKey();

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(signatureB64) as BufferSource,
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return { status: "tidak-ada", payload: null };

    const mentah = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payloadB64))
    ) as Partial<SessionPayloadTersimpan>;
    // Token dari sebelum batas menganggur (tanpa v/lp/ak) tidak dipercaya lagi.
    if (typeof mentah.v !== "number" || typeof mentah.lp !== "number" || typeof mentah.ak !== "number") {
      return { status: "format-lama", payload: null };
    }
    if (typeof mentah.exp !== "number") return { status: "tidak-ada", payload: null };
    const { exp, ...payload } = mentah as SessionPayloadTersimpan;
    if (exp <= now) return { status: "kedaluwarsa", payload: null };
    if (now - payload.ak >= menganggurMs) return { status: "menganggur", payload: null };
    return { status: "ok", payload };
  } catch {
    // Cookie yang tidak bisa diurai BUKAN sesi - titik. Sebelumnya `atob` di
    // dalam base64UrlDecode melempar "Invalid character" dan lemparan itu
    // menembus sampai ke middleware, tempat satu lemparan berarti HTTP 500
    // untuk SELURUH halaman; korbannya bahkan tidak bisa membuka /login untuk
    // membuang cookie-nya.
    return { status: "tidak-ada", payload: null };
  }
}

/** Payload hanya bila status "ok"; selain itu null. */
export async function verifikasiTokenSesi(token: string, now = Date.now()): Promise<SessionPayload | null> {
  return (await nilaiTokenSesi(token, now)).payload;
}
