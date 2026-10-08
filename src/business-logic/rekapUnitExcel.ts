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

export const KOLOM_TOTAL_TUKIN = [5, 6, 7, 8, 9];
export const KOLOM_RUPIAH_TUKIN = [5, 6, 7, 8, 9];

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
    Math.round(r.tukinPokok),
    Math.round(r.komponenKehadiran),
    Math.round(r.komponenKinerja),
    Math.round(r.potonganPph),
    Math.round(r.tukinBersih),
    r.status,
    r.catatanAnomali ?? "",
  ]);

  const total = susunBarisTotalAdk(baris, KOLOM_TOTAL_TUKIN, KOLOM_REKAP_TUKIN.length);
  total[2] = "TOTAL";
  return { header: KOLOM_REKAP_TUKIN, baris, total };
}

// ============================================================================
// FORMAT RINCIAN LENGKAP TUNJANGAN KINERJA
//
// Format rincian lengkap mencakup 43 kolom: detail presensi (kehadiran, WFO,
// WFH, keterlambatan, lupa absen, alpa, dinas luar, 12 jenis cuti, diklat,
// upacara), perhitungan potongan & bobot 30% kehadiran, capaian hasil &
// perilaku kinerja serta bobot 70% kinerja, hingga rincian nominal dan status.
//
// Kolom 1-40 sejalan 1:1 dengan tabel "Lihat rincian lengkap" di
// `/kasubag/kalkulasi` dan arsip Biro Keuangan (PMK 32/2025 & Permenaker 15/2024).
// Kolom 41-43 memuat Potongan PPh, Status Pengajuan, dan Catatan Anomali
// untuk transparansi audit sebelum rekap dikirim ke PPABP.
// ============================================================================

export interface BarisRekapTukinLengkap {
  nip: string;
  nama: string;
  golongan: string | null;
  kelasJabatan: number | null;
  nominalTukin: number;
  statusPegawai: string | null;
  // Rekap presensi
  jumlahHariKerja: number;
  jumlahHariWfo: number;
  jumlahHariWfhWfa: number;
  totalMenitTerlambat: number;
  jumlahTidakPresensi: number;
  jumlahHariAlpha: number;
  jumlahHariDinasLuar: number;
  // 12 Kolom Cuti (Pasal 14)
  ctGugurKandungan1: string;
  ctGugurKandungan2: string;
  cutiTahunan: string;
  cutiMelahirkan: string;
  cutiSakitBulan1: string;
  cutiSakitBulan2: string;
  cutiSakitBulan3: string;
  cutiSakitLebih3Bulan: string;
  ctBesarApKurang1Bulan: string;
  ctBesarBulan1: string;
  ctBesarBulan2: string;
  ctBesarBulan3: string;
  // Penugasan & Pelengkap Presensi
  jumlahHariTugasBelajar: number;
  jumlahHariDiklat: number;
  jumlahTidakIkutUpacara: number;
  jumlahWfoWfh: number;
  // Komponen Kehadiran (30%)
  persenPotongan: number | string;
  persenKehadiran: number | string;
  nominalKehadiran: number;
  jumlahPotonganKehadiran: number;
  // Komponen Kinerja (70%)
  hasilKerja: string | null;
  perilakuKerja: string | null;
  capaianKinerja: string | null;
  persenKinerja: number | string;
  nominalKinerja: number;
  // Pembayaran & Audit
  dibayarkan: number;
  potonganPph: number;
  statusPengajuan: string;
  catatanAnomali: string | null;
}

export const KOLOM_REKAP_TUKIN_LENGKAP = [
  "No.",
  "Nama Pegawai",
  "NIP",
  "GOL",
  "Kelas Jabatan",
  "Nominal Tukin",
  "Status",
  "Hari Kerja",
  "Hari WFO",
  "Hari WFH/WFA",
  "Terlambat (Menit)",
  "Lupa Absen",
  "Alpa",
  "Dinas Luar",
  "CT Gugur Kandungan",
  "CT Gugur Kandungan >1 Bulan",
  "Cuti Thn",
  "Cuti Melahirkan",
  "Cuti Sakit Bulan I",
  "Cuti Sakit Bulan II",
  "Cuti Sakit Bulan III",
  "Cuti Sakit > 3 Bulan",
  "CT B/CT AP < 1 Bln",
  "CT Bsr Bln I",
  "CT Besar Bln II",
  "CT Besar Bln III",
  "TB",
  "Diklat",
  "TDK UPC",
  "WFO + WFH",
  "% Pot",
  "Persentase Kehadiran (30%)",
  "Nominal Kehadiran",
  "Jumlah Potongan Kehadiran",
  "Hasil Kerja",
  "Perilaku Kerja",
  "Capaian Kinerja",
  "Persentase Kinerja (70%)",
  "Nominal Kinerja",
  "Dibayarkan",
  "Potongan PPh",
  "Status Pengajuan",
  "Catatan Anomali",
] as const;

/**
 * Kolom yang dijumlahkan di baris TOTAL untuk format rincian lengkap.
 *
 * Kolom indeks:
 * 5: Nominal Tukin
 * 7: Hari Kerja
 * 8: Hari WFO
 * 9: Hari WFH/WFA
 * 10: Terlambat (Menit)
 * 11: Lupa Absen
 * 12: Alpa
 * 13: Dinas Luar
 * 26: TB
 * 27: Diklat
 * 28: TDK UPC
 * 29: WFO + WFH
 * 32: Nominal Kehadiran
 * 33: Jumlah Potongan Kehadiran
 * 38: Nominal Kinerja
 * 39: Dibayarkan
 * 40: Potongan PPh
 */
