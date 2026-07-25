// ============================================================================
// AUTH - session sederhana buat login berbasis model User (7 role).
//
// TODO(legal-confirm) - RISIKO KEAMANAN YANG DISADARI: login sekarang pakai
// NIP sebagai username SEKALIGUS password (bukan salah ketik - ini permintaan
// eksplisit, sementara sampai SSO Kemnaker tersambung). NIP BUKAN rahasia -
// siapa pun yang tahu/menebak NIP orang lain bisa login SEBAGAI orang itu
// dengan penuh hak akses role-nya. Ini WAJIB diganti begitu SSO tersedia -
// jangan biarkan pola ini jadi permanen. Lihat loginAction di
// src/app/login/actions.ts untuk verifikasinya.
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
const SESSION_MAX_AGE_DETIK = 60 * 60 * 8; // 8 jam

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
}

interface SessionPayloadTersimpan extends SessionPayload {
  exp: number;
}

function getSecretKey(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // TODO(confirm): dev-only fallback - WAJIB set SESSION_SECRET asli
    // (env var, acak, panjang) sebelum dipakai di luar localhost.
    return "dev-only-insecure-secret-jangan-dipakai-di-production";
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

export async function buatTokenSesi(payload: SessionPayload): Promise<string> {
  const key = await getHmacKey();
  const tersimpan: SessionPayloadTersimpan = {
    ...payload,
    exp: Date.now() + SESSION_MAX_AGE_DETIK * 1000,
  };
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(tersimpan)));
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifikasiTokenSesi(token: string): Promise<SessionPayload | null> {
  const [payloadB64, signatureB64] = token.split(".");
  if (!payloadB64 || !signatureB64) return null;

  const key = await getHmacKey();
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlDecode(signatureB64) as BufferSource,
    new TextEncoder().encode(payloadB64)
  );
  if (!valid) return null;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payloadB64))
    ) as SessionPayloadTersimpan;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    const { exp: _exp, ...sisanya } = payload;
    return sisanya;
  } catch {
    return null;
  }
}
