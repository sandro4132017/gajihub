import { KELAS_JABATAN_MINIMUM_JPT } from "./pejabatPimpinanTinggi";
import { uraiJenisCuti } from "./jenisCuti";

/**
 * Pemeriksaan kelengkapan data SEBELUM kalkulasi dijalankan dan dikirim.
 *
 * PURE - pemanggilnya yang membaca database.
 *
 * Unit memastikan datanya lengkap dan benar SEBELUM angkanya dikirim, bukan
 * sesudah PPABP menemukan keganjilan. Angka Tukin yang keluar dari data yang
 * belum lengkap tetap berupa angka - kelihatan sah, tidak ada yang menandai,
 * dan baru ketahuan waktu pegawainya protes.
 *
 * DUA TINGKAT, dan bedanya menentukan tindakan:
 *
 *   HALANG  - kalkulasi untuk orang ini PASTI salah atau dilewati. Presensi
 *             belum ditarik, predikat belum masuk, kelas jabatan kosong.
 *             Tidak ada gunanya menekan Hitung sebelum ini beres.
 *   PERIKSA - datanya ada dan kalkulasi akan berjalan, tapi bentuknya janggal
 *             dan mungkin bukan yang dimaksud. Butuh mata manusia, bukan
 *             penghalang.
 *
 * TIDAK ADA tingkat ketiga untuk "sudah dikoreksi": koreksi jam presensi
 * BUKAN masalah - itu pekerjaan yang sudah dilakukan dengan benar. Tetap
 * dihitung dan ditampilkan terpisah, karena yang memeriksa berhak tahu baris
 * mana yang tidak lagi apa adanya dari e-Presensi.
 */

export type TingkatTemuan = "HALANG" | "PERIKSA";

export type JenisTemuan =
  | "PRESENSI_BELUM_ADA"
  | "HARI_KERJA_NOL"
  | "TIDAK_ADA_KEHADIRAN"
  | "HADIR_MELEBIHI_HARI_KERJA"
  | "CUTI_PANJANG_TANPA_BULAN"
  | "PREDIKAT_BELUM_ADA"
  | "PREDIKAT_JPT_BELUM_ADA"
  | "NIP_TIDAK_SAH"
  | "KELAS_JABATAN_KOSONG";

export interface RincianTemuan {
  tingkat: TingkatTemuan;
  /** Judul pendek untuk dikelompokkan di layar. */
  label: string;
  /** Apa yang harus dilakukan - bukan pengulangan labelnya. */
  tindakan: string;
}

export const TEMUAN: Record<JenisTemuan, RincianTemuan> = {
  PRESENSI_BELUM_ADA: {
    tingkat: "HALANG",
    label: "Rekap presensi belum ada",
    tindakan: "Tarik presensi periode ini dulu lewat menu Presensi.",
  },
  HARI_KERJA_NOL: {
    tingkat: "HALANG",
    label: "Jumlah hari kerja 0",
    tindakan:
      "Kalender hari libur kemungkinan belum diisi, atau presensi ditarik sebelum kalendernya lengkap. Uang makan ikut jadi nol tanpa pesan galat.",
  },
  PREDIKAT_BELUM_ADA: {
    tingkat: "HALANG",
    label: "Predikat kinerja belum ada",
    tindakan: "Unggah rekap penilaian dari e-Kinerja BKN, atau isi manual di menu Predikat Kinerja.",
  },
  PREDIKAT_JPT_BELUM_ADA: {
    tingkat: "HALANG",
    label: "Predikat pejabat pimpinan tinggi belum ada",
    tindakan:
      "Penilaian pejabat pimpinan tinggi datang dari penilai di atasnya, bukan dari rekap unit ini - berkasnya biasanya menyusul terpisah.",
  },
  KELAS_JABATAN_KOSONG: {
    tingkat: "HALANG",
    label: "Kelas jabatan kosong",
    tindakan: "Tanpa kelas jabatan tidak ada tarif tukin pokok yang bisa dipakai - orang ini akan dilewati kalkulasi.",
  },
  TIDAK_ADA_KEHADIRAN: {
    tingkat: "PERIKSA",
    label: "Sebulan penuh tanpa kehadiran tercatat",
    tindakan:
      "Tidak ada hadir, cuti, dinas luar, diklat, maupun tugas belajar. Pastikan orangnya memang tidak masuk - kalau tidak, presensinya yang belum lengkap.",
  },
  HADIR_MELEBIHI_HARI_KERJA: {
    tingkat: "PERIKSA",
    label: "Hari hadir melebihi hari kerja",
    tindakan:
      "Biasanya kalender hari libur belum lengkap waktu presensi ditarik. Periksa kalendernya, lalu tarik ulang periode ini.",
  },
  CUTI_PANJANG_TANPA_BULAN: {
    tingkat: "PERIKSA",
    label: "Cuti panjang tanpa keterangan bulan",
    tindakan:
      "Potongan Pasal 14 bertingkat menurut bulan ke berapa cuti berjalan. Tanpa keterangan itu dipakai tingkat paling ringan - cek SK cutinya, lalu isi lewat koreksi presensi.",
  },
  NIP_TIDAK_SAH: {
    tingkat: "PERIKSA",
    label: "NIP bukan 18 digit",
    tindakan:
      "Baris ini tidak akan cocok dengan berkas dari Web Gaji maupun e-Kinerja BKN. Perbaiki di SIAP, lalu jalankan sinkronisasi pegawai.",
  },
};

