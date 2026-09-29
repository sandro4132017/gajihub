// ============================================================================
// Rincian presensi HARIAN satu unit, dalam bentuk yang diminta template
// Kasubag TU (`Template_export_presensi_kasubagTU.xlsx`, 2026-09-29).
//
// PURE - tidak ada I/O. Yang membaca database & menyusun berkasnya ada di
// src/app/tukin/presensi/export/route.ts.
//
// MENGGANTIKAN `susunRekapPresensiExcel()` di `rekapUnitExcel.ts` sebagai isi
// unduhan presensi unit - bukan berdampingan dengannya. Yang lama SATU BARIS
// PER PEGAWAI berisi total sebulan; template baru SATU BARIS PER HARI. Cuma
// ada SATU tombol unduh presensi, dan bentuknya yang ini.
//
// URUTAN & NAMA KOLOM DIKUNCI TEMPLATE, termasuk "Full tanggal" yang berhuruf
// besar di depan dan pakai spasi sementara sisanya snake_case. Itu BUKAN untuk
// dirapikan: berkas ini dibaca ulang oleh orang yang sudah punya lembar kerja
// sendiri, dan mengganti nama kolom mematahkan rumus di lembar itu tanpa ada
// pesan galat.
// ============================================================================

import {
  ISTIRAHAT_MENIT,
  JADWAL_KERJA_DEFAULT,
  tapKeluarMustahil,
  tapKetukanGanda,
  tapMasukMustahil,
} from "./presensiPdfKeRekap";
import { TARIF_POTONGAN_PASAL_13 } from "./tukin";

/** Header, PERSIS seperti template - jangan diurutkan ulang atau dirapikan. */
export const HEADER_EXPORT_PRESENSI_HARIAN = [
  "nama_pegawai",
  "nama_sistem_kerja",
  "tanggal",
  "Full tanggal",
  "jam_masuk",
  "jam_keluar",
  "menit_kerja",
  "jumlah_potongan",
  "keterangan",
] as const;

/**
 * Format angka sel, diukur dari template - BUKAN ditebak.
 *
 * Kolom `tanggal` dan `Full tanggal` memuat NILAI TANGGAL YANG SAMA; yang
 * membedakannya cuma format tampilan. Sempat saya baca sebagai kolom kembar
 * yang mubazir, dan itu keliru: `[$-13809]` adalah penanda lokal Indonesia,
 * jadi kolom D menampilkan "Jumat, 06 Maret 2024" sementara C menampilkan
 * "2024-03-06". Dua cara membaca tanggal yang sama untuk dua kebutuhan
 * berbeda - menyortir lawan membaca.
 */
export const FORMAT_TANGGAL_RINGKAS = "yyyy-mm-dd";
export const FORMAT_TANGGAL_PENUH = '[$-13809]dddd, dd mmmm yyyy;@';

/**
 * Label e-Presensi untuk baris yang teks aslinya belum tersimpan.
 *
 * Kolom `PresensiHarian.namaSistemKerja` baru ada sejak 2026-09-29, jadi baris
 * dari sinkronisasi sebelumnya NULL. Daripada mengosongkan selnya, statusnya
 * dipetakan balik ke label e-Presensi.
 *
 * DAFTAR INI DIAMBIL DARI TABEL `sistem_kerja` e-PRESENSI (12 baris, dibaca
 * 2026-09-29), bukan dikarang. Yang ke-12 - "WFA" - SENGAJA tidak ada di sini,
 * dan itu batas ketelitian yang harus diketahui: `STATUS_HARIAN` memetakan
 * WFH dan WFA dua-duanya ke "WFH", jadi pemetaan balik TIDAK BISA memulihkan
 * WFA. Di Juli 2026 itu 679 dari 122.641 baris (0,55%). Baris yang
 * `namaSistemKerja`-nya tersimpan tidak kena batas ini - makanya kolom itu
 * ditambahkan.
 *
 * "Sakit" juga tidak ada di daftar e-Presensi mana pun, jadi status SAKIT
 * jatuh ke cadangan di bawah.
 */
