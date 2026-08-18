// ============================================================================
// RINCIAN UANG MAKAN - "kenapa uang makan saya segini"
//
// PURE. Tidak ada I/O. Bahannya rekap presensi + golongan pegawai, dua hal
// yang sudah pasti tersimpan.
//
// Rumusnya sendiri cuma satu baris - hari dibayar x tarif harian - jadi yang
// betul-betul perlu dijelaskan BUKAN perkaliannya, melainkan dua hal yang
// tidak kelihatan dari hasil akhirnya:
//
//   1. KENAPA tarifnya segitu       -> golongan pegawai (SBM 2026 item 22.1)
//   2. KENAPA harinya sekian        -> hari hadir TIDAK SAMA DENGAN hari
//                                      dibayar; diklat & dinas keluar hadir
//                                      tapi tidak berhak
//
// Poin (2) yang paling sering jadi pertanyaan: dashboard lama menampilkan
// "Hadir 22 dari 23 hari kerja" lalu nominal yang sebenarnya hasil kali 18
// hari - aritmatikanya tidak bisa diperiksa dari layar, dan selisih 4 hari itu
// tidak punya tempat untuk dijelaskan.
//
// Tarif TIDAK dihitung ulang di sini: diambil lewat `tarifUangMakanPerHari()`
// yang sama dipakai kalkulasi massal, supaya tampilan dan pembayaran tidak
// bisa berbeda.
// ============================================================================

import { golonganRomawi, kurungTarifSbm, TARIF_UANG_MAKAN_PER_HARI, type GolonganRomawi } from "./tarifSbm";

/** Satu baris status kehadiran dalam periode, beserta perlakuannya. */
export interface BarisHariUangMakan {
  status: string;
  jumlahHari: number;
  berhak: boolean;
  /** Kenapa tidak berhak - kosong kalau berhak. */
  alasan: string;
}

export interface RincianUangMakan {
  /** Golongan mentah dari data pegawai, mis. "III/d" atau "IX" (PPPK). */
  golonganAsli: string | null;
  /** Kelompok tarif SBM. null kalau golongannya tidak terbaca. */
  kelompokTarif: GolonganRomawi | null;
  /** Label kelompok tarif seperti bunyi SBM ("Golongan I dan II"). */
  labelKelompok: string | null;
  tarifPerHari: number | null;
  hariDibayar: number;
  hariHadirTidakDibayar: number;
  total: number | null;
  baris: BarisHariUangMakan[];
  /** Hal yang perlu dilihat manusia - tidak pernah diputuskan diam-diam. */
  catatan: string[];
}

/**
 * SBM 2026 item 22.1 menyatukan Golongan I & II dalam satu tarif, sementara
 * uang lembur (item 23.1) memisahkannya. Label ini mengikuti bunyi dokumennya
 * supaya bisa diadu langsung ke lampiran, bukan disederhanakan jadi "Gol II".
 */
export function labelKelompokTarifUangMakan(g: GolonganRomawi): string {
  return g === "I" || g === "II" ? "Golongan I dan II" : `Golongan ${g}`;
}

export interface InputRincianUangMakan {
  golongan: string | null;
  jumlahHariWfo: number;
  jumlahHariWfhWfa: number;
  jumlahHariDiklat: number;
  jumlahHariDinasLuar: number;
  jumlahHariCuti: number;
  jumlahHariAlpha: number;
  jumlahHariKerja: number;
}

