// Bagian MURNI penyambung SPKL ke sumber data: menentukan, untuk satu
// pegawai dan satu periode, perintah mana yang berlaku dan tanggal mana yang
// tunduk pada aturan SPKL. Tanpa prisma, tanpa I/O.
//
// PILIHAN DESAIN - periode separuh di dalam gerbang (berlakuMulai di tengah
// bulan): mesin (`rekapDariLaporanPdf`) menerima SATU Map per pegawai untuk
// seluruh bulan, dan "tanpa perintah di suatu tanggal" berarti 0. Kalau Map itu
// dipakai apa adanya, tanggal SEBELUM berlakuMulai ikut dinolkan padahal SPKL
// belum berlaku di sana. Maka hasilnya membawa dua hal: `perintah` (hanya
// tanggal dalam gerbang) dan `berlaku(iso)`; mesin menerapkan aturan SPKL
// HANYA pada tanggal yang `berlaku(iso)`-nya true, tanggal lain tetap
// perilaku lama dan `jamLemburNyata`-nya null.

import { spklAktifUntuk } from "./gerbangSpkl";
import { terapkanPerintahLembur } from "../../business-logic/lemburDiperintahkan";

export interface PerintahLemburPegawai {
  /** Tanggal ISO -> jam diperintahkan; HANYA tanggal yang tunduk pada SPKL. */
  perintah: ReadonlyMap<string, number>;
  /** Apakah aturan SPKL berlaku untuk tanggal ISO ini (gerbang satker pegawai). */
  berlaku: (tanggalIso: string) => boolean;
}

export interface BarisPerintahTerkirim {
  pegawaiId: string;
  /** Tanggal ISO YYYY-MM-DD. */
  tanggalIso: string;
  jamDiperintahkan: number;
}

/** Tanggal (UTC tengah malam) -> "YYYY-MM-DD". */
export function isoDariTanggalUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Tanggal ISO hari terakhir bulan itu. */
export function hariTerakhirIso(bulan: number, tahun: number): string {
  return isoDariTanggalUtc(new Date(Date.UTC(tahun, bulan, 0)));
}

/**
 * Apakah ADA tanggal di periode itu yang tunduk pada SPKL untuk satker ini.
 * Gerbang hanya punya batas bawah, jadi cukup periksa hari terakhir bulan.
 */
export function spklBerlakuDiPeriode(satuanKerja: string | null | undefined, bulan: number, tahun: number): boolean {
  return spklAktifUntuk(satuanKerja, hariTerakhirIso(bulan, tahun));
}

/**
 * Perintah satu pegawai untuk periode itu, atau `null` kalau SPKL tidak
 * berlaku untuknya di periode itu (satker bukan pilot / periode sebelum
 * gerbang). Map kosong BUKAN null: artinya SPKL berlaku tapi tidak ada perintah.
 *
 * Tanggal di luar bulan/gerbang pada `perintahPegawai` dibuang - pertahanan
 * kedua, karena nilai ini langsung menentukan uang.
 */
export function perintahUntukPegawai(
  satuanKerja: string | null | undefined,
  perintahPegawai: ReadonlyMap<string, number> | undefined,
  bulan: number,
  tahun: number
): PerintahLemburPegawai | null {
  if (!spklBerlakuDiPeriode(satuanKerja, bulan, tahun)) return null;
  const awalan = `${tahun}-${String(bulan).padStart(2, "0")}-`;
  const perintah = new Map<string, number>();
  for (const [iso, jam] of perintahPegawai ?? []) {
    if (!iso.startsWith(awalan)) continue;
    if (!spklAktifUntuk(satuanKerja, iso)) continue;
    perintah.set(iso, jam);
  }
  return { perintah, berlaku: (iso) => spklAktifUntuk(satuanKerja, iso) };
}

