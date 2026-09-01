import { susunBarisTotalAdk, type SelAdk } from "./adk";

/**
 * Rekap unit dalam bentuk Excel - untuk DIBACA MANUSIA, bukan disetor ke mana
 * pun.
 *
 * BEDA MENDASAR DARI ADK, dan ini yang menentukan bentuknya. ADK
 * (`src/business-logic/adk.ts` & `adkHarian.ts`) adalah berkas PEMBAYARAN yang
 * formatnya dikunci Web Gaji: sebagian tanpa baris header, tanpa baris total,
 * tanpa nama pegawai, dan tidak boleh ditambah kolom apa pun. Berkas di sini
 * kebalikannya - dipakai Kasubag TU mengarsip dan mencocokkan ulang dengan
 * e-Presensi atau rincian manual, jadi justru WAJIB punya header yang terbaca,
 * nama orang, dan baris total.
 *
 * Karena itu keduanya SENGAJA tidak berbagi penyusun baris. Yang dipakai
 * bersama cuma `SelAdk` dan `susunBarisTotalAdk` - dua hal yang memang netral.
 * Menyatukannya lebih jauh berarti satu perubahan demi keterbacaan rekap bisa
 * merusak berkas yang dipakai membayar orang.
 *
 * PURE - nol I/O, seluruh data masuk lewat parameter (konvensi
 * business-logic). Pemanggilnya yang membaca database dan menulis HTTP
 * response.
 */

export interface HasilRekapExcel {
  header: readonly string[];
  baris: SelAdk[][];
  total: SelAdk[];
}

/** Data satu pegawai untuk rekap presensi. Bentuk datar, bukan model Prisma. */
export interface BarisRekapPresensi {
  nip: string;
  nama: string;
  jabatan: string | null;
  golongan: string | null;
  jumlahHariKerja: number;
  jumlahHariHadir: number;
  jumlahHariWfo: number;
  jumlahHariWfhWfa: number;
  jumlahHariDiklat: number;
  jumlahHariDinasLuar: number;
  jumlahHariTugasBelajar: number;
  jumlahHariAlpha: number;
  jumlahTidakPresensi: number;
  totalMenitTerlambat: number;
  totalMenitPulangCepat: number;
  totalMenitMeninggalkanKantor: number;
  jumlahTidakIkutUpacara: number;
  jenisCutiAktif: string | null;
  bulanCutiKeberapa: number | null;
  jumlahHariCuti: number;
  totalJamLembur: number;
  totalJamLemburHariLibur: number;
  jumlahHariMakanLembur: number;
  jumlahHariMakanLemburHariLibur: number;
}

export const KOLOM_REKAP_PRESENSI = [
  "No",
  "NIP",
  "Nama",
  "Jabatan",
  "Golongan",
  // Kehadiran - dasar uang makan (SBM 2026 item 22.1)
  "Hari Kerja",
  "Hari Hadir",
  "WFO",
  "WFH/WFA",
  "Diklat",
  "Dinas Luar",
  "Tugas Belajar",
  // Potongan Pasal 13 Permenaker 15/2024 - urutannya mengikuti ayatnya
  "Alpha (hari)",
  "Tidak Presensi (kejadian)",
  "Terlambat (menit)",
  "Pulang Cepat (menit)",
  "Meninggalkan Kantor (menit)",
  "Tidak Upacara (kejadian)",
  // Cuti - Pasal 14
  "Jenis Cuti",
  "Cuti Bulan Ke-",
  "Hari Cuti",
  // Lembur - SBM 2026 item 23.1 & 23.2
  "Jam Lembur",
  "Jam Lembur Hari Libur",
  "Hari Makan Lembur",
  "Hari Makan Lembur (Libur)",
] as const;

/**
 * Kolom yang dijumlahkan di baris TOTAL.
 *
 * "Cuti Bulan Ke-" SENGAJA TIDAK ikut walau angkanya numerik: itu penanda
 * urutan (cuti bulan ke-2), bukan kuantitas. Menjumlahkannya menghasilkan
 * angka yang terlihat sah tapi tidak berarti apa-apa - persis jenis kekeliruan
 * yang sulit ketahuan karena tidak ada yang error.
 */