/**
 * Ambang "cuti berkepanjangan" - sengaja disamakan dengan `tukin.ts`.
 *
 * Kalau berbeda, halaman ini akan menandai orang yang kalkulasinya diam saja,
 * atau sebaliknya diam untuk orang yang kalkulasinya menandai - dan yang
 * membaca kedua layar tidak punya cara tahu mana yang benar.
 */
const AMBANG_CUTI_BERKEPANJANGAN = 0.8;

/** Jenis cuti yang potongannya bertingkat per bulan (Pasal 14). */
const CUTI_BERTINGKAT_PER_BULAN: readonly string[] = ["CUTI_SAKIT", "CUTI_BESAR"];

export interface RekapUntukPeriksa {
  jumlahHariKerja: number;
  jumlahHariHadir: number;
  jumlahHariCuti: number;
  jumlahHariDinasLuar: number;
  jumlahHariDiklat: number;
  jumlahHariTugasBelajar: number;
  jenisCutiAktif: string | null;
  bulanCutiKeberapa: number | null;
}

export interface FaktaPegawai {
  nip: string;
  nama: string;
  kelasJabatan: number | null;
  /** null = rekap presensi periode ini belum ada sama sekali. */
  rekap: RekapUntukPeriksa | null;
  adaPredikat: boolean;
  /** Berapa hari presensinya dikoreksi manual pada periode ini. */
  jumlahKoreksi: number;
}

export interface PegawaiDiperiksa {
  nip: string;
  nama: string;
  temuan: JenisTemuan[];
  jumlahKoreksi: number;
}

export interface RingkasanKesiapan {
  jumlahDiperiksa: number;
  jumlahLengkap: number;
  jumlahPerluDiperiksa: number;
  /** Pegawai yang punya temuan HALANG - kalkulasinya pasti salah atau dilewati. */
  jumlahTerhalang: number;
  /** Pegawai yang presensinya pernah dikoreksi manual - keterangan, bukan masalah. */
  jumlahAdaKoreksi: number;
  perJenis: { jenis: JenisTemuan; jumlah: number; pegawai: PegawaiDiperiksa[] }[];
  perPegawai: PegawaiDiperiksa[];
}

