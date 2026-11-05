// ============================================================================
// PENANDA DOKUMEN HASIL SIMULASI TTE - bukan tanda tangan BSrE yang sesungguhnya.
//
// KENAPA INI ADA. Alur TTE punya jalur simulasi: HANYA di lingkungan non-
// production DAN dengan TTE_SIMULASI="true", `terapkanStempelTteSimulasi()`
// membubuhkan stempel tiruan supaya pengujian lokal tetap menghasilkan PDF yang
// utuh. Di production jalur itu TIDAK PERNAH aktif, dan mode jaringan
// (INTERNAL/PUBLIC) tidak memengaruhinya. Hasil simulasinya
// dulu disimpan dengan status "TERTANDATANGANI", `signedAt` terisi, dan
// `idDokumenBsre` berawalan "BSRE-" - persis seperti dokumen yang benar-benar
// ditandatangani. Akibatnya halaman /tte/verify menyatakannya
// "TERVERIFIKASI SAH", padahal BSrE tidak pernah melihat dokumen itu.
//
// SPTJM adalah surat pernyataan TANGGUNG JAWAB MUTLAK dalam rantai pembayaran.
// Dokumen yang mengaku tertandatangani padahal tidak, adalah jenis kesalahan
// yang tidak boleh bergantung pada ingatan siapa pun. Jadi penandanya
// dititipkan ke `idDokumenBsre` - satu-satunya kolom yang tersedia tanpa
// migrasi - dan SATU fungsi di bawah ini yang menentukan jawabannya, dipakai
// bersama oleh penyimpan dan pembaca.
//
// TODO(confirm): kalau nanti ada migrasi untuk `DokumenTte`, pindahkan
// penandanya ke kolom boolean tersendiri (mis. `hasilSimulasi`). Menitipkan
// makna pada bentuk sebuah string tetap lebih rapuh daripada kolom sendiri.
// ============================================================================

/** Awalan `idDokumenBsre` untuk dokumen yang distempel simulasi. */
export const AWALAN_ID_SIMULASI = "SIMULASI-";

/** Id yang dipakai saat stempel simulasi dibubuhkan. */
export function idDokumenSimulasi(dokumenId: string): string {
  return `${AWALAN_ID_SIMULASI}${dokumenId.slice(0, 8).toUpperCase()}`;
}

/**
 * Bentuk LAMA penanda simulasi, dipakai sebelum 2026-10-20.
 *
 * Dulu id cadangannya `BSRE-` + 8 karakter pertama uuid dokumen itu sendiri.
 * Bentuk itu masih ada di baris-baris lama, dan justru bisa dikenali PERSIS
 * karena diturunkan dari id barisnya - jadi dokumen lama tidak perlu ditebak
 * maupun dibiarkan ambigu.
 */
function idDokumenSimulasiLama(dokumenId: string): string {
  return `BSRE-${dokumenId.slice(0, 8).toUpperCase()}`;
}

/**
 * Apakah dokumen ini hasil simulasi, bukan tanda tangan BSrE.
 *
 * Masukannya sengaja cuma dua kolom supaya bisa dipanggil dari mana saja -
 * Server Action, halaman verifikasi, maupun test - tanpa membawa Prisma.
 */
export function apakahHasilSimulasi(d: {
  id: string;
  idDokumenBsre: string | null;
}): boolean {
  if (!d.idDokumenBsre) return false;
  const nilai = d.idDokumenBsre.trim();
  if (nilai.startsWith(AWALAN_ID_SIMULASI)) return true;
  return nilai === idDokumenSimulasiLama(d.id);
}

// ----------------------------------------------------------------------------
// GERBANG SIMULASI & KLASIFIKASI KEGAGALAN BSrE (Kriteria BSrE IX: setiap
// kegagalan penandatanganan tercatat di log_gagal_tte).
// ----------------------------------------------------------------------------

/**
 * Stempel simulasi hanya boleh dibubuhkan di luar production DAN bila
 * TTE_SIMULASI bernilai "true" (tanpa memandang huruf besar/kecil). Di
 * production bendera itu diabaikan sepenuhnya.
 */
export function bolehSimulasiTte(
  env: Record<string, string | undefined> = process.env
): boolean {
  if (env.NODE_ENV === "production") return false;
  return (env.TTE_SIMULASI ?? "").trim().toLowerCase() === "true";
}

