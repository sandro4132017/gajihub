// ============================================================================
// KOREKSI JAM PRESENSI HARIAN - aturan murni (nol I/O).
//
// Dasar: Pasal 10 ayat (2) Permenaker 15/2024 (kendala/kesalahan pencatatan
// presensi tidak boleh merugikan pegawai) - jam masuk, pulang, dan lembur
// boleh dikoreksi oleh Kasubag TU unitnya SESUDAH ada bukti kehadiran. Yang
// dikoreksi adalah FAKTA kehadiran, jadi yang menentukan sah-tidaknya adalah
// bukti dan jejak auditnya, bukan penanda "kendala e-Presensi".
//
// Pengamannya (semuanya ditegakkan di Server Action, aturannya di sini):
//   1. Bukti wajib PER SISI: bukti masuk untuk jam masuk, bukti pulang untuk
//      jam pulang (`butuhBukti`).
//   2. Alasan minimal `PANJANG_MIN_ALASAN_KOREKSI` karakter.
//   3. Berkas bukti dibatasi jenis & ukurannya (`validasiBuktiKoreksi`).
//   4. Ditolak bila rekap unit pada periode TANGGAL YANG DIKOREKSI sudah
//      terkirim (`periodeDariTanggal`) - bukan periode dari form.
// ============================================================================

export const PANJANG_MIN_ALASAN_KOREKSI = 15;
export const MAKS_BUKTI_KOREKSI_BITA = 2 * 1024 * 1024; // 2 MB
export const EKSTENSI_BUKTI_KOREKSI = [".jpg", ".jpeg", ".png", ".pdf"] as const;

/** Teks pernyataan yang dicentang Kasubag TU - ditampilkan apa adanya di form. */
export const TEKS_PERNYATAAN_KOREKSI =
  "Saya sudah memeriksa bukti kehadiran pegawai ini dan bertanggung jawab atas koreksi ini.";

/** Pesan galat, atau `null` bila alasan sah. */
export function validasiAlasanKoreksi(alasan: string): string | null {
  if (alasan.trim().length < PANJANG_MIN_ALASAN_KOREKSI) {
    return `Alasan wajib diisi minimal ${PANJANG_MIN_ALASAN_KOREKSI} karakter - sebutkan dasar koreksinya (mis. foto bergeotag jam 07.15 dikirim pegawai via WhatsApp).`;
  }
  return null;
}

export type HasilValidasiBukti = { ok: true; ekstensi: string } | { ok: false; error: string };

/**
 * Memeriksa nama & ukuran berkas bukti. Pemeriksaan ISI (magic byte) dilakukan
 * pemanggil lewat `cocokTandaTangan` karena butuh bita berkasnya.
 */
export function validasiBuktiKoreksi(berkas: { nama: string; ukuran: number }): HasilValidasiBukti {
  if (!Number.isFinite(berkas.ukuran) || berkas.ukuran <= 0) {
    return { ok: false, error: "Berkas bukti kosong." };
  }
  if (berkas.ukuran > MAKS_BUKTI_KOREKSI_BITA) {
    return { ok: false, error: "Ukuran berkas bukti melebihi batas maksimal 2 MB." };
  }
  const titik = berkas.nama.lastIndexOf(".");
  const ekstensi = titik >= 0 ? berkas.nama.slice(titik).toLowerCase() : "";
  if (!(EKSTENSI_BUKTI_KOREKSI as readonly string[]).includes(ekstensi)) {
    return { ok: false, error: "Bukti harus berkas JPG, PNG, atau PDF." };
  }
  return { ok: true, ekstensi: ekstensi.slice(1) };
}

export interface KoreksiLamaBukti {
  jamMasuk: string | null;
  jamKeluar: string | null;
  /** Bukti absen masuk tersimpan (bukti_ref). */
  buktiRef: string | null;
  /** Bukti absen pulang tersimpan (bukti_ref_keluar). */
  buktiRefKeluar: string | null;
}

export interface WajibBukti {
  masuk: boolean;
  keluar: boolean;
}

/**
 * Sisi mana yang WAJIB disertai bukti baru. Jam diberikan sebagai "HH:MM"
 * atau null (= tidak dikoreksi). Tiap sisi berdiri sendiri:
 *
 *  - Jam masuk disentuh  -> bukti masuk wajib, KECUALI koreksi lama sudah punya
 *    bukti masuk dan jam masuknya tidak berubah (bukti lama dipakai).
 *  - Jam pulang disentuh -> bukti pulang wajib, dengan syarat yang sama.
 *  - Sisi yang tidak disentuh tidak butuh bukti.
 */
export function butuhBukti(
  baru: { jamMasuk: string | null; jamKeluar: string | null },
  lama: KoreksiLamaBukti | null
): WajibBukti {
  const masuk =
    baru.jamMasuk !== null && (!lama || !lama.buktiRef || baru.jamMasuk !== lama.jamMasuk);
  const keluar =
    baru.jamKeluar !== null && (!lama || !lama.buktiRefKeluar || baru.jamKeluar !== lama.jamKeluar);
  return { masuk, keluar };
}

/** Periode (bulan 1-12, tahun) dari tanggal koreksi yang bertanda tengah malam UTC. */
export function periodeDariTanggal(tanggal: Date): { bulan: number; tahun: number } {
  return { bulan: tanggal.getUTCMonth() + 1, tahun: tanggal.getUTCFullYear() };
}
