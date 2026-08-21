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

export const KOLOM_TOTAL_ADK_TUKIN = [8, 9, 10];

export type SelAdk = string | number | null;

export interface SumberBarisAdkTukin {
  nip: string;
  nama: string;
  kelasJabatan: number | null;
  /**
   * Tarif tukin pokok PENUH untuk kelas jabatannya (Lampiran Permenaker
   * 15/2024), SEBELUM potongan apa pun. Inilah "Nilai Bruto" di file ADK.
   *
   * null kalau kelas jabatannya tidak diketahui - lihat susunBarisAdkTukin()
   * untuk perlakuannya.
   */
  tarifPenuhKelasJabatan: number | null;
  tukinBersih: number;
  kodeSatker: string | null;
  kodeBankSpan: string | null;
  namaBank: string | null;
  nomorRekening: string | null;
  namaRekening: string | null;
}

/**
 * Nilai Bruto / Potongan / Bersih untuk satu baris ADK Tukin.
 *
 *   Nilai Bruto    = tarif PENUH kelas jabatan (sebelum potongan apa pun)
 *   Nilai Bersih   = yang benar-benar dibayarkan
 *   Nilai Potongan = selisih keduanya
 *
 * Dibuktikan dari sheet "Masuk ADK" rincian tukin manual Rokeu, yang cuma
 * punya dua kolom uang (`pot` dan `tukin`) dan `tukin` = tarif penuh - `pot`.
 *
 * JANGAN kembalikan ke `tukinPokok / potonganPph / tukinBersih`: `tukinPokok`
 * sudah nilai SETELAH potongan Pasal 13 dan `potonganPph` tidak pernah diisi,
 * jadi filenya keluar dengan Bruto = Bersih dan Potongan = 0 - seluruh
 * potongan kehadiran hilang. Tidak ada kolom PPh di workbook manual manapun,
 * jadi PPh nol memang sesuai praktik; kalau nanti benar-benar dipotong,
 * angkanya ikut sendiri karena `tukinBersih` sudah bersih dari PPh.
 *
 * PEMBULATAN pada bruto & bersih DULU, potongan diturunkan dari selisihnya -
 * supaya `bruto - potongan = bersih` tetap tepat pada bilangan bulat.
 *
 * Kalau tarif kelasnya tidak diketahui, bruto disamakan dengan bersih dan
 * potongan nol - lebih baik melaporkan "tidak ada potongan" daripada
 * mengarang nilai bruto tanpa dasar.
 */
export function nilaiUangAdkTukin(r: Pick<SumberBarisAdkTukin, "tarifPenuhKelasJabatan" | "tukinBersih">): {
  bruto: number;
  potongan: number;
  bersih: number;
} {
  const bersih = Math.round(r.tukinBersih);
  const bruto = r.tarifPenuhKelasJabatan === null ? bersih : Math.round(r.tarifPenuhKelasJabatan);
  // Tidak pernah negatif menurut konstruksinya: tukinBersih paling besar sama
  // dengan tarif penuh (bobot kehadiran + kinerja maksimal 100%, dan override
  // Pasal 14 hanya MENGURANGI). Math.max jadi penjaga kalau invarian itu suatu
  // saat dilanggar - file ADK tidak boleh memuat potongan negatif.
  return { bruto, potongan: Math.max(0, bruto - bersih), bersih };
}

export function susunBarisAdkTukin(
  sumber: SumberBarisAdkTukin[],
  periodeBulan: number,
  periodeTahun: number
): SelAdk[][] {
  const bulanPad = String(periodeBulan).padStart(2, "0");
  return sumber.map((r, i) => {
    const uang = nilaiUangAdkTukin(r);
    return [
    i + 1,
    r.kodeSatker ?? "",
    bulanPad,
    String(periodeTahun),
    r.nip,
    r.nama,
    "", // Nomor SK
    r.kelasJabatan === null ? "" : String(r.kelasJabatan).padStart(2, "0"),
    uang.bruto,
    uang.potongan,
    uang.bersih,
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
    ];
  });
}

export function susunBarisTotalAdk(baris: SelAdk[][], kolomTotal: number[], jumlahKolom: number): SelAdk[] {
  const total: SelAdk[] = Array.from({ length: jumlahKolom }, () => "");
  for (const idx of kolomTotal) {
    total[idx] = baris.reduce((a, b) => a + (typeof b[idx] === "number" ? (b[idx] as number) : 0), 0);
  }
  return total;
}

export function selKeTeks(nilai: SelAdk, barisTotal = false): string {
  if (nilai === null || nilai === undefined) return "";
  if (typeof nilai === "number") {
    return barisTotal ? ` ${new Intl.NumberFormat("id-ID").format(nilai)} ` : String(nilai);
  }
  
  return nilai.replace(/[\t\r\n]+/g, " ");
}

export function rakitTeksAdk(header: readonly string[], baris: SelAdk[][], barisTotal: SelAdk[]): string {
  const garis = [
    header.join("\t"),
    ...baris.map((b) => b.map((s) => selKeTeks(s)).join("\t")),
    barisTotal.map((s) => selKeTeks(s, true)).join("\t"),
  ];
  return garis.join("\r\n") + "\r\n";
}