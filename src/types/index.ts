// ============================================================================
// Domain types - dipakai bersama oleh business logic engine & adapters
// Referensi utama: Permenaker Nomor 15 Tahun 2024 tentang Pemberian
// Tunjangan Kinerja Pegawai di Lingkungan Kementerian Ketenagakerjaan
// ============================================================================

export type StatusKehadiran =
  | "HADIR"           // dianggap WFO - lihat catatan di bawah
  | "WFO"             // kerja di kantor - BERHAK uang makan
  | "WFH"             // kerja dari rumah - BERHAK uang makan
  | "WFA"             // kerja dari mana saja - BERHAK uang makan
  | "TERLAMBAT"
  | "ALPHA"           // tidak hadir tanpa keterangan sah - Pasal 13 ayat (1)
  | "TIDAK_PRESENSI"  // hadir tapi tidak tap in/out - Pasal 13 ayat (2)
  | "DIKLAT"          // TIDAK berhak uang makan (konsumsi ditanggung diklat)
  | "DINAS_LUAR"      // TIDAK berhak uang makan (ditanggung perjalanan dinas)
  | "IZIN"
  | "SAKIT"
  | "CUTI";

/**
 * Status yang BERHAK uang makan (aturan user 2026-07-29): WFO dan WFH/WFA.
 * "HADIR" ikut masuk karena data lama memakai label itu untuk kehadiran
 * biasa di kantor - lihat catatan di uangMakan.ts.
 *
 * Diklat & Dinas Keluar SENGAJA di luar daftar: pegawainya memang bekerja,
 * tapi konsumsinya sudah ditanggung kegiatan/perjalanan dinas.
 */
export const STATUS_BERHAK_UANG_MAKAN: StatusKehadiran[] = ["HADIR", "WFO", "WFH", "WFA", "TERLAMBAT"];

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
  /**
   * Pasal 13 ayat (3) menyebut TIGA pelanggaran dengan tarif yang sama
   * (0,01%/menit): terlambat hadir, pulang cepat, dan meninggalkan kantor.
   * Dipisah jadi tiga field - bukan karena tarifnya beda, tapi supaya bisa
   * dijelaskan ke pegawai/auditor menitnya datang dari pelanggaran yang mana.
   * Sebelumnya cuma ada `totalMenitTerlambat`, jadi dua jenis lainnya tidak
   * punya tempat dan terpaksa "dititipkan" ke keterlambatan.
   */
  totalMenitTerlambat: number;
  totalMenitPulangCepat: number;
  totalMenitMeninggalkanKantor: number;
  /**
   * Jumlah KEJADIAN tidak ikut upacara bendera tanpa alasan sah - potongan
   * 3% per kejadian (Pasal 13 ayat 4).
   *
   * TODO(confirm): teks Pasal 13 ayat (4) TIDAK memuat frasa "setiap kali"
   * (beda dengan ayat (2) yang eksplisit "setiap kali tidak melakukan
   * presensi"), jadi secara harfiah bisa juga dibaca 3% sekali saja per
   * periode berapa pun jumlah upacara yang dilewatkan. Dibuat per-kejadian
   * mengikuti tabel yang diberikan user. Praktis jarang berbeda (upacara
   * bendera umumnya sebulan sekali), TAPI perlu ditegaskan ke Biro Hukum
   * sebelum dipakai produksi.
   */
  jumlahTidakIkutUpacara: number;
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
    /**
     * Jumlah HARI cuti dalam periode ini. Dibutuhkan KHUSUS oleh Pasal 14
     * huruf e angka 2 (cuti sakit karena gugur kandungan di atas 1 bulan
     * s.d. 1,5 bulan = potongan 1% PER HARI) - satu-satunya ketentuan cuti
     * yang tarifnya harian, bukan per bulan.
     */
    jumlahHariCuti?: number;
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

/** Satu baris rincian potongan komponen kehadiran (Pasal 13). */
export interface RincianPotonganKehadiran {
  /** Label siap tampil, mis. "Tidak hadir kerja tanpa keterangan yang sah". */
  jenis: string;
  /** Pasal yang jadi dasar, mis. "Pasal 13 ayat (1)". */
  dasarHukum: string;
  /** Berapa kali/hari/menit pelanggarannya. */
  jumlah: number;
  /** Satuan `jumlah` - "hari" | "kejadian" | "menit". */
  satuan: string;
  /** Tarif potongan per satuan, dalam pecahan (0.03 = 3%). */
  tarifPersen: number;
  /** jumlah x tarifPersen, dalam pecahan dari BOBOT KEHADIRAN (bukan dari total tukin). */
  totalPersen: number;
}

