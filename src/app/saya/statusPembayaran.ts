import type { StatusUnit } from "../../business-logic/pengirimanUnit";

/**
 * Keterangan "final atau estimasi" untuk angka milik pegawai.
 *
 * Patokannya SATU: keadaan rekap unit dari `statusUnit()`
 * (src/business-logic/pengirimanUnit.ts). Angka baru final kalau rekap
 * unitnya TERKIRIM ke PPABP - sama dengan gerbang ADK (satkerTerkirim.ts).
 * Status per-baris kalkulasi tidak dipakai: sejak persetujuan berjenjang
 * diganti "kirim rekap ke PPABP" ia tidak lagi menandai apa pun.
 *
 * `alasanKembali` sengaja TIDAK ikut keluar: itu catatan PPABP untuk Kasubag
 * TU, bukan untuk pegawai.
 */
export interface KeteranganFinalitas {
  final: boolean;
  label: string;
  /** Kalimat peringatan untuk slip; null kalau angkanya sudah final. */
  peringatan: string | null;
}

export function keteranganFinalitas(s: StatusUnit): KeteranganFinalitas {
  switch (s.keadaan) {
    case "TERKIRIM":
      return { final: true, label: "Terkirim ke PPABP", peringatan: null };
    case "DIKEMBALIKAN":
      return {
        final: false,
        label: "Estimasi - dikembalikan ke unit",
        peringatan:
          "Rekap unit periode ini dikembalikan PPABP ke unit untuk diperbaiki - angka di bawah masih bisa berubah.",
      };
    case "BELUM_KIRIM":
    default:
      return {
        final: false,
        label: "Estimasi - rekap unit belum dikirim",
        peringatan:
          "Rekap unit periode ini belum dikirim ke PPABP - angka di bawah masih bisa berubah, bukan pembayaran final.",
      };
  }
}
