import {
  FiCornerUpLeft,
  FiDownload,
  FiEdit3,
  FiRefreshCw,
  FiSend,
  FiTrash2,
  FiUploadCloud,
} from "react-icons/fi";
import type { IconType } from "react-icons";
import type { JenisAktivitas } from "./kalimatAudit";

/**
 * Format tampilan panel Kabar. MURNI dan aman dipakai di klien (tanpa prisma).
 * Semua tanggal dibaca menurut Asia/Jakarta - server dan peramban bisa berada
 * di zona waktu lain, dan "hari ini" yang berbeda membuat baris tengah malam
 * masuk kelompok hari yang salah.
 */
export const ZONA_KABAR = "Asia/Jakarta";

const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const NAMA_BULAN_PENUH = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function bagianJakarta(d: Date): { tahun: number; bulan: number; hari: number; jam: string; menit: string } {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA_KABAR,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const peta: Record<string, string> = {};
  for (const b of f.formatToParts(d)) peta[b.type] = b.value;
  return {
    tahun: Number(peta.year),
    bulan: Number(peta.month),
    hari: Number(peta.day),
    jam: peta.hour ?? "00",
    menit: peta.minute ?? "00",
  };
}

/** "2026-11-05" menurut WIB. */
export function kunciHariJakarta(d: Date): string {
  const b = bagianJakarta(d);
  return `${b.tahun}-${String(b.bulan).padStart(2, "0")}-${String(b.hari).padStart(2, "0")}`;
}

/** "14.05" menurut WIB. */
export function jamJakarta(d: Date): string {
  const b = bagianJakarta(d);
  return `${b.jam}.${b.menit}`;
}

function selisihHari(kunciA: string, kunciB: string): number {
  return Math.round((Date.parse(`${kunciA}T00:00:00Z`) - Date.parse(`${kunciB}T00:00:00Z`)) / 86_400_000);
}

/** "Hari ini" / "Kemarin" / "Senin, 3 November 2026". */
export function labelHari(kunciHari: string, sekarang: Date = new Date()): string {
  const selisih = selisihHari(kunciHariJakarta(sekarang), kunciHari);
  if (selisih === 0) return "Hari ini";
  if (selisih === 1) return "Kemarin";
  const t = new Date(`${kunciHari}T00:00:00Z`);
  if (Number.isNaN(t.getTime())) return kunciHari;
  const [thn, bln, tgl] = kunciHari.split("-").map(Number);
  return `${NAMA_HARI[t.getUTCDay()]}, ${tgl} ${NAMA_BULAN_PENUH[bln - 1]} ${thn}`;
}

/** Kelompokkan berurutan per hari WIB; urutan masukan dipertahankan. */
export function kelompokPerHari<T extends { waktu: Date | string }>(
  baris: readonly T[]
): { kunci: string; baris: T[] }[] {
  const hasil: { kunci: string; baris: T[] }[] = [];
  for (const b of baris) {
    const kunci = kunciHariJakarta(new Date(b.waktu));
    const akhir = hasil[hasil.length - 1];
    if (akhir && akhir.kunci === kunci) akhir.baris.push(b);
    else hasil.push({ kunci, baris: [b] });
  }
  return hasil;
}

export interface SegmenTeks {
  t: string;
  /** true = angka, ditampilkan font-mono. */
  mono: boolean;
}

/** Pecah teks menjadi segmen angka (mono) dan bukan angka. */
export function pecahAngka(teks: string): SegmenTeks[] {
  const hasil: SegmenTeks[] = [];
  // Pemisah hanya dihitung bila diapit angka, jadi titik/koma penutup kalimat
  // tidak ikut masuk segmen mono.
  const re = /\d+(?:[.,/]\d+)*/g;
  let akhir = 0;
  for (const m of teks.matchAll(re)) {
    const awal = m.index ?? 0;
    if (awal > akhir) hasil.push({ t: teks.slice(akhir, awal), mono: false });
    hasil.push({ t: m[0], mono: true });
    akhir = awal + m[0].length;
  }
  if (akhir < teks.length) hasil.push({ t: teks.slice(akhir), mono: false });
  return hasil;
}

export interface GayaJenis {
  Ikon: IconType;
  kelas: string;
}

export const GAYA_JENIS: Record<JenisAktivitas, GayaJenis> = {
  kirim: { Ikon: FiSend, kelas: "bg-green-tint text-green" },
  kembalikan: { Ikon: FiCornerUpLeft, kelas: "bg-gold-tint text-gold-deep" },
  hapus: { Ikon: FiTrash2, kelas: "bg-red-tint text-red" },
  ubah: { Ikon: FiEdit3, kelas: "bg-teal-tint text-biru" },
  unggah: { Ikon: FiUploadCloud, kelas: "border border-line bg-surface-2 text-navy" },
  ekspor: { Ikon: FiDownload, kelas: "border border-line bg-surface-2 text-navy" },
  sistem: { Ikon: FiRefreshCw, kelas: "bg-line-2 text-muted" },
};
