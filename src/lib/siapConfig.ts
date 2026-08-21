import type { config as SqlConfig } from "mssql";

/**
 * SATU-SATUNYA tempat konfigurasi koneksi ke database SIAP dibentuk.
 *
 * Disatukan karena cara gagalnya berbahaya: kalau dua salinan diarahkan ke
 * instance berbeda, TIDAK ADA error - importer mengambil pegawai dari satu
 * database sementara pemetaan `id_pegawai -> NIP` mengambil dari yang lain,
 * dan yang muncul cuma "sekian pegawai dilewati".
 *
 * READ-ONLY: seluruh pemakainya hanya menjalankan SELECT.
 *
 * NAMED INSTANCE - server SIAP menjalankan LEBIH DARI SATU instance dengan
 * nama database SAMA PERSIS (`simpeg_kemnaker_24102018`):
 *   SQLEXPRESS2014 (default, 1433) - data lama, berhenti ±Agustus 2025
 *   MSSQLDEV       (named)         - data terkini
 * Salah pilih TIDAK menghasilkan error, cuma data lama yang terlihat wajar.
 * Named instance portnya dinamis (ditemukan lewat SQL Server Browser, UDP
 * 1434), jadi kalau `SIAP_INSTANCE` diisi, `SIAP_PORT` SENGAJA DIABAIKAN -
 * mengirim keduanya membuat driver memakai port dan diam-diam menyambung ke
 * instance yang salah.
 *
 * SIAP_ENCRYPT - MSSQLDEV memutus koneksi (ECONNRESET) begitu hasil query
 * cukup besar selama enkripsi menyala; dibuktikan berdampingan dengan query
 * yang sama (encrypt true -> ECONNRESET, false -> 5.078 baris / 8 detik).
 * Penyebabnya TLS 1.0 yang sudah usang.
 * KONSEKUENSINYA: dengan "false", nama/NIP/jabatan lewat TANPA enkripsi di
 * jaringan kantor (paket login tetap dienkripsi SQL Server sendiri).
 * Trade-off sadar. Perbaikan yang benar: naikkan SIAP ke TLS 1.2, lalu hapus
 * SIAP_ENCRYPT dan cryptoCredentialsDetails. Default `true` supaya tidak ada
 * yang kehilangan enkripsi karena lupa mengisi variabel.
 */
export function konfigurasiSiap(): SqlConfig {
  const { SIAP_HOST, SIAP_PORT, SIAP_INSTANCE, SIAP_DB, SIAP_USER, SIAP_PASSWORD, SIAP_ENCRYPT } =
    process.env;

  if (!SIAP_HOST || !SIAP_DB || !SIAP_USER || !SIAP_PASSWORD) {
    throw new Error(
      "Kredensial SIAP belum lengkap di .env - butuh SIAP_HOST, SIAP_DB, SIAP_USER, SIAP_PASSWORD."
    );
  }

  const instance = SIAP_INSTANCE?.trim();

  return {
    server: SIAP_HOST,
    database: SIAP_DB,
    user: SIAP_USER,
    password: SIAP_PASSWORD,
    // Named instance dan port tetap saling meniadakan - lihat catatan di atas.
    ...(instance ? {} : { port: SIAP_PORT ? Number(SIAP_PORT) : 1433 }),
    options: {
      ...(instance ? { instanceName: instance } : {}),
      encrypt: SIAP_ENCRYPT?.trim().toLowerCase() !== "false",
      trustServerCertificate: true,
      enableArithAbort: true,
      // SIAP jalan di SQL Server 2014 yang cuma bicara TLS 1.0, sementara
      // Node 22+ (OpenSSL 3) menolak apa pun di bawah TLS 1.2 beserta cipher
      // lamanya. Dua baris ini menurunkan batas itu KHUSUS koneksi ini -
      // tanpanya koneksi gagal dengan ERR_SSL_UNSUPPORTED_PROTOCOL.
      cryptoCredentialsDetails: {
        minVersion: "TLSv1",
        ciphers: "DEFAULT@SECLEVEL=0",
      },
    },
    connectionTimeout: 30_000,
    requestTimeout: 180_000,
  } as SqlConfig;
}

/** Buat log/pesan error: "192.168.212.108\MSSQLDEV/simpeg_kemnaker_24102018". */
export function labelSumberSiap(): string {
  const inst = process.env.SIAP_INSTANCE?.trim();
  const host = process.env.SIAP_HOST ?? "?";
  const lokasi = inst ? `${host}\\${inst}` : `${host}:${process.env.SIAP_PORT ?? 1433}`;
  return `${lokasi}/${process.env.SIAP_DB ?? "?"}`;
}
