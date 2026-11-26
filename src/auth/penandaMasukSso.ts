/**
 * Cookie sekali pakai "baru saja masuk lewat SSO" - memicu pita
 * `PenandaMasukSso`. Isinya hanya "1"; sengaja TIDAK httpOnly karena dibaca
 * dan dihapus di browser. Tidak memuat NIP, nama, atau apa pun tentang akun.
 */
export const COOKIE_MASUK_SSO = "gajihub_masuk_sso";
export const UMUR_MASUK_SSO_DETIK = 120;

/**
 * Rincian kegagalan SSO untuk halaman login (httpOnly, dibaca server). Sengaja
 * bukan `?pesan=` di URL - lihat `keLogin` di callback.
 */
export const COOKIE_PESAN_SSO = "gajihub_pesan_sso";
export const UMUR_PESAN_SSO_DETIK = 60;
