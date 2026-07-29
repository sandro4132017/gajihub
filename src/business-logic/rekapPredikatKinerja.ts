// ============================================================================
// REKAP PENILAIAN e-KINERJA BKN -> PredikatKinerja (bobot 70% Tukin)
//
// Modul ini PURE (tidak ada I/O - lihat "Konvensi kode" di CLAUDE.md):
// pembacaan file XLSX-nya dilakukan di Server Action
// (src/app/predikat-kinerja/actions.ts) dan di MockEKinerjaAdapter, yang
// masuk ke sini cuma matriks baris yang sudah dibaca.
//
// MENUTUP open item lama "Format file rekap predikat dari e-Kinerja BKN -
// belum ada contoh filenya" (CLAUDE.md). Sumber format: file asli
// "Rekap Penilaian (45).xlsx" hasil export portal e-Kinerja BKN, 28 pegawai
// Biro Keuangan dan BMN periode 6/2026.
//
// Bentuk filenya:
//   baris 1 : "3013 - Kementerian Ketenagakerjaan"   (instansi)
//   baris 2 : "Subbagian Tata Usaha"                 (unit penilaian)
//   baris 3 : "Periode Bulanan 6 Tahun 2026"         (periode)
//   baris 4 : kosong
//   baris 5 : header tabel
//   baris 6+: data
//   Kolom: No | NIP | Nama | Jabatan | Rating Hasil Kinerja |
//          Rating Perilaku Kerja | Predikat Kinerja Periodik
//
// CATATAN PENTING soal baris "unit" di kepala file: nilainya nama SUB-unit
// penilaian (mis. "Subbagian Tata Usaha"), BUKAN `Pegawai.satuanKerja`.
// Jadi baris itu CUMA informasi buat ditampilkan - scoping kewenangan
// (Kasubag TU cuma boleh unitnya sendiri) WAJIB ditentukan dari
// `Pegawai.satuanKerja` hasil lookup NIP, jangan dari teks ini.
//
// TODO(confirm):
// - Baru mendukung rekap BULANAN ("Periode Bulanan N Tahun YYYY"), karena
//   PredikatKinerja di skema ini memang per bulan. Rekap TAHUNAN ditolak
//   dengan pesan jelas, bukan dipaksa jadi bulan tertentu.
// - Kolom "Rating Hasil Kinerja" & "Rating Perilaku Kerja" DIBACA tapi
//   TIDAK disimpan - skema `PredikatKinerja` cuma punya satu predikat akhir,
//   dan yang dipakai Permenaker 15/2024 + Kepsekjen 82/2025 buat konversi
//   ke persen memang "Predikat Kinerja Periodik". Kalau nanti kedua rating
//   itu perlu diarsipkan, butuh kolom tambahan (migrasi terpisah).
// ============================================================================

import { konversiPredikatKeNilaiPersen, type PredikatKinerja } from "./konversiPredikat";

/**
 * Label predikat di file e-Kinerja BKN -> enum internal.
 *
 * Pencocokan EXACT (setelah normalisasi spasi & huruf besar), SENGAJA BUKAN
 * "includes"/fuzzy: salah menebak predikat langsung mengubah komponen 70%
 * tunjangan kinerja orang. Label yang tidak ada di daftar ini DILEWATI
 * dengan alasan eksplisit supaya ketahuan, bukan diam-diam diasumsikan.
 *
 * "PERLU PERBAIKAN" dan "BUTUH PERBAIKAN" dipetakan ke slot yang sama -
 * lihat TODO(confirm) di konversiPredikat.ts soal padanan istilah ini.
 */
const PETA_PREDIKAT: Record<string, PredikatKinerja> = {
  "SANGAT BAIK": "SANGAT_BAIK",
  BAIK: "BAIK",
  "PERLU PERBAIKAN": "PERLU_PERBAIKAN",
  "BUTUH PERBAIKAN": "PERLU_PERBAIKAN",
  KURANG: "KURANG",
  "SANGAT KURANG": "SANGAT_KURANG",
};

