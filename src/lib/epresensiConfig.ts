import type pg from "pg";

/**
 * Konfigurasi koneksi ke database e-Presensi dari EPRESENSI_*, dibaca persis
 * seperti `EpresensiAdapter`. Mengembalikan null bila ada yang kosong - tidak
 * melempar dan tidak mencetak apa pun (nilai env tidak boleh bocor ke log).
 *
 * READ-ONLY: database e-Presensi adalah sistem produksi milik pihak lain;
 * semua pemakainya hanya menjalankan SELECT.
 */
export function konfigurasiEpresensi(): pg.ClientConfig | null {
  const { EPRESENSI_HOST, EPRESENSI_PORT, EPRESENSI_DB, EPRESENSI_USER, EPRESENSI_PASSWORD } =
    process.env;
  if (!EPRESENSI_HOST || !EPRESENSI_DB || !EPRESENSI_USER || !EPRESENSI_PASSWORD) return null;
  return {
    host: EPRESENSI_HOST,
    port: EPRESENSI_PORT ? Number(EPRESENSI_PORT) : 5432,
    database: EPRESENSI_DB,
    user: EPRESENSI_USER,
    password: EPRESENSI_PASSWORD,
  };
}
