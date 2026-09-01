/**
 * PTKP (Penghasilan Tidak Kena Pajak) dan kategori TER untuk PPh Pasal 21.
 *
 * Dasar: PP 58/2023 dan PMK 168/2023, sebagaimana dirangkum dalam salindia
 * resmi DJP "Update Regulasi PPh Pasal 21 - Instansi Pemerintah"
 * (docs/Slide PPh Pasal 21 - Instansi Pemerintah.pdf).
 *
 * ==========================================================================
 * YANG DIHASILKAN MODUL INI ADALAH DUGAAN, BUKAN STATUS PTKP YANG SAH.
 * ==========================================================================
 * Status PTKP yang berlaku adalah yang terdaftar di DJP. Modul ini menurunkan
 * dugaan dari data kepegawaian SIAP supaya bisa DIPERIKSA - untuk menemukan
 * pegawai yang datanya sudah tidak sesuai keadaan, bukan untuk memotong pajak.
 * Empat hal berikut TIDAK ADA di data mana pun yang dimiliki sistem ini:
 *
 * 1. Tanggungan tidak terbatas anak. PTKP mengakui keluarga sedarah garis
 *    lurus (orang tua, anak kandung), keluarga semenda garis lurus (mertua,
 *    anak tiri), dan anak angkat. Tabel ORANGTUA di SIAP berisi 5.330 baris
 *    yang tidak ikut terhitung di sini sama sekali.
 * 2. Syarat "menjadi tanggungan sepenuhnya" = tidak mempunyai penghasilan DAN
 *    seluruh biaya hidupnya ditanggung. Yang bisa dilihat dari SIAP cuma kolom
 *    PEKERJAAN pada tabel ANAK, dan kolom itu terisi 819 dari 6.217 baris.
 *    Kosong berarti "tidak tercatat", bukan "terbukti tidak berpenghasilan".
 * 3. Surat keterangan pemerintah daerah untuk wanita kawin (lihat di bawah).
 * 4. Keadaan pada 1 Januari - PTKP ditetapkan menurut keadaan AWAL TAHUN
 *    KALENDER, sementara data SIAP adalah keadaan hari ini. Anak yang lahir
 *    Maret tidak menambah tanggungan untuk tahun itu.
 *
 * TODO(legal-confirm): keempatnya perlu penegasan Bagian Keuangan sebelum
 * hasil modul ini boleh dipakai untuk apa pun selain pemeriksaan.
 *
 * TARIF TER SENGAJA TIDAK ADA DI SINI. Modul ini berhenti di KATEGORI (A/B/C).
 * Tabel tarifnya berlapis menurut penghasilan bruto bulanan dan hanya sah dari
 * lampiran PMK 168/2023 - menyalinnya dari ingatan ke kode berarti mengarang
 * angka yang menyentuh pembayaran.
 */

/** Tambahan PTKP per lapisan - PMK 168/2023. */
const PTKP_DIRI_SENDIRI = 54_000_000;
const PTKP_TAMBAHAN_KAWIN = 4_500_000;
const PTKP_TAMBAHAN_TANGGUNGAN = 4_500_000;

/** PTKP hanya mengakui paling banyak 3 tanggungan. */
export const MAKS_TANGGUNGAN_PTKP = 3;

export type KategoriTer = "A" | "B" | "C";

export interface InputPtkp {
  /** PEGAWAI.STATUSKAWIN di SIAP: K, B, C, J, atau D. */
  statusKawin: string | null;
  /** PEGAWAI.JENISKELAMIN di SIAP: L atau P. Dipakai KHUSUS aturan wanita kawin. */
  jenisKelamin: string | null;
  /** Jumlah calon tanggungan yang tercatat. Boleh melebihi 3; akan dijepit. */
  jumlahTanggungan: number | null;
  /**
   * Pegawai perempuan berstatus kawin yang MEMILIKI surat keterangan dari
   * pemerintah daerah bahwa suaminya tidak berpenghasilan. Default false -
   * surat itu tidak ada di sistem mana pun, jadi harus dinyatakan manual.
   */
  adaSuratSuamiTidakBerpenghasilan?: boolean;
}

export interface HasilPtkp {
  /** "TK/0" sampai "K/3". */
  kode: string;
  kategoriTer: KategoriTer;
  /** Nilai PTKP setahun dalam rupiah. */
  ptkpSetahun: number;
  /** Jumlah tanggungan yang benar-benar dipakai (sudah dijepit ke 3). */
  tanggunganDipakai: number;
  /**
   * Hal yang WAJIB disampaikan ke pemakainya - bukan hiasan. Tiap butir
   * menjelaskan keputusan yang tidak terlihat dari kodenya saja.
   */
  catatan: string[];
}

