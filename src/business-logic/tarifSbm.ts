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
 * Ambil golongan romawi PNS dari nilai `Pegawai.golongan` yang bentuknya
 * "III/d", "IV/a", "II/b", dst.
 *
 * SUFIKS HURUFNYA WAJIB, dan itu yang membedakan PNS dari PPPK. Golongan PNS
 * selalu berpasangan dengan huruf a-e; PPPK memakai angka romawi TELANJANG
 * pada skala I-XVII yang sama sekali beda artinya (lihat
 * golonganPppkKeKurungSbm di bawah). Sebelum sufiksnya diwajibkan, fungsi ini
 * membaca "III" milik PPPK sebagai PNS Gol III dan membayarnya dengan tarif
 * S1 tanpa peringatan apa pun - ada 5 pegawai yang kena persis begitu.
 *
 * Mengembalikan null kalau tidak cocok - SENGAJA tidak menebak, karena salah
 * golongan berarti salah tarif dan salah bayar. Pakai kurungTarifSbm() kalau
 * yang dibutuhkan "kurung tarif untuk pegawai ini, PNS maupun PPPK".
 */
export function golonganRomawi(golongan: string | null | undefined): GolonganRomawi | null {
  if (!golongan) return null;
  const cocok = golongan.trim().toUpperCase().match(/^(IV|III|II|I)\s*\/\s*[A-E]\b/);
  if (!cocok) return null;
  return cocok[1] as GolonganRomawi;
}

/**
 * Padanan jenjang golongan PPPK (I-XVII) ke kurung tarif SBM (Gol I-IV).
 *
 * KENAPA PERLU: SBM 2026 cuma mengenal empat kurung golongan PNS. PPPK
 * memakai skala tersendiri berdasarkan jenjang pendidikan & jabatan, dan
 * SBM TIDAK menyebut PPPK sama sekali. Tanpa padanan ini, 996 dari 5.077
 * pegawai aktif (19,6%) tidak dapat uang makan & lembur sama sekali.
 *
 * TODO(confirm) - PADANAN DI BAWAH BELUM DIKONFIRMASI KE BIRO KEUANGAN/DJA.
 * Disusun mengikuti kesetaraan jenjang pendidikan (pola yang sama dengan
 * golongan PNS), dan cocok dengan data yang ada: seluruh pegawai gol IX di
 * basis data ini berjabatan "Ahli Pertama" (setara S1/III-a) dan berkelas
 * jabatan 7-9, sementara gol V & VII ada di kelas jabatan 5-6 (pelaksana).
 * Keputusan dipakainya padanan ini datang dari user (2026-08-06, "perhitungan
 * pppk sama dengan pns"), BUKAN dari dokumen resmi.
 *
 * Selisihnya nyata, jadi jangan dianggap detail: Gol II vs III itu
 * Rp 35.000 vs Rp 37.000 per hari (uang makan) dan Rp 24.000 vs Rp 30.000
 * per jam (lembur, +25%). Kalau padanan resminya beda, ubah tabel ini saja -
 * tidak ada logika lain yang perlu disentuh.
 *
 * Ditulis eksplisit satu per satu (bukan hasil hitung angka romawi) supaya
 * bisa di-grep dan dibaca apa adanya waktu diadu ke peraturan.
 */
export const PADANAN_GOLONGAN_PPPK: Record<string, GolonganRomawi> = {
  I: "I",
  II: "I",
  III: "I",
  IV: "I",
  V: "II",
  VI: "II",
  VII: "II",
  VIII: "II",
  IX: "III",
  X: "III",
  XI: "IV",
  XII: "IV",
  XIII: "IV",
  XIV: "IV",
  XV: "IV",
  XVI: "IV",
  XVII: "IV",
};

/**
 * Kurung tarif SBM untuk golongan PPPK ("IX", "V", dst - angka romawi
 * telanjang, tanpa sufiks huruf). Null kalau di luar skala I-XVII.
 */
export function golonganPppkKeKurungSbm(golongan: string | null | undefined): GolonganRomawi | null {
  if (!golongan) return null;
  const bersih = golongan.trim().toUpperCase();
  // Sufiks huruf berarti ini format PNS, bukan PPPK - jangan diklaim di sini.
  if (bersih.includes("/")) return null;
  return PADANAN_GOLONGAN_PPPK[bersih] ?? null;
}

/**
 * Kurung tarif SBM untuk SATU pegawai, apa pun jenis kepegawaiannya.
 *
 * Inilah yang seharusnya dipakai lapisan kalkulasi - bukan golonganRomawi()
 * langsung, yang cuma mengenali PNS. Urutannya: format PNS ("III/d") dulu,
 * baru jenjang PPPK ("IX"). Tetap null kalau dua-duanya tidak cocok, dan
 * pemanggil WAJIB melaporkan kasus itu, bukan menebak tarif default.
 */
export function kurungTarifSbm(golongan: string | null | undefined): GolonganRomawi | null {
  return golonganRomawi(golongan) ?? golonganPppkKeKurungSbm(golongan);
}
