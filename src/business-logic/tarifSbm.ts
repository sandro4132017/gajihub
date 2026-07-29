// ============================================================================
// TARIF RESMI STANDAR BIAYA MASUKAN (SBM) TAHUN ANGGARAN 2026
//
// Sumber: PMK tentang Standar Biaya Masukan TA 2026, halaman -13-:
//   item 22.1 - Satuan Biaya Uang Makan bagi Pegawai ASN
//   item 23.1 - Uang Lembur bagi Pegawai ASN
//   item 23.2 - Uang Makan Lembur bagi Pegawai ASN
//
// MENUTUP open item lama "Tarif uang makan & uang lembur ... perlu
// dikonfirmasi ke Biro Keuangan/DJA sebelum dipakai di data production".
//
// Dipisah dari engine kalkulasi (uangMakan.ts / uangLembur.ts) DENGAN SENGAJA:
// engine tetap menerima tarif sebagai PARAMETER, karena SBM terbit tiap tahun
// anggaran dan angkanya berubah. Tabel ini yang di-update tiap tahun, bukan
// logika perhitungannya. Pola yang sama dengan tarifTukinPokok.ts.
//
// PERHATIKAN bedanya pengelompokan golongan:
//   - Uang makan & uang makan lembur : Gol I & II DISATUKAN (3 tingkat)
//   - Uang lembur per jam            : Gol I dan II TERPISAH (4 tingkat)
// Ini bukan salah ketik - memang begitu di SBM-nya.
//
// TODO(confirm):
// - Tarif di sini KHUSUS Pegawai ASN (item 22.1, 23.1, 23.2). SBM item 24
//   mengatur tarif berbeda untuk Pegawai Non-ASN, Satpam, Pengemudi, Petugas
//   Kebersihan, dan Pramubakti (uang lembur Rp 20.000/13.000 per jam, uang
//   makan lembur Rp 31.000/30.000). Skema `Pegawai` belum membedakan
//   kelompok itu, jadi belum diimplementasi - kalau nanti pegawai non-ASN
//   ikut masuk sistem ini, butuh kolom penanda + cabang tarif tersendiri.
// - SBM TIDAK menyebut batas maksimal jam lembur per bulan. Batas 40 jam yang
//   dipakai engine adalah asumsi lama yang MASIH BELUM dikonfirmasi (lihat
//   BATAS_DEFAULT_JAM_LEMBUR_PER_BULAN di uangLembur.ts).
// ============================================================================

export type GolonganRomawi = "I" | "II" | "III" | "IV";

/**
 * Pengali tarif uang lembur pada HARI LIBUR / tanggal merah.
 *
 * PERHATIAN - INI TIDAK BERASAL DARI SBM. Seluruh dokumen SBM 2026 sudah
 * dicek: kata "libur" TIDAK muncul sama sekali, dan tidak ada ketentuan
 * 200%/dua kali untuk lembur. SBM cuma menetapkan besaran per jam (item
 * 23.1) dan per hari (item 23.2), tanpa membedakan hari kerja/hari libur.
 *
 * Angka 2x di bawah dipakai atas instruksi user (2026-07-29). Aturannya
 * memang lazim dipakai di lingkungan pemerintah, TAPI dasar hukumnya ada di
 * peraturan TATA CARA pembayaran lembur (PMK/Perdirjen Perbendaharaan),
 * BUKAN di SBM.
 *
 * TODO(confirm): minta salinan peraturan tata cara pembayaran uang lembur
 * yang berlaku, lalu ganti komentar ini dengan kutipan pasalnya - jangan
 * dibiarkan tanpa rujukan seperti sekarang.
 */
export const PENGALI_LEMBUR_HARI_LIBUR = 2;

/**
 * Pengali UANG MAKAN LEMBUR pada hari libur.
 *
 * Sengaja dibedakan dari PENGALI_LEMBUR_HARI_LIBUR dan default-nya 1 (TIDAK
 * dilipatgandakan): instruksi user menyebut "tarif dikali 2" untuk lembur,
 * dan uang makan lembur sifatnya penggantian konsumsi yang SBM sendiri batasi
 * "paling banyak 1 (satu) kali per hari" - melipatgandakannya berarti
 * membayar dua kali makan untuk satu hari.
 *
 * TODO(confirm): kalau ternyata di peraturan tata cara uang makan lembur
 * hari libur juga naik, cukup ubah konstanta ini - logikanya sudah siap.
 */
export const PENGALI_MAKAN_LEMBUR_HARI_LIBUR = 1;

/** SBM 2026 item 22.1 - uang makan ASN, satuan OH (orang/hari). */
export const TARIF_UANG_MAKAN_PER_HARI: Record<GolonganRomawi, number> = {
  I: 35_000,
  II: 35_000, // Gol I dan II satu tarif
  III: 37_000,
  IV: 41_000,
};

/** SBM 2026 item 23.1 - uang lembur ASN, satuan OJ (orang/jam). */
export const TARIF_UANG_LEMBUR_PER_JAM: Record<GolonganRomawi, number> = {
  I: 18_000,
  II: 24_000, // di sini Gol I dan II BEDA, tidak seperti uang makan
  III: 30_000,
  IV: 36_000,
};

/** SBM 2026 item 23.2 - uang makan lembur ASN, satuan OH (orang/hari). */
export const TARIF_UANG_MAKAN_LEMBUR_PER_HARI: Record<GolonganRomawi, number> = {
  I: 35_000,
  II: 35_000, // Gol I dan II satu tarif
  III: 37_000,
  IV: 41_000,
};

/**
 * Ambil golongan romawi dari nilai `Pegawai.golongan` yang bentuknya
 * "III/d", "IV/a", "II/b", dst.
 *
 * Mengembalikan null kalau tidak bisa dibaca - SENGAJA tidak menebak ke
 * golongan default, karena salah golongan berarti salah tarif dan salah
 * bayar. Pemanggil wajib menangani kasus null (lewati + laporkan).
 */
export function golonganRomawi(golongan: string | null | undefined): GolonganRomawi | null {
  if (!golongan) return null;
  // Ambil angka romawi di depan sebelum "/" atau spasi.
  const cocok = golongan.trim().toUpperCase().match(/^(IV|III|II|I)\b/);
  if (!cocok) return null;
  return cocok[1] as GolonganRomawi;
}
