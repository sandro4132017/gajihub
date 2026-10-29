/**
 * Menentukan SATU langkah berikutnya untuk Kasubag TU pada satu periode.
 *
 * PURE - nol I/O. Pemanggilnya (dashboard `/kasubag`) yang menghitung
 * jumlah-jumlahnya dari database lalu merangkai tautannya.
 *
 * URUTANNYA MENGIKUTI KETERGANTUNGAN, BUKAN SELERA - dan ini bukan soal
 * kerapian tampilan:
 *
 *   presensi (30%)  ─┐
 *                     ├─> kalkulasi Tukin ─> approval
 *   predikat  (70%)  ─┘
 *
 * Menghitung sebelum kedua bahan lengkap menghasilkan angka yang nanti harus
 * dihitung ulang - dan menghitung ulang **mereset status kalkulasi ke DRAFT**
 * sehingga semua yang sudah diperiksa harus diperiksa ulang. Di Biro Keuangan periode 7/2026 itu benar-benar terjadi: 278 baris
 * ApprovalLog untuk 47 pegawai, siklusnya terulang sekitar tiga kali.
 *
 * Karena itu fungsi ini TIDAK PERNAH menyarankan "hitung" selama masih ada
 * bahan yang kurang. Ia menyebut bahan yang kurang lebih dulu.
 */

import {
  cekBolehKirim,
  tabelBelumDiverifikasi,
  TABEL_WAJIB_DIVERIFIKASI,
  type JenisTabelKalkulasi,
  type StatusUnit,
} from "./pengirimanUnit";

export type JenisLangkah = "PRESENSI" | "PREDIKAT" | "HITUNG";

export interface LangkahTutupBulan {
  jenis: JenisLangkah;
  /** Berapa yang sudah ada, buat dirangkai jadi kalimat oleh pemanggil. */
  sudah: number;
  dari: number;
}

export interface KeadaanTutupBulan {
  /** Pegawai AKTIF di unit ini. Pembagi semua kelengkapan. */
  totalPegawai: number;
  /** Baris RekapPresensiPeriode untuk periode ini. */
  jumlahRekapPresensi: number;
  /** Baris PredikatKinerja untuk periode ini. */
  jumlahPredikat: number;
  /** Baris TukinCalculation untuk periode ini. */
  jumlahKalkulasi: number;
}

/**
 * `null` berarti tidak ada yang perlu disarankan - panelnya tidak dirender
 * sama sekali.
 *
 * SENGAJA tidak mengembalikan "semua beres" sebagai langkah: baris status yang
 * selalu tampil berubah jadi hiasan yang berhenti dibaca, dan begitu itu
 * terjadi, peringatan yang sungguhan ikut tidak terbaca.
 */
export function langkahTutupBulan(keadaan: KeadaanTutupBulan): LangkahTutupBulan | null {
  const { totalPegawai, jumlahRekapPresensi, jumlahPredikat, jumlahKalkulasi } = keadaan;

  // Unit tanpa pegawai aktif bukan "belum lengkap" - tidak ada yang bisa
  // disarankan, dan "0 dari 0 pegawai" cuma membingungkan.
  if (totalPegawai <= 0) return null;

  if (jumlahRekapPresensi < totalPegawai) {
    return { jenis: "PRESENSI", sudah: jumlahRekapPresensi, dari: totalPegawai };
  }
  if (jumlahPredikat < totalPegawai) {
    return { jenis: "PREDIKAT", sudah: jumlahPredikat, dari: totalPegawai };
  }
  if (jumlahKalkulasi < totalPegawai) {
    return { jenis: "HITUNG", sudah: jumlahKalkulasi, dari: totalPegawai };
  }
  return null;
}

// ---------------------------------------------------------------------------
// DAFTAR LIMA LANGKAH - versi lengkap untuk dashboard.
//
// `langkahTutupBulan()` di atas TETAP sebagai versi lama: ia hanya mengenal tiga
// langkah pertama (PRESENSI, PREDIKAT, HITUNG) dan mengembalikan satu saran.
// `daftarLangkahTutupBulan()` memperluasnya jadi lima langkah dengan status
// masing-masing. Aturan "jangan sarankan HITUNG selama bahan kurang" dari
// komentar di kepala file ini berlaku sama: HITUNG TERKUNCI selama langkah 1
// atau 2 belum selesai.
//
// Gerbang kirim TIDAK dibuat ulang di sini: langkah KIRIM memakai
// `cekBolehKirim` apa adanya, termasuk bunyi alasannya.
// ---------------------------------------------------------------------------