export function rincianUangMakan(input: InputRincianUangMakan): RincianUangMakan {
  const catatan: string[] = [];

  // WAJIB `kurungTarifSbm`, BUKAN `golonganRomawi` - yang kedua cuma mengenali
  // format PNS ("III/d") dan mengembalikan null untuk jenjang PPPK ("IX").
  // Memakainya di sini akan menandai ~996 pegawai PPPK "tidak dikenali" padahal
  // kalkulasi membayar mereka lewat PADANAN_GOLONGAN_PPPK - tampilan dan
  // pembayaran jadi bercerita beda.
  const kelompok = kurungTarifSbm(input.golongan);
  const tarif = kelompok ? TARIF_UANG_MAKAN_PER_HARI[kelompok] : null;
  const lewatPadananPppk = kelompok !== null && golonganRomawi(input.golongan) === null;

  if (!input.golongan) {
    catatan.push("Golongan pegawai kosong di data kepegawaian - tarif tidak bisa ditentukan, uang makan dilewati.");
  } else if (!kelompok) {
    catatan.push(
      `Golongan "${input.golongan}" tidak dikenali sebagai golongan PNS (mis. "III/d") maupun jenjang PPPK. ` +
        "Tarif TIDAK ditebak - pegawai ini dilewati saat kalkulasi. Perbaiki golongannya di SIAP."
    );
  } else if (lewatPadananPppk) {
    // Dinyatakan terang-terangan: SBM 2026 tidak menyebut PPPK sama sekali,
    // jadi tarif ini hasil padanan yang belum dikonfirmasi ke Biro Keuangan/DJA.
    catatan.push(
      `Golongan PPPK "${input.golongan}" dipadankan ke ${labelKelompokTarifUangMakan(kelompok)} SBM. ` +
        "TODO(confirm): SBM 2026 tidak mengatur PPPK - padanan ini belum dikonfirmasi ke Biro Keuangan/DJA."
    );
  }

  // Urutannya sengaja: yang dibayar dulu, baru yang tidak - supaya selisih
  // "hadir tapi tidak dibayar" terbaca sebagai satu blok.
  const baris: BarisHariUangMakan[] = [
    { status: "WFO (kerja di kantor)", jumlahHari: input.jumlahHariWfo, berhak: true, alasan: "" },
    { status: "WFH / WFA", jumlahHari: input.jumlahHariWfhWfa, berhak: true, alasan: "" },
    {
      status: "Diklat",
      jumlahHari: input.jumlahHariDiklat,
      berhak: false,
      alasan: "konsumsi ditanggung penyelenggara diklat",
    },
    {
      status: "Dinas Keluar",
      jumlahHari: input.jumlahHariDinasLuar,
      berhak: false,
      alasan: "konsumsi ditanggung perjalanan dinas",
    },
    { status: "Cuti", jumlahHari: input.jumlahHariCuti, berhak: false, alasan: "tidak masuk kerja" },
    { status: "Tidak hadir", jumlahHari: input.jumlahHariAlpha, berhak: false, alasan: "tidak masuk kerja" },
  ].filter((b) => b.jumlahHari > 0);

  const hariBerhak = Math.max(0, input.jumlahHariWfo) + Math.max(0, input.jumlahHariWfhWfa);
  // Batas atas yang sama dengan `hitungUangMakan` - tidak mungkin dibayar
  // lebih banyak dari hari kerja yang tersedia.
  const hariDibayar = Math.min(hariBerhak, Math.max(0, input.jumlahHariKerja));

  if (hariBerhak > input.jumlahHariKerja) {
    catatan.push(
      `Hari berhak (${hariBerhak}) melebihi hari kerja periode ini (${input.jumlahHariKerja}), jadi dipotong ke ` +
        `${hariDibayar}. Kemungkinan ada dinas/kegiatan di hari libur, atau libur nasional yang belum dikenali sistem.`
    );
  }

  const hariHadirTidakDibayar = input.jumlahHariDiklat + input.jumlahHariDinasLuar;
  if (hariHadirTidakDibayar > 0) {
    catatan.push(
      `${hariHadirTidakDibayar} hari tercatat HADIR tapi tidak dibayar uang makan (diklat/dinas keluar) - ` +
        "ini bukan potongan, konsumsinya memang sudah ditanggung kegiatan yang bersangkutan."
    );
  }

  return {
    golonganAsli: input.golongan,
    kelompokTarif: kelompok,
    labelKelompok: kelompok ? labelKelompokTarifUangMakan(kelompok) : null,
    tarifPerHari: tarif,
    hariDibayar,
    hariHadirTidakDibayar,
    total: tarif === null ? null : hariDibayar * tarif,
    baris,
    catatan,
  };
}
