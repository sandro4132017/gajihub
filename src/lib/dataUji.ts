/**
 * Penanda data uji (pegawai dummy untuk akun penguji Pusdatik).
 *
 * Penandanya `Pegawai.sourceSystem = "DUMMY_UJI"`, bukan nama: sinkronisasi SIAP
 * dan job hapus dummy lama menyaring berdasarkan nama diawali "dummy", jadi
 * nama pegawai uji sengaja TIDAK diawali kata itu. Semua penyaring "jangan
 * kirim ke luar / jangan rekonsiliasi" memakai konstanta di sini.
 *
 * Semua nilai di berkas ini data palsu, bukan data pegawai sungguhan.
 */

export const SUMBER_DUMMY = "DUMMY_UJI";
export const SATKER_DUMMY = "UNIT UJI COBA PUSDATIK";

/** NIP akun penguji (palsu). Awalan 9999 tidak dipakai NIP pegawai sungguhan. */
export const NIP_PENGUJI = "999900000000000001"; // sensitive-ok

/** Awalan NIP yang dicadangkan untuk data uji. */
export const AWALAN_NIP_DUMMY = "9999";

/**
 * Potongan `where` untuk relasi/tabel Pegawai: pegawai uji TIDAK ikut. Dipakai
 * semua angka lintas unit, daftar periode, dan jumlah yang menyangkut
 * pembayaran atau berkas keluar.
 *
 * Pengecualiannya satu: bila yang diminta memang unit uji itu sendiri
 * (`satker === SATKER_DUMMY`), penyaring dimatikan supaya akun penguji bisa
 * melihat hasil ujinya.
 */
export function pegawaiBukanUji(satker?: string | null): { sourceSystem?: { not: string } } {
  return satker === SATKER_DUMMY ? {} : { sourceSystem: { not: SUMBER_DUMMY } };
}

export function isNipDummy(nip: string | null | undefined): boolean {
  return typeof nip === "string" && nip.startsWith(AWALAN_NIP_DUMMY);
}