export type KodeLangkah = "PRESENSI" | "PREDIKAT" | "HITUNG" | "PERIKSA" | "KIRIM";

/** Awalan catatan uang makan di langkah HITUNG - satu sumber untuk pembuat & penampilnya. */
export const AWALAN_CATATAN_UANG_MAKAN = "uang makan";

export type StatusLangkah = "SELESAI" | "AKTIF" | "BISA_DIKERJAKAN" | "TERKUNCI" | "TIDAK_BERLAKU";

export interface LangkahPeriode {
  kode: KodeLangkah;
  judul: string;
  /** Satu kalimat. */
  deskripsi: string;
  /** `null` kalau langkah ini tidak punya hitungan (KIRIM). */
  angka: { x: number; y: number } | null;
  status: StatusLangkah;
  /** Diisi HANYA kalau status TERKUNCI. */
  alasan?: string;
  /**
   * Sub-baris pelengkap (mis. uang makan, angka basi). Tidak menahan selesai.
   * Catatan uang makan diawali AWALAN_CATATAN_UANG_MAKAN - penampil memakai
   * konstanta itu untuk menempelkan tautan ke halaman uang makan.
   */
  catatan?: string[];
}

export interface KeadaanDaftarLangkah {
  /** Pegawai IKUT: AKTIF dan tidak dikecualikan pada periode ini. */
  totalPegawai: number;
  jumlahPresensi: number;
  jumlahPredikat: number;
  jumlahTukin: number;
  /** Baris Tukin yang sumbernya berubah/dihapus sesudah dihitung. */
  jumlahBasi: number;
  jumlahUangMakan: number;
  tabelDiverifikasi: readonly JenisTabelKalkulasi[];
  status: StatusUnit;
  /** Menimpa `status.alasanKembali` bila diisi. */
  alasanKembali?: string | null;
}

/**
 * PURE. Lima langkah berurutan. Tepat satu AKTIF: langkah pertama yang belum
 * selesai dan tidak terkunci (nol AKTIF kalau semua selesai / tidak berlaku).
 *
 * TERKIRIM mengalahkan segalanya: kelima langkah SELESAI walau angkanya
 * bergeser sesudah kirim - kiriman yang terkunci tidak turun pangkat
 * (preseden `riwayatPengirimanPeriode`).
 */
