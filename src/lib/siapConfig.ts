import type { config as SqlConfig } from "mssql";

/**
 * SATU-SATUNYA tempat konfigurasi koneksi ke database SIAP dibentuk.
 *
 * Sebelumnya konfigurasi ini disalin di dua tempat (`src/jobs/importPegawaiSiap.ts`
 * dan `src/adapters/EpresensiAdapter.ts`). Itu berbahaya bukan karena
 * duplikasinya, tapi karena cara gagalnya: kalau salah satu diarahkan ke
 * server/instance yang berbeda, TIDAK ADA error sama sekali - importer
 * mengambil daftar pegawai dari satu database, sementara pemetaan
 * `id_pegawai -> NIP` untuk presensi mengambil dari database lain. Yang
 * muncul cuma "sekian pegawai dilewati", dan penyebabnya nyaris mustahil
 * ditebak. Makanya disatukan.
 *
 * READ-ONLY: seluruh pemakai modul ini hanya menjalankan SELECT. SIAP adalah
 * source of truth kepegawaian - Gajihub cuma mencerminkannya.
 *
 * ---------------------------------------------------------------------------
 * NAMED INSTANCE (SIAP_INSTANCE)
 * ---------------------------------------------------------------------------
 * Server SIAP `192.168.212.108` menjalankan LEBIH DARI SATU instance SQL
 * Server di satu mesin (`WIN-7NU35GEFU25`), dan isinya BERBEDA jauh:
 *
 *   SQLEXPRESS2014 (default, port 1433) - data lama, berhenti ±Agustus 2025
 *   MSSQLDEV       (named instance)     - data terkini
 *
 * Keduanya punya database bernama SAMA PERSIS (`simpeg_kemnaker_24102018`),
 * jadi salah pilih instance TIDAK menghasilkan error - cuma data lama yang
 * kelihatan wajar. Ketahuan pertama kali karena pegawai TMT 2025 (1.578
 * orang) tidak ada satu pun di instance default.
 *
 * Named instance TIDAK memakai port tetap: portnya dinamis dan ditemukan
 * lewat SQL Server Browser (UDP 1434). Karena itu, kalau `SIAP_INSTANCE`
 * diisi, `SIAP_PORT` SENGAJA DIABAIKAN - mengirim keduanya membuat driver
 * memakai port dan mengabaikan instanceName, yang artinya diam-diam
 * menyambung ke instance yang salah.
 *
 * ---------------------------------------------------------------------------
 * SIAP_ENCRYPT - kenapa ini perlu bisa dimatikan
 * ---------------------------------------------------------------------------
 * Instance MSSQLDEV memutus koneksi (`ECONNRESET`) begitu hasil query cukup
 * besar, SELAMA enkripsi menyala. Bukan timeout - server yang menutup. Query
 * kecil ke instance yang sama berjalan normal, jadi ini bukan soal
 * kredensial atau hak akses. Dibuktikan berdampingan: query importer yang
 * sama, `encrypt: true` -> ECONNRESET, `encrypt: false` -> 5.078 baris dalam
 * 8 detik. Penyebabnya hampir pasti TLS 1.0 yang memang sudah usang dan
 * dipaksa hidup lewat `cryptoCredentialsDetails` di bawah.
 *
 * KONSEKUENSINYA JUJUR SAJA: dengan `SIAP_ENCRYPT="false"`, isi tabel
 * pegawai lewat dalam keadaan TIDAK terenkripsi di jaringan kantor. Paket
 * LOGIN tetap dienkripsi oleh SQL Server sendiri, jadi passwordnya tidak
 * terbuka - tapi nama, NIP, dan jabatan iya. Ini trade-off sadar, bukan
 * kelalaian: pilihannya cuma antara TLS 1.0 (yang di sini juga rusak) atau
 * tanpa enkripsi. Perbaikan yang benar adalah menaikkan SIAP ke TLS 1.2 -
 * begitu itu terjadi, hapus `SIAP_ENCRYPT` dan `cryptoCredentialsDetails`.
 *
 * Default tetap `true` supaya tidak ada yang diam-diam kehilangan enkripsi
 * hanya karena lupa mengisi variabel.
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
