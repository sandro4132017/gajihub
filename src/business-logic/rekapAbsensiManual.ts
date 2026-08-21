// ============================================================================
// Berkas rekap absensi MANUAL yang dipakai petugas ("Jam Absensi.xlsx")
//
// KENAPA ADA: sampai Gajihub dipercaya penuh, petugas masih merekap di Excel
// dan ANGKA ITULAH yang dipindahkan ke rincian tunkin. Modul ini membacanya
// supaya keduanya bisa DIADU per hari sebelum jalur manual dimatikan.
//
// PURE - pembacaan .xlsx-nya di lapisan pemanggil (Server Action).
//
// TIDAK menghitung ulang Pasal 13. Keluarannya sengaja berbentuk
// `LaporanPresensiPdf` - tipe yang SAMA dengan hasil parsing PDF - supaya
// dihitung `rekapDariLaporanPdf()` yang itu-itu juga. Kalau modul ini punya
// mesin hitung sendiri, perbandingannya tidak berarti: beda hasil bisa datang
// dari beda mesin, bukan beda data.
//
// KOLOM HITUNGAN BERKAS TIDAK DIPAKAI ("Terlambat", "Menit Kerja",
// "Kekurangan Jam Kerja", "Persentase Potongan Harian") - modelnya berbeda
// dari yang dibayarkan: "Terlambat" dihitung pada SEMUA status termasuk Dinas
// Luar & Diklat, dan persentasenya memakai tabel berjenjang yang diadu ke
// rincian tunkin resmi Juli 2026 cocok 0/48 (per-menit 0,01% cocok 47/48).
// Yang diambil HANYA fakta mentah: tanggal, status, jam masuk, jam keluar.
//
// PERHATIAN - JUDUL KOLOM STATUS BERGESER SATU. Di baris judul, kolom sesudah
// "Hari" kosong dan "Keterangan Cuti" ada di kolom berikutnya; di baris data
// justru sebaliknya. Karena itu status dicari lewat POSISI (tepat sesudah
// "Hari"), bukan lewat judulnya. Kolom lain tetap dicari lewat judul.
//
// Tanggal & jam disimpan Excel sebagai angka: tanggal = serial hari sejak
// 1899-12-30, jam = pecahan hari (0,3125 = 07:30).
// ============================================================================

import type { BarisPresensiPdf, LaporanPresensiPdf, RingkasanSumberPdf } from "./presensiPdf";
import { AMBANG_KETUKAN_GANDA_MENIT, JADWAL_KERJA_DEFAULT } from "./presensiPdfKeRekap";

/** Semua sel kosong - sumber ini memang tidak punya blok "Summary Presensi". */
const RINGKASAN_KOSONG: RingkasanSumberPdf = {
  tidakHadir: null,
  izin: null,
  tugasBelajar: null,
  lembur: null,
  tidakPresensi: null,
  cuti: null,
  upacaraBendera: null,
  dinasKeluar: null,
  wfo: null,
  diklat: null,
  wfh: null,
  wfa: null,
  kewajibanJamKerja: null,
  kekuranganJamKerja: null,
};

/**
 * Teks yang dititipkan ke `potonganTeks` supaya cocok dengan regex
 * LUPA_PRESENSI di `presensiPdfKeRekap.ts`. Kalimatnya sengaja menyebut
 * sebabnya, karena teks ini ikut terbaca manusia saat menelusuri.
 */
const PENANDA_KETUKAN_GANDA = "lupa presensi (satu ketukan tersalin ke dua kolom)";

export interface HasilParseRekapManual {
  /** Satu laporan per pegawai, siap diserahkan ke `rekapDariLaporanPdf()`. */
  laporan: LaporanPresensiPdf[];
  /** Baris yang tidak bisa dipakai, beserta alasannya - JANGAN ditelan diam-diam. */
  dilewati: { baris: number; alasan: string }[];
  /** Masalah bentuk berkas yang perlu dilihat manusia. */
  peringatan: string[];
}