/** Daftar label yang dikenali - buat ditampilkan di pesan error UI. */
export const LABEL_PREDIKAT_DIKENALI = Object.keys(PETA_PREDIKAT);

export interface BarisRekapPredikat {
  nip: string;
  nama: string | null;
  jabatan: string | null;
  /** Dibaca dari file tapi tidak disimpan - lihat TODO(confirm) di atas. */
  ratingHasilKinerja: string | null;
  ratingPerilakuKerja: string | null;
  /** Teks asli dari file, buat ditampilkan apa adanya. */
  predikatLabel: string;
  predikat: PredikatKinerja;
  nilaiAngka: number;
}

export interface BarisRekapDilewati {
  /** Nomor baris di file (1-indexed, seperti yang dilihat user di Excel). */
  nomorBaris: number;
  nip: string | null;
  alasan: string;
}

export interface HasilParseRekapPredikat {
  /** Terisi kalau file tidak bisa diproses sama sekali. Kalau ada, `baris` pasti kosong. */
  error?: string;
  periodeBulan: number;
  periodeTahun: number;
  instansi: string | null;
  /** Nama unit penilaian dari kepala file - INFORMASI SAJA, jangan buat scoping. */
  unitPenilaian: string | null;
  baris: BarisRekapPredikat[];
  dilewati: BarisRekapDilewati[];
}

