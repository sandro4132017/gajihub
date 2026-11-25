import { LABEL_STATUS, NAMA_HARI, jamTeks, lemburTeks } from "../../../../lib/format/presensiTampilan";
import {
  teksKeteranganPotongan,
  type BagianPotonganHarian,
} from "../../../../business-logic/rincianJamKerjaHarian";

/**
 * Baris Excel presensi perorangan - kolomnya sama dengan tabel "Rincian
 * harian" di `/tukin/presensi/[nip]` (mode Presensi). Murni, tanpa prisma.
 */
export const HEADER_EXCEL_PRESENSI_PEGAWAI = [
  "Tanggal",
  "Hari",
  "Status",
  "Masuk",
  "Pulang",
  "Telat (menit)",
  "Kekurangan jam kerja (menit)",
  "Lembur",
  "Potongan (%)",
  "Keterangan potongan",
  "Uang makan",
  "Koreksi",
] as const;

/** Sama dengan `BERHAK_UANG_MAKAN` di halaman rincian pegawai. */
const BERHAK_UANG_MAKAN = ["WFO", "HADIR", "TERLAMBAT", "WFH", "WFA"];

export interface HariExcelPresensi {
  tanggal: Date;
  statusKehadiran: string;
  jamMasuk: Date | null;
  jamKeluar: Date | null;
  menitTerlambat: number;
  menitPulangCepat: number;
  jamLembur: number;
}

export interface KoreksiExcelPresensi {
  jamMasuk: Date | null;
  jamKeluar: Date | null;
  jamLembur: number | null;
}

export type SelExcel = string | number | Date;

/** Potongan hari itu, sejajar dengan `harian` - dari `susunBarisHarianPegawai`. */
export interface PotonganExcelPresensi {
  /** Pecahan bobot kehadiran (0,016 = 1,6%). */
  potonganPersen: number;
  bagianPotongan: readonly BagianPotonganHarian[];
}

/**
 * Jam Masuk/Pulang yang ditulis = jam yang BERLAKU (koreksi petugas menimpa
 * jam mesin), dan kolom Koreksi menyebut jam aslinya supaya tetap bisa diaudit.
 * Lembur mengikuti halaman: koreksi lembur menimpa jam mesin.
 */
export function susunBarisExcelPresensiPegawai(
  harian: readonly HariExcelPresensi[],
  koreksiPerTanggal: ReadonlyMap<string, KoreksiExcelPresensi>,
  potongan: readonly PotonganExcelPresensi[] = []
): SelExcel[][] {
  return harian.map((h, i) => {
    const pot = potongan[i];
    const iso = h.tanggal.toISOString().slice(0, 10);
    const hariKe = h.tanggal.getUTCDay();
    const akhirPekan = hariKe === 0 || hariKe === 6;
    const k = koreksiPerTanggal.get(iso);
    const jamLembur = k?.jamLembur ?? h.jamLembur;

    const catatanKoreksi: string[] = [];
    if (k?.jamMasuk) catatanKoreksi.push(`masuk ${jamTeks(h.jamMasuk)} -> ${jamTeks(k.jamMasuk)}`);
    if (k?.jamKeluar) catatanKoreksi.push(`pulang ${jamTeks(h.jamKeluar)} -> ${jamTeks(k.jamKeluar)}`);
    if (k?.jamLembur != null && k.jamLembur !== h.jamLembur) catatanKoreksi.push("lembur");

    return [
      // Tanggal sebagai tanggal Excel (bisa disortir); formatnya dipasang per kolom.
      h.tanggal,
      NAMA_HARI[hariKe],
      LABEL_STATUS[h.statusKehadiran] ?? h.statusKehadiran,
      jamTeks(k?.jamMasuk ?? h.jamMasuk),
      jamTeks(k?.jamKeluar ?? h.jamKeluar),
      h.menitTerlambat > 0 ? h.menitTerlambat : "-",
      h.menitPulangCepat > 0 ? h.menitPulangCepat : "-",
      jamLembur > 0 ? lemburTeks(jamLembur) : "-",
      // Angka persen (1,6 = 1,6%) supaya bisa dijumlah di Excel.
      pot && pot.potonganPersen > 0 ? Math.round(pot.potonganPersen * 100 * 100) / 100 : "-",
      pot && pot.bagianPotongan.length > 0 ? teksKeteranganPotongan(pot.bagianPotongan) : "-",
      akhirPekan ? "akhir pekan" : BERHAK_UANG_MAKAN.includes(h.statusKehadiran) ? "berhak" : "tidak",
      k ? `Dikoreksi${catatanKoreksi.length ? ` (${catatanKoreksi.join(", ")})` : ""}` : "-",
    ];
  });
}
