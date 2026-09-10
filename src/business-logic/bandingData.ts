/**
 * Jenis banding dan bagian data yang boleh dipersoalkan pegawai.
 *
 * Semula banding hanya bisa diajukan atas ANGKA yang sudah dihitung (Tukin,
 * uang makan, uang lembur). Masalahnya, angka itu hampir tidak pernah salah
 * dengan sendirinya - yang salah biasanya DATA SUMBERNYA: kelas jabatan yang
 * belum diperbarui setelah pelantikan, tap presensi yang hilang, predikat
 * kinerja yang belum masuk. Pegawai yang tahu persis apa yang keliru dulu cuma
 * bisa menulisnya sebagai kalimat bebas di banding tukin, dan yang menerima
 * harus menebak sendiri ke sistem mana ia harus melihat.
 *
 * Sekarang tiap banding menyebut TIGA hal: bagian data apa, kenapa keliru, dan
 * SEHARUSNYA berapa.
 *
 * `sistemSumber` ada di tiap jenis karena Gajihub tidak menyimpan data ini -
 * ia menyalinnya. Perbaikannya selalu terjadi di sistem asalnya, lalu ikut
 * masuk pada sinkronisasi berikutnya. Menuliskannya di layar mencegah harapan
 * yang keliru bahwa menekan "ajukan" akan mengubah angkanya sendiri.
 */

export const REFERENSI_BANDING = [
  "TUKIN",
  "UANG_MAKAN",
  "UANG_LEMBUR",
  "DATA_PEGAWAI",
  "PRESENSI",
  "PREDIKAT_KINERJA",
] as const;

export type ReferensiBanding = (typeof REFERENSI_BANDING)[number];

export function isReferensiBanding(nilai: string): nilai is ReferensiBanding {
  return (REFERENSI_BANDING as readonly string[]).includes(nilai);
}

/** Banding atas DATA sumber - punya `bagianData`, bukan atas angka kalkulasi. */
export const REFERENSI_DATA = ["DATA_PEGAWAI", "PRESENSI", "PREDIKAT_KINERJA"] as const;
export type ReferensiData = (typeof REFERENSI_DATA)[number];

export function isReferensiData(nilai: string): nilai is ReferensiData {
  return (REFERENSI_DATA as readonly string[]).includes(nilai);
}

export interface JenisBanding {
  label: string;
  /** Sistem tempat perbaikannya benar-benar dikerjakan. */
  sistemSumber: string;
  /** Kepada siapa pegawai berurusan setelah banding disetujui. */
  ditanganiOleh: string;
  /** Daftar tertutup bagian data yang bisa dipersoalkan. */
  bagian: readonly string[];
}

export const JENIS_BANDING: Record<ReferensiData, JenisBanding> = {
  DATA_PEGAWAI: {
    label: "Data pegawai",
    sistemSumber: "SIAP",
    ditanganiOleh: "Kasubag TU unit, diteruskan ke OSDMA",
    bagian: [
      "Nama",
      "NIP",
      "Jabatan",
      "Golongan",
      "Kelas jabatan",
      "Satuan kerja / unit",
      "Status kepegawaian",
      "Status kawin / jumlah tanggungan",
      "Nomor rekening",
    ],
  },
  PRESENSI: {
    label: "Kehadiran",
    sistemSumber: "e-Presensi",
    ditanganiOleh: "Kasubag TU unit",
    bagian: [
      "Jam masuk / jam pulang",
      "Hari yang tercatat alpha",
      "Hari yang tercatat tidak presensi",
      "Status hari (WFO / WFH / dinas luar / diklat)",
      "Cuti - jenis atau jumlah harinya",
      "Cuti - bulan ke berapa",
      "Jumlah hari kerja periode ini",
      "Jam lembur",
    ],
  },
  PREDIKAT_KINERJA: {
    label: "Predikat kinerja",
    sistemSumber: "e-Kinerja BKN",
    ditanganiOleh: "Kasubag TU unit, diteruskan ke OSDMA",
    bagian: ["Predikat", "Nilai hasil kerja", "Nilai perilaku kerja", "Predikat belum masuk sama sekali"],
  },
};

const LABEL_ANGKA: Record<string, string> = {
  TUKIN: "Tunjangan Kinerja",
  UANG_MAKAN: "Uang Makan",
  UANG_LEMBUR: "Uang Lembur",
};

/**
 * Label untuk ditampilkan. Nilai yang tidak dikenal dikembalikan APA ADANYA -
 * baris banding lama tidak boleh hilang dari layar cuma karena jenisnya sudah
 * tidak dipakai lagi.
 */
export function labelReferensiBanding(tipe: string): string {
  if (isReferensiData(tipe)) return JENIS_BANDING[tipe].label;
  return LABEL_ANGKA[tipe] ?? tipe;
}

/**
 * Apakah bagian data yang dikirim benar-benar ada di daftar jenis itu.
 *
 * Dicek ULANG di server. Nilai `<select>` gampang diganti lewat DevTools, dan
 * bagian data inilah yang menentukan ke sistem mana verifikator melihat -
 * teks karangan di situ membuat banding tidak bisa ditindaklanjuti.
 */
export function bagianDataSah(tipe: ReferensiData, bagian: string): boolean {
  return JENIS_BANDING[tipe].bagian.includes(bagian);
}
