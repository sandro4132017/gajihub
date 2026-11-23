// Gerbang pilot SPKL (Surat Perintah Kerja Lembur): fitur perintah lembur
// hanya menyala untuk satuan kerja yang terdaftar di bawah, mulai tanggal
// berlakunya. Murni - tanpa I/O.
//
// Ini SATU-SATUNYA tempat nama satker pilot ditulis. Menambah satker =
// menambah satu baris di SPKL_AKTIF; jangan menyalin nama satker ke berkas lain.

import { SATKER_DUMMY } from "../dataUji";

export interface SpklAktif {
  satuanKerja: string;
  /** Tanggal ISO (YYYY-MM-DD), inklusif. */
  berlakuMulai: string;
  /** Nama pendek untuk kalimat di dokumen. */
  namaSingkat: string;
  /** Jabatan penanda tangan SPKL di unit ini (tanpa nama orangnya). */
  jabatanPenandatangan: string;
}

// TODO(confirm): tanggal mulai pilot SPKL di Biro Keuangan dan BMN belum
// dikonfirmasi; 2026-12-01 adalah perkiraan.
//
// Baris kedua = unit uji akun penguji (pegawai DUMMY_UJI, disaring dari semua
// berkas ADK), supaya alur Kepala Tim bisa dicoba sebelum pilot berlaku tanpa
// menyentuh pegawai sungguhan. Satker pilot SELALU di indeks 0.
export const SPKL_AKTIF: readonly SpklAktif[] = [
  {
    satuanKerja: "Biro Keuangan dan Barang Milik Negara",
    berlakuMulai: "2026-12-01",
    namaSingkat: "Biro Keuangan dan BMN",
    jabatanPenandatangan: "Kepala Biro Keuangan dan BMN",
  },
  {
    satuanKerja: SATKER_DUMMY,
    berlakuMulai: "2026-11-01",
    namaSingkat: SATKER_DUMMY,
    jabatanPenandatangan: "Kepala Biro",
  },
];

const FORMAT_TANGGAL_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tanggal mulai berlaku SPKL untuk satker ini; null bila satkernya belum
 * terdaftar (SPKL belum diaktifkan sama sekali). Pencocokan sama dengan
 * `spklAktifUntuk`: persis setelah trim.
 */
export function berlakuMulaiSpkl(satuanKerja: string | null | undefined): string | null {
  const satker = satuanKerja?.trim();
  if (!satker) return null;
  return SPKL_AKTIF.find((a) => a.satuanKerja === satker)?.berlakuMulai ?? null;
}

/**
 * Apakah SPKL berlaku untuk satker ini pada tanggal itu.
 *
 * Satker kosong, satker yang tidak terdaftar, tanggal yang bukan format ISO
 * (YYYY-MM-DD), dan tanggal sebelum `berlakuMulai` semuanya DITOLAK. Nama
 * satker dicocokkan persis (setelah trim), tanpa pencocokan sebagian.
 */
export function spklAktifUntuk(satuanKerja: string | null | undefined, tanggalIso: string): boolean {
  const satker = satuanKerja?.trim();
  if (!satker) return false;
  if (!FORMAT_TANGGAL_ISO.test(tanggalIso)) return false;
  // Format ISO berurutan sama dengan urutan kronologis, jadi cukup dibandingkan sebagai teks.
  return SPKL_AKTIF.some((a) => a.satuanKerja === satker && tanggalIso >= a.berlakuMulai);
}

/** Data satker terdaftar (nama singkat, jabatan penanda tangan); null bila belum terdaftar. */
export function spklAktifDataUntuk(satuanKerja: string | null | undefined): SpklAktif | null {
  const satker = satuanKerja?.trim();
  if (!satker) return null;
  return SPKL_AKTIF.find((a) => a.satuanKerja === satker) ?? null;
}
