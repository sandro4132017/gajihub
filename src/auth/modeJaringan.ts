export type ModeJaringan = "INTERNAL" | "PUBLIC";

/**
 * Membaca mode jaringan aktif aplikasi:
 * - "INTERNAL": Akses publik diputus Pusdatik (hanya bisa diakses lewat Intranet / VPN).
 *   Seluruh redirect mempertahankan host/IP internal, QR TTE mengarah ke host internal,
 *   dan login NIP 18 digit diaktifkan sebagai cadangan SSO.
 * - "PUBLIC": Akses domain publik (https://gajihub.kemnaker.go.id) dibuka Pusdatik.
 *   Redirect di balik proxy mengarah ke domain resmi NACO_REDIRECT_URI, QR TTE mengarah
 *   ke domain publik, dan login umum wajib melalui SSO SIAP ID (kecuali akun QA/dev).
 */
export function getModeJaringan(): ModeJaringan {
  if (process.env.NODE_ENV === "test" && !process.env.TEST_NETWORK_MODE) {
    return "PUBLIC";
  }
  const raw = (process.env.TEST_NETWORK_MODE || process.env.NETWORK_MODE || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .toUpperCase();
  if (raw === "PUBLIC") return "PUBLIC";
  return "INTERNAL";
}

export function isModeInternal(): boolean {
  return getModeJaringan() === "INTERNAL";
}
