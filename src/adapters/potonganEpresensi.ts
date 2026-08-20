// ============================================================================
// TABEL `potongan_tukin` e-PRESENSI - buku besar potongan yang tampil di web-nya
//
// READ-ONLY, hanya SELECT. Sama seperti seluruh akses ke e-Presensi & SIAP.
//
// DIPAKAI HANYA UNTUK MEMBANDINGKAN, TIDAK PERNAH UNTUK MEMBAYAR. Rumus di
// balik angka-angka ini menyimpang dari Permenaker 15/2024 - lihat daftar
// lengkapnya di business-logic/bandingPotonganEpresensi.ts. Yang dibayarkan
// tetap hasil hitungan Gajihub.
//
// ---------------------------------------------------------------------------
// RANTAI PEMETAAN - bagian paling rawan, sama persis dengan jalur sinkronisasi
// ---------------------------------------------------------------------------
//   Pegawai.nip -> SIAP.PEGAWAI.NIPBARU -> PEGAWAIID -> e-Presensi.id_pegawai
//
// e-Presensi TIDAK menyimpan NIP sama sekali (sudah dicek ke seluruh
// information_schema), jadi SIAP wajib dilewati. Pencocokannya HARUS PERSIS -
// jangan menambah/membuang nol di depan: normalisasi nol pernah mencocokkan
// "00009600" ke PEGAWAIID milik ORANG LAIN.
//
// Halaman ini SENGAJA tidak menyimpan hasil pemetaannya ke database Gajihub.
// Menambah kolom berarti migrasi + backfill, sementara yang dibutuhkan cuma
// satu pegawai per kali buka. Kalau nanti perbandingan ini dijalankan massal,
// barulah kolom itu layak - bukan sekarang.
// ============================================================================
import pg from "pg";
import sql from "mssql";
import { konfigurasiSiap } from "../lib/siapConfig";

export interface BarisPotonganEpresensi {
  /** "YYYY-MM-DD" - dibaca sebagai TEKS, lihat catatan zona waktu di bawah. */
  tanggalIso: string;
  /**
   * Persen yang MEMOTONG, sebagai pecahan positif (0,02 = 2%).
   *
   * Sumbernya menyimpan negatif untuk potongan (-2) dan positif untuk
   * penyesuaian yang MENGEMBALIKAN potongan (+1). Tandanya dibalik di sini
   * supaya sisi Gajihub (yang selalu positif) bisa dibandingkan langsung.
   */
  persen: number;
  keterangan: string;
}

/**
 * PEGAWAIID SIAP untuk satu NIP. null kalau tidak ketemu.
 *
 * Dipakai sebagai `id_pegawai` di e-Presensi - lihat rantai pemetaan di atas.
 */
export async function pegawaiIdEpresensiUntukNip(nip: string): Promise<string | null> {
  const pool = await sql.connect(konfigurasiSiap());
  try {
    const hasil = await pool
      .request()
      .input("nip", sql.VarChar, nip)
      .query<{ PEGAWAIID: string }>(
        `SELECT LTRIM(RTRIM(PEGAWAIID)) AS PEGAWAIID
           FROM PEGAWAI
          WHERE LTRIM(RTRIM(NIPBARU)) = @nip`
      );
    return hasil.recordset[0]?.PEGAWAIID ?? null;
  } finally {
    await pool.close();
  }
}

/**
 * Keputusan potongan e-Presensi untuk satu pegawai dalam satu periode.
 *
 * JEBAKAN ZONA WAKTU: kolom `tanggal` bertipe `date`, dan driver pg
 * mengembalikannya sebagai tengah malam WAKTU LOKAL proses - di Asia/Jakarta
 * itu mundur satu hari. Makanya di-cast `::text` di SQL-nya, bukan diperbaiki
 * di JS. Jebakan yang sama pernah membuang 4.596 baris presensi di halaman
 * kendala e-Presensi.
 */
export async function ambilPotonganEpresensi(
  idPegawai: string,
  bulan: number,
  tahun: number
): Promise<BarisPotonganEpresensi[]> {
  const { EPRESENSI_HOST, EPRESENSI_PORT, EPRESENSI_DB, EPRESENSI_USER, EPRESENSI_PASSWORD } = process.env;
  if (!EPRESENSI_HOST || !EPRESENSI_DB || !EPRESENSI_USER || !EPRESENSI_PASSWORD) {
    throw new Error("Kredensial e-Presensi belum lengkap di .env (EPRESENSI_HOST/DB/USER/PASSWORD).");
  }
  const client = new pg.Client({
    host: EPRESENSI_HOST,
    port: EPRESENSI_PORT ? Number(EPRESENSI_PORT) : 5432,
    database: EPRESENSI_DB,
    user: EPRESENSI_USER,
    password: EPRESENSI_PASSWORD,
  });
  await client.connect();
  try {
    const { rows } = await client.query<{ iso: string; jumlah: string; keterangan: string | null }>(
      `SELECT tanggal::text AS iso, jumlah_potongan::text AS jumlah, keterangan
         FROM potongan_tukin
        WHERE id_pegawai = $1
          AND tanggal >= make_date($2, $3, 1)
          AND tanggal <  (make_date($2, $3, 1) + interval '1 month')
        ORDER BY tanggal, "createdAt"`,
      [idPegawai, tahun, bulan]
    );
    return rows.map((r) => ({
      tanggalIso: r.iso,
      // Negatif di sumber = memotong. Dibalik jadi positif, lalu dari satuan
      // persen (2) ke pecahan (0,02) supaya satu satuan dengan sisi Gajihub.
      persen: -Number(r.jumlah) / 100,
      keterangan: (r.keterangan ?? "").trim() || "(tanpa keterangan)",
    }));
  } finally {
    await client.end();
  }
}