export function daftarLangkahTutupBulan(k: KeadaanDaftarLangkah): LangkahPeriode[] {
  const total = k.totalPegawai;
  const terkirim = k.status.keadaan === "TERKIRIM";
  const angkaBahan = (n: number) => ({ x: Math.min(n, Math.max(total, 0)), y: Math.max(total, 0) });

  const wajib = TABEL_WAJIB_DIVERIFIKASI.length;
  const belumDiperiksa = tabelBelumDiverifikasi(k.tabelDiverifikasi).length;

  // Jumlah tabel di deskripsi Periksa diturunkan dari TABEL_WAJIB_DIVERIFIKASI,
  // supaya kalimatnya tidak berbohong kalau daftar tabel wajib berubah - dan
  // tetap cocok dengan indikator "x/3 tabel" di sebelahnya.
  const jumlahTabelWajib = wajib === 3 ? "ketiga" : String(wajib);
  const judulDeskripsi = {
    PRESENSI: ["Tarik presensi", "Rekap kehadiran untuk komponen Tukin 30%."],
    PREDIKAT: [
      "Lengkapi predikat kinerja",
      "Unggah predikat dari e-Kinerja BKN atau isi manual untuk komponen kinerja 70%.",
    ],
    HITUNG: ["Hitung Tukin & Uang Makan", "Hitung seluruh pegawai unit sekaligus."],
    PERIKSA: ["Periksa tabel", `Periksa dan centang ${jumlahTabelWajib} tabel.`],
    KIRIM: ["Kirim rekap ke PPABP", "Pengiriman akan mengunci periode."],
  } as const satisfies Record<KodeLangkah, readonly [string, string]>;

  const buat = (
    kode: KodeLangkah,
    angka: LangkahPeriode["angka"],
    status: StatusLangkah,
    alasan?: string | null,
    catatan?: string[]
  ): LangkahPeriode => ({
    kode,
    judul: judulDeskripsi[kode][0],
    deskripsi: judulDeskripsi[kode][1],
    angka,
    status,
    ...(status === "TERKUNCI" && alasan ? { alasan } : {}),
    ...(catatan && catatan.length > 0 ? { catatan } : {}),
  });

  const catatanHitung: string[] = [];
  if (k.jumlahBasi > 0) catatanHitung.push(`${k.jumlahBasi} angka perlu dihitung ulang`);
  // Uang makan TIDAK menahan selesai: baris yang tidak terbit itu keadaan
  // data (paling sering golongan yang tidak dikenali), bukan bahan yang bisa
  // dilengkapi dari sini. Sebabnya tidak dipastikan - "periksa", bukan vonis.
  if (k.jumlahUangMakan < k.jumlahTukin) {
    catatanHitung.push(
      `${AWALAN_CATATAN_UANG_MAKAN} ${k.jumlahUangMakan}/${k.jumlahTukin} belum terhitung - periksa golongan`
    );
  }
  const angkaPeriksa = { x: wajib - belumDiperiksa, y: wajib };

  if (terkirim) {
    return [
      buat("PRESENSI", angkaBahan(k.jumlahPresensi), "SELESAI"),
      buat("PREDIKAT", angkaBahan(k.jumlahPredikat), "SELESAI"),
      buat("HITUNG", angkaBahan(k.jumlahTukin), "SELESAI", null, catatanHitung),
      buat("PERIKSA", angkaPeriksa, "SELESAI"),
      buat("KIRIM", null, "SELESAI"),
    ];
  }

  if (total <= 0) {
    return (["PRESENSI", "PREDIKAT", "HITUNG", "PERIKSA", "KIRIM"] as const).map((kode) =>
      buat(kode, null, "TIDAK_BERLAKU")
    );
  }

  const selesaiPresensi = k.jumlahPresensi >= total;
  const selesaiPredikat = k.jumlahPredikat >= total;
  const selesaiHitung = k.jumlahTukin >= total && k.jumlahBasi === 0;
  const selesaiPeriksa = belumDiperiksa === 0;

  // Alasan terkunci langkah HITUNG: sama dengan aturan di kepala file.
  let alasanHitung: string | null = null;
  if (!selesaiPresensi || !selesaiPredikat) {
    const kurang = [!selesaiPresensi && "presensi", !selesaiPredikat && "predikat kinerja"].filter(
      Boolean
    );
    alasanHitung = `Lengkapi ${kurang.join(" dan ")} dulu - menghitung sebelum bahannya lengkap membuat angka harus dihitung ulang.`;
  }
  const alasanPeriksa = selesaiHitung ? null : "Hitung Tukin dulu - tabel yang diperiksa harus sudah final.";

  const cek = cekBolehKirim(
    {
      totalPegawai: total,
      jumlahKalkulasi: k.jumlahTukin,
      jumlahBasi: k.jumlahBasi,
      tabelDiverifikasi: k.tabelDiverifikasi,
    },
    k.status
  );

  type Dasar = { kode: KodeLangkah; angka: LangkahPeriode["angka"]; selesai: boolean; alasan: string | null; catatan?: string[] };
  const dasar: Dasar[] = [
    { kode: "PRESENSI", angka: angkaBahan(k.jumlahPresensi), selesai: selesaiPresensi, alasan: null },
    { kode: "PREDIKAT", angka: angkaBahan(k.jumlahPredikat), selesai: selesaiPredikat, alasan: null },
    {
      kode: "HITUNG",
      angka: angkaBahan(k.jumlahTukin),
      selesai: selesaiHitung,
      alasan: alasanHitung,
      catatan: catatanHitung,
    },
    { kode: "PERIKSA", angka: angkaPeriksa, selesai: selesaiPeriksa, alasan: alasanPeriksa },
    {
      kode: "KIRIM",
      angka: null,
      selesai: false,
      alasan: cek.boleh ? null : cek.alasan,
      catatan:
        k.status.keadaan === "DIKEMBALIKAN"
          ? [`Dikembalikan PPABP: ${k.alasanKembali ?? k.status.alasanKembali ?? "tanpa alasan tercatat"}`]
          : undefined,
    },
  ];

  let aktifDipakai = false;
  return dasar.map((d) => {
    let status: StatusLangkah;
    if (d.selesai) status = "SELESAI";
    else if (d.alasan !== null) status = "TERKUNCI";
    else if (!aktifDipakai) {
      status = "AKTIF";
      aktifDipakai = true;
    } else status = "BISA_DIKERJAKAN";
    return buat(d.kode, d.angka, status, d.alasan, d.catatan);
  });
}

