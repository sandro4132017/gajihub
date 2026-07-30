import { describe, it, expect } from "vitest";
import { parsePdfPresensi, type HalamanPdf, type ItemTeksPdf } from "../presensiPdf";

/**
 * Koordinat di file ini DISALIN DARI FILE ASLI, bukan dikarang:
 * "rekap-presensi-000000008740-6-2026.pdf" dan
 * "gadis rekap-presensi-000000008740-5-2026.pdf" (export "Laporan Detail
 * Presensi Harian" e-Presensi). Kalau layout PDF-nya berubah, test ini yang
 * jatuh duluan.
 *
 * Perhatikan kolom di halaman Mei berada di x yang BERBEDA dari Juni
 * (Status di x353 vs x362, Aktivitas di x514 vs x561) - itu memang terjadi di
 * file aslinya, dan justru itu alasan batas kolom dibaca ulang tiap halaman.
 */

const it_ = (teks: string, x: number, y: number, lebar: number): ItemTeksPdf => ({ teks, x, y, lebar });

/** Header tabel halaman Juni (y=328.5 di halaman 1, y=798 di halaman lanjutan). */
function headerJuni(y: number): ItemTeksPdf[] {
  return [
    it_("No.", 50, y, 13),
    it_("Hari, Tanggal", 85, y, 51),
    it_("Jam Masuk", 148, y, 43),
    it_("Jam Keluar", 204, y, 43),
    it_("Lokasi Keluar", 271, y, 52),
    it_("Status", 362, y, 24),
    it_("Potongan", 451, y, 37),
    it_("Aktivitas", 561, y, 33),
  ];
}

/** Blok kepala laporan halaman pertama (Informasi Pegawai + Summary). */
const KEPALA_JUNI: ItemTeksPdf[] = [
  it_("LAPORAN DETAIL PRESENSI HARIAN", 188, 743.5, 220),
  it_("Juni 2026", 275, 731, 46),

  it_("Summary Presensi", 353, 701, 72),
  it_("Tidak Hadir", 353, 685, 41),
  it_(": 1", 437, 685, 9),
  it_("Izin", 353, 669.5, 12),
  it_(": 0", 437, 669.5, 9),
  it_("Tugas Belajar", 353, 653.5, 49),
  it_(": 0", 437, 653.5, 9),
  it_("Lembur", 353, 638, 27),
  it_(": 0", 437, 638, 9),
  it_("Tidak Presensi", 353, 622, 53),
  it_(": 0", 437, 622, 9),
  it_("Cuti", 353, 606.5, 14),
  it_(": 1", 437, 606.5, 9),
  it_("Upacara Bendera", 353, 590.5, 62),
  it_(": 1", 437, 590.5, 9),
  it_("Dinas Keluar", 353, 575, 45),
  it_(": 11", 437, 575, 14),
  it_("WFO", 353, 559, 18),
  it_(": 5", 437, 559, 9),
  it_("Diklat", 353, 543.5, 20),
  it_(": 0", 437, 543.5, 9),
  it_("WFH", 353, 527.5, 18),
  it_(": 3", 437, 527.5, 9),
  it_("WFA", 353, 511.5, 17),
  it_(": 0", 437, 511.5, 9),

  it_("Informasi Pegawai", 36, 635, 70),
  it_("NIP", 36, 619, 13),
  it_(":", 133, 619, 2),
  it_("199612052018122001", 157, 619, 80),
  it_("Nama Pegawai", 36, 603.5, 54),
  it_(":", 133, 603.5, 2),
  it_("GADIS SUKMA DEWA", 157, 603.5, 82),
  // Jabatan: NILAINYA turun dua baris - label & nilai tidak sejajar y.
  it_("Analis Pengelolaan Keuangan APBN", 157, 587.5, 131),
  it_("Jabatan", 36, 582.5, 28),
  it_(":", 133, 582.5, 2),
  it_("Ahli Pertama", 157, 578, 46),

  // Blok kiri & kanan yang y-nya nyaris sejajar - jebakan buat parser.
  it_("Summary Tunjangan Kinerja", 36, 481, 108),
  it_("Tunjangan Kotor", 36, 433.5, 59),
  it_(":", 133, 433.5, 2),
  it_("Rp4,365,393", 157, 433.5, 46),
  it_("Summary Jam Kerja", 353, 446.5, 77),
  it_("Kewajiban Jam Kerja", 353, 430.5, 75),
  it_(": 150", 437, 430.5, 18),
  // "Kekurangan Jam Kerja": LABELNYA yang turun baris, nilainya di tengah.
  it_("Kekurangan Jam", 353, 415, 60),
  it_(": 0", 437, 410, 9),
  it_("Kerja", 353, 405, 18),
];

