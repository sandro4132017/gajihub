export type ModeJaringan = "INTERNAL" | "PUBLIC";

/**
 * Membaca mode jaringan aktif aplikasi:
 * - "INTERNAL": Akses publik diputus Pusdatik (hanya bisa diakses lewat Intranet / VPN).
 *   Seluruh redirect mempertahankan host/IP internal.
 * - "PUBLIC": Akses domain publik (https://gajihub.kemnaker.go.id) dibuka Pusdatik.
 *   Redirect di balik proxy mengarah ke domain resmi NACO_REDIRECT_URI,
 *   dan login pegawai wajib melalui SSO SIAP ID (kecuali akun uji coba/penguji).
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
