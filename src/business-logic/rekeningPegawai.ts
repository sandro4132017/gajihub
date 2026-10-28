import { rapikanRekening, type MasalahRekening } from "./bankSpan";
// ============================================================================
// REKENING PEGAWAI - pemetaan file daftar rekening bank penerima pembayaran.
//
// Modul ini PURE (tidak ada I/O).
//
// KENAPA per JENIS PEMBAYARAN: sudah dibuktikan dari dua file asli satker
// 450938 periode 06/2026 bahwa TUKIN dan GAJI memakai bank yang BERBEDA -
// gaji lewat BNI (kode bank SPAN 520009000990), tukin lewat BRI
// (520002000990) - dan dari 96 NIP yang ada di kedua file, TIDAK SATUPUN
// nomor rekeningnya sama. Jadi rekening tukin TIDAK BISA diturunkan dari file
// gaji induk GPP, dan sebaliknya. Masing-masing punya sumber sendiri.
//
// Sumber rekening TUKIN: file ADK tukin yang sudah ada di tangan PPABP
// (contoh: "export txt adk_tunkin-PNS_ROMUM_JUni__2026.xlsx"). File itu
// memang sudah memuat kolom NIP + Kode Bank SPAN + Nama Bank + Nomor
// Rekening + Nama Rekening, jadi dipakai langsung sebagai sumber daftar
// rekening - tidak perlu file baru.
//
// Sumber rekening GAJI: file ADK gaji GPP (kolom kdbankspan/nmbankspan/
// rekening/nmrek), lihat gajiInduk.ts.
//
// CATATAN PII: ini data rekening bank. Lihat catatan panjang di model
// RekeningPegawai (schema.prisma) soal konsekuensi keamanannya.
// ============================================================================

export type JenisPembayaran = "TUKIN" | "GAJI";

/**
 * Rekening GAJI BELUM DITERIMA (keputusan user 2026-10-27): rekening gaji
 * menyusul begitu Gajihub sudah terinterkoneksi. Sampai saat itu tidak ada
 * jalur unggah yang menulis rekening GAJI, dan tampilannya disembunyikan.
 * Tipe & kolomnya sengaja dibiarkan supaya membukanya cukup mengubah ini.
 */
export const REKENING_GAJI_DITERIMA = false;

export interface BarisRekening {
  nip: string;
  kodeBankSpan: string;
  namaBank: string;
  nomorRekening: string;
  namaRekening: string | null;
}

export interface BarisRekeningDilewati {
  nomorBaris: number;
  nip: string | null;
  alasan: string;
}

export interface HasilParseRekening {
  error?: string;
  baris: BarisRekening[];
  dilewati: BarisRekeningDilewati[];
  /**
   * Yang diperbaiki maupun yang perlu diperiksa manusia - lihat
   * rapikanRekening(). Sengaja dikembalikan mentah, bukan sudah jadi
   * kalimat: pemanggilnya yang tahu mau menampilkannya sebagai apa.
   */
  masalah: MasalahRekening[];
}