/** Baris 1 Juni: Dinas Keluar, lengkap, alamat & aktivitas multi-baris. */
const BARIS_1_JUNI: ItemTeksPdf[] = [
  it_(", Makasar,", 272, 307, 37),
  it_("Kota", 272, 297.5, 16),
  it_("Administrasi", 272, 287.5, 43),
  it_("Selasa,", 97, 278, 27),
  it_("Jakarta", 272, 278, 26),
  it_("11:39 -", 551, 278, 25),
  it_("Dinas", 358, 273, 21),
  it_("1", 52, 268, 4),
  it_("30-06-", 97, 268, 23),
  it_("08:16", 160, 268, 20),
  it_("18:39", 216, 268, 20),
  it_("Timur, ,", 272, 268, 27),
  it_("Coaching", 551, 268, 34),
  it_("Keluar", 358, 263, 23),
  it_("2026", 97, 258.5, 18),
  it_("Daerah", 272, 258.5, 26),
  it_("clinic", 551, 258.5, 18),
  it_("Khusus", 272, 248.5, 26),
  it_("Ibukota", 272, 239, 26),
  it_("Jakarta", 272, 229, 26),
];

/** Baris 7 & 8 Juni: SATU tanggal, DUA baris (Cuti + Tidak Hadir otomatis). */
const BARIS_GANDA_JUNI: ItemTeksPdf[] = [
  it_("Senin,", 97, 497.5, 23),
  it_("Cuti -", 358, 497.5, 19),
  it_("7", 52, 488, 4),
  it_("22-06-", 97, 488, 23),
  it_("00:00", 160, 488, 20),
  it_("00:00", 216, 488, 20),
  it_("-", 272, 488, 2),
  it_("Cuti", 358, 488, 15),
  it_("2026", 97, 478, 18),
  it_("Tahunan", 358, 478, 32),

  it_("Senin,", 97, 450.5, 23),
  it_("Tidak", 358, 445.5, 20),
  it_("8", 52, 440.5, 4),
  it_("22-06-", 97, 440.5, 23),
  it_("00:00", 160, 440.5, 20),
  it_("00:00", 216, 440.5, 20),
  it_("-", 272, 440.5, 2),
  it_("Hadir", 358, 435.5, 19),
  it_("2026", 97, 431, 18),
];

/** Baris 19 Juni: WFO dengan dua catatan potongan multi-baris. */
const BARIS_POTONGAN_JUNI: ItemTeksPdf[] = [
  it_("-1.83 | Potongan telat", 427, 773.5, 77),
  it_("presensi 110 menit", 427, 763.5, 68),
  it_("Kamis,", 97, 760.5, 24),
  it_("19", 52, 751, 9),
  it_("04-06-", 97, 751, 23),
  it_("09:20", 160, 751, 20),
  it_("23:59", 216, 751, 20),
  it_("WFO", 358, 751, 19),
  it_("10:44 - Listra", 551, 751, 47),
  it_("-1.17 | Potongan lupa", 427, 748, 77),
  it_("2026", 97, 741, 18),
  it_("presensi", 427, 738, 31),
  it_("1.1666666666666667%", 427, 728.5, 85),
];

/**
 * Halaman pertama seperti aslinya: kepala laporan di atas, header tabel di
 * y=328,5, lalu baris pertama di bawahnya.
 */
const HALAMAN_PERTAMA: HalamanPdf = {
  nomor: 1,
  items: [...KEPALA_JUNI, ...headerJuni(328.5), ...BARIS_1_JUNI],
};