const STATUS_KAWIN_SAH = ["K", "B", "C", "J", "D"] as const;

/**
 * Kategori TER bulanan - PMK 168/2023.
 *
 * Batas antar kategori jatuh persis di tempat data kepegawaian paling rapuh:
 * K/2 masuk B sementara K/3 masuk C. Satu tanggungan yang salah hitung
 * memindahkan orangnya ke tarif yang berbeda setiap bulan.
 */
export function kategoriTerDari(kode: string): KategoriTer | null {
  if (["TK/0", "TK/1", "K/0"].includes(kode)) return "A";
  if (["TK/2", "TK/3", "K/1", "K/2"].includes(kode)) return "B";
  if (kode === "K/3") return "C";
  return null;
}

/** Normalisasi nilai SIAP yang berpadding spasi & huruf kecil. */
function bersih(v: string | null): string {
  return (v ?? "").trim().toUpperCase();
}

/**
 * Turunkan dugaan PTKP dari data kepegawaian.
 *
 * Mengembalikan `null` kalau status kawinnya tidak dikenal - 93 pegawai di
 * SIAP berada dalam keadaan itu (91 kosong, 2 berisi karakter rusak). `null`
 * berarti "tidak diketahui" dan HARUS ditampilkan begitu; menebaknya jadi
 * TK/0 akan menempatkan orangnya di kategori tarif yang belum tentu benar.
 */
export function hitungPtkp(input: InputPtkp): HasilPtkp | null {
  const status = bersih(input.statusKawin);
  if (!STATUS_KAWIN_SAH.includes(status as (typeof STATUS_KAWIN_SAH)[number])) return null;

  const catatan: string[] = [];
  const mentah = input.jumlahTanggungan ?? 0;
  const tanggungan = Math.max(0, Math.min(Math.floor(mentah), MAKS_TANGGUNGAN_PTKP));
  if (mentah > MAKS_TANGGUNGAN_PTKP) {
    catatan.push(
      `Tercatat ${mentah} calon tanggungan, tetapi PTKP hanya mengakui paling banyak ${MAKS_TANGGUNGAN_PTKP}.`
    );
  }

  const perempuan = bersih(input.jenisKelamin) === "P";
  const kawin = status === "K";

  // ------------------------------------------------------------------
  // ATURAN WANITA KAWIN - PMK 168/2023
  // ------------------------------------------------------------------
  // "Secara default, besaran PTKP untuk Wanita Kawin adalah TK/0", kecuali
  // dapat menunjukkan keterangan tertulis dari Pemerintah Daerah setempat -
  // serendah-rendahnya kecamatan - yang menyatakan suaminya tidak menerima
  // atau memperoleh penghasilan.
  //
  // Aturan ini mengubah status 1.830 pegawai perempuan berstatus kawin di
  // Kemnaker, dan itulah kenapa `jenisKelamin` sampai perlu diimpor dari SIAP
  // padahal proyek ini menolak data pribadi yang tidak menentukan pembayaran.
  if (kawin && perempuan && !input.adaSuratSuamiTidakBerpenghasilan) {
    return {
      kode: "TK/0",
      kategoriTer: "A",
      ptkpSetahun: PTKP_DIRI_SENDIRI,
      tanggunganDipakai: 0,
      catatan: [
        ...catatan,
        "PMK 168/2023: PTKP pegawai perempuan berstatus kawin ditetapkan TK/0, berapa pun jumlah tanggungannya.",
        "Dapat berubah jika ada surat keterangan dari pemerintah daerah (serendah-rendahnya kecamatan) yang menyatakan suami tidak berpenghasilan. Surat itu tidak tercatat di sistem ini.",
      ],
    };
  }

  if (!kawin && status !== "B") {
    // Cerai, janda, dan duda diperlakukan tidak kawin untuk PTKP, tetapi tetap
    // boleh punya tanggungan. Dicatat supaya tidak terbaca sebagai kekeliruan.
    catatan.push(`Status kepegawaian "${status}" diperlakukan tidak kawin untuk PTKP, tanggungan tetap dihitung.`);
  }

  const kode = `${kawin ? "K" : "TK"}/${tanggungan}`;
  const kategoriTer = kategoriTerDari(kode);
  if (!kategoriTer) return null;

  return {
    kode,
    kategoriTer,
    ptkpSetahun:
      PTKP_DIRI_SENDIRI +
      (kawin ? PTKP_TAMBAHAN_KAWIN : 0) +
      tanggungan * PTKP_TAMBAHAN_TANGGUNGAN,
    tanggunganDipakai: tanggungan,
    catatan,
  };
}

