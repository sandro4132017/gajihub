// ============================================================================
// PEMETAAN TEKS JENIS CUTI -> JenisCuti (Pasal 14 Permenaker 15/2024)
//
// Dipakai bareng dua sumber yang penulisannya berbeda: template rekap manual
// ("Cuti Sakit" atau langsung enum) dan export e-Presensi ("Cuti - Cuti Sakit
// <1 bulan").
//
// PRINSIPNYA: TIDAK PERNAH MENEBAK. Teks yang tidak dikenali mengembalikan
// null dan pemanggil wajib melaporkannya sebagai baris yang dilewati - salah
// jenis cuti berarti salah tarif, dan selisihnya besar (cuti besar bulan
// pertama dipotong 50%, cuti tahunan tidak dipotong sama sekali).
//
// "BULAN KE BERAPA" ADA DI NAMA JENISNYA. Tabel `cuti` e-Presensi memecah
// jenisnya sampai tingkat bulan (Cuti Besar I/II/III = potongan 50/75/90%,
// Cuti Sakit Bulan I/II/III = 0/50/75%), dan `cuti.nilai_persen` di sana cocok
// PERSIS dengan tabel Pasal 14 di tukin.ts. Penomorannya juga terbukti dipakai
// berurutan sungguhan lintas bulan.
//
// Karena itu `uraiJenisCuti()` mengembalikan jenis DAN bulannya. Pembacaan
// angkanya konservatif: kalau nomornya tidak ada di teks, hasilnya null
// (= tidak diketahui), BUKAN 1.
// ============================================================================

import type { JenisCuti } from "../types/index";

/** Label yang ditampilkan ke user & diterima di template. */
export const LABEL_JENIS_CUTI: Record<JenisCuti, string> = {
  CUTI_TAHUNAN: "Cuti Tahunan",
  CUTI_MELAHIRKAN_ANAK_1_2_3: "Cuti Melahirkan",
  CUTI_ALASAN_PENTING: "Cuti Alasan Penting",
  CUTI_BESAR_KURANG_1_BULAN: "Cuti Besar < 1 Bulan",
  CUTI_BESAR: "Cuti Besar",
  CUTI_SAKIT: "Cuti Sakit",
  CUTI_SAKIT_GUGUR_KANDUNGAN: "Cuti Sakit Gugur Kandungan",
  CUTI_DI_LUAR_TANGGUNGAN_NEGARA: "Cuti di Luar Tanggungan Negara",
};

export const SEMUA_JENIS_CUTI = Object.keys(LABEL_JENIS_CUTI) as JenisCuti[];

/**
 * URUTAN PENGECEKAN PENTING - yang lebih spesifik WAJIB duluan.
 *
 * "Cuti Sakit Gugur Kandungan" mengandung kata "sakit"; kalau CUTI_SAKIT
 * dicek lebih dulu, cuti gugur kandungan akan salah masuk ke sana dan
 * potongannya berubah dari 1%/hari jadi 50% di bulan kedua. Begitu juga
 * "Cuti Besar < 1 Bulan" yang mengandung "cuti besar".
 */
const POLA: { jenis: JenisCuti; kandidat: string[] }[] = [
  { jenis: "CUTI_SAKIT_GUGUR_KANDUNGAN", kandidat: ["gugur kandungan", "keguguran"] },
  { jenis: "CUTI_BESAR_KURANG_1_BULAN", kandidat: ["besar < 1", "besar <1", "besar kurang 1", "besar kurang dari 1"] },
  { jenis: "CUTI_MELAHIRKAN_ANAK_1_2_3", kandidat: ["melahirkan", "bersalin"] },
  { jenis: "CUTI_ALASAN_PENTING", kandidat: ["alasan penting"] },
  // Dicek SEBELUM CUTI_TAHUNAN: label resminya "Cuti di Luar Tanggungan
  // Negara", tidak mengandung kata lain yang bentrok, tapi urutannya sengaja
  // di atas pola satu-kata supaya tidak ada yang menyerobot kalau daftar ini
  // nanti bertambah.
  { jenis: "CUTI_DI_LUAR_TANGGUNGAN_NEGARA", kandidat: ["luar tanggungan", "cltn"] },
  { jenis: "CUTI_TAHUNAN", kandidat: ["tahunan"] },
  { jenis: "CUTI_BESAR", kandidat: ["besar"] },
  { jenis: "CUTI_SAKIT", kandidat: ["sakit"] },
];

