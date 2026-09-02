// ============================================================================
// PENGECUALIAN PEGAWAI - orang yang masih ada di data unit tapi seharusnya
// tidak ikut dihitung pada periode itu.
//
// MASALAH YANG DISELESAIKAN. Data pegawai datang dari SIAP, dan SIAP tidak
// selalu diperbarui saat orang pindah atau berhenti. Akibatnya satu unit tidak
// pernah bisa mencapai "semua pegawai sudah punya presensi & predikat", dan
// karena itu syarat kirim ke PPABP, seluruh unit macet gara-gara satu orang
// yang sebenarnya sudah tidak di sana.
//
// KENAPA BUKAN MENGUBAH `Pegawai.statusPegawai`. Sinkronisasi SIAP menulis
// `statusPegawai: "AKTIF"` pada SETIAP update (importPegawaiSiap.ts) - jadi
// penandaan manual di kolom itu hilang pada sinkronisasi berikutnya. Tanda ini
// wajib hidup di tabel milik Gajihub sendiri.
//
// KENAPA BUKAN DITEBAK DARI KEHADIRAN. "Tidak absen 10 hari = sudah keluar"
// menghasilkan pola yang sama dengan cuti sakit panjang, sidik jari yang belum
// terdaftar, tugas belajar yang belum ditandai, dan e-Presensi yang sedang
// bermasalah. Salah tandai berarti orang yang masih bekerja hilang dari daftar
// bayar - arah kesalahan yang paling mahal. Kehadiran dipakai sebagai
// PETUNJUK yang ditampilkan ke manusia, bukan sebagai keputusan.
//
// PER PERIODE, BUKAN PERMANEN. Orang bisa kembali, dan penandaan permanen yang
// keliru tidak akan pernah ketahuan lagi.
// ============================================================================

export interface AlasanPengecualian {
  kode: string;
  label: string;
  /** Ditampilkan di bawah pilihan - membedakan yang mirip. */
  keterangan: string;
}

/**
 * Daftar TETAP, bukan teks bebas.
 *
 * Alasannya bukan kerapian: daftar pengecualian ini akan disetorkan ke PPABP
 * dan OSDMA supaya SIAP diperbaiki. "Sudah keluar" yang ditulis empat puluh
 * cara berbeda tidak bisa dijumlahkan, dan tanpa jumlah tidak ada yang bisa
 * membuktikan bahwa masalahnya sistemik.
 *
 * "LAINNYA" tetap ada karena daftar tertutup selalu punya kasus yang tidak
 * terpikirkan - dan orang yang tidak menemukan pilihannya akan memilih yang
 * paling mirip, yang justru merusak angkanya. Penjelasannya diwajibkan.
 */
export const ALASAN_PENGECUALIAN: readonly AlasanPengecualian[] = [
  {
    kode: "MUTASI_KELUAR",
    label: "Mutasi keluar",
    keterangan: "Sudah pindah ke satuan kerja lain, data SIAP belum diperbarui.",
  },
  {
    kode: "BERHENTI",
    label: "Berhenti / mengundurkan diri",
    keterangan: "Sudah tidak berstatus pegawai, data SIAP belum diperbarui.",
  },
  {
    kode: "PENSIUN",
    label: "Pensiun",
    keterangan: "Sudah pensiun tapi masih tercatat AKTIF di SIAP.",
  },
  {
    kode: "MENINGGAL",
    label: "Meninggal dunia",
    keterangan: "Hak periode berjalan diurus terpisah, bukan lewat kalkulasi rutin.",
  },
  {
    kode: "BELUM_EFEKTIF",
    label: "Belum efektif bertugas",
    keterangan: "TMT-nya belum berjalan pada periode ini, jadi belum ada kewajiban kinerja.",
  },
  {
    kode: "LAINNYA",
    label: "Lainnya",
    keterangan: "Wajib dijelaskan - dipakai kalau tidak ada satu pun yang cocok di atas.",
  },
] as const;