const KOLOM_TOTAL_PRESENSI = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 20, 21, 22, 23, 24];

export function susunRekapPresensiExcel(rows: readonly BarisRekapPresensi[]): HasilRekapExcel {
  const baris: SelAdk[][] = rows.map((r, i) => [
    i + 1,
    r.nip,
    r.nama,
    r.jabatan ?? "",
    r.golongan ?? "",
    r.jumlahHariKerja,
    r.jumlahHariHadir,
    r.jumlahHariWfo,
    r.jumlahHariWfhWfa,
    r.jumlahHariDiklat,
    r.jumlahHariDinasLuar,
    r.jumlahHariTugasBelajar,
    r.jumlahHariAlpha,
    r.jumlahTidakPresensi,
    r.totalMenitTerlambat,
    r.totalMenitPulangCepat,
    r.totalMenitMeninggalkanKantor,
    r.jumlahTidakIkutUpacara,
    // Nilai enum JenisCuti ("CUTI_SAKIT") dirapikan jadi "Cuti Sakit" - berkas
    // ini dibaca manusia, bukan mesin. Kosong kalau tidak sedang cuti.
    r.jenisCutiAktif ? labelJenisCuti(r.jenisCutiAktif) : "",
    r.bulanCutiKeberapa ?? "",
    r.jumlahHariCuti,
    r.totalJamLembur,
    r.totalJamLemburHariLibur,
    r.jumlahHariMakanLembur,
    r.jumlahHariMakanLemburHariLibur,
  ]);

  const total = susunBarisTotalAdk(baris, KOLOM_TOTAL_PRESENSI, KOLOM_REKAP_PRESENSI.length);
  total[2] = "TOTAL";
  return { header: KOLOM_REKAP_PRESENSI, baris, total };
}

/** `CUTI_SAKIT` -> `Cuti Sakit`. Nilai tak dikenal dikembalikan apa adanya. */
export function labelJenisCuti(jenis: string): string {
  return jenis
    .split("_")
    .filter(Boolean)
    .map((k) => k.charAt(0) + k.slice(1).toLowerCase())
    .join(" ");
}

/** Data satu pegawai untuk rekap Tunjangan Kinerja. */
export interface BarisRekapTukin {
  nip: string;
  nama: string;
  jabatan: string | null;
  kelasJabatan: number | null;
  tukinPokok: number;
  komponenKehadiran: number;
  komponenKinerja: number;
  potonganPph: number;
  tukinBersih: number;
  status: string;
  catatanAnomali: string | null;
}

export const KOLOM_REKAP_TUKIN = [
  "No",
  "NIP",
  "Nama",
  "Jabatan",
  "Kelas Jabatan",
  "Tukin Pokok",
  "Komponen Kehadiran (30%)",
  "Komponen Kinerja (70%)",
  "Potongan PPh",
  "Tukin Bersih",
  "Status",
  "Catatan Anomali",
] as const;

const KOLOM_TOTAL_TUKIN = [5, 6, 7, 8, 9];

export function susunRekapTukinExcel(rows: readonly BarisRekapTukin[]): HasilRekapExcel {
  const baris: SelAdk[][] = rows.map((r, i) => [
    i + 1,
    r.nip,
    r.nama,
    r.jabatan ?? "",
    // Kelas jabatan boleh kosong - pegawai tanpa kelas jabatan memang tidak
    // bisa dihitung tukin pokoknya, dan itu fakta yang harus terlihat di
    // rekap, bukan diisi nol seolah kelasnya nol.
    r.kelasJabatan ?? "",
    r.tukinPokok,
    r.komponenKehadiran,
    r.komponenKinerja,
    r.potonganPph,
    r.tukinBersih,
    r.status,
    r.catatanAnomali ?? "",
  ]);

  const total = susunBarisTotalAdk(baris, KOLOM_TOTAL_TUKIN, KOLOM_REKAP_TUKIN.length);
  total[2] = "TOTAL";
  return { header: KOLOM_REKAP_TUKIN, baris, total };
}
