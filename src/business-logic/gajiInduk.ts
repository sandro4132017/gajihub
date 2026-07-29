// ============================================================================
// GAJI INDUK - pemetaan file ADK "Gaji_Bank_*.xlsx" (aplikasi GPP / Web Gaji
// Kemenkeu) ke komponen gaji yang dipakai slip gaji Gajihub.
//
// Modul ini PURE (tidak ada I/O - lihat "Konvensi kode" di CLAUDE.md):
// pembacaan file XLSX-nya dilakukan di Server Action
// (src/app/ppabp/gaji-induk/actions.ts), yang masuk ke sini cuma baris yang
// sudah jadi objek biasa.
//
// Gajihub TIDAK menghitung gaji pokok/tunjangan keluarga sendiri - itu domain
// Web Gaji Kemenkeu ("don't replace, integrate"). Nilai di file diterima APA
// ADANYA; yang dilakukan di sini cuma (1) mapping nama kolom, (2) penjumlahan
// total, (3) pengecekan aritmatika sebagai deteksi salah-baca file, BUKAN
// sebagai "koreksi" atas angka resmi.
//
// Sumber pemetaan: file contoh "Gaji_Bank_45093800_1_000964.xlsx" (satker
// 450938 Setjen, periode 07/2026, 350 baris) yang dicocokkan baris-per-baris
// dengan slip "PERINCIAN PEMBAYARAN GAJI" cetakan PPABP Setjen.
//
// TODO(confirm):
// - Kolom `tjpph` (tunjangan PPh) dan `potpph` (potongan PPh) di file contoh
//   nilainya SELALU sama persis untuk tiap baris, jadi efeknya saling
//   meniadakan di gaji bersih. Ini konsisten dengan slip contoh (PPH muncul
//   di sisi penghasilan DAN potongan). Belum dikonfirmasi apakah ada kasus
//   keduanya berbeda - kalau ada, kedua kolom ini tetap disimpan terpisah
//   jadi tidak ada informasi yang hilang.
// - Baru mendukung gaji INDUK (`kdjns` = "1"). Jenis lain (susulan/kekurangan/
//   terusan) DILEWATI dengan alasan eksplisit, lihat catatan di model
//   GajiInduk (prisma/schema.prisma).
// ============================================================================

/** Nama kolom di file GPP yang WAJIB ada supaya file bisa diproses. */
export const KOLOM_WAJIB_GPP = ["nip", "bulan", "tahun", "gjpokok", "bersih"] as const;

/**
 * Satu baris file GPP yang sudah dipetakan ke istilah slip gaji.
 * Nama field SENGAJA sama dengan kolom model GajiInduk (schema.prisma).
 */
export interface BarisGajiInduk {
  nip: string;
  periodeBulan: number;
  periodeTahun: number;

  kodeSatker: string | null;
  nomorGaji: string | null;
  jenisGaji: string;

  gajiPokok: number;
  tunjanganIstri: number;
  tunjanganAnak: number;
  tunjanganUmum: number;
  tunjanganStruktural: number;
  tunjanganFungsional: number;
  tunjanganBeras: number;
  tunjanganPph: number;
  pembulatan: number;
  tunjanganLain: number;

  potonganIuranPegawai: number;
  potonganPph: number;
  potonganBpjs: number;
  potonganLain: number;

  totalPenghasilan: number;
  totalPotongan: number;
  /** Diambil apa adanya dari kolom `bersih` file GPP. */
  gajiBersih: number;
  /**
   * (totalPenghasilan - totalPotongan) - gajiBersih. Harusnya 0. Kalau tidak,
   * artinya ada kolom file yang belum dipetakan di sini - baris tetap
   * diproses tapi ditandai supaya PPABP tahu ada yang perlu dicek.
   */
  selisihAritmatika: number;
}

export interface BarisDilewati {
  /** Nomor baris di file (1 = baris data pertama setelah header). */
  nomorBaris: number;
  nip: string | null;
  alasan: string;
}

export interface HasilParseGajiInduk {
  baris: BarisGajiInduk[];
  dilewati: BarisDilewati[];
  /** Kolom wajib yang tidak ditemukan di header file. Kalau terisi, `baris` pasti kosong. */
  kolomHilang: string[];
}