function normal(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

const ROMAWI: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };

/**
 * Bulan KE BERAPA cuti berjalan, dibaca dari nama jenisnya.
 *
 * Dua bentuk yang dikenali, keduanya dari master `cuti` e-Presensi:
 *   - angka Romawi di UJUNG teks: "Cuti Besar II", "Cuti Sakit Bulan III"
 *   - "Lebih Dari N Bulan": "Cuti Sakit Bulan Lebih Dari 3 Bulan" -> N+1,
 *     supaya jatuh di luar tabel 1-3 dan kena tarif "lebih dari 3 bulan"
 *
 * @returns nomor bulan, atau null kalau teksnya tidak memuatnya. null berarti
 *          TIDAK DIKETAHUI - jangan diperlakukan sebagai bulan pertama di
 *          sini; itu keputusan pemanggil yang harus dilaporkan ke user.
 *
 * PENTING soal "< 1 bulan": "Cuti Sakit <1 bulan" dan "Cuti Gugur Kandungan
 * < 1.5 Bulan" TIDAK menyebut nomor bulan sama sekali, jadi hasilnya null -
 * angka 1 dan 1.5 di situ adalah LAMA cuti, bukan urutan bulannya. Kalau
 * dibaca sebagai nomor, "1.5" akan jadi bulan ke-1 secara kebetulan benar
 * dan menutupi bug yang sama di tempat lain.
 */
export function bulanCutiDariLabel(teks: string | null | undefined): number | null {
  if (!teks) return null;
  const s = normal(teks);

  const lebihDari = s.match(/lebih dari\s+(\d+)\s*bulan/);
  if (lebihDari) return Number(lebihDari[1]) + 1;

  // Angka Romawi HARUS di ujung teks & berdiri sebagai kata sendiri. Tanpa
  // kedua syarat itu, huruf "i" di dalam kata biasa ikut tertangkap.
  const romawi = s.match(/\b(iii|ii|iv|i|v)\s*$/);
  if (romawi) return ROMAWI[romawi[1]] ?? null;

  return null;
}

/**
 * Jenis cuti + bulan ke-berapa dari satu teks.
 *
 * @returns null kalau teksnya kosong / jenisnya tidak dikenali. `bulanKeberapa`
 *          null berarti jenisnya kenal tapi nomor bulannya tidak disebut.
 */
export function uraiJenisCuti(
  teks: string | null | undefined
): { jenis: JenisCuti; bulanKeberapa: number | null } | null {
  const jenis = parseJenisCuti(teks);
  if (!jenis) return null;
  return { jenis, bulanKeberapa: bulanCutiDariLabel(teks) };
}

/**
 * @returns JenisCuti, atau null kalau teksnya kosong / tidak dikenali.
 *          null WAJIB dilaporkan pemanggil, jangan diperlakukan sebagai
 *          "tidak cuti".
 */
export function parseJenisCuti(teks: string | null | undefined): JenisCuti | null {
  if (!teks) return null;
  const s = normal(teks);
  if (s === "" || s === "-") return null;

  // Nilai enum ditulis langsung (mis. hasil salin dari sistem lain).
  const sebagaiEnum = teks.replace(/\s+/g, "_").toUpperCase();
  if ((SEMUA_JENIS_CUTI as string[]).includes(sebagaiEnum)) return sebagaiEnum as JenisCuti;

  for (const { jenis, kandidat } of POLA) {
    if (kandidat.some((k) => s.includes(k))) return jenis;
  }
  return null;
}