/** Semua temuan untuk SATU pegawai. */
export function periksaSatuPegawai(f: FaktaPegawai): JenisTemuan[] {
  const temuan: JenisTemuan[] = [];

  if (!/^\d{18}$/.test(f.nip)) temuan.push("NIP_TIDAK_SAH");
  if (f.kelasJabatan === null) temuan.push("KELAS_JABATAN_KOSONG");

  // --- Kinerja -----------------------------------------------------------
  // Pejabat pimpinan tinggi dipisah dari staf biasa BUKAN karena aturannya
  // berbeda, melainkan karena TINDAK LANJUTNYA berbeda: predikat staf ditagih
  // ke penilai di unit ini, predikat JPT ke penilai di atasnya. Digabung jadi
  // satu angka "20 belum punya predikat", sebagian orang akan ditagih ke
  // tempat yang salah.
  if (!f.adaPredikat) {
    temuan.push(
      f.kelasJabatan !== null && f.kelasJabatan >= KELAS_JABATAN_MINIMUM_JPT
        ? "PREDIKAT_JPT_BELUM_ADA"
        : "PREDIKAT_BELUM_ADA"
    );
  }

  // --- Kehadiran ---------------------------------------------------------
  // Rekap yang belum ada MENGHENTIKAN pemeriksaan kehadiran di sini. Tanpa
  // rekap tidak ada satu pun angka kehadiran yang bisa dinilai, dan
  // menambahkan "hari kerja 0" di atasnya cuma melipatgandakan temuan untuk
  // satu sebab yang sama.
  if (!f.rekap) {
    temuan.push("PRESENSI_BELUM_ADA");
    return temuan;
  }
  const r = f.rekap;

  if (r.jumlahHariKerja <= 0) {
    temuan.push("HARI_KERJA_NOL");
    return temuan;
  }

  if (r.jumlahHariHadir > r.jumlahHariKerja) temuan.push("HADIR_MELEBIHI_HARI_KERJA");

  const adaJejakKehadiran =
    r.jumlahHariHadir + r.jumlahHariCuti + r.jumlahHariDinasLuar + r.jumlahHariDiklat + r.jumlahHariTugasBelajar > 0;
  if (!adaJejakKehadiran) temuan.push("TIDAK_ADA_KEHADIRAN");

  // Cuti panjang yang bulan ke berapanya tidak diketahui.
  const cuti = uraiJenisCuti(r.jenisCutiAktif);
  const bulanCuti = cuti?.bulanKeberapa ?? r.bulanCutiKeberapa;
  if (
    cuti &&
    CUTI_BERTINGKAT_PER_BULAN.includes(cuti.jenis) &&
    (bulanCuti === null || bulanCuti === undefined) &&
    r.jumlahHariCuti / r.jumlahHariKerja >= AMBANG_CUTI_BERKEPANJANGAN
  ) {
    temuan.push("CUTI_PANJANG_TANPA_BULAN");
  }

  return temuan;
}

/**
 * Periksa seluruh unit.
 *
 * Yang DIKECUALIKAN dari periode ini tidak boleh ikut - penyaringannya di
 * pemanggil, sama seperti seluruh hitungan kelengkapan di halaman kalkulasi.
 * Kalau ikut, unit yang sudah menyelesaikan pengecualiannya tetap terlihat
 * belum siap, dan fitur pengecualian jadi tidak ada gunanya.
 */
export function periksaKesiapanKalkulasi(fakta: FaktaPegawai[]): RingkasanKesiapan {
  const perPegawai: PegawaiDiperiksa[] = fakta.map((f) => ({
    nip: f.nip,
    nama: f.nama,
    temuan: periksaSatuPegawai(f),
    jumlahKoreksi: f.jumlahKoreksi,
  }));

  const punyaTingkat = (p: PegawaiDiperiksa, t: TingkatTemuan) => p.temuan.some((j) => TEMUAN[j].tingkat === t);

  // Urutan jenis mengikuti urutan di TEMUAN (HALANG dulu), BUKAN urutan
  // kemunculan di data - supaya susunan daftarnya tidak berubah-ubah tiap kali
  // halaman dibuka dan orang bisa hafal letaknya.
  const perJenis = (Object.keys(TEMUAN) as JenisTemuan[])
    .map((jenis) => {
      const pegawai = perPegawai.filter((p) => p.temuan.includes(jenis));
      return { jenis, jumlah: pegawai.length, pegawai };
    })
    .filter((x) => x.jumlah > 0)
    .sort((a, b) => {
      const bobot = (t: TingkatTemuan) => (t === "HALANG" ? 0 : 1);
      const beda = bobot(TEMUAN[a.jenis].tingkat) - bobot(TEMUAN[b.jenis].tingkat);
      return beda !== 0 ? beda : b.jumlah - a.jumlah;
    });

  return {
    jumlahDiperiksa: perPegawai.length,
    jumlahLengkap: perPegawai.filter((p) => p.temuan.length === 0).length,
    jumlahPerluDiperiksa: perPegawai.filter((p) => p.temuan.length > 0).length,
    jumlahTerhalang: perPegawai.filter((p) => punyaTingkat(p, "HALANG")).length,
    jumlahAdaKoreksi: perPegawai.filter((p) => p.jumlahKoreksi > 0).length,
    perJenis,
    perPegawai,
  };
}