const LABEL_EPRESENSI_DARI_STATUS: Record<string, string> = {
  WFO: "WFO",
  WFH: "WFH",
  DINAS_LUAR: "Dinas Keluar",
  DIKLAT: "Diklat",
  LEMBUR: "Lembur",
  UPACARA: "Upacara Bendera",
  CUTI: "Cuti",
  IZIN: "Izin",
  TUGAS_BELAJAR: "Tugas Belajar",
  ALPHA: "Tidak Hadir",
  TIDAK_PRESENSI: "Tidak Presensi",
};

export function labelSistemKerja(namaSistemKerja: string | null, statusKehadiran: string): string {
  const tersimpan = namaSistemKerja?.trim();
  if (tersimpan) return tersimpan;
  // Status apa adanya kalau tidak ada padanannya - jelek tapi jujur, dan
  // langsung memberi tahu label mana yang perlu ditambahkan. Sel kosong
  // terbaca "tidak ada data" padahal datanya ada.
  return LABEL_EPRESENSI_DARI_STATUS[statusKehadiran] ?? statusKehadiran;
}

/** Satu baris presensi harian, sebagaimana tersimpan di `PresensiHarian`. */
export interface SumberBarisHarian {
  nama: string;
  statusKehadiran: string;
  namaSistemKerja: string | null;
  /** Tengah malam UTC - sama seperti yang disimpan `tanggalUtc()`. */
  tanggal: Date;
  jamMasuk: Date | null;
  jamKeluar: Date | null;
  menitTerlambat: number;
  menitPulangCepat: number;
  tidakIkutUpacara: boolean;
}

/** Satu baris siap tulis. Tipe selnya sengaja disebut - lihat catatan format. */
export interface BarisExportPresensiHarian {
  namaPegawai: string;
  namaSistemKerja: string;
  /** Dipakai DUA KALI (kolom C & D) dengan format berbeda. */
  tanggal: Date;
  jamMasuk: string;
  jamKeluar: string;
  /** null = salah satu ketukan tidak ada, jadi tidak bisa dihitung. */
  menitKerja: number | null;
  /** NEGATIF, satuan persen (mis. -3). null = tidak ada potongan hari itu. */
  jumlahPotongan: number | null;
  keterangan: string;
}

/**
 * Jam:menit dari kolom waktu, ATAU "00:00" kalau tidak ada ketukan.
 *
 * "00:00", BUKAN sel kosong - itu yang dipakai e-Presensi sendiri dan yang
 * muncul di template pada baris Izin & Tidak Hadir. Menampilkannya sebagai
 * kosong membuat dua keadaan yang berbeda di sumbernya (tidak ada ketukan
 * lawan tidak ada barisnya) terlihat sama.
 *
 * Dibaca sebagai UTC karena itulah cara `menitKeWaktu()` menyimpannya - pakai
 * `getHours()` lokal dan jamnya bergeser mengikuti zona waktu server.
 */
export function jamTeks(waktu: Date | null): string {
  if (!waktu) return "00:00";
  const j = String(waktu.getUTCHours()).padStart(2, "0");
  const m = String(waktu.getUTCMinutes()).padStart(2, "0");
  return `${j}:${m}`;
}

/** Menit sejak tengah malam. Dibaca UTC - lihat alasannya di `jamTeks()`. */
function menitSejakTengahMalam(waktu: Date): number {
  return waktu.getUTCHours() * 60 + waktu.getUTCMinutes();
}

