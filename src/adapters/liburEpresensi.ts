// ============================================================================
// TABEL `libur` e-PRESENSI - kalender hari libur nasional & cuti bersama
//
// READ-ONLY, hanya SELECT. Sama seperti seluruh akses ke e-Presensi.
//
// ---------------------------------------------------------------------------
// CATATAN LAMA YANG SALAH - "tabel `libur` ada tapi KOSONG"
// ---------------------------------------------------------------------------
// Itu tertulis di CLAUDE.md sejak jalur sinkronisasi dibangun, dan jadi alasan
// kenapa kalender `HariLiburNasional` harus diisi tangan. Diperiksa ulang
// 2026-08-13: tabelnya berisi **127 baris** (2022-2026), diperbarui terakhir
// 15 Januari 2026 - jadi memang dirawat, bukan sisa.
//
// Diadu ke data kehadiran: dari 21 tanggal libur 2026 yang jatuh di hari
// kerja, SEMUANYA ber-kehadiran WFO/WFH/WFA ~0 (satu-satunya yang bukan nol
// adalah 1 Januari dengan 2 baris). Jadi daftarnya cocok dengan kenyataan,
// bukan sekadar tabel referensi yang tidak dipakai.
//
// ---------------------------------------------------------------------------
// KENAPA DI-IMPOR, BUKAN DIBACA LANGSUNG SAAT MENGHITUNG
// ---------------------------------------------------------------------------
// Sama alasannya dengan importPegawaiSiap.ts: ini SNAPSHOT, bukan live sync.
//   1. Kalau dibaca langsung tiap kali rekap dihitung, e-Presensi yang mengubah
//      tabelnya diam-diam mengubah angka periode yang SUDAH disetujui - tanpa
//      jejak siapa pun.
//   2. Kalender ini menentukan pengali lembur 2x dan batas hari uang makan.
//      Angka yang dipakai membayar harus bisa ditelusuri ke baris di database
//      MILIK Gajihub, lengkap dengan siapa yang memasukkannya dan kapan.
//   3. e-Presensi bisa saja tidak terjangkau saat kalkulasi berjalan.
// Setelah diimpor, barisnya bisa diubah/dihapus manusia seperti biasa - impor
// TIDAK menimpa tanggal yang sudah ada.
//
// ---------------------------------------------------------------------------
// CUTI BERSAMA - penamaannya TIDAK konsisten antar tahun
// ---------------------------------------------------------------------------
// 2022-2025 memakai baris bernama "Cuti Bersama ..." (4/11/8/9 baris), TAPI
// 2026 **nol** - cuti bersama Idul Fitri 2026 ditulis dengan nama hari
// rayanya ("Hari Raya Idul Fitri 1447 Hijriah", 20-24 Maret). Jadi penanda
// `cutiBersama` di sini diturunkan dari NAMANYA dan pasti kurang lengkap
// untuk 2026 - itu disebutkan ke pemakai, bukan ditebak diam-diam. Bedanya
// tidak mengubah pembayaran (perlakuannya sama persis), cuma pelaporan.
// ============================================================================
import pg from "pg";

export interface BarisLiburEpresensi {
  /** "YYYY-MM-DD" - dibaca sebagai TEKS, lihat catatan zona waktu di bawah. */
  iso: string;
  nama: string;
  cutiBersama: boolean;
}

/**
 * Ambil daftar hari libur e-Presensi untuk satu tahun.
 *
 * JEBAKAN ZONA WAKTU: kolom `tanggal` bertipe `date`, dan driver pg
 * mengembalikannya sebagai tengah malam WAKTU LOKAL proses. Di Asia/Jakarta
 * (+7) tanggal 2026-03-20 terbaca `2026-03-19T17:00:00Z` - mundur satu hari.
 * Makanya di-cast `::text` di SQL-nya, bukan diperbaiki di JS. Jebakan yang
 * sama pernah membuang 4.596 baris presensi di halaman kendala e-Presensi.
 */
export async function ambilLiburEpresensi(tahun: number): Promise<BarisLiburEpresensi[]> {
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
    const { rows } = await client.query<{ iso: string; nama: string }>(
      `SELECT tanggal::text AS iso, nama_libur AS nama
         FROM libur
        WHERE tanggal >= make_date($1, 1, 1)
          AND tanggal <  make_date($1 + 1, 1, 1)
        ORDER BY tanggal`,
      [tahun]
    );

    // Tanggal ganda memang ada di sumbernya (2 kasus: 2022-12-25, 2023-05-18).
    // Yang pertama dipakai - keduanya libur, jadi yang berbeda cuma namanya.
    const unik = new Map<string, BarisLiburEpresensi>();
    for (const r of rows) {
      if (unik.has(r.iso)) continue;
      const nama = (r.nama ?? "").trim();
      unik.set(r.iso, { iso: r.iso, nama: nama || "Hari libur", cutiBersama: /cuti\s*bersama/i.test(nama) });
    }
    return [...unik.values()];
  } finally {
    await client.end();
  }
}
