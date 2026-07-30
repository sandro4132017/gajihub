// ============================================================================
// ADK (Arsip Data Komputer) - penyusunan baris file "daftar bayar" yang
// diunggah manual ke Web Gaji (belum ada API resmi, lihat CLAUDE.md).
//
// Modul ini PURE. Yang membaca database & menulis response ada di
// src/app/ppabp/adk/*/route.ts.
//
// KENAPA dipisah jadi modul sendiri: satu jenis ADK sekarang bisa diunduh
// dalam DUA format (Excel .xlsx dan teks tab-separated). Kalau baris datanya
// disusun dua kali di dua tempat, cepat atau lambat keduanya akan berbeda -
// dan bedanya baru ketahuan setelah file salah terkirim ke Web Gaji. Di sini
// barisnya disusun SEKALI, formatnya saja yang beda.
//
// Sumber format: file contoh dari user
// "export txt adk_tunkin-PNS_ROMUM_JUni__2026.xlsx" + versi .txt-nya (satker
// 450938 Biro Umum, periode 06/2026, 96 baris + 1 baris total).
// ============================================================================

/** Header ADK Tunjangan Kinerja - urutan & penamaan persis file contoh. */
export const KOLOM_ADK_TUKIN = [
  "NO",
  "Kode Satker",
  "Bulan",
  "Tahun",
  "NIP",
  "Nama Pegawai",
  "Nomor SK",
  "Kode Grade",
  "Nilai Bruto",
  "Nilai Potongan",
  "Nilai Bersih",
  "Kode Bank SPAN",
  "Nama Bank",
  "Nomor Rekening",
  "Nama Rekening",
  "Bulan Awal",
  "Tahun Awal",
  "Bulan Akhir",
  "Tahun Akhir",
  "Tukin Kali",
  "Nomor Tukin Lama",
  "Nomor Tukin Baru",
] as const;

/**
 * Indeks kolom (0-based) yang berisi NILAI UANG dan ikut dijumlahkan di baris
 * total: Nilai Bruto, Nilai Potongan, Nilai Bersih. Di file contoh cuma tiga
 * kolom ini yang terisi pada baris terakhir, sisanya kosong.
 */
export const KOLOM_TOTAL_ADK_TUKIN = [8, 9, 10];

export type SelAdk = string | number | null;

export interface SumberBarisAdkTukin {
  nip: string;
  nama: string;
  kelasJabatan: number | null;
  tukinPokok: number;
  potonganPph: number;
  tukinBersih: number;
  /**
   * Kode satker resmi (mis. "450938"). Satu-satunya sumbernya di sistem ini
   * adalah `GajiInduk.kodeSatker` hasil upload ADK gaji dari GPP - kalau
   * periode itu belum diupload, dikosongkan (JANGAN ditebak).
   */
  kodeSatker: string | null;
  /**
   * Rekening penerima TUKIN - dari RekeningPegawai jenis "TUKIN", BUKAN dari
   * file gaji induk. Sudah dibuktikan tukin & gaji memakai bank berbeda dan
   * TIDAK ADA satupun rekening yang sama, jadi mengambilnya dari gaji induk
   * akan mengirim uang ke rekening yang salah.
   */
  kodeBankSpan: string | null;
  namaBank: string | null;
  nomorRekening: string | null;
  namaRekening: string | null;
}

/**
 * Susun baris data ADK Tukin.
 *
 * KOLOM YANG SENGAJA DIKOSONGKAN (bukan lupa) - datanya TIDAK ADA di skema
 * manapun, dan mengarangnya berarti mengirim data salah ke Web Gaji:
 *   - Nomor SK, Nomor Tukin Lama/Baru: TukinCalculation tidak menyimpan
 *     referensi nomor SK sama sekali.
 *   - Bulan/Tahun Awal & Akhir: di contoh asli nilainya beda dengan bulan
 *     pembayaran (kemungkinan periode cakupan SK), artinya belum jelas.
 *
 * KOLOM REKENING SEKARANG TERISI (sebelumnya dikosongkan) - Web Gaji butuh
 * nomor rekening untuk memproses pembayaran. Sumbernya `RekeningPegawai`
 * jenis "TUKIN", BUKAN file gaji induk: tukin & gaji memakai bank yang
 * berbeda dan tidak ada satupun rekening yang sama, jadi mengambilnya dari
 * gaji induk berarti mengirim uang ke rekening yang salah. Pegawai yang
 * rekening tukinnya belum terdaftar tetap dikosongkan - JANGAN ditebak.
 *
 * "Nama Rekening" jatuh ke `nama` pegawai kalau nama pemilik rekeningnya
 * tidak tercatat - di file contoh keduanya memang sering sama, cuma beda
 * penulisan.
 *
 * "Tukin Kali" diisi 1 - SEMUA baris contoh asli nilainya 1, jadi ini pola
 * yang konsisten di data referensi, bukan tebakan.
 *
 * NILAI UANG DIBULATKAN KE RUPIAH BULAT. Kalkulasi tukin menghasilkan pecahan
 * (hasil perkalian persentase), sementara SELURUH nilai di file ADK contoh
 * berupa bilangan bulat - file dengan rupiah pecahan berisiko ditolak atau
 * dibulatkan sendiri oleh Web Gaji dengan cara yang tidak kita kendalikan.
 * Pembulatan dilakukan PER BARIS, lalu baris total menjumlahkan yang sudah
 * dibulatkan - supaya total di file benar-benar sama dengan jumlah baris di
 * atasnya (kalau totalnya dihitung dari nilai pecahan, angkanya bisa beda
 * beberapa rupiah dari hasil menjumlah kolom secara manual, dan itu yang
 * pertama kali dicurigai auditor).
 *
 * TODO(confirm): idealnya pembulatan terjadi saat KALKULASI, supaya angka di
 * database, di slip gaji, dan di ADK persis sama. Sekarang pembulatan cuma di
 * lapisan export, jadi `TukinCalculation.tukinBersih` masih menyimpan pecahan.
 * Perlu diputuskan apakah kalkulasinya ikut dibulatkan (mengubah angka yang
 * sudah di-approve) atau cukup di sini.
 */
export function susunBarisAdkTukin(
  sumber: SumberBarisAdkTukin[],
  periodeBulan: number,
  periodeTahun: number
): SelAdk[][] {
  const bulanPad = String(periodeBulan).padStart(2, "0");
  return sumber.map((r, i) => [
    i + 1,
    r.kodeSatker ?? "",
    bulanPad,
    String(periodeTahun),
    r.nip,
    r.nama,
    "", // Nomor SK
    r.kelasJabatan === null ? "" : String(r.kelasJabatan).padStart(2, "0"),
    Math.round(r.tukinPokok),
    Math.round(r.potonganPph),
    Math.round(r.tukinBersih),
    r.kodeBankSpan ?? "",
    r.namaBank ?? "",
    r.nomorRekening ?? "",
    r.namaRekening ?? r.nama,
    "", // Bulan Awal
    "", // Tahun Awal
    "", // Bulan Akhir
    "", // Tahun Akhir
    1, // Tukin Kali
    "", // Nomor Tukin Lama
    "", // Nomor Tukin Baru
  ]);
}

/**
 * Baris TOTAL di akhir file - cuma kolom nilai uang yang terisi, sisanya
 * kosong, persis seperti file contoh.
 */
export function susunBarisTotalAdk(baris: SelAdk[][], kolomTotal: number[], jumlahKolom: number): SelAdk[] {
  const total: SelAdk[] = Array.from({ length: jumlahKolom }, () => "");
  for (const idx of kolomTotal) {
    total[idx] = baris.reduce((a, b) => a + (typeof b[idx] === "number" ? (b[idx] as number) : 0), 0);
  }
  return total;
}

/**
 * Format satu sel untuk file TEKS tab-separated.
 *
 * Baris data ditulis apa adanya (angka tanpa pemisah ribuan), TAPI baris
 * TOTAL memakai pemisah ribuan + spasi pengapit - itu persis yang muncul di
 * file .txt contoh (` 461.029.358 `), karena file itu hasil "save as text"
 * dari spreadsheet yang baris totalnya diberi format angka.
 */
export function selKeTeks(nilai: SelAdk, barisTotal = false): string {
  if (nilai === null || nilai === undefined) return "";
  if (typeof nilai === "number") {
    return barisTotal ? ` ${new Intl.NumberFormat("id-ID").format(nilai)} ` : String(nilai);
  }
  // Tab & newline dibuang, bukan di-escape: format ini tab-separated tanpa
  // mekanisme quoting, jadi karakter itu akan merusak struktur kolomnya.
  return nilai.replace(/[\t\r\n]+/g, " ");
}

/** Rakit seluruh isi file TXT tab-separated (header + data + baris total). */
export function rakitTeksAdk(header: readonly string[], baris: SelAdk[][], barisTotal: SelAdk[]): string {
  const garis = [
    header.join("\t"),
    ...baris.map((b) => b.map((s) => selKeTeks(s)).join("\t")),
    barisTotal.map((s) => selKeTeks(s, true)).join("\t"),
  ];
  return garis.join("\r\n") + "\r\n";
}