/** Kelompokkan baris perintah per pegawaiId -> Map tanggalIso -> jam. */
export function kelompokkanPerintah(baris: readonly BarisPerintahTerkirim[]): Map<string, Map<string, number>> {
  const perPegawai = new Map<string, Map<string, number>>();
  for (const b of baris) {
    let peta = perPegawai.get(b.pegawaiId);
    if (!peta) {
      peta = new Map();
      perPegawai.set(b.pegawaiId, peta);
    }
    // Basis data menjamin satu perintah TERKIRIM per pegawai+tanggal; kalau
    // tetap ada dua, ambil yang LEBIH KECIL - jangan membayar lebih dari yang
    // pasti diperintahkan.
    const ada = peta.get(b.tanggalIso);
    peta.set(b.tanggalIso, ada === undefined ? b.jamDiperintahkan : Math.min(ada, b.jamDiperintahkan));
  }
  return perPegawai;
}

/**
 * Status kehadiran tersimpan (PresensiHarian.statusKehadiran) -> kategori yang
 * dipahami `terapkanPerintahLembur`. "HADIR"/"TERLAMBAT" adalah label lama yang
 * artinya WFO (lihat src/types/index.ts); "WFO" dan "LEMBUR" dikenali apa
 * adanya; selain itu dikembalikan apa adanya (dan dianggap BUKAN WFO).
 */
export function kategoriDariStatusTersimpan(status: string): string {
  if (status === "WFO" || status === "HADIR" || status === "TERLAMBAT") return "WFO";
  return status;
}

export interface HasilHariSpkl {
  /** Jam yang DIBAYAR hari itu. */
  dibayar: number;
  catatan: string | null;
}

/**
 * Satu primitif untuk SATU hari ber-SPKL di luar mesin tarik (koreksi
 * petugas, cabut koreksi, sinkronisasi ulang rekap): memakai fungsi yang SAMA
 * dengan mesin (`terapkanPerintahLembur`), jadi hari kerja non-WFO dibayar 0
 * mutlak dan jam dibatasi perintah persis seperti saat presensi ditarik.
 *
 * `perintah` null = tanpa perintah terkirim di tanggal itu.
 */
export function jamDibayarHariSpkl(h: {
  tanggalIso: string;
  statusKehadiran: string;
  hariLibur: boolean;
  jamNyata: number;
  perintah: number | null;
}): HasilHariSpkl {
  const peta = new Map<string, number>();
  if (h.perintah !== null) peta.set(h.tanggalIso, h.perintah);
  const { hari } = terapkanPerintahLembur(
    [
      {
        tanggalIso: h.tanggalIso,
        kategori: kategoriDariStatusTersimpan(h.statusKehadiran),
        hariLibur: h.hariLibur,
        jamLembur: h.jamNyata,
        // Hanya `jamLembur` dan `catatanLembur` yang dipakai pemanggil; syarat
        // makan lembur tidak dinilai di sini.
        berhakMakanLembur: true,
      },
    ],
    peta
  );
  return { dibayar: hari[0].jamLembur, catatan: hari[0].catatanLembur };
}

export interface RincianLemburSpkl {
  perintah: number | null;
  nyata: number;
  dibayar: number;
  catatan: string | null;
}

/**
 * Bahan tampilan satu hari: diperintahkan / nyata / dibayar + catatan.
 * null = SPKL tidak berlaku di tanggal itu ATAU baris belum membawa jam nyata
 * (ditarik sebelum fitur ini) - tampilan jatuh ke angka tunggal lama.
 * `dibayar` adalah angka TERSIMPAN (yang dibaca ADK); catatan diturunkan dari
 * aturan yang sama dengan mesin.
 */
export function rincianLemburSpkl(
  spkl: PerintahLemburPegawai | null,
  h: { tanggalIso: string; statusKehadiran: string; hariLibur: boolean; jamLembur: number; jamLemburNyata: number | null }
): RincianLemburSpkl | null {
  if (!spkl || !spkl.berlaku(h.tanggalIso) || h.jamLemburNyata === null) return null;
  const perintah = spkl.perintah.get(h.tanggalIso) ?? null;
  const { catatan } = jamDibayarHariSpkl({
    tanggalIso: h.tanggalIso,
    statusKehadiran: h.statusKehadiran,
    hariLibur: h.hariLibur,
    jamNyata: h.jamLemburNyata,
    perintah,
  });
  return { perintah, nyata: h.jamLemburNyata, dibayar: h.jamLembur, catatan };
}
