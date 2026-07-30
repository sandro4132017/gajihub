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
}

function teks(nilai: unknown): string | null {
  if (nilai === null || nilai === undefined) return null;
  const s = String(nilai).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

/** Cari indeks kolom dari kandidat nama header (case-insensitive, sebagian). */
function cariKolom(header: (string | null)[], ...kandidat: string[]): number {
  for (const kata of kandidat) {
    const idx = header.findIndex((h) => h?.toLowerCase().includes(kata.toLowerCase()));
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
    const sel = baris.map((s) => teks(s)?.toLowerCase() ?? "");
    return sel.some((s) => s === "nip") && sel.some((s) => s.includes("rekening"));
  });
  if (idxHeader < 0) {
    return {
      baris: [],
      dilewati: [],
      error: 'Baris header tidak ketemu - file harus punya kolom "NIP" dan kolom nomor rekening.',
    };
  }

  const header = matriks[idxHeader].map((s) => teks(s));
  const kolNip = header.findIndex((h) => h?.toLowerCase() === "nip");
  const kolKode = cariKolom(header, "kode bank span", "kdbankspan");
  const kolNamaBank = cariKolom(header, "nama bank", "nmbankspan", "nm_bank");
  const kolRek = cariKolom(header, "nomor rekening", "rekening");
  const kolNamaRek = cariKolom(header, "nama rekening", "nmrek");

  const hilang: string[] = [];
  if (kolKode < 0) hilang.push("Kode Bank SPAN");
  if (kolNamaBank < 0) hilang.push("Nama Bank");
  if (kolRek < 0) hilang.push("Nomor Rekening");
  if (hilang.length > 0) {
    return { baris: [], dilewati: [], error: `Kolom wajib tidak ditemukan: ${hilang.join(", ")}.` };
  }

  const baris: BarisRekening[] = [];
  const dilewati: BarisRekeningDilewati[] = [];

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

    baris.push({
      nip,
      kodeBankSpan,
      namaBank,
      nomorRekening,
      namaRekening: kolNamaRek >= 0 ? teks(row[kolNamaRek]) : null,
    });
  }

  return { baris, dilewati };
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