// ---------------------------------------------------------------------------
// KARTU KOMPONEN BERJALAN - deret kartu di kartu sambutan dashboard Kasubag TU.
// ---------------------------------------------------------------------------

export type KodeKomponen = "PRESENSI" | "KINERJA" | "TUKIN" | "UANG_MAKAN" | "UANG_LEMBUR";

export interface KartuKomponen {
  kode: KodeKomponen;
  nama: string;
  /** Pegawai yang sudah punya data/hasil pada komponen ini. */
  x: number;
  /** Pembagi; `null` untuk lembur - barisnya hanya ada untuk yang berjam lembur. */
  y: number | null;
  selesai: boolean;
}

/**
 * PURE. Lima komponen berurutan (permintaan user 2026-10-27): presensi,
 * kinerja, Tukin, uang makan, uang lembur. Penampil menyembunyikan yang
 * SELESAI, sehingga yang belum beres maju ke depan.
 *
 * "Selesai" memakai ukuran yang SAMA dengan stepper: bahan lengkap untuk
 * presensi/kinerja; Tukin lengkap DAN tidak ada yang basi. Uang makan selesai
 * kalau setiap pegawai ikut punya baris - golongan yang tidak dikenali
 * membuat kartunya tetap tampil, dan itu memang keadaan yang perlu dilihat.
 * Lembur dihitung bersama Tukin dalam satu tombol, jadi ia selesai bersama
 * Tukin.
 *
 * Rekap TERKIRIM = semua selesai (angka yang bergeser sesudah terkunci tidak
 * membuka lagi apa pun - preseden langkah KIRIM). Tanpa pegawai ikut, tidak
 * ada kartu sama sekali; kartu sambutan sudah menyebut sebabnya.
 */
export function daftarKartuKomponen(
  k: KeadaanDaftarLangkah & { jumlahLembur: number; tampilkanLembur: boolean }
): KartuKomponen[] {
  const total = Math.max(k.totalPegawai, 0);
  if (total === 0 && k.status.keadaan !== "TERKIRIM") return [];
  const terkirim = k.status.keadaan === "TERKIRIM";
  const tukinSelesai = k.jumlahTukin >= total && k.jumlahBasi === 0;
  const kartu: KartuKomponen[] = [
    { kode: "PRESENSI", nama: "Presensi", x: k.jumlahPresensi, y: total, selesai: k.jumlahPresensi >= total },
    { kode: "KINERJA", nama: "Predikat Kinerja", x: k.jumlahPredikat, y: total, selesai: k.jumlahPredikat >= total },
    { kode: "TUKIN", nama: "Tunjangan Kinerja", x: k.jumlahTukin, y: total, selesai: tukinSelesai },
    {
      kode: "UANG_MAKAN",
      nama: "Uang Makan",
      x: k.jumlahUangMakan,
      y: total,
      selesai: k.jumlahUangMakan >= total && k.jumlahBasi === 0,
    },
  ];
  if (k.tampilkanLembur) {
    kartu.push({ kode: "UANG_LEMBUR", nama: "Uang Lembur", x: k.jumlahLembur, y: null, selesai: tukinSelesai });
  }
  return kartu.map((c) => ({ ...c, x: c.y === null ? c.x : Math.min(c.x, c.y), selesai: terkirim || c.selesai }));
}

export function ringkasLangkah(langkah: readonly LangkahPeriode[]): {
  selesai: number;
  total: number;
  aktif: LangkahPeriode | null;
} {
  return {
    selesai: langkah.filter((l) => l.status === "SELESAI").length,
    total: langkah.filter((l) => l.status !== "TIDAK_BERLAKU").length,
    aktif: langkah.find((l) => l.status === "AKTIF") ?? null,
  };
}