/**
 * Jawaban cadangan "ISSUE" untuk NIK akun demo saat BSrE tak terjangkau hanya
 * boleh di luar production; di production gangguan BSrE harus tampil apa adanya.
 */
export function bolehFallbackAkunDemo(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.NODE_ENV !== "production";
}

/** NIK akun uji coba resmi server BSrE (sertifikat demo, bukan milik pegawai). */
export const NIK_DEMO_BSRE = "0803202100007062"; // sensitive-ok

/**
 * Pengecualian cek "NIK harus milik pemegang sesi" untuk NIK demo BSrE.
 * Bawaannya MATI; hidup hanya bila TTE_IZINKAN_NIK_DEMO="true". Selama hidup,
 * akun pegawai mana pun bisa menandatangani SPTJM dengan sertifikat demo,
 * sementara nama yang tercetak tetap nama akun yang login - jadi sakelar ini
 * untuk masa uji, dan dimatikan sebelum SPTJM dipakai sebagai dasar
 * pembayaran.
 */
export function izinkanNikDemo(
  nik: string,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (nik.trim() !== NIK_DEMO_BSRE) return false;
  return (env.TTE_IZINKAN_NIK_DEMO ?? "").trim().replace(/^["']|["']$/g, "").toLowerCase() === "true";
}

export type KategoriGagalBsre =
  | "PASSPHRASE_SALAH"
  | "NETWORK_TIMEOUT"
  | "BSRE_ERROR";

export interface KlasifikasiGagalBsre {
  kategori: KategoriGagalBsre;
  pesanPengguna: string;
}

/**
 * Menggolongkan kegagalan `signPdf` menjadi kategori log dan pesan untuk
 * pengguna. Pesan tidak memuat passphrase maupun NIK.
 */
export function klasifikasiGagalBsre(signResult: {
  error?: string;
  statusCode?: number;
}): KlasifikasiGagalBsre {
  const pesan = (signResult.error || "").toLowerCase();
  const kode = signResult.statusCode;

  if (kode === 0 || pesan.includes("passphrase")) {
    return {
      kategori: "PASSPHRASE_SALAH",
      pesanPengguna: signResult.error || "Passphrase BSrE salah.",
    };
  }

  const akhir =
    " SPTJM belum ditandatangani dan tidak diterbitkan. Coba lagi beberapa menit lagi; " +
    "bila berulang, laporkan ke Admin Gajihub. Kegagalan ini sudah tercatat.";

  const jaringan =
    pesan.includes("timeout") ||
    pesan.includes("fetch failed") ||
    pesan.includes("econnrefused") ||
    pesan.includes("network") ||
    pesan.includes("koneksi");
  if (jaringan) {
    return {
      kategori: "NETWORK_TIMEOUT",
      pesanPengguna:
        "Penandatanganan GAGAL: layanan tanda tangan BSrE tidak dapat dihubungi (batas waktu/koneksi)." +
        akhir,
    };
  }

  if (kode !== undefined && kode >= 500) {
    return {
      kategori: "BSRE_ERROR",
      pesanPengguna: `Penandatanganan GAGAL: server BSrE mengalami gangguan (HTTP ${kode}).` + akhir,
    };
  }

  return {
    kategori: "BSRE_ERROR",
    pesanPengguna:
      signResult.error || "Gagal melakukan tanda tangan elektronik pada dokumen.",
  };
}

/** Panjang minimum passphrase yang disamarkan; di bawah ini teks dibiarkan utuh. */
const PANJANG_MIN_SAMAR = 4;

/**
 * Mengganti setiap kemunculan passphrase (pencocokan string literal, bukan
 * regex) dengan "[disamarkan]". Kriteria BSrE V & VIII: passphrase tidak boleh
 * tersimpan di log maupun tampil di layar, termasuk bila BSrE menggemakannya
 * di teks galat.
 *
 * Passphrase kosong atau lebih pendek dari 4 karakter dibiarkan: mengganti
 * satu-dua karakter akan merusak seluruh teks galat, dan passphrase BSrE yang
 * sah jauh lebih panjang dari itu.
 */
export function samarkanPassphrase(teks: string, passphrase: string): string {
  if (!teks || !passphrase || passphrase.length < PANJANG_MIN_SAMAR) return teks;
  return teks.split(passphrase).join("[disamarkan]");
}