describe("parsePdfPresensi - kepala laporan", () => {
  it("membaca NIP, nama, jabatan multi-baris, dan periode dari judul", () => {
    const hasil = parsePdfPresensi([HALAMAN_PERTAMA]);
    expect(hasil.error).toBeUndefined();
    expect(hasil.laporan).toHaveLength(1);

    const l = hasil.laporan[0];
    expect(l.nip).toBe("199612052018122001");
    expect(l.nama).toBe("GADIS SUKMA DEWA");
    // Label & nilai TIDAK sejajar y di file asli - nilainya dua baris.
    expect(l.jabatan).toBe("Analis Pengelolaan Keuangan APBN Ahli Pertama");
    expect(l.periodeBulan).toBe(6);
    expect(l.periodeTahun).toBe(2026);
    expect(l.peringatan).toEqual([]);
  });

  it("membaca Summary Presensi termasuk label yang turun baris", () => {
    const hasil = parsePdfPresensi([HALAMAN_PERTAMA]);
    const r = hasil.laporan[0].ringkasanSumber;
    expect(r).toMatchObject({
      tidakHadir: 1,
      izin: 0,
      tugasBelajar: 0,
      lembur: 0,
      tidakPresensi: 0,
      cuti: 1,
      upacaraBendera: 1,
      dinasKeluar: 11,
      wfo: 5,
      diklat: 0,
      wfh: 3,
      wfa: 0,
      kewajibanJamKerja: 150,
    });
    // Labelnya terpecah jadi "Kekurangan Jam" + "Kerja" di dua baris berbeda,
    // dengan nilainya di antara keduanya.
    expect(r.kekuranganJamKerja).toBe(0);
  });

  it("tidak tertukar dengan blok kiri yang y-nya nyaris sejajar", () => {
    const hasil = parsePdfPresensi([HALAMAN_PERTAMA]);
    // "Tunjangan Kotor : Rp4,365,393" (y 433,5) cuma berjarak 3pt dari
    // "Kewajiban Jam Kerja : 150" (y 430,5). Kalau tercampur, kewajiban jam
    // kerja jadi salah - dan itu jadi batas hari uang makan.
    expect(hasil.laporan[0].ringkasanSumber.kewajibanJamKerja).toBe(150);
  });
});

describe("parsePdfPresensi - tabel detail", () => {
  it("memetakan tiap sel ke kolom yang benar & menggabungkan teks multi-baris", () => {
    const hasil = parsePdfPresensi([HALAMAN_PERTAMA]);
    const b = hasil.laporan[0].baris;
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({
      nomor: 1,
      namaHari: "Selasa",
      tanggal: 30,
      bulan: 6,
      tahun: 2026,
      jamMasukTeks: "08:16",
      jamKeluarTeks: "18:39",
      statusTeks: "Dinas Keluar",
      potonganTeks: "",
    });
    expect(b[0].jamMasukMenit).toBe(8 * 60 + 16);
    expect(b[0].jamKeluarMenit).toBe(18 * 60 + 39);
    expect(b[0].lokasiKeluar).toContain("Makasar");
  });

  it("memisahkan dua baris pada tanggal yang sama, tidak menggabungkannya", () => {
    const hasil = parsePdfPresensi([
      HALAMAN_PERTAMA,
      { nomor: 2, items: [...headerJuni(798), ...BARIS_GANDA_JUNI] },
    ]);
    const b = hasil.laporan[0].baris;
    expect(b).toHaveLength(3); // 1 baris di halaman 1 + 2 baris di halaman 2
    expect(b[1]).toMatchObject({ nomor: 7, tanggal: 22, statusTeks: "Cuti - Cuti Tahunan" });
    expect(b[2]).toMatchObject({ nomor: 8, tanggal: 22, statusTeks: "Tidak Hadir" });
    // 00:00 = penanda tidak ada presensi, bukan presensi tengah malam.
    expect(b[1].jamMasukMenit).toBeNull();
    expect(b[1].jamMasukTeks).toBe("00:00");
  });

  it("membawa teks kolom Potongan apa adanya tanpa menafsirkan angkanya", () => {
    const hasil = parsePdfPresensi([
      HALAMAN_PERTAMA,
      { nomor: 2, items: [...headerJuni(798), ...BARIS_POTONGAN_JUNI] },
    ]);
    const b = hasil.laporan[0].baris[1];
    expect(b.statusTeks).toBe("WFO");
    expect(b.potonganTeks).toContain("Potongan telat");
    expect(b.potonganTeks).toContain("Potongan lupa");
    // Teks aktivitas di kolom paling kanan tidak boleh tersedot ke Potongan.
    expect(b.aktivitas).toBe("10:44 - Listra");
    expect(b.potonganTeks).not.toContain("Listra");
  });

  it("membiarkan sel Jam Keluar KOSONG ketika pegawai tidak presensi pulang", () => {
    // Baris 9 file Mei - pegawai presensi masuk 06:05 lalu tidak presensi
    // pulang sama sekali. Kolom x di halaman Mei berbeda dari Juni.
    const headerMei: ItemTeksPdf[] = [
      it_("No.", 50, 798, 13),
      it_("Hari, Tanggal", 85, 798, 51),
      it_("Jam Masuk", 148, 798, 43),
      it_("Jam Keluar", 204, 798, 43),
      it_("Lokasi Keluar", 267, 798, 53),
      it_("Status", 353, 798, 24),
      it_("Potongan", 423, 798, 37),
      it_("Aktivitas", 514, 798, 33),
    ];
    const baris9: ItemTeksPdf[] = [
      it_("Kamis,", 97, 776.5, 24),
      it_("Dinas", 351, 771.5, 21),
      it_("9", 52, 766.5, 4),
      it_("14-05-", 97, 766.5, 23),
      it_("06:05", 160, 766.5, 20),
      it_("Keluar", 351, 762, 23),
      it_("2026", 97, 757, 18),
    ];
    const hasil = parsePdfPresensi([HALAMAN_PERTAMA, { nomor: 3, items: [...headerMei, ...baris9] }]);
    const b = hasil.laporan[0].baris[1];
    expect(b.jamMasukTeks).toBe("06:05");
    // Inti dari pemakaian koordinat: 06:05 TIDAK boleh bergeser jadi jam keluar.
    expect(b.jamKeluarTeks).toBeNull();
    expect(b.jamKeluarMenit).toBeNull();
    expect(b.statusTeks).toBe("Dinas Keluar");
  });
});

