// ============================================================================
// Domain types - dipakai bersama oleh business logic engine & adapters
// Referensi utama: Permenaker Nomor 15 Tahun 2024 tentang Pemberian
// Tunjangan Kinerja Pegawai di Lingkungan Kementerian Ketenagakerjaan
// ============================================================================

export type StatusKehadiran =
  | "HADIR"
  | "TERLAMBAT"
  | "ALPHA"           // tidak hadir tanpa keterangan sah - Pasal 13 ayat (1)
  | "TIDAK_PRESENSI"  // hadir tapi tidak tap in/out - Pasal 13 ayat (2)
  | "IZIN"
  | "SAKIT"
  | "CUTI"
  | "WFA";

/** Jenis cuti sesuai Pasal 14 - tiap jenis punya aturan pembayaran tukin berbeda */
export type JenisCuti =
  | "CUTI_TAHUNAN"
  | "CUTI_MELAHIRKAN_ANAK_1_2_3"
  | "CUTI_ALASAN_PENTING"
  | "CUTI_BESAR_KURANG_1_BULAN"
  | "CUTI_BESAR"
  | "CUTI_SAKIT"
  | "CUTI_SAKIT_GUGUR_KANDUNGAN";

/**
 * Nilai capaian kinerja (0-100). RESOLVED: Permenaker 15/2024 Pasal 6 ayat
 * (3) menyerahkan pedoman ini ke Keputusan Sekretaris Jenderal terpisah -
 * sekarang sudah ada salinannya (Lampiran Kepsekjen 82 Tahun 2025). Konversi
 * predikat -> persen ada di src/business-logic/konversiPredikat.ts
 * (konversiPredikatKeNilaiPersen), sudah diverifikasi cocok persis dengan
 * tabel resmi (lihat src/business-logic/__tests__/konversiPredikat.test.ts).
 * nilaiCapaianKinerjaPersen di sini tetap berupa angka jadi (bukan predikat
 * mentah) - pemanggil yang punya predikat mentah dari e-Kinerja BKN WAJIB
 * konversi lewat fungsi itu dulu, bukan isi angka sembarangan.
 */
export interface CapaianKinerjaInput {
  pegawaiId: string;
  periodeBulan: number;
  periodeTahun: number;
  nilaiCapaianKinerjaPersen: number; // 0-100, sudah dikonversi dari predikat sesuai Kepsesjen
}

export interface RekapKehadiranPeriode {
  pegawaiId: string;
  periodeBulan: number;
  periodeTahun: number;
  /** Jumlah hari tidak hadir tanpa keterangan sah - dasar potongan 3%/hari (Pasal 13 ayat 1) */
  jumlahHariAlpha: number;
  /** Jumlah kejadian tidak presensi masuk/pulang - dasar potongan 1%/kejadian (Pasal 13 ayat 2) */
  jumlahTidakPresensi: number;
  /** Total akumulasi menit keterlambatan/pulang cepat - dasar potongan 0.01%/menit (Pasal 13 ayat 3) */
  totalMenitTerlambat: number;
  /** false jika tidak ikut upacara bendera tanpa alasan sah - potongan 3% (Pasal 13 ayat 4) */
  ikutUpacaraBendera: boolean;
  /**
   * Jika pegawai menjalani cuti dalam periode ini, Pasal 14 mengatur
   * pembayaran tukin dengan skema TERSENDIRI (bukan sekadar potongan
   * komponen kehadiran) - lihat hitungOverrideCuti().
   * TODO(legal-confirm): aturan ini belum menangani kasus cuti yang
   * dimulai/berakhir di tengah periode (proporsional harian) - perlu
   * konfirmasi ke Biro OSDMA/Hukum bagaimana praktiknya selama ini.
   */
  cutiAktif?: {
    jenis: JenisCuti;
    bulanKeberapa?: number; // untuk cuti besar/sakit yang bertingkat per bulan (1, 2, 3, ...)
  };
  /**
   * Field di bawah (jumlahHariKerja, jumlahHariHadir, totalJamLembur) dipakai
   * untuk kalkulasi Uang Makan & Uang Lembur, BUKAN untuk Tukin.
   * TODO(confirm): asumsi bahwa e-Presensi adalah sumber data hari kerja/hadir
   * DAN jam lembur belum dikonfirmasi ke pihak terkait - jam lembur bisa jadi
   * datang dari sistem/mekanisme lain yang belum ada adapternya di project ini.
   */
  jumlahHariKerja: number;
  jumlahHariHadir: number;
  totalJamLembur: number;
}

export interface TukinInput {
  pegawaiId: string;
  periodeBulan: number;
  periodeTahun: number;
  /** Nilai tukin pokok sesuai kelas jabatan, dari Lampiran Permenaker 15/2024 */
  tukinPokokKelasJabatan: number;
  rekapKehadiran: RekapKehadiranPeriode;
  capaianKinerja: CapaianKinerjaInput;
  /** Opsional: dikosongkan jika PPh dihitung terpisah di Web Gaji/SAKTI */
  tarifPphEfektif?: number;
}

export interface TukinResult {
  pegawaiId: string;
  periodeBulan: number;
  periodeTahun: number;
  bobotKehadiran: number;      // nilai rupiah dari 30% tukinPokokKelasJabatan
  bobotKinerja: number;        // nilai rupiah dari 70% tukinPokokKelasJabatan
  potonganKehadiranPersen: number; // akumulasi persentase potongan sesuai Pasal 13
  komponenKehadiranSetelahPotongan: number;
  komponenKinerja: number;
  tukinPokok: number;          // komponenKehadiran + komponenKinerja (sebelum override cuti/disiplin)
  overrideCutiDiterapkan: boolean;
  potonganPph: number;
  tukinBersih: number;
  anomali: string[];
}

export interface UangMakanInput {
  pegawaiId: string;
  periodeBulan: number;
  periodeTahun: number;
  jumlahHariKerja: number;
  jumlahHariHadir: number;
  tarifHarianUangMakan: number;
}

export interface UangMakanResult {
  pegawaiId: string;
  periodeBulan: number;
  periodeTahun: number;
  totalUangMakan: number;
  anomali: string[];
}

export interface UangLemburInput {
  pegawaiId: string;
  periodeBulan: number;
  periodeTahun: number;
  totalJamLembur: number;
  tarifPerJam: number;
  batasMaksimalJamLembur?: number;
}

export interface UangLemburResult {
  pegawaiId: string;
  periodeBulan: number;
  periodeTahun: number;
  jamLemburDihitung: number;
  totalUangLembur: number;
  anomali: string[];
}