function teks(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\s+/g, " ").trim();
}

function angka(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Pecahan hari Excel -> menit sejak 00:00.
 *
 * `null` untuk sel kosong DAN untuk nilai 0. Nol di berkas ini berarti "tidak
 * ada ketukan" (baris cuti selalu 0/0), bukan "masuk tepat tengah malam" -
 * perlakuan yang sama dengan jalur PDF, yang juga membaca 00:00 sebagai sel
 * kosong.
 */
export function pecahanKeMenit(v: unknown): number | null {
  const n = angka(v);
  if (n === null || n === 0) return null;
  // Nilai > 1 berarti selnya memuat tanggal+jam, bukan jam saja.
  const pecahan = n >= 1 ? n - Math.floor(n) : n;
  const menit = Math.round(pecahan * 24 * 60);
  if (menit <= 0 || menit >= 24 * 60) return null;
  return menit;
}

/** Serial tanggal Excel -> komponen tanggal. Epoch 1899-12-30 (bug 1900 ikut). */
export function serialKeTanggal(v: unknown): { tanggal: number; bulan: number; tahun: number } | null {
  const n = angka(v);
  if (n === null || n < 1 || n > 200000) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
  if (Number.isNaN(d.getTime())) return null;
  return { tanggal: d.getUTCDate(), bulan: d.getUTCMonth() + 1, tahun: d.getUTCFullYear() };
}

function duaDigit(n: number): string {
  return String(n).padStart(2, "0");
}

function jamTeks(menit: number | null): string | null {
  return menit === null ? null : `${duaDigit(Math.floor(menit / 60))}:${duaDigit(menit % 60)}`;
}

/**
 * Status berkas -> bentuk yang dimengerti `kategoriDariStatus()`.
 *
 * Satu-satunya yang perlu diubah adalah CUTI. Di berkas ini jenisnya menempel
 * langsung ("Cuti tahunan", "Cuti Bersalin"), sementara jalur PDF memakai
 * "Cuti - <jenis>" dan `kategoriDariStatus()` mengambil jenisnya SESUDAH tanda
 * hubung. Tanpa penyisipan ini jenis cutinya hilang, dan hilangnya jenis cuti
 * berarti Pasal 14 tidak berjalan - pegawai cuti besar terbayar penuh.
 */
export function samakanStatus(statusTeks: string): string {
  const s = statusTeks.trim();
  if (/^cuti\b/i.test(s) && !s.includes("-")) return `Cuti - ${s}`;
  return s;
}

function cariKolom(judul: string[], nama: string): number {
  const n = nama.toLowerCase();
  return judul.findIndex((h) => h.toLowerCase() === n);
}

export function parseRekapAbsensiManual(
  matriks: unknown[][],
  /**
   * Jam masuk wajib (menit sejak 00:00). Dipakai HANYA untuk mengenali jam
   * keluar yang mustahil - lihat catatan "bukan ketukan pulang" di bawah.
   * Diturunkan dari jadwal yang sama dengan mesin hitungnya, bukan angka
   * tersendiri, supaya keduanya tidak bisa berbeda.
   */
  jamMasukWajibMenit: number = JADWAL_KERJA_DEFAULT.jamMasukWajibMenit
): HasilParseRekapManual {
  const dilewati: { baris: number; alasan: string }[] = [];
  const peringatan: string[] = [];

  if (!Array.isArray(matriks) || matriks.length < 3) {
    return { laporan: [], dilewati, peringatan: ["Sheet kosong atau tidak punya baris data."] };
  }

  const judul = (matriks[0] ?? []).map((c) => teks(c));
  const iNama = cariKolom(judul, "Nama Pegawai");
  const iNip = cariKolom(judul, "NIP");
  const iTanggal = cariKolom(judul, "Tanggal");
  const iHari = cariKolom(judul, "Hari");
  const iMasuk = cariKolom(judul, "Checkin");
  const iKeluar = cariKolom(judul, "Checkout");

  const hilang = [
    ["Nama Pegawai", iNama],
    ["NIP", iNip],
    ["Tanggal", iTanggal],
    ["Hari", iHari],
    ["Checkin", iMasuk],
    ["Checkout", iKeluar],
  ]
    .filter(([, i]) => (i as number) < 0)
    .map(([n]) => n as string);

  if (hilang.length > 0) {
    return {
      laporan: [],
      dilewati,
      peringatan: [
        `Kolom wajib tidak ketemu di baris judul: ${hilang.join(", ")}. Pastikan yang diunggah sheet "Master Presensi" dari berkas rekap absensi petugas.`,
      ],
    };
  }

  // Status TIDAK dicari lewat judul - lihat catatan panjang di kepala file.
  const iStatus = iHari + 1;

  // Baris 1 di berkas asli cuma nomor kolom (1,2,3,...). Dilewati kalau memang
  // begitu, tapi TIDAK diasumsikan ada - berkas lain bisa saja tanpa itu.
  const barisPertamaData = (matriks[1] ?? []).every((c) => {
    const t = teks(c);
    return t === "" || /^\d+$/.test(t);
  })
    ? 2
    : 1;

  const perPegawai = new Map<string, { nama: string; baris: BarisPresensiPdf[] }>();
  let adaStatusDikenali = false;

  for (let i = barisPertamaData; i < matriks.length; i++) {
    const r = matriks[i] ?? [];
    const nomorBaris = i + 1; // 1-indexed seperti yang dilihat user di Excel
    const nip = teks(r[iNip]);
    const nama = teks(r[iNama]);
    const tgl = serialKeTanggal(r[iTanggal]);

    if (nip === "" && nama === "" && tgl === null) continue; // baris kosong
    if (nip === "") {
      dilewati.push({ baris: nomorBaris, alasan: "NIP kosong" });
      continue;
    }
    if (tgl === null) {
      dilewati.push({ baris: nomorBaris, alasan: `tanggal tidak terbaca (isi sel: "${teks(r[iTanggal])}")` });
      continue;
    }

    const statusAsli = teks(r[iStatus]);
    if (statusAsli === "") {
      dilewati.push({ baris: nomorBaris, alasan: "kolom status kosong" });
      continue;
    }
    adaStatusDikenali = true;

    const masuk = pecahanKeMenit(r[iMasuk]);
    const keluar = pecahanKeMenit(r[iKeluar]);

    // JAM KELUAR YANG BUKAN KETUKAN PULANG.
    //
    // Di berkas ini tap pulang yang hilang tidak meninggalkan sel kosong -
    // kolomnya terisi ketukan PAGI. Dibaca apa adanya, itu jadi "pulang cepat"
    // ratusan menit: Nurul Apriyanah 594 menit (masuk 06:03, keluar 06:06),
    // Yusfrida 640 menit (05:11 / 05:22). Petugasnya sendiri TIDAK pernah
    // menagihkan itu - di rincian tunkin resmi Nurul cuma tercatat 8 menit.
    //
    // Dua bentuk yang dikenali, keduanya nyata di berkas asli:
    //   1. selisihnya semenit-dua  -> satu ketukan tersalin ke dua kolom
    //      (31 baris; ketukannya bisa PAGI 13 maupun SORE 18, jadi tidak boleh
    //      ditebak mana yang asli)
    //   2. jam keluar LEBIH PAGI dari jam masuk wajib -> mustahil sebagai
    //      kepulangan; orang tidak bisa pulang sebelum jam kerjanya dimulai.
    //      Ambangnya diturunkan dari `JadwalKerja`, BUKAN angka baru.
    //
    // Yang dilakukan di sini cuma dua hal, dan keduanya bukan aturan baru:
    // jam keluarnya dikosongkan (tidak ada ketukan pulang yang sah), dan
    // penanda "lupa presensi" dititipkan supaya mesin `rekapDariLaporanPdf()`
    // memakai penanganan yang SUDAH ada - kejadian Pasal 13 ayat (2) dihitung,
    // jam masuk cuma dipercaya kalau jatuh sebelum jam pulang wajib. Persis
    // yang dilakukan jalur PDF untuk pola yang sama ("masuk 19:46, pulang
    // 19:47") dan jalur e-Presensi untuk jam keluar 23:59.
    const bukanKetukanPulang =
      keluar !== null &&
      ((masuk !== null && keluar - masuk <= AMBANG_KETUKAN_GANDA_MENIT) || keluar < jamMasukWajibMenit);
    const keluarDipakai = bukanKetukanPulang ? null : keluar;

    const entri = perPegawai.get(nip) ?? { nama, baris: [] };
    entri.baris.push({
      nomor: entri.baris.length + 1,
      halaman: 1,
      tanggalTeks: `${teks(r[iHari])}, ${duaDigit(tgl.tanggal)}-${duaDigit(tgl.bulan)}-${tgl.tahun}`,
      namaHari: teks(r[iHari]) || null,
      tanggal: tgl.tanggal,
      bulan: tgl.bulan,
      tahun: tgl.tahun,
      jamMasukMenit: masuk,
      jamKeluarMenit: keluarDipakai,
      jamMasukTeks: jamTeks(masuk),
      jamKeluarTeks: jamTeks(keluarDipakai),
      lokasiKeluar: null,
      statusTeks: samakanStatus(statusAsli),
      // Berkas ini tidak punya kolom potongan. Yang dititipkan lewat kolom ini
      // HANYA penanda "lupa presensi" - fakta yang sama yang dibaca jalur PDF
      // dari kolom Potongan e-Presensi, cuma sumber petunjuknya berbeda (di
      // sini: ketukan ganda). Angka potongannya sendiri tidak pernah diambil
      // dari sumber manapun.
      potonganTeks: bukanKetukanPulang ? PENANDA_KETUKAN_GANDA : "",
      aktivitas: null,
      // null = "sumber ini tidak punya angka itu". SENGAJA BUKAN kolom "Menit
      // Kerja" berkas: angka di situ = (checkout - checkin) - istirahat, jadi
      // baris satu ketukan bernilai -59, bukan 0. Mesin Gajihub memakai
      // `menitKerja === 0` sebagai penanda tap pulang hilang, dan memberinya
      // -59 akan mematikan penanda itu tanpa suara.
      menitKerja: null,
    });
    if (!entri.nama && nama) entri.nama = nama;
    perPegawai.set(nip, entri);
  }

  if (!adaStatusDikenali && dilewati.length > 0) {
    peringatan.push(
      `Kolom status (tepat sesudah kolom "Hari") kosong di semua baris - kemungkinan susunan kolom berkasnya berbeda dari yang diharapkan.`
    );
  }

  const laporan: LaporanPresensiPdf[] = [];
  for (const [nip, { nama, baris }] of perPegawai) {
    // Periode = bulan yang paling banyak muncul. Satu berkas boleh memuat
    // beberapa hari dari bulan lain (baris tepi), dan yang minoritas TIDAK
    // dibuang di sini - `rekapDariLaporanPdf()` yang menentukan cakupannya.
    const hitung = new Map<string, number>();
    for (const b of baris) hitung.set(`${b.bulan}-${b.tahun}`, (hitung.get(`${b.bulan}-${b.tahun}`) ?? 0) + 1);
    const [kunci] = [...hitung.entries()].sort((a, b) => b[1] - a[1])[0];
    const [bulan, tahun] = kunci.split("-").map(Number);

    laporan.push({
      nip,
      nama: nama || null,
      jabatan: null,
      periodeBulan: bulan,
      periodeTahun: tahun,
      ringkasanSumber: RINGKASAN_KOSONG,
      baris,
      halamanMulai: 1,
      peringatan: [],
    });
  }

  return { laporan, dilewati, peringatan };
}
