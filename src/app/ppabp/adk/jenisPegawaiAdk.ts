// ============================================================================
// PEMISAHAN ADK PNS vs ADK P3K.
//
// SUMBERNYA `IdentitasWebGaji.jenisPegawai`, BUKAN format golongan.
//
// Golongan memang terlihat memisahkan keduanya - PNS berformat "III/d",
// jenjang PPPK berupa angka Romawi telanjang "IX" - dan penurunan itu memang
// dipakai di tempat lain (tarifSbm.ts). Tapi diukur pada data 5.302 pegawai
// (2026-09-02) penurunan itu SALAH pada 14 orang: identitas Web Gaji menyebut
// mereka PPPK sementara golongannya berformat PNS. Empat belas orang di berkas
// yang keliru adalah empat belas pembayaran yang tidak akan diproses.
//
// `IdentitasWebGaji` datang dari berkas basis data gaji Kemenkeu sendiri (sheet
// data_PNS / data_P3K), jadi ia BUKAN tebakan - itu jawaban Web Gaji sendiri
// atas pertanyaan "orang ini masuk berkas yang mana".
//
// YANG TIDAK PUNYA IDENTITAS TIDAK DITEBAK. Pada data yang sama, 329 pegawai
// belum tercakup berkas basis data gaji. Mereka TIDAK dimasukkan ke salah satu
// bucket lewat golongannya - mereka keluar dari berkas begitu penyaringan
// jenis dipakai, dan jumlahnya ditampilkan di layar supaya kelihatan sebelum
// berkasnya dikirim. Menebak akan menaruh sebagian dari mereka di berkas yang
// salah tanpa ada yang tahu.
// ============================================================================

export type JenisPegawaiAdk = "PNS" | "P3K";

export interface PilihanJenisPegawai {
  kode: JenisPegawaiAdk;
  label: string;
  /**
   * Nilai `IdentitasWebGaji.jenisPegawai` yang masuk kelompok ini, apa adanya
   * dari berkas Kemenkeu.
   */
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
    // Dua ejaan dijaga sekaligus: berkas Kemenkeu memakai "PPPK" di kolom
    // JENIS PEGAWAI sementara nama sheet-nya "data_P3K". Kalau suatu saat
    // kolomnya ikut memakai "P3K", penyaringan ini tidak diam-diam kosong.
    nilaiDiData: ["PPPK", "P3K"],
  },
] as const;

/** Semua nilai yang dikenali, dari kedua kelompok. */
export const SEMUA_NILAI_JENIS: readonly string[] = JENIS_PEGAWAI_ADK.flatMap((j) => [...j.nilaiDiData]);

/**
 * Potongan `where` untuk pegawai yang TIDAK masuk kelompok mana pun - belum
 * punya identitas Web Gaji, atau punya tapi jenisnya di luar daftar.
 *
 * Dipakai untuk MENGHITUNG, bukan menyaring berkas. Angkanya ditampilkan di
 * halaman Export ADK supaya orang yang memilih "ADK PNS" tahu berapa pegawai
 * yang keluar dari berkas gara-gara pilihan itu - bukan menemukannya nanti
 * dari pegawai yang menelepon karena tidak dibayar.
 */
export function wherePegawaiTanpaJenis() {
  return { NOT: { identitasWebGaji: { jenisPegawai: { in: [...SEMUA_NILAI_JENIS] } } } };
}

export function bacaJenisPegawai(nilai: string | null | undefined): JenisPegawaiAdk | null {
  if (!nilai) return null;
  return JENIS_PEGAWAI_ADK.find((j) => j.kode === nilai)?.kode ?? null;
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
  return { identitasWebGaji: { jenisPegawai: { in: [...nilai] } } };
}