/**
 * Menit kerja satu hari: dari ketukan masuk sampai ketukan pulang, dikurangi
 * istirahat.
 *
 * DIHITUNG, tidak diambil dari e-Presensi - dan itu memang bisa, karena jam
 * masuk & jam keluar sudah tersimpan di `PresensiHarian`. Sempat saya bangun
 * jalur yang menyimpan `presensi.menit_kerja` dari e-Presensi untuk mengisi
 * kolom ini; itu berlebihan, dan akibatnya kolomnya kosong sampai seluruh
 * periode disinkronkan ulang.
 *
 * ISTIRAHAT DIKURANGI, dan itu yang membuat angkanya cocok dengan template:
 * hari normal 07:30-16:00 itu 510 menit kotor, sementara template menulis 450.
 * Bedanya persis satu jam istirahat (Pasal 9 ayat (2): Senin-Kamis 60 menit,
 * Jumat 90). Kalau istirahat tidak dikurangi, seluruh kolom akan lebih besar
 * 60-90 menit dari yang selama ini dipakai petugas.
 *
 * `ISTIRAHAT_MENIT` DIIMPOR dari `presensiPdfKeRekap.ts`, tidak ditulis ulang -
 * dan rumusnya sama dengan `rincianJamKerjaHari().menitKerja`, yang sudah
 * diadu ke 1.019 baris berkas petugas (cocok 1.015). Ada test yang mengunci
 * kesamaan itu supaya keduanya tidak bisa menyimpang diam-diam.
 *
 * AKHIR PEKAN istirahatnya 0, bukan null yang membatalkan hitungan: di hari
 * libur tidak ada jadwal istirahat 12.00-13.00 yang perlu dipotong, sementara
 * orang yang tap di hari itu memang bekerja (lembur). Mengosongkan selnya akan
 * menyembunyikan jam kerja yang nyata.
 *
 * BATAS YANG DIAKUI: tanggal merah yang jatuh di hari kerja tetap dikurangi
 * istirahat, karena fungsi ini cuma melihat nama harinya - kalender libur
 * nasional tidak dibawa ke sini. Hanya berpengaruh pada orang yang tap di
 * tanggal merah, dan angkanya terlalu kecil 60-90 menit kalau itu terjadi.
 *
 * KETUKAN YANG TIDAK DIPERCAYA MENGHASILKAN null, dan ini BUKAN kehati-hatian
 * berlebihan - tanpanya kolom ini keluar sebagai angka yang jelas salah.
 * Diukur pada data nyata satu unit, Juli 2026: baris ber-jam keluar 23:59
 * menghasilkan 941, 978, bahkan 1.018 menit. Angka 23:59 itu ISIAN OTOMATIS
 * e-Presensi ketika tap pulang tidak masuk, bukan orang yang pulang tengah
 * malam - dan proyek ini sudah pernah tergigit di titik yang sama (tap pulang
 * hilang terbaca sebagai pulang cepat ratusan menit).
 *
 * Predikatnya DIIMPOR, bukan ditulis ulang: `tapMasukMustahil`,
 * `tapKeluarMustahil`, `tapKetukanGanda` - fungsi yang SAMA dipakai mesin yang
 * membayar, jadi kolom ini tidak bisa mempercayai ketukan yang ditolak mesin
 * itu. Tiga bentuk yang tertangkap: jam keluar 23:59, jam keluar pada/sebelum
 * jam masuk wajib, dan satu ketukan yang tersalin ke dua kolom (selisih <= 2
 * menit - pola 20:29/20:30 yang ada di template contoh).
 *
 * `dikoreksi` SELALU false di sini: `PresensiHarian` tidak menyimpan penanda
 * koreksi per ketukan, jadi tidak ada jalan mengetahuinya dari baris ini. Yang
 * hilang cuma jam hasil koreksi petugas yang kebetulan berbentuk mustahil -
 * lebih baik kosong daripada angka yang salah.
 */
export function menitKerjaHarian(b: {
  tanggal: Date;
  jamMasuk: Date | null;
  jamKeluar: Date | null;
}): number | null {
  if (!b.jamMasuk || !b.jamKeluar) return null;

  const indeksHari = b.tanggal.getUTCDay();
  const masuk = menitSejakTengahMalam(b.jamMasuk);
  const keluar = menitSejakTengahMalam(b.jamKeluar);

  const jamPulangWajib = JADWAL_KERJA_DEFAULT.jamPulangWajibMenit[indeksHari] ?? null;
  if (
    tapMasukMustahil(masuk, jamPulangWajib) ||
    tapKeluarMustahil(keluar, JADWAL_KERJA_DEFAULT) ||
    tapKetukanGanda(masuk, keluar)
  ) {
    return null;
  }

  return keluar - masuk - (ISTIRAHAT_MENIT[indeksHari] ?? 0);
}