function teks(nilai: unknown): string | null {
  if (nilai === null || nilai === undefined) return null;
  const s = String(nilai).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

/** Normalisasi label predikat jadi enum internal; null kalau tidak dikenali. */
export function normalisasiPredikat(label: unknown): PredikatKinerja | null {
  const bersih = teks(label);
  if (!bersih) return null;
  return PETA_PREDIKAT[bersih.toUpperCase()] ?? null;
}

/**
 * Baca "Periode Bulanan 6 Tahun 2026" jadi { bulan: 6, tahun: 2026 }.
 * Mengembalikan alasan penolakan (string) kalau bentuknya lain.
 */
export function parsePeriodeRekap(
  baris: string
): { ok: true; bulan: number; tahun: number } | { ok: false; alasan: string } {
  const bersih = baris.replace(/\s+/g, " ").trim();

  const bulanan = bersih.match(/periode\s+bulanan\s+(\d{1,2})\s+tahun\s+(\d{4})/i);
  if (bulanan) {
    const bulan = Number(bulanan[1]);
    const tahun = Number(bulanan[2]);
    if (bulan < 1 || bulan > 12) return { ok: false, alasan: `bulan "${bulanan[1]}" di luar 1-12` };
    return { ok: true, bulan, tahun };
  }

  if (/periode\s+tahunan/i.test(bersih)) {
    return {
      ok: false,
      alasan:
        "file ini rekap TAHUNAN, sementara Gajihub menghitung tukin per bulan - unduh ulang rekap periode BULANAN dari e-Kinerja",
    };
  }

  return { ok: false, alasan: `baris periode tidak dikenali: "${bersih}"` };
}

/** Cari indeks kolom berdasarkan potongan nama header (case-insensitive). */
function cariKolom(header: (string | null)[], ...kandidat: string[]): number {
  for (const kata of kandidat) {
    const idx = header.findIndex((h) => h?.toLowerCase().includes(kata.toLowerCase()));
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Parse SELURUH isi file rekap. `matriks` = seluruh baris sheet (termasuk
 * blok kepala), sel kosong boleh null.
 */
export function parseRekapPredikatKinerja(matriks: unknown[][]): HasilParseRekapPredikat {
  const kosong: HasilParseRekapPredikat = {
    periodeBulan: 0,
    periodeTahun: 0,
    instansi: null,
    unitPenilaian: null,
    baris: [],
    dilewati: [],
  };

  // --- Cari baris header tabel: harus punya kolom NIP DAN kolom predikat ---
  // Dicari, bukan dipatok di indeks tetap, supaya file dengan jumlah baris
  // kepala berbeda (mis. ada baris nama satker tambahan) tetap terbaca.
  const idxHeader = matriks.findIndex((baris) => {
    const sel = baris.map((s) => teks(s)?.toLowerCase() ?? "");
    return sel.some((s) => s === "nip") && sel.some((s) => s.includes("predikat"));
  });
  if (idxHeader < 0) {
    return {
      ...kosong,
      error:
        'Baris header tidak ketemu - file ini sepertinya bukan "Rekap Penilaian" dari e-Kinerja BKN (dicari kolom "NIP" dan "Predikat Kinerja Periodik").',
    };
  }

  // --- Periode diambil dari blok kepala di atas header ---
  const barisKepala = matriks
    .slice(0, idxHeader)
    .map((b) => b.map((s) => teks(s)).filter(Boolean).join(" "))
    .filter(Boolean);

  let periode: { bulan: number; tahun: number } | null = null;
  let alasanPeriode = "baris periode tidak ditemukan di kepala file";
  for (const baris of barisKepala) {
    if (!/periode/i.test(baris)) continue;
    const hasil = parsePeriodeRekap(baris);
    if (hasil.ok) {
      periode = { bulan: hasil.bulan, tahun: hasil.tahun };
    } else {
      alasanPeriode = hasil.alasan;
    }
    break;
  }
  if (!periode) {
    return { ...kosong, error: `Periode tidak bisa dibaca dari file - ${alasanPeriode}.` };
  }

  const instansi = barisKepala[0] ?? null;
  // Baris kepala yang bukan instansi & bukan periode = unit penilaian.
  const unitPenilaian = barisKepala.slice(1).find((b) => !/periode/i.test(b)) ?? null;

  // --- Petakan kolom ---
  const header = matriks[idxHeader].map((s) => teks(s));
  const kolNip = cariKolom(header, "nip");
  const kolNama = cariKolom(header, "nama");
  const kolJabatan = cariKolom(header, "jabatan");
  const kolPredikat = cariKolom(header, "predikat");
  const kolRatingHasil = cariKolom(header, "rating hasil");
  const kolRatingPerilaku = cariKolom(header, "rating perilaku");

  const baris: BarisRekapPredikat[] = [];
  const dilewati: BarisRekapDilewati[] = [];

  for (let i = idxHeader + 1; i < matriks.length; i++) {
    const row = matriks[i];
    const nomorBaris = i + 1; // 1-indexed, sama dengan nomor baris di Excel
    const nip = teks(row[kolNip]);

    // Baris kosong (mis. footer/pemisah) dilewati diam-diam, bukan dilaporkan
    // sebagai masalah - kalau ADA isi tapi NIP-nya kosong, baru dilaporkan.
    const adaIsi = row.some((sel) => teks(sel) !== null);
    if (!adaIsi) continue;
    if (!nip) {
      dilewati.push({ nomorBaris, nip: null, alasan: "kolom NIP kosong" });
      continue;
    }

    const predikatLabel = teks(row[kolPredikat]);
    if (!predikatLabel) {
      dilewati.push({ nomorBaris, nip, alasan: "kolom Predikat Kinerja Periodik kosong" });
      continue;
    }

    const predikat = normalisasiPredikat(predikatLabel);
    if (!predikat) {
      dilewati.push({
        nomorBaris,
        nip,
        alasan: `predikat "${predikatLabel}" tidak dikenali (yang dikenali: ${LABEL_PREDIKAT_DIKENALI.join(", ")})`,
      });
      continue;
    }

    baris.push({
      nip,
      nama: kolNama >= 0 ? teks(row[kolNama]) : null,
      jabatan: kolJabatan >= 0 ? teks(row[kolJabatan]) : null,
      ratingHasilKinerja: kolRatingHasil >= 0 ? teks(row[kolRatingHasil]) : null,
      ratingPerilakuKerja: kolRatingPerilaku >= 0 ? teks(row[kolRatingPerilaku]) : null,
      predikatLabel,
      predikat,
      nilaiAngka: konversiPredikatKeNilaiPersen(predikat),
    });
  }

  return {
    periodeBulan: periode.bulan,
    periodeTahun: periode.tahun,
    instansi,
    unitPenilaian,
    baris,
    dilewati,
  };
}