/** Baca angka dari sel apa pun; sel kosong/teks non-angka dianggap 0. */
function angka(nilai: unknown): number {
  if (typeof nilai === "number") return Number.isFinite(nilai) ? nilai : 0;
  if (typeof nilai === "string") {
    const bersih = nilai.trim().replace(/\./g, "").replace(/,/g, ".");
    const n = Number(bersih);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Baca teks dari sel apa pun; sel kosong/spasi jadi null. */
function teks(nilai: unknown): string | null {
  if (nilai === null || nilai === undefined) return null;
  const s = String(nilai).trim();
  return s === "" ? null : s;
}

/**
 * Jumlah komponen penghasilan & potongan. Dipisah dari petakanBarisGpp supaya
 * bisa dipakai ulang saat PPABP mengedit baris yang sudah tersimpan.
 */
export function hitungTotalGajiInduk(k: {
  gajiPokok: number;
  tunjanganIstri: number;
  tunjanganAnak: number;
  tunjanganUmum: number;
  tunjanganStruktural: number;
  tunjanganFungsional: number;
  tunjanganBeras: number;
  tunjanganPph: number;
  pembulatan: number;
  tunjanganLain: number;
  potonganIuranPegawai: number;
  potonganPph: number;
  potonganBpjs: number;
  potonganLain: number;
}): { totalPenghasilan: number; totalPotongan: number } {
  const totalPenghasilan =
    k.gajiPokok +
    k.tunjanganIstri +
    k.tunjanganAnak +
    k.tunjanganUmum +
    k.tunjanganStruktural +
    k.tunjanganFungsional +
    k.tunjanganBeras +
    k.tunjanganPph +
    k.pembulatan +
    k.tunjanganLain;

  const totalPotongan = k.potonganIuranPegawai + k.potonganPph + k.potonganBpjs + k.potonganLain;

  return { totalPenghasilan, totalPotongan };
}

/**
 * "Total Penghasilan" paling bawah di slip gaji: gaji bersih (gaji induk)
 * DITAMBAH komponen yang dihitung/ditampung Gajihub sendiri.
 *
 * Perhatikan tukin yang dipakai adalah tukin BERSIH (setelah potongan PPh
 * tukin) - sama seperti slip contoh, di mana baris "Tunjangan Kinerja" sudah
 * berupa nilai yang diterima pegawai, bukan tukin pokok.
 */
export function hitungTotalPenghasilanSlip(k: {
  gajiBersih: number;
  tunjanganKinerja: number;
  uangMakan: number;
  uangLembur: number;
  honorarium: number;
}): number {
  return k.gajiBersih + k.tunjanganKinerja + k.uangMakan + k.uangLembur + k.honorarium;
}

/**
 * Petakan SATU baris file GPP. Mengembalikan null + alasan kalau baris itu
 * tidak layak diproses (baris kosong, NIP hilang, periode tidak valid, atau
 * jenis gaji selain induk).
 */
export function petakanBarisGpp(
  row: Record<string, unknown>
): { ok: true; data: BarisGajiInduk } | { ok: false; nip: string | null; alasan: string } {
  const nip = teks(row.nip);
  if (!nip) return { ok: false, nip: null, alasan: "kolom nip kosong" };

  const periodeBulan = angka(row.bulan);
  const periodeTahun = angka(row.tahun);
  if (!Number.isInteger(periodeBulan) || periodeBulan < 1 || periodeBulan > 12) {
    return { ok: false, nip, alasan: `kolom bulan tidak valid (${teks(row.bulan) ?? "kosong"})` };
  }
  if (!Number.isInteger(periodeTahun) || periodeTahun < 2000) {
    return { ok: false, nip, alasan: `kolom tahun tidak valid (${teks(row.tahun) ?? "kosong"})` };
  }

  const jenisGaji = teks(row.kdjns) ?? "1";
  if (jenisGaji !== "1") {
    return {
      ok: false,
      nip,
      alasan: `jenis gaji "${jenisGaji}" belum didukung - baru gaji induk (kdjns=1) yang ditangani`,
    };
  }

  const komponen = {
    gajiPokok: angka(row.gjpokok),
    tunjanganIstri: angka(row.tjistri),
    tunjanganAnak: angka(row.tjanak),
    tunjanganUmum: angka(row.tjupns),
    tunjanganStruktural: angka(row.tjstruk),
    tunjanganFungsional: angka(row.tjfungs),
    tunjanganBeras: angka(row.tjberas),
    tunjanganPph: angka(row.tjpph),
    pembulatan: angka(row.pembul),
    // Empat kolom ini nol semua di file contoh Setjen, tapi tetap ditampung
    // supaya nilainya tidak hilang diam-diam kalau satker lain mengisinya.
    tunjanganLain: angka(row.tjdaerah) + angka(row.tjpencil) + angka(row.tjlain) + angka(row.tjkompen),

    potonganIuranPegawai: angka(row.potpfk10),
    potonganPph: angka(row.potpph),
    potonganBpjs: angka(row.bpjs) + angka(row.bpjs2),
    potonganLain:
      angka(row.potswrum) +
      angka(row.potkelbtj) +
      angka(row.potlain) +
      angka(row.pottabrum) +
      angka(row.potpfkbul) +
      angka(row.potpfk2),
  };

  const { totalPenghasilan, totalPotongan } = hitungTotalGajiInduk(komponen);
  const gajiBersih = angka(row.bersih);

  return {
    ok: true,
    data: {
      nip,
      periodeBulan,
      periodeTahun,
      kodeSatker: teks(row.kdsatker),
      nomorGaji: teks(row.nogaji),
      jenisGaji,
      ...komponen,
      totalPenghasilan,
      totalPotongan,
      gajiBersih,
      selisihAritmatika: totalPenghasilan - totalPotongan - gajiBersih,
    },
  };
}

/**
 * Petakan SELURUH isi file GPP. `rows` = baris data (header sudah dipakai
 * sebagai key objek), urut sesuai file.
 */
export function parseFileGajiInduk(rows: Record<string, unknown>[], header: string[]): HasilParseGajiInduk {
  const headerSet = new Set(header.map((h) => String(h).trim().toLowerCase()));
  const kolomHilang = KOLOM_WAJIB_GPP.filter((k) => !headerSet.has(k));
  if (kolomHilang.length > 0) {
    return { baris: [], dilewati: [], kolomHilang: [...kolomHilang] };
  }

  const baris: BarisGajiInduk[] = [];
  const dilewati: BarisDilewati[] = [];

  rows.forEach((row, i) => {
    const hasil = petakanBarisGpp(row);
    if (hasil.ok) baris.push(hasil.data);
    else dilewati.push({ nomorBaris: i + 1, nip: hasil.nip, alasan: hasil.alasan });
  });

  return { baris, dilewati, kolomHilang: [] };
}
