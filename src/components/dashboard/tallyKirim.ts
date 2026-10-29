// ============================================================================
// Cacah baris kalkulasi menurut keadaan PENGIRIMAN unitnya.
//
// MENGGANTIKAN `tallyApproval` (dihapus 2026-09-02 bersama approval
// berjenjang). Yang dulu dihitung: berapa baris sudah disetujui, sedang
// diproses, ditolak, belum diajukan - empat keadaan yang bisa berbeda-beda
// antar baris dalam satu unit.
//
// Sekarang keadaannya ditentukan per UNIT, jadi cacahnya tinggal tiga dan
// seluruh baris satu unit selalu jatuh ke keranjang yang sama. Itu bukan
// penyederhanaan tampilan - itu memang bentuk keputusannya sekarang.
//
// PURE - nol I/O. Pemanggilnya yang membaca PengirimanUnit dari database.
// ============================================================================

export interface HasilTallyKirim {
  terkirim: number;
  dikembalikan: number;
  belumKirim: number;
  total: number;
}

/**
 * `kunciPerBaris` berisi satu kunci `"<satker>|<bulan>|<tahun>"` per baris
 * kalkulasi - boleh berulang, memang satu unit punya banyak baris.
 *
 * `petaKirim` memetakan kunci yang sama ke status PengirimanUnit. Kunci yang
 * TIDAK ada di peta dihitung sebagai belum dikirim; itu keadaan normal, bukan
 * data hilang.
 */
export function tallyKirim(
  kunciPerBaris: readonly string[],
  petaKirim: ReadonlyMap<string, string>
): HasilTallyKirim {
  const hasil: HasilTallyKirim = { terkirim: 0, dikembalikan: 0, belumKirim: 0, total: 0 };
  for (const kunci of kunciPerBaris) {
    hasil.total++;
    const status = petaKirim.get(kunci);
    if (status === "TERKIRIM") hasil.terkirim++;
    else if (status === "DIKEMBALIKAN") hasil.dikembalikan++;
    else hasil.belumKirim++;
  }
  return hasil;
}

/** Bentuk kunci yang dipakai `tallyKirim` dan peta pengirimannya. */
export function kunciKirim(satuanKerja: string, periodeBulan: number, periodeTahun: number): string {
  return `${satuanKerja}|${periodeBulan}|${periodeTahun}`;
}