describe("parsePdfPresensi - banyak pegawai dalam satu file", () => {
  it("memulai laporan baru tiap ketemu blok Informasi Pegawai", () => {
    const kepalaKedua = KEPALA_JUNI.map((i) =>
      i.teks === "199612052018122001" ? it_("197303072005011001", i.x, i.y, i.lebar) : i
    );
    const hasil = parsePdfPresensi([
      HALAMAN_PERTAMA,
      { nomor: 2, items: [...headerJuni(798), ...BARIS_GANDA_JUNI] },
      { nomor: 3, items: [...kepalaKedua, ...headerJuni(328.5), ...BARIS_1_JUNI] },
    ]);
    expect(hasil.error).toBeUndefined();
    expect(hasil.laporan).toHaveLength(2);
    expect(hasil.laporan[0].nip).toBe("199612052018122001");
    // Halaman 2 adalah lanjutan pegawai pertama, bukan pegawai baru.
    expect(hasil.laporan[0].baris).toHaveLength(3);
    expect(hasil.laporan[1].nip).toBe("197303072005011001");
    expect(hasil.laporan[1].baris).toHaveLength(1);
  });

  it("menolak file yang tabelnya muncul sebelum identitas pegawai", () => {
    const hasil = parsePdfPresensi([{ nomor: 1, items: [...headerJuni(798), ...BARIS_1_JUNI] }]);
    expect(hasil.error).toContain("Informasi Pegawai");
  });

  it("menolak PDF tanpa teks sama sekali (hasil scan)", () => {
    const hasil = parsePdfPresensi([{ nomor: 1, items: [] }]);
    expect(hasil.error).toContain("Informasi Pegawai");
    expect(hasil.laporan).toEqual([]);
  });

  it("melaporkan nomor baris yang tidak terbaca, bukan diam-diam kurang", () => {
    // Nomor 1 ada, nomor 3 ada, nomor 2 hilang -> harus jadi peringatan,
    // supaya satu hari yang gagal dibaca tidak lolos tanpa jejak.
    const barisTiga = BARIS_1_JUNI.map((i) =>
      it_(i.teks === "1" && i.x === 52 ? "3" : i.teks, i.x, i.y - 120, i.lebar)
    );
    const hasil = parsePdfPresensi([
      { nomor: 1, items: [...KEPALA_JUNI, ...headerJuni(328.5), ...BARIS_1_JUNI, ...barisTiga] },
    ]);
    expect(hasil.laporan[0].baris.map((b) => b.nomor)).toEqual([1, 3]);
    expect(hasil.laporan[0].peringatan.join(" ")).toContain("Nomor baris 2");
  });
});