// ===========================================================================
// PPh PASAL 21 FINAL ATAS HONORARIUM APBN/APBD
// ===========================================================================
// REZIM YANG BERBEDA DARI TER DI ATAS. Jangan disandingkan tanpa penjelasan -
// keduanya sama-sama "PPh Pasal 21" tapi mengenai penghasilan yang berlainan:
//
//   Gaji pokok, tunjangan tetap, TUNJANGAN KINERJA, gaji ke-13/THR
//     -> dihitung dengan TER bulanan (PMK 168/2023)
//     -> untuk ASN yang penghasilannya dibebankan APBN, PPh-nya DITANGGUNG
//        PEMERINTAH; tidak mengurangi yang diterima pegawai
//
//   HONORARIUM atau imbalan lain yang menjadi beban APBN/APBD
//     -> dipotong FINAL dengan tarif menurut GOLONGAN (0% / 5% / 15%)
//     -> final berarti selesai; tidak digabung lagi di SPT Tahunan
//
// Salah menempatkan keduanya berakibat nyata: memberi tahu pegawai golongan
// III bahwa tunjangan kinerjanya dipotong 5% final itu keliru, dan angkanya
// akan diperdebatkan tiap bulan.
//
// Sumber tarif: salindia DJP halaman 50-51, mengacu PP 80/2010.

/** Komponen yang menjadi dasar pengenaan TER bulanan - contoh kasus DJP. */
export const DASAR_PENGENAAN_TER = [
  "Gaji pokok",
  "Tunjangan kinerja",
  "Tunjangan jabatan",
  "Tunjangan istri dan anak",
  "Gaji ke-13, THR, dan rapel",
] as const;

export interface TarifFinalHonorarium {
  /** 0, 0.05, atau 0.15. */
  tarif: number;
  /** Ruang golongan yang dipakai menentukannya: "I", "II", "III", atau "IV". */
  golonganPokok: string;
}

/**
 * Tarif PPh Pasal 21 FINAL atas honorarium yang dibebankan APBN/APBD,
 * menurut golongan penerima.
 *
 *   PNS Golongan I dan II                     -> 0%
 *   PNS Golongan III                          -> 5%
 *   Pejabat Negara dan PNS Golongan IV        -> 15%
 *
 * Mengembalikan `null` kalau golongannya tidak bisa dipetakan - dan itu bukan
 * kasus langka. Golongan PPPK di data ini berupa angka Romawi TANPA sufiks
 * huruf ("V", "VII", "IX", "X"), sekitar 1.000 pegawai, dan tabel tarif di
 * atas TIDAK menyebut PPPK sama sekali. Menebaknya - misalnya menganggap "IX"
 * setara golongan IV - berarti memotong 15% atas dasar yang tidak ada.
 *
 * TODO(legal-confirm): perlakuan honorarium PPPK perlu ditanyakan ke Bagian
 * Keuangan atau DJP.
 *
 * "Pejabat Negara" juga tidak bisa dikenali dari golongan; daftarnya (Presiden,
 * anggota DPR/DPD/MPR, hakim agung, dan seterusnya) tidak beririsan dengan
 * pegawai Kemnaker, jadi di sini cukup golongan IV yang memicu 15%.
 */
export function tarifFinalHonorarium(golongan: string | null): TarifFinalHonorarium | null {
  const g = bersih(golongan);
  if (!g) return null;

  // "III/a" -> "III";  "III" -> "III". Sufiks ruang tidak mengubah tarifnya.
  const pokok = g.split("/")[0].trim();

  if (pokok === "I" || pokok === "II") return { tarif: 0, golonganPokok: pokok };
  if (pokok === "III") return { tarif: 0.05, golonganPokok: pokok };
  if (pokok === "IV") return { tarif: 0.15, golonganPokok: pokok };

  // V, VI, VII, VIII, IX, X, ... = PPPK. Sengaja tidak dipetakan.
  return null;
}

/**
 * Tanggal acuan penetapan PTKP.
 *
 * PMK 168/2023: PTKP ditetapkan menurut keadaan pada AWAL TAHUN KALENDER.
 * Ditulis sebagai fungsi, bukan dirakit di JSX, supaya seluruh halaman yang
 * menampilkannya menyebut tanggal yang sama - dan supaya jelas bahwa yang
 * dipakai bukan tanggal hari ini.
 */
export function tanggalAcuanPtkp(tahun: number): Date {
  return new Date(Date.UTC(tahun, 0, 1));
}
