// Format tampilan waktu untuk halaman perintah lembur. Murni, aman dari klien.
// WIB = UTC+7 tetap (tidak ada DST), dihitung manual - bukan Intl - supaya hasilnya
// sama di server dan di browser mana pun.

import { NAMA_BULAN } from "../format/bulan";

const OFFSET_WIB_MS = 7 * 60 * 60 * 1000;

/** "2026-11-19" -> "19 November 2026"; masukan tidak sah dikembalikan apa adanya. */
export function tanggalIsoTeks(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${NAMA_BULAN[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** Instan UTC -> "19 November 2026, 14.05 WIB". */
export function waktuWibTeks(d: Date): string {
  const w = new Date(d.getTime() + OFFSET_WIB_MS);
  const jam = String(w.getUTCHours()).padStart(2, "0");
  const menit = String(w.getUTCMinutes()).padStart(2, "0");
  const iso = w.toISOString().slice(0, 10);
  return `${tanggalIsoTeks(iso)}, ${jam}.${menit} WIB`;
}

/** "2026-11-19" -> "2026-11" (kunci periode rekap presensi). */
export function kunciPeriodeDariTanggal(iso: string): string {
  return iso.slice(0, 7);
}