function teks(nilai: unknown): string | null {
  if (nilai === null || nilai === undefined) return null;
  const s = String(nilai).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

/**
 * Judul kolom dibakukan: huruf kecil, garis bawah dibaca sebagai spasi.
 * Ekspor aplikasi (mis. "nama_bank", "nama_rekening") dan ketikan manusia
 * ("Nama Bank") menyebut kolom yang sama - tanpa ini, berkas ekspor ditolak
 * dengan "Kolom wajib tidak ditemukan: Nama Bank" padahal kolomnya ada.
 */
function teksJudul(nilai: unknown): string | null {
  return teks(nilai)?.toLowerCase().replace(/_+/g, " ").replace(/\s+/g, " ").trim() ?? null;
}

/**
 * Cari indeks kolom dari kandidat nama header.
 *
 * Kecocokan PERSIS didahulukan atas kecocokan sebagian. "rekening" juga
 * terkandung di "nama rekening"; tanpa urutan ini, berkas yang menaruh kolom
 * Nama Rekening sebelum kolom Rekening akan mengisi nomor rekening dengan
 * nama orang.
 */
function cariKolom(header: (string | null)[], ...kandidat: string[]): number {
  for (const kata of kandidat) {
    const idx = header.findIndex((h) => h === kata);
    if (idx >= 0) return idx;
  }
  for (const kata of kandidat) {
    const idx = header.findIndex((h) => h?.includes(kata));
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Parse daftar rekening dari file ber-header. Mendukung dua penamaan kolom
 * sekaligus: gaya ADK tukin ("Kode Bank SPAN", "Nomor Rekening") dan gaya
 * mentah GPP ("kdbankspan", "rekening") - jadi satu parser cukup untuk kedua
 * sumber.
 */
export function parseRekeningPegawai(matriks: unknown[][]): HasilParseRekening {
  const idxHeader = matriks.findIndex((baris) => {
    const sel = baris.map((s) => teksJudul(s) ?? "");
    return sel.some((s) => s === "nip") && sel.some((s) => s.includes("rekening"));
  });
  if (idxHeader < 0) {
    return {
      baris: [],
      dilewati: [],
      masalah: [],
      error: 'Baris header tidak ketemu - file harus punya kolom "NIP" dan kolom nomor rekening.',
    };
  }

  const header = matriks[idxHeader].map((s) => teksJudul(s));
  const kolNip = header.findIndex((h) => h === "nip");
  const kolKode = cariKolom(header, "kode bank span", "kdbankspan");
  const kolNamaBank = cariKolom(header, "nama bank", "nmbankspan", "nm bank");
  const kolRek = cariKolom(header, "nomor rekening", "rekening");
  const kolNamaRek = cariKolom(header, "nama rekening", "nmrek");

  const hilang: string[] = [];
  if (kolKode < 0) hilang.push("Kode Bank SPAN");
  if (kolNamaBank < 0) hilang.push("Nama Bank");
  if (kolRek < 0) hilang.push("Nomor Rekening");
  if (hilang.length > 0) {
    return { baris: [], dilewati: [], masalah: [], error: `Kolom wajib tidak ditemukan: ${hilang.join(", ")}.` };
  }

  const baris: BarisRekening[] = [];
  const dilewati: BarisRekeningDilewati[] = [];
  const masalah: MasalahRekening[] = [];

  for (let i = idxHeader + 1; i < matriks.length; i++) {
    const row = matriks[i];
    const nomorBaris = i + 1;
    if (!row.some((sel) => teks(sel) !== null)) continue; // baris kosong/footer

    const nip = teks(row[kolNip]);
    if (!nip) {
      // Baris TOTAL di akhir file ADK juga tidak punya NIP - dilewati diam-
      // diam kalau kolom rekeningnya juga kosong, dilaporkan kalau tidak.
      if (teks(row[kolRek])) dilewati.push({ nomorBaris, nip: null, alasan: "kolom NIP kosong" });
      continue;
    }

    const kodeBankSpan = teks(row[kolKode]);
    const namaBank = teks(row[kolNamaBank]);
    const nomorRekening = teks(row[kolRek]);
    if (!kodeBankSpan || !namaBank || !nomorRekening) {
      dilewati.push({
        nomorBaris,
        nip,
        alasan: "kode bank SPAN / nama bank / nomor rekening ada yang kosong",
      });
      continue;
    }

    // Aturan perapian yang SAMA dengan jalur basis data gaji - nama bank
    // dibakukan, nol di depan dikembalikan, kode bank rusak dipulihkan dari
    // namanya. Dua jalur unggahan mengisi tabel yang sama, jadi keduanya
    // harus memperlakukan datanya dengan cara yang sama; kalau tidak, isi
    // tabelnya bergantung lewat pintu mana datanya masuk.
    const rapi = rapikanRekening({ kodeBankSpan, namaBank, nomorRekening });
    masalah.push(...rapi.masalah);

    baris.push({
      nip,
      kodeBankSpan: rapi.kodeBankSpan,
      namaBank: rapi.namaBank,
      nomorRekening: rapi.nomorRekening,
      namaRekening: kolNamaRek >= 0 ? teks(row[kolNamaRek]) : null,
    });
  }

  return { baris, dilewati, masalah };
}

export interface SheetRekening {
  nama: string;
  matriks: unknown[][];
}

export interface HasilParseRekeningBerkas extends HasilParseRekening {
  /** Jumlah baris terbaca per sheet, termasuk sheet yang tidak berisi daftar rekening (0). */
  perSheet: { nama: string; jumlah: number; dilewatiKarena?: string }[];
}

/**
 * Parse SELURUH sheet sebuah berkas rekening, bukan cuma yang pertama.
 *
 * Berkas rekening lazim dipisah per jenis pegawai (sheet "PNS" dan "PPPK").
 * Membaca sheet pertama saja membuat seluruh PPPK hilang tanpa satu pun
 * peringatan - unggahan terlihat berhasil.
 *
 * - Sheet tanpa baris judul NIP + rekening (catatan, rekap) DILEWATI dan
 *   disebut di `perSheet`, bukan menggagalkan berkasnya.
 * - Sheet yang punya judul tapi kolom wajibnya kurang MENGGAGALKAN berkas:
 *   itu daftar rekening yang rusak, dan menyimpan sebagian sheet saja lebih
 *   berbahaya daripada menolak semuanya.
 * - NIP yang muncul lebih dari sekali dengan rekening YANG SAMA disimpan
 *   sekali. Dengan rekening BERBEDA, semua kemunculannya dilewati: dua tujuan
 *   transfer untuk satu orang tidak boleh diputuskan oleh urutan baris.
 */
export function parseRekeningBerkas(sheets: SheetRekening[]): HasilParseRekeningBerkas {
  const perSheet: HasilParseRekeningBerkas["perSheet"] = [];
  const semua: BarisRekening[] = [];
  const dilewati: BarisRekeningDilewati[] = [];
  const masalah: MasalahRekening[] = [];

  for (const sheet of sheets) {
    const hasil = parseRekeningPegawai(sheet.matriks);
    if (hasil.error) {
      if (hasil.error.startsWith("Baris header tidak ketemu")) {
        perSheet.push({ nama: sheet.nama, jumlah: 0, dilewatiKarena: "tidak ada kolom NIP & rekening" });
        continue;
      }
      return { baris: [], dilewati: [], masalah: [], perSheet, error: `Sheet "${sheet.nama}": ${hasil.error}` };
    }
    perSheet.push({ nama: sheet.nama, jumlah: hasil.baris.length });
    semua.push(...hasil.baris);
    dilewati.push(...hasil.dilewati);
    masalah.push(...hasil.masalah);
  }

  if (perSheet.every((s) => s.dilewatiKarena)) {
    return {
      baris: [],
      dilewati: [],
      masalah: [],
      perSheet,
      error: 'Baris header tidak ketemu di sheet mana pun - file harus punya kolom "NIP" dan kolom nomor rekening.',
    };
  }

  const kunciRek = (b: BarisRekening) => `${b.kodeBankSpan}|${b.nomorRekening}`;
  const perNip = new Map<string, BarisRekening[]>();
  for (const b of semua) perNip.set(b.nip, [...(perNip.get(b.nip) ?? []), b]);

  const baris: BarisRekening[] = [];
  for (const [nip, daftar] of perNip) {
    if (new Set(daftar.map(kunciRek)).size > 1) {
      dilewati.push({ nomorBaris: 0, nip, alasan: "NIP muncul lebih dari sekali dengan rekening berbeda" });
      continue;
    }
    baris.push(daftar[0]);
  }

  return { baris, dilewati, masalah, perSheet };
}

/**
 * Kelompokkan baris menurut kode bank SPAN. Dipakai buat menampilkan bank apa
 * saja yang benar-benar ada di data - tombol export per bank diturunkan dari
 * sini, BUKAN dari daftar bank yang dihardcode (kalau banknya berubah, UI-nya
 * ikut sendiri dan tidak ada tombol mati).
 */
export function kelompokkanPerBank<T extends { kodeBankSpan: string; namaBank: string }>(
  baris: T[]
): { kodeBankSpan: string; namaBank: string; jumlah: number }[] {
  const peta = new Map<string, { namaBank: string; jumlah: number }>();
  for (const b of baris) {
    const ada = peta.get(b.kodeBankSpan);
    // Nama bank di file kadang beda kapitalisasi antar baris ("Bank Rakyat
    // Indonesia" vs "BANK RAKYAT INDONESIA") - dipakai yang pertama ketemu,
    // pengelompokannya tetap by KODE bank yang stabil.
    if (ada) ada.jumlah += 1;
    else peta.set(b.kodeBankSpan, { namaBank: b.namaBank, jumlah: 1 });
  }
  return [...peta.entries()]
    .map(([kodeBankSpan, v]) => ({ kodeBankSpan, ...v }))
    .sort((a, b) => b.jumlah - a.jumlah);
}