export const KOLOM_TOTAL_TUKIN_LENGKAP = [5, 7, 8, 9, 10, 11, 12, 13, 26, 27, 28, 29, 32, 33, 38, 39, 40];
export const KOLOM_RUPIAH_TUKIN_LENGKAP = [5, 32, 33, 38, 39, 40];

export function susunRekapTukinLengkapExcel(
  rows: readonly BarisRekapTukinLengkap[]
): HasilRekapExcel {
  const baris: SelAdk[][] = rows.map((r, i) => [
    i + 1,
    r.nama,
    r.nip,
    r.golongan ?? "",
    r.kelasJabatan ?? "",
    Math.round(r.nominalTukin),
    r.statusPegawai ?? "",
    r.jumlahHariKerja,
    r.jumlahHariWfo,
    r.jumlahHariWfhWfa,
    r.totalMenitTerlambat,
    r.jumlahTidakPresensi,
    r.jumlahHariAlpha,
    r.jumlahHariDinasLuar,
    r.ctGugurKandungan1,
    r.ctGugurKandungan2,
    r.cutiTahunan,
    r.cutiMelahirkan,
    r.cutiSakitBulan1,
    r.cutiSakitBulan2,
    r.cutiSakitBulan3,
    r.cutiSakitLebih3Bulan,
    r.ctBesarApKurang1Bulan,
    r.ctBesarBulan1,
    r.ctBesarBulan2,
    r.ctBesarBulan3,
    r.jumlahHariTugasBelajar,
    r.jumlahHariDiklat,
    r.jumlahTidakIkutUpacara,
    r.jumlahWfoWfh,
    typeof r.persenPotongan === "number" ? formatPersenDesimal(r.persenPotongan, 2) : r.persenPotongan,
    typeof r.persenKehadiran === "number" ? formatPersenDesimal(r.persenKehadiran) : r.persenKehadiran,
    Math.round(r.nominalKehadiran),
    Math.round(r.jumlahPotonganKehadiran),
    r.hasilKerja ?? "",
    r.perilakuKerja ?? "",
    r.capaianKinerja ?? "",
    typeof r.persenKinerja === "number" ? formatPersenDesimal(r.persenKinerja) : r.persenKinerja,
    Math.round(r.nominalKinerja),
    Math.round(r.dibayarkan),
    Math.round(r.potonganPph),
    r.statusPengajuan,
    r.catatanAnomali ?? "",
  ]);

  const total = susunBarisTotalAdk(baris, KOLOM_TOTAL_TUKIN_LENGKAP, KOLOM_REKAP_TUKIN_LENGKAP.length);
  total[1] = "TOTAL";
  return { header: KOLOM_REKAP_TUKIN_LENGKAP, baris, total };
}

/** Menentukan jenis kepegawaian (PNS / PPPK) dari format string golongan. */
export function jenisKepegawaian(golongan: string | null): string | null {
  if (!golongan) return null;
  const g = golongan.trim().toUpperCase();
  if (/^[IVX]+\/[A-E]$/.test(g)) return "PNS";
  if (/^[IVX]+$/.test(g)) return "PPPK";
  return null;
}

/** Menghitung penanda sel cuti (12 kolom) dari data rekap cuti. */
export function selCuti(
  kunci: string,
  rekap?: {
    jenisCutiAktif: string | null;
    bulanCutiKeberapa: number | null;
    jumlahHariCuti: number;
  } | null
): string {
  if (!rekap?.jenisCutiAktif) return "";
  const bulan = rekap.bulanCutiKeberapa ?? 1;
  const jenis = rekap.jenisCutiAktif;

  const cocok =
    kunci === "GUGUR_1" ? jenis === "CUTI_SAKIT_GUGUR_KANDUNGAN" && rekap.jumlahHariCuti <= 30 :
    kunci === "GUGUR_2" ? jenis === "CUTI_SAKIT_GUGUR_KANDUNGAN" && rekap.jumlahHariCuti > 30 :
    kunci === "TAHUNAN" ? jenis === "CUTI_TAHUNAN" :
    kunci === "MELAHIRKAN" ? jenis === "CUTI_MELAHIRKAN_ANAK_1_2_3" :
    kunci === "SAKIT_1" ? jenis === "CUTI_SAKIT" && bulan === 1 :
    kunci === "SAKIT_2" ? jenis === "CUTI_SAKIT" && bulan === 2 :
    kunci === "SAKIT_3" ? jenis === "CUTI_SAKIT" && bulan === 3 :
    kunci === "SAKIT_4" ? jenis === "CUTI_SAKIT" && bulan > 3 :
    kunci === "BESAR_AP_KURANG" ? jenis === "CUTI_BESAR_KURANG_1_BULAN" || jenis === "CUTI_ALASAN_PENTING" :
    kunci === "BESAR_1" ? jenis === "CUTI_BESAR" && bulan === 1 :
    kunci === "BESAR_2" ? jenis === "CUTI_BESAR" && bulan === 2 :
    kunci === "BESAR_3" ? jenis === "CUTI_BESAR" && bulan >= 3 :
    false;

  if (!cocok) return "";
  return rekap.jumlahHariCuti > 0 ? String(rekap.jumlahHariCuti) : "v";
}

/** Format angka persentase dengan lokal Indonesia (mis. 0% atau 2,5%). */
export function formatPersenDesimal(nilai: number, desimal = 2): string {
  return (
    new Intl.NumberFormat("id-ID", {
      minimumFractionDigits: 0,
      maximumFractionDigits: desimal,
    }).format(nilai) + "%"
  );
}