export interface TukinResult {
  pegawaiId: string;
  periodeBulan: number;
  periodeTahun: number;
  bobotKehadiran: number;      // nilai rupiah dari 30% tukinPokokKelasJabatan
  bobotKinerja: number;        // nilai rupiah dari 70% tukinPokokKelasJabatan
  potonganKehadiranPersen: number; // akumulasi persentase potongan sesuai Pasal 13
  /**
   * Rincian potongan Pasal 13 per jenis pelanggaran - dipakai buat
   * menampilkan "kenapa tukin saya segini" ke pegawai tanpa harus menghitung
   * ulang di sisi UI.
   */
  rincianPotonganKehadiran: RincianPotonganKehadiran[];
  komponenKehadiranSetelahPotongan: number;
  komponenKinerja: number;
  tukinPokok: number;          // komponenKehadiran + komponenKinerja (sebelum override cuti/disiplin)
  overrideCutiDiterapkan: boolean;
  /** Persen tukin yang DIBAYARKAN saat override cuti berlaku (Pasal 14). null kalau tidak ada cuti. */
  persenDibayarCuti: number | null;
  potonganPph: number;
  tukinBersih: number;
  anomali: string[];
}

export interface UangMakanInput {
  pegawaiId: string;
  periodeBulan: number;
  periodeTahun: number;
  jumlahHariKerja: number;
  /**
   * Hari yang BERHAK uang makan dipecah per status kehadiran, bukan satu
   * angka "hari hadir" - karena tidak semua kehadiran berhak. Yang berhak
   * cuma WFO dan WFH/WFA; Diklat & Dinas Keluar TIDAK (konsumsinya sudah
   * ditanggung kegiatan/perjalanan dinasnya). Lihat uangMakan.ts.
   */
  jumlahHariWfo: number;
  jumlahHariWfhWfa: number;
  /** SBM 2026 item 22.1 per golongan - lihat tarifSbm.ts. */
  tarifHarianUangMakan: number;
}

export interface UangMakanResult {
  pegawaiId: string;
  periodeBulan: number;
  periodeTahun: number;
  /** Hari yang benar-benar dibayar (WFO + WFH/WFA, di-clamp ke hari kerja). */
  jumlahHariDibayar: number;
  totalUangMakan: number;
  anomali: string[];
}

export interface UangLemburInput {
  pegawaiId: string;
  periodeBulan: number;
  periodeTahun: number;
  /** Jam lembur pada HARI KERJA biasa - tarif normal. */
  totalJamLembur: number;
  /**
   * Jam lembur pada HARI LIBUR / tanggal merah - tarifnya dikali
   * PENGALI_LEMBUR_HARI_LIBUR (lihat tarifSbm.ts; pengali ini BUKAN dari
   * SBM). Dipisah dari totalJamLembur supaya keduanya bisa ditelusuri.
   */
  totalJamLemburHariLibur?: number;
  /** SBM 2026 item 23.1 per golongan (OJ) - lihat tarifSbm.ts. */
  tarifPerJam: number;
  /**
   * Jumlah HARI KERJA yang lemburnya mencapai minimal 2 jam BERTURUT-TURUT -
   * satu-satunya dasar uang makan lembur, yang satuannya per hari (OH),
   * bukan per jam. Tidak bisa diturunkan dari totalJamLembur saja. Pemanggil
   * yang punya rincian harian bisa memakai hitungHariBerhakMakanLembur().
   */
  jumlahHariMakanLembur?: number;
  /** Sama, tapi untuk hari libur. */
  jumlahHariMakanLemburHariLibur?: number;
  /** SBM 2026 item 23.2 per golongan (OH) - lihat tarifSbm.ts. */
  tarifMakanLemburPerHari?: number;
  /**
   * Jumlah hari WFO pegawai pada periode ini. Dipakai HANYA buat
   * pengecekan silang: lembur cuma diakui buat pegawai yang bekerja di
   * kantor, jadi klaim jam lembur tanpa satu pun hari WFO itu janggal.
   * Lihat catatan WFH/WFA di uangLembur.ts.
   */
  jumlahHariWfo?: number;
  batasMaksimalJamLembur?: number;
}

export interface UangLemburResult {
  pegawaiId: string;
  periodeBulan: number;
  periodeTahun: number;
  jamLemburDihitung: number;
  /** Rincian jam yang dibayar, dipisah hari kerja vs hari libur. */
  jamLemburHariKerja: number;
  jamLemburHariLibur: number;
  jumlahHariMakanLembur: number;
  /** Komponen 1 - jam x tarif per jam (SBM item 23.1), hari libur dikali pengali. */
  uangLembur: number;
  /** Komponen 2 - hari (>=2 jam berturut-turut) x tarif per hari (SBM item 23.2). */
  uangMakanLembur: number;
  /** uangLembur + uangMakanLembur - inilah yang dibayarkan. */
  totalUangLembur: number;
  anomali: string[];
}
