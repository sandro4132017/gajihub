// ============================================================================
// SIDIK BERKAS SPTJM - SHA-256 dari PDF yang SUDAH ditandatangani.
//
// MENJAWAB PERTANYAAN YANG BERBEDA dari `document_integrity` milik BSrE, dan
// itu sebabnya keduanya ada:
//
//   BSrE  : "berkas ini berubah tidak sejak ditandatangani?" - vonis
//           kriptografis, tapi butuh layanan BSrE hidup dan terjangkau.
//   Sidik : "berkas yang saya pegang ini sama persis dengan yang dicatat
//           Gajihub?" - bisa diperiksa siapa pun, kapan pun, bahkan offline
//           dengan `sha256sum`, tanpa menyentuh BSrE sama sekali.
//
// SHA-256, bukan MD5. Sebagian aplikasi naskah dinas menampilkan nilai 128-bit
// yang panjangnya sama dengan MD5; MD5 sudah bisa ditabrakkan dengan sengaja -
// dua berkas berbeda dibuat bernilai sama - jadi tidak dipakai untuk sesuatu
// yang gunanya membuktikan keaslian.
//
// PURE, nol I/O: isinya masuk sebagai parameter.
// ============================================================================

import { createHash } from "crypto";

/** SHA-256 heksadesimal huruf kecil, 64 karakter. */
export function hitungHashBerkas(isi: Uint8Array): string {
  return createHash("sha256").update(isi).digest("hex");
}

/**
 * Apakah dua sidik menunjuk berkas yang sama?
 *
 * Perbandingannya tidak peka huruf besar/kecil dan mengabaikan spasi, karena
 * nilai pembanding sering datang dari hasil salin-tempel layar atau keluaran
 * `sha256sum` yang membawa nama berkas di belakangnya.
 */
export function hashSama(a: string | null | undefined, b: string | null | undefined): boolean {
  const bersih = (v: string | null | undefined) =>
    (v ?? "").trim().split(/\s+/)[0].toLowerCase();
  const x = bersih(a);
  const y = bersih(b);
  return x.length === 64 && x === y;
}

/** Bentuk yang enak dibaca di layar: 8 kelompok berisi 8 karakter. */
export function hashUntukDibaca(hash: string): string {
  return (hash.match(/.{1,8}/g) ?? []).join(" ");
}
