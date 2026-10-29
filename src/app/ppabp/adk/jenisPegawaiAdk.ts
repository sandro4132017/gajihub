// ============================================================================
// PEMISAHAN ADK PNS vs ADK P3K.
//
// SUMBERNYA `Pegawai.jenisPegawai` DARI SIAP (PEGAWAI.STATUSPEGAWAIID, lihat
// src/business-logic/jenisPegawai.ts), BUKAN format golongan dan BUKAN lagi
// berkas basis data gaji Kemenkeu. Keputusan user 2026-10-27/28: data
// kepegawaian diambil dari database SIAP; Excel hanya untuk data tertentu
// yang tidak ada di SIAP (rekening, nomor SK grading).
//
// Golongan memang terlihat memisahkan keduanya - PNS berformat "III/d",
// jenjang PPPK berupa angka Romawi telanjang "IX" - tapi penurunan itu
// terbukti keliru pada belasan orang (2026-09-02), jadi tidak dipakai.
//
// YANG JENISNYA BELUM TERCATAT TIDAK DITEBAK. Mereka keluar dari berkas begitu
// penyaringan jenis dipakai, dan jumlahnya ditampilkan di layar supaya
// kelihatan sebelum berkasnya dikirim. Kolomnya terisi lewat sinkronisasi
// pegawai (`npm run sync:pegawai` atau halaman Sistem admin).
// ============================================================================

export type JenisPegawaiAdk = "PNS" | "P3K";

export interface PilihanJenisPegawai {
  kode: JenisPegawaiAdk;
  label: string;
  /** Nilai `Pegawai.jenisPegawai` (dari SIAP) yang masuk kelompok ini. */
  nilaiDiData: readonly string[];
}

export const JENIS_PEGAWAI_ADK: readonly PilihanJenisPegawai[] = [
  {
    kode: "PNS",
    label: "ADK PNS",
    // CPNS ikut ke berkas PNS - DIKONFIRMASI USER 2026-09-02, bukan asumsi.
    // Terukur 2 orang pada data 7/2026.
    nilaiDiData: ["PNS", "CPNS"],
  },
  {
    kode: "P3K",
    label: "ADK P3K",
    // SIAP menulis "PPPK"; "P3K" dijaga juga supaya ejaan lain tidak membuat
    // penyaringan ini diam-diam kosong.
    nilaiDiData: ["PPPK", "P3K"],
  },
] as const;

/** Semua nilai yang dikenali, dari kedua kelompok. */
export const SEMUA_NILAI_JENIS: readonly string[] = JENIS_PEGAWAI_ADK.flatMap((j) => [...j.nilaiDiData]);

/**
 * Potongan `where` untuk pegawai yang TIDAK masuk kelompok mana pun - jenisnya
 * belum tercatat dari SIAP, atau di luar daftar.
 *
 * Dipakai untuk MENGHITUNG, bukan menyaring berkas. Angkanya ditampilkan di
 * halaman Export ADK supaya orang yang memilih "ADK PNS" tahu berapa pegawai
 * yang keluar dari berkas gara-gara pilihan itu - bukan menemukannya nanti
 * dari pegawai yang menelepon karena tidak dibayar.
 */
export function wherePegawaiTanpaJenis() {
  // Dibungkus AND, bukan OR telanjang: hasil fungsi ini disebar (`...`) ke
  // `where` yang bisa sudah punya `OR` sendiri (mis. pencarian nama/NIP di
  // /pegawai) - OR telanjang akan menimpanya diam-diam.
  return { AND: [{ OR: [{ jenisPegawai: null }, { jenisPegawai: { notIn: [...SEMUA_NILAI_JENIS] } }] }] };
}

export function bacaJenisPegawai(nilai: string | null | undefined): JenisPegawaiAdk | null {
  if (!nilai) return null;
  return JENIS_PEGAWAI_ADK.find((j) => j.kode === nilai)?.kode ?? null;
}

/**
 * Kelompok berkas ADK dari nilai APA ADANYA di data
 * (`IdentitasWebGaji.jenisPegawai`: "PNS", "CPNS", "PPPK", "P3K").
 *
 * BEDA DARI `bacaJenisPegawai` di atas, dan bedanya gampang tertukar:
 * yang itu membaca KODE pilihan dari query string (`?jenis=P3K`), yang ini
 * membaca NILAI dari berkas Kemenkeu. "CPNS" sah di sini dan tidak sah di
 * sana; "P3K" sah di dua-duanya tapi lewat jalan berbeda.
 *
 * Null kalau nilainya kosong atau di luar daftar - pemanggil WAJIB
 * menampilkannya sebagai "belum diketahui", bukan menjatuhkannya ke PNS.
 * Lihat alasannya di kepala berkas ini.
 */
export function kelompokDariNilaiData(nilai: string | null | undefined): JenisPegawaiAdk | null {
  if (!nilai) return null;
  const bersih = nilai.trim().toUpperCase();
  return JENIS_PEGAWAI_ADK.find((j) => j.nilaiDiData.includes(bersih))?.kode ?? null;
}

export function labelJenisPegawai(jenis: JenisPegawaiAdk | null): string {
  if (!jenis) return "Semua pegawai";
  return JENIS_PEGAWAI_ADK.find((j) => j.kode === jenis)?.label ?? "Semua pegawai";
}

/**
 * Potongan `where` untuk relasi `pegawai`. Kosong = tanpa penyaringan.
 *
 * Sengaja mengembalikan objek yang bisa disebar (`...`) ke dalam filter
 * `pegawai` yang sudah ada, bukan menggantinya - filter satuan kerja
 * (gerbang pengiriman unit) TIDAK BOLEH hilang gara-gara penyaringan jenis.
 */
export function wherePegawaiJenis(jenis: JenisPegawaiAdk | null) {
  if (!jenis) return {};
  const nilai = JENIS_PEGAWAI_ADK.find((j) => j.kode === jenis)?.nilaiDiData ?? [];
  return { jenisPegawai: { in: [...nilai] } };
}