/**
 * Potongan Pasal 13 untuk SATU hari - dihitung Gajihub, BUKAN disalin
 * e-Presensi.
 *
 * INI KEPUTUSAN YANG PALING PENTING DI BERKAS INI. Template aslinya memuat
 * kolom `jumlah_potongan` & `keterangan` yang di e-Presensi berisi angka
 * potongan versi e-Presensi. Aturan proyek ini menutup jalur itu: dari
 * e-Presensi diambil FAKTA (tanggal, status, jam), tidak pernah angka
 * potongannya - karena angka itulah yang justru sedang diverifikasi Gajihub.
 *
 * Bentuk keluarannya tetap sama dengan template (`-3`, "Potongan Tidak Hadir
 * (3%)"), dan angkanya memang sudah cocok: `perHariAlpha` = 0,03. Jadi tidak
 * ada yang perlu dikorbankan - kolomnya terisi, sumbernya benar.
 *
 * TARIFNYA DIIMPOR dari `TARIF_POTONGAN_PASAL_13`, tidak ditulis ulang di
 * sini. Kalau suatu saat tarifnya berubah, yang berubah satu tempat.
 *
 * TIDAK_PRESENSI SENGAJA TIDAK DIHITUNG. Pasal 13 ayat (2) memotong 1% per
 * KEJADIAN, dan jumlah kejadian per hari TIDAK tersimpan di `PresensiHarian` -
 * satu hari bisa punya satu kejadian (tap masuk hilang) atau dua. Menebaknya
 * satu berarti berpotensi mengurangi potongan seseorang tanpa dasar; menebak
 * dua berarti menambahnya. Di template aslinya kolom itu juga kosong pada
 * baris Tidak Presensi. Yang menghitung kejadian tetap rekap periode, yang
 * memang punya angkanya.
 */
export function potonganHarian(b: {
  statusKehadiran: string;
  menitTerlambat: number;
  menitPulangCepat: number;
  tidakIkutUpacara: boolean;
}): { persen: number; keterangan: string } | null {
  const bagian: { persen: number; teks: string }[] = [];

  // Pasal 13 ayat (1) - tidak masuk kerja tanpa keterangan, 3% per hari.
  if (b.statusKehadiran === "ALPHA") {
    bagian.push({ persen: TARIF_POTONGAN_PASAL_13.perHariAlpha, teks: "Potongan Tidak Hadir (3%)" });
  }

  // Pasal 13 ayat (3) - 0,01% per menit, terlambat maupun pulang cepat.
  // Keduanya bisa terjadi di hari yang SAMA dan memang dijumlahkan.
  if (b.menitTerlambat > 0) {
    bagian.push({
      persen: b.menitTerlambat * TARIF_POTONGAN_PASAL_13.perMenit,
      teks: `Potongan Terlambat (${b.menitTerlambat} menit)`,
    });
  }
  if (b.menitPulangCepat > 0) {
    bagian.push({
      persen: b.menitPulangCepat * TARIF_POTONGAN_PASAL_13.perMenit,
      teks: `Potongan Pulang Cepat (${b.menitPulangCepat} menit)`,
    });
  }

  if (b.tidakIkutUpacara) {
    bagian.push({
      persen: TARIF_POTONGAN_PASAL_13.perKejadianTidakUpacara,
      teks: "Potongan Tidak Ikut Upacara (3%)",
    });
  }

  if (bagian.length === 0) return null;

  // Dijadikan satuan PERSEN (tarifnya tersimpan sebagai pecahan: 0,03 = 3%),
  // lalu dibulatkan 2 desimal. Tanpa pembulatan, 246 x 0,0001 x 100 keluar
  // sebagai 2.4600000000000004 dan angka itu benar-benar tertulis ke sel.
  const persen = Math.round(bagian.reduce((t, x) => t + x.persen, 0) * 100 * 100) / 100;
  return { persen, keterangan: bagian.map((x) => x.teks).join("; ") };
}

/**
 * Susun seluruh baris export. Urutannya ditentukan pemanggil (lewat urutan
 * `sumber`), bukan diurutkan ulang di sini - yang tahu urutan yang berguna
 * adalah query-nya (nama pegawai lalu tanggal).
 */
export function susunExportPresensiHarian(
  sumber: SumberBarisHarian[]
): BarisExportPresensiHarian[] {
  return sumber.map((s) => {
    const p = potonganHarian(s);
    return {
      namaPegawai: s.nama,
      namaSistemKerja: labelSistemKerja(s.namaSistemKerja, s.statusKehadiran),
      tanggal: s.tanggal,
      jamMasuk: jamTeks(s.jamMasuk),
      jamKeluar: jamTeks(s.jamKeluar),
      menitKerja: menitKerjaHarian(s),
      // NEGATIF, mengikuti template - di sana potongan ditulis `-3`.
      jumlahPotongan: p ? -p.persen : null,
      keterangan: p ? p.keterangan : "",
    };
  });
}