export const KODE_LAINNYA = "LAINNYA";

/** Panjang minimal penjelasan untuk alasan "Lainnya". */
export const MINIMAL_PENJELASAN = 10;

export function alasanDariKode(kode: string): AlasanPengecualian | null {
  return ALASAN_PENGECUALIAN.find((a) => a.kode === kode) ?? null;
}

export interface HasilValidasiPengecualian {
  boleh: boolean;
  alasan: string | null;
}

/**
 * Memvalidasi masukan form pengecualian.
 *
 * Penjelasan diwajibkan HANYA untuk "Lainnya". Mewajibkannya untuk semua
 * pilihan terdengar lebih ketat, tapi hasilnya kebalikannya: orang mengetik
 * "sudah pindah" di sebelah pilihan yang sudah berbunyi "Mutasi keluar", dan
 * kolom penjelasan berhenti dibaca justru saat ia benar-benar penting.
 */
export function validasiPengecualian(kode: string, penjelasan: string): HasilValidasiPengecualian {
  const alasan = alasanDariKode(kode);
  if (!alasan) return { boleh: false, alasan: "Pilih alasan pengecualiannya dulu." };
  if (kode === KODE_LAINNYA && penjelasan.trim().length < MINIMAL_PENJELASAN) {
    return {
      boleh: false,
      alasan: `Alasan "Lainnya" wajib dijelaskan (minimal ${MINIMAL_PENJELASAN} karakter).`,
    };
  }
  return { boleh: true, alasan: null };
}

export interface PetunjukKehadiran {
  jumlahHariKerja: number;
  jumlahHariHadir: number;
  punyaPredikat: boolean;
  /** Hari cuti pada periode itu - cuti melahirkan, CLTN, dst. */
  jumlahHariCuti: number;
  /** Hari tugas belajar pada periode itu. */
  jumlahHariTugasBelajar: number;
}

/**
 * Kalimat petunjuk yang ditampilkan di samping pilihan pengecualian.
 *
 * `null` berarti tidak ada yang mencurigakan - dan itu penting: petunjuk yang
 * muncul di setiap orang berhenti dibaca, lalu yang sungguhan ikut terlewat.
 *
 * SENGAJA TIDAK PERNAH MENYIMPULKAN. Kalimatnya menyebut angka dan berhenti di
 * "kemungkinan"; yang memutuskan tetap manusia yang menekan tombolnya.
 */
export function petunjukKemungkinanKeluar(p: PetunjukKehadiran): string | null {
  if (p.jumlahHariKerja <= 0) return null;
  if (p.jumlahHariHadir > 0) return null;
  if (p.punyaPredikat) return null;

  // CUTI DAN TUGAS BELAJAR MEMBATALKAN PETUNJUK, dan ini bukan kehati-hatian
  // berlebihan - tanpa penyaringan ini petunjuknya salah pada MAYORITAS
  // kasus.
  //
  // Diukur pada data nyata periode 7/2026: dari 87 pegawai bernilai "0 hadir
  // dan tanpa predikat", 30 sedang TUGAS BELAJAR dan 21 sedang CUTI (banyak
  // di antaranya cuti melahirkan). Mereka pegawai sah yang memang tidak hadir
  // dan memang tidak dinilai - dan engine Tukin sudah punya aturannya sendiri
  // untuk keduanya (tugas belajar 80% Permenaker 15/2024, override cuti).
  //
  // Menyarankan "kemungkinan sudah tidak di unit ini" untuk orang yang sedang
  // cuti melahirkan bukan sekadar keliru; itu saran yang kalau diikuti
  // menghentikan pembayarannya.
  if (p.jumlahHariCuti > 0) return null;
  if (p.jumlahHariTugasBelajar > 0) return null;

  return `0 hadir dari ${p.jumlahHariKerja} hari kerja, tanpa cuti atau tugas belajar, dan tidak ada predikat kinerja - kemungkinan sudah tidak di unit ini.`;
}
