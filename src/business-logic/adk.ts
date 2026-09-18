export const KOLOM_ADK_TUKIN = [
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

// KOLOM_TOTAL_ADK_TUKIN DICABUT bersama baris TOTAL-nya (permintaan user
// 2026-09-14). Tidak ada lagi kolom yang dijumlahkan di berkas ADK.

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
  nomorSk: string | null;
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

/**
 * Bulan & tahun PENGERJAAN - isi kolom "Bulan" dan "Tahun" berkas ADK.
 *
 * ATURAN USER 2026-09-14: kedua kolom itu menyatakan KAPAN berkasnya dibuat,
 * bukan periode yang dibayar. Tukin Januari bisa saja baru dikerjakan Agustus,
 * dan yang perlu terbaca di situ adalah saat pengerjaannya. Periode yang
 * dibayar pindah seluruhnya ke kolom "Bulan Awal/Akhir", yang diisi persis
 * periode yang dipilih PPABP di filter.
 *
 * MENGGANTIKAN aturan lama (dikonfirmasi user 2026-09-03) yang mengisi
 * Bulan/Tahun dengan periode berkas dan Awal/Akhir dengan periode itu MINUS
 * SATU BULAN. Aturan itu berangkat dari anggapan bahwa periode di filter
 * berarti bulan PEMBAYARAN; sekarang periode di filter berarti bulan KERJA,
 * jadi tidak ada lagi yang dikurangi satu.
 *
 * WAKTUNYA MASUK LEWAT PARAMETER, bukan `new Date()` di dalam sini - engine
 * ini pure dan hasilnya diuji; fungsi yang membaca jam sendiri tidak bisa
 * diuji tanpa memalsukan waktu sistem.
 *
 * OFFSET WIB DIHITUNG TETAP +7 JAM, bukan lewat `Intl`/`toLocaleString`.
 * Dua sebabnya: engine ini tidak boleh bergantung pada data lokal milik
 * runtime, dan WIB tidak mengenal daylight saving jadi offsetnya memang
 * tetap. Ini bukan kerapian - server yang berjalan di UTC akan menyebut
 * "31 Agustus" pada pukul 06.00 WIB tanggal 1 September, dan berkas
 * pembayarannya berlabel bulan yang salah tepat di pergantian bulan.
 */
const MENIT_WIB = 7 * 60;

export function bulanPengerjaanAdk(dibuatPada: Date): { bulan: number; tahun: number } {
  const wib = new Date(dibuatPada.getTime() + MENIT_WIB * 60_000);
  return { bulan: wib.getUTCMonth() + 1, tahun: wib.getUTCFullYear() };
}

export function susunBarisAdkTukin(
  sumber: SumberBarisAdkTukin[],
  periodeBulan: number,
  periodeTahun: number,
  /**
   * Saat berkasnya dibuat - mengisi kolom "Bulan" & "Tahun". Diminta sebagai
   * parameter supaya fungsi ini tetap pure; pemanggilnya mengirim `new Date()`.
   */
  dibuatPada: Date
): SelAdk[][] {
  // DUA PASANG KOLOM YANG ARTINYA BERBEDA, dan tertukarnya tidak akan terlihat
  // di berkas - keduanya cuma dua digit:
  //   "Bulan"/"Tahun"           -> KAPAN berkas ini dikerjakan (hari ini)
  //   "Bulan Awal/Akhir" + thn  -> periode KERJA yang dibayar (pilihan filter)
  //
  // Dihitung SEKALI di luar map: nilainya sama untuk seluruh baris, dan
  // menghitungnya per pegawai cuma membuka peluang dua baris berbeda isinya -
  // termasuk kalau ekspornya kebetulan berjalan melewati tengah malam.
  const kerja = bulanPengerjaanAdk(dibuatPada);
  const bulanPad = String(kerja.bulan).padStart(2, "0");
  const tahunKerja = String(kerja.tahun);
  const periodeBulanPad = String(periodeBulan).padStart(2, "0");
  const periodeTahunTeks = String(periodeTahun);
  return sumber.map((r) => {
    const uang = nilaiUangAdkTukin(r);
    return [
    r.kodeSatker ?? "",
    bulanPad, // Bulan - pengerjaan
    tahunKerja, // Tahun - pengerjaan
    r.nip,
    r.nama,
    r.nomorSk ?? "",
    r.kelasJabatan === null ? "" : String(r.kelasJabatan).padStart(2, "0"),
    uang.bruto,
    uang.potongan,
    uang.bersih,
    r.kodeBankSpan ?? "",
    r.namaBank ?? "",
    r.nomorRekening ?? "",
    r.namaRekening ?? r.nama,
    // Periode yang dipilih PPABP di filter, apa adanya. Awal = Akhir karena
    // satu berkas selalu satu bulan; kolomnya berpasangan supaya format yang
    // sama bisa dipakai untuk rapel beberapa bulan sekaligus, yang belum
    // pernah dipakai di sini.
    periodeBulanPad, // Bulan Awal
    periodeTahunTeks, // Tahun Awal
    periodeBulanPad, // Bulan Akhir
    periodeTahunTeks, // Tahun Akhir
    1, // Tukin Kali
    "", // Nomor Tukin Lama
    "", // Nomor Tukin Baru
    ];
  });
}

/**
 * Baris penjumlahan untuk sebuah tabel.
 *
 * TIDAK LAGI DIPAKAI BERKAS ADK - baris totalnya dicabut 2026-09-14. Yang
 * memakainya sekarang tinggal rekap unit Excel (`rekapUnitExcel.ts`), yang
 * memang dibuka manusia untuk diperiksa, bukan disetorkan ke mesin. Jangan
 * dihapus sebagai kode mati - namanya saja yang masih berawalan "Adk".
 */
export function susunBarisTotalAdk(baris: SelAdk[][], kolomTotal: number[], jumlahKolom: number): SelAdk[] {
  const total: SelAdk[] = Array.from({ length: jumlahKolom }, () => "");
  for (const idx of kolomTotal) {
    total[idx] = baris.reduce((a, b) => a + (typeof b[idx] === "number" ? (b[idx] as number) : 0), 0);
  }
  return total;
}

/**
 * Satu sel jadi teks untuk muatan .txt.
 *
 * ANGKA SELALU DITULIS APA ADANYA, tanpa pemisah ribuan. Dulu ada cabang
 * kedua yang menulis ` 461.029.358 ` (bertitik, berspasi pengapit) khusus
 * untuk baris TOTAL, meniru berkas contoh. Baris itu sudah dicabut, jadi
 * satu-satunya bentuk angka yang sah di berkas ini tinggal bentuk mentah -
 * dan itu memang yang bisa dibaca mesin di seberang.
 */
export function selKeTeks(nilai: SelAdk): string {
  if (nilai === null || nilai === undefined) return "";
  if (typeof nilai === "number") return String(nilai);
  return nilai.replace(/[\t\r\n]+/g, " ");
}

/**
 * Muatan .txt ADK Tunjangan Kinerja - tab-separated, ISI DATA SAJA.
 *
 * TANPA BARIS HEADER (permintaan user 2026-09-03) dan kini TANPA BARIS TOTAL
 * (permintaan user 2026-09-14). Alasan keduanya sama, dan baris total
 * sebetulnya kasus yang lebih tajam: berkas ini disetorkan ke Web Gaji, dan
 * di sana baris berkolom-NIP-kosong berisi angka bertitik bukan ringkasan -
 * ia baris ke-N yang ikut terbaca sebagai data pegawai.
 *
 * Versi .xlsx ikut kehilangan baris itu supaya kedua bentuk berisi hal yang
 * sama persis. Kalau .xlsx menampilkan total sementara .txt tidak, dua orang
 * yang memeriksa berkas periode yang sama bisa menyebut jumlah baris yang
 * berbeda.
 */
export function rakitTeksAdk(baris: SelAdk[][]): string {
  if (baris.length === 0) return "";
  return baris.map((b) => b.map((s) => selKeTeks(s)).join("\t")).join("\r\n") + "\r\n";
}