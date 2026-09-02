// ============================================================================
// GERBANG ISI ADK - satuan kerja mana yang rekapnya sudah dikirim & terkunci.
//
// MENGGANTIKAN gerbang lama `status: "APPROVED"` per baris kalkulasi
// (keputusan user 2026-09-02, approval berjenjang dihapus).
//
// PERGESERAN YANG PERLU DIPAHAMI: dulu yang menentukan sebuah baris ikut ke
// ADK adalah kolom `status` pada baris itu sendiri. Sekarang yang menentukan
// adalah SATUAN KERJA-nya - satu keputusan Kasubag TU per unit per periode.
// Konsekuensinya disengaja: unit dikirim UTUH atau tidak sama sekali. Tidak
// ada lagi keadaan "37 dari 47 orang ikut ke file, 10 tertinggal karena
// approval-nya kelewat" - keadaan yang paling sering jadi sebab file ADK
// kelihatan benar tapi kurang orang.
//
// BERLAKU UNTUK TUKIN & UANG MAKAN. ADK Uang Lembur tidak memakai ini karena
// memang sedang tidak berfungsi - lihat src/app/tampilUangLembur.ts.
// ============================================================================

import type { PrismaClient } from "@prisma/client";
import { wherePegawaiJenis, type JenisPegawaiAdk } from "./jenisPegawaiAdk";

/**
 * Daftar satuan kerja yang berhak ikut ke ADK periode ini.
 *
 * Sengaja mengembalikan ARRAY, bukan Set: pemakaian utamanya langsung masuk
 * ke `where: { pegawai: { satuanKerja: { in: ... } } }`, dan mengubah Set jadi
 * array di tiap pemanggil cuma menambah langkah yang bisa terlupa.
 *
 * Array KOSONG berarti belum ada satu unit pun yang mengirim - dan itu bukan
 * keadaan aneh, itu keadaan normal di awal bulan. Pemanggilnya WAJIB
 * memperlakukannya sebagai "tidak ada baris", bukan sebagai "tanpa filter":
 * `{ in: [] }` di Prisma memang menghasilkan nol baris, jadi perilakunya
 * sudah benar dengan sendirinya - tapi jangan sekali-kali menghilangkan
 * filternya ketika daftar ini kosong.
 */
export async function satkerTerkirim(
  prisma: PrismaClient,
  periodeBulan: number,
  periodeTahun: number
): Promise<string[]> {
  const baris = await prisma.pengirimanUnit.findMany({
    where: { periodeBulan, periodeTahun, status: "TERKIRIM" },
    select: { satuanKerja: true },
  });
  return baris.map((b) => b.satuanKerja);
}

/**
 * Bentuk `where` untuk kalkulasi (TukinCalculation / UangMakan) yang ikut ADK.
 *
 * Disediakan sebagai fungsi supaya bentuk filternya SAMA di semua route -
 * kalau satu route menuliskannya sendiri lalu bentuknya bergeser sedikit,
 * dua berkas ADK dari periode yang sama akan berisi orang yang berbeda.
 */
export function whereIkutAdk(
  periodeBulan: number,
  periodeTahun: number,
  satkerBoleh: readonly string[],
  /**
   * Penyaringan PNS/P3K - lihat ./jenisPegawaiAdk.ts. `null` = semua.
   *
   * DISEBAR ke dalam filter `pegawai`, bukan menggantinya: gerbang satuan
   * kerja adalah syarat yang tidak boleh hilang karena alasan apa pun, dan
   * penyaringan jenis menyempit DI DALAM gerbang itu, bukan di sampingnya.
   */
  jenis: JenisPegawaiAdk | null = null
) {
  return {
    periodeBulan,
    periodeTahun,
    pegawai: { satuanKerja: { in: [...satkerBoleh] }, ...wherePegawaiJenis(jenis) },
  };
}

/**
 * Menyempitkan gerbang ke SATU satuan kerja, kalau memang diminta dan kalau
 * unit itu sudah mengirim.
 *
 * VALIDASINYA BUKAN FORMALITAS. Parameter `satker` datang dari query string,
 * jadi isinya bisa apa saja - salah ketik, nama unit yang sudah berganti, atau
 * URL lama yang ditempel ulang. Tanpa pemeriksaan ini, nilai yang tidak cocok
 * menghasilkan berkas KOSONG yang bentuknya sah dan tidak memberi tahu apa
 * pun - dan berkas kosong yang terunggah ke Web Gaji terbaca sebagai "unit
 * ini memang tidak punya siapa-siapa bulan ini".
 *
 * Yang tidak cocok jatuh kembali ke SELURUH unit terkirim, bukan ke daftar
 * kosong: itu keadaan halaman sebelum ada penyaring, dan tidak ada satu pun
 * pegawai yang hilang karenanya.
 */
export function sempitkanKeSatker(
  satkerBoleh: readonly string[],
  satker: string | null | undefined
): { dipakai: string[]; terpilih: string } {
  if (satker && satkerBoleh.includes(satker)) return { dipakai: [satker], terpilih: satker };
  return { dipakai: [...satkerBoleh], terpilih: "" };
}
