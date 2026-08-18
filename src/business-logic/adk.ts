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
 * DIPERBAIKI 2026-08-10. Sebelumnya ketiganya diisi dari
 * `tukinPokok / potonganPph / tukinBersih`, dan itu keliru: `tukinPokok` di
 * `TukinCalculation` sudah nilai SETELAH potongan Pasal 13, sementara
 * `potonganPph` tidak pernah diisi (nol di seluruh baris yang ada, karena
 * kalkulasi massal tidak mengoper `tarifPphEfektif`). Hasilnya file ADK keluar
 * dengan **Nilai Bruto = Nilai Bersih dan Nilai Potongan = 0** - potongan
 * kehadiran yang justru jadi inti perhitungan tidak muncul sama sekali.
 *
 * Yang benar, dibuktikan dari sheet "Masuk ADK" pada rincian tukin manual
 * Rokeu (`Rincian Tunkin Juli 2026.xlsx`) yang cuma punya dua kolom uang:
 *
 *     NIP                  nama            pot          tukin
 *     197601091999032001   ARINI SARKOWI   44.235,12    9.851.764,88
 *
 * `tukin` = tarif penuh kelas jabatannya (9.896.000) dikurangi `pot`. Jadi:
 *   Nilai Bruto    = tarif PENUH kelas jabatan (sebelum potongan apa pun)
 *   Nilai Bersih   = yang benar-benar dibayarkan
 *   Nilai Potongan = selisih keduanya
 *
 * TIDAK ADA kolom PPh di seluruh workbook itu - jadi `potonganPph` yang selalu
 * nol memang sesuai praktik, yang salah cuma pemakaian kolomnya. Kalau suatu
 * saat PPh benar-benar dipotong, angkanya otomatis ikut terhitung di sini:
 * `tukinBersih` sudah bersih dari PPh, jadi selisihnya membesar sendiri.
 *
 * PEMBULATAN dilakukan pada bruto & bersih DULU, baru potongan diturunkan dari
 * selisih keduanya - supaya `bruto - potongan = bersih` tetap tepat pada
 * bilangan bulat di dalam file. Kalau potongan ikut dibulatkan sendiri-sendiri,
 * ketiga kolom bisa meleset satu rupiah dan itu yang pertama dicurigai auditor.
 *
 * KALAU TARIF KELASNYA TIDAK DIKETAHUI (kelas jabatan kosong di data pegawai),
 * bruto disamakan dengan bersih dan potongan jadi nol - lebih baik melaporkan
 * "tidak ada potongan" daripada mengarang nilai bruto yang tidak punya dasar.
 * Dalam praktik ini nyaris tidak terjadi: pegawai tanpa kelas jabatan memang
 * dilewati waktu kalkulasi karena tarifnya tidak bisa dicari.
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