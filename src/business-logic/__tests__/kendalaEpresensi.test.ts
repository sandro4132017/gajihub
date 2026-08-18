import { describe, it, expect } from "vitest";
import {
  indeksKendala,
  tanggalDikecualikan,
  tanggalKendalaUntukSatker,
  deteksiTanggalJanggal,
  AMBANG_MINIMUM_PERSEN,
  type StatistikTanggal,
} from "../kendalaEpresensi";
import { rekapDariLaporanPdf, JADWAL_KERJA_DEFAULT } from "../presensiPdfKeRekap";
import type { BarisPresensiPdf, LaporanPresensiPdf, RingkasanSumberPdf } from "../presensiPdf";

const RINGKASAN_KOSONG: RingkasanSumberPdf = {
  tidakHadir: null, izin: null, tugasBelajar: null, lembur: null, tidakPresensi: null,
  cuti: null, upacaraBendera: null, dinasKeluar: null, wfo: null, diklat: null,
  wfh: null, wfa: null, kewajibanJamKerja: null, kekuranganJamKerja: null,
};

function jam(teks: string | null): number | null {
  if (!teks) return null;
  const [h, m] = teks.split(":").map(Number);
  return h * 60 + m;
}

let urutan = 0;
function baris(
  tanggalTeks: string,
  namaHari: string,
  jamMasuk: string | null,
  jamKeluar: string | null,
  statusTeks: string,
  potonganTeks = ""
): BarisPresensiPdf {
  const [dd, mm, yyyy] = tanggalTeks.split("-").map(Number);
  return {
    nomor: ++urutan,
    halaman: 1,
    tanggalTeks: `${namaHari}, ${tanggalTeks}`,
    namaHari,
    tanggal: dd,
    bulan: mm,
    tahun: yyyy,
    jamMasukMenit: jam(jamMasuk),
    jamKeluarMenit: jam(jamKeluar),
    jamMasukTeks: jamMasuk,
    jamKeluarTeks: jamKeluar,
    lokasiKeluar: null,
    statusTeks,
    potonganTeks,
    aktivitas: null,
  };
}

function laporan(isi: BarisPresensiPdf[]): LaporanPresensiPdf {
  return {
    nip: "198111302025211042",
    nama: "ACEP SJAIFULLOH R",
    jabatan: null,
    periodeBulan: isi[0]?.bulan ?? 7,
    periodeTahun: isi[0]?.tahun ?? 2026,
    ringkasanSumber: RINGKASAN_KOSONG,
    baris: isi,
    halamanMulai: 1,
    peringatan: [],
  };
}

describe("indeks & cakupan penanda kendala", () => {
  it("penanda se-kementerian berlaku untuk semua satuan kerja", () => {
    const idx = indeksKendala([{ tanggalIso: "2026-07-15", satuanKerja: null }]);
    expect(tanggalDikecualikan("2026-07-15", "Biro Umum", idx)).toBe(true);
    expect(tanggalDikecualikan("2026-07-15", "Pusdatik", idx)).toBe(true);
    expect(tanggalDikecualikan("2026-07-15", null, idx)).toBe(true);
  });

  it("penanda per satker TIDAK menyentuh satker lain", () => {
    const idx = indeksKendala([{ tanggalIso: "2026-07-15", satuanKerja: "Biro Umum" }]);
    expect(tanggalDikecualikan("2026-07-15", "Biro Umum", idx)).toBe(true);
    expect(tanggalDikecualikan("2026-07-15", "Pusdatik", idx)).toBe(false);
    // Pegawai tanpa satuan kerja tidak boleh ikut kecipratan penanda unit lain.
    expect(tanggalDikecualikan("2026-07-15", null, idx)).toBe(false);
  });

  it("tanggal lain tidak ikut dikecualikan", () => {
    const idx = indeksKendala([{ tanggalIso: "2026-07-15", satuanKerja: null }]);
    expect(tanggalDikecualikan("2026-07-16", "Biro Umum", idx)).toBe(false);
  });

  it("himpunan per satker menggabungkan penanda se-kementerian dan penanda unitnya", () => {
    const idx = indeksKendala([
      { tanggalIso: "2026-07-15", satuanKerja: null },
      { tanggalIso: "2026-07-16", satuanKerja: "Biro Umum" },
      { tanggalIso: "2026-07-17", satuanKerja: "Pusdatik" },
    ]);
    const biroUmum = tanggalKendalaUntukSatker("Biro Umum", idx);
    expect([...biroUmum].sort()).toEqual(["2026-07-15", "2026-07-16"]);
    expect([...tanggalKendalaUntukSatker(null, idx)]).toEqual(["2026-07-15"]);
  });
});

describe("deteksi tanggal janggal", () => {
  /**
   * Bentuk angkanya DISALIN dari data nyata Juli 2026 se-kementerian
   * (presensi_harian, status kerja saja): hari biasa 1,3-2,5%, hari JUMAT
   * 3,5-5,1%, dan 15-16 Juli 13,6% & 14,1% saat web e-Presensi bermasalah.
   */
  const JULI_2026: StatistikTanggal[] = [
    { tanggalIso: "2026-07-01", hariKerja: 4080, kejadian: 73 },
    { tanggalIso: "2026-07-02", hariKerja: 4120, kejadian: 69 },
    { tanggalIso: "2026-07-03", hariKerja: 4336, kejadian: 208 }, // Jumat 4,8%
    { tanggalIso: "2026-07-06", hariKerja: 4200, kejadian: 57 },
    { tanggalIso: "2026-07-07", hariKerja: 4097, kejadian: 62 },
    { tanggalIso: "2026-07-08", hariKerja: 4158, kejadian: 63 },
    { tanggalIso: "2026-07-09", hariKerja: 4020, kejadian: 93 },
    { tanggalIso: "2026-07-10", hariKerja: 4418, kejadian: 218 }, // Jumat 4,9%
    { tanggalIso: "2026-07-13", hariKerja: 4311, kejadian: 55 },
    { tanggalIso: "2026-07-14", hariKerja: 4249, kejadian: 105 },
    { tanggalIso: "2026-07-15", hariKerja: 4237, kejadian: 576 }, // 13,6%
    { tanggalIso: "2026-07-16", hariKerja: 4223, kejadian: 597 }, // 14,1%
    { tanggalIso: "2026-07-17", hariKerja: 4506, kejadian: 159 },
    { tanggalIso: "2026-07-20", hariKerja: 4380, kejadian: 72 },
    { tanggalIso: "2026-07-21", hariKerja: 4338, kejadian: 71 },
    { tanggalIso: "2026-07-22", hariKerja: 4163, kejadian: 75 },
    { tanggalIso: "2026-07-23", hariKerja: 4046, kejadian: 69 },
    { tanggalIso: "2026-07-24", hariKerja: 4385, kejadian: 197 }, // Jumat 4,5%
    { tanggalIso: "2026-07-27", hariKerja: 4290, kejadian: 68 },
    { tanggalIso: "2026-07-28", hariKerja: 4163, kejadian: 58 },
    { tanggalIso: "2026-07-29", hariKerja: 3961, kejadian: 88 },
    { tanggalIso: "2026-07-30", hariKerja: 4001, kejadian: 64 },
    { tanggalIso: "2026-07-31", hariKerja: 4333, kejadian: 223 }, // Jumat 5,1%
  ];

  it("menemukan PERSIS dua hari yang memang bermasalah", () => {
    const hasil = deteksiTanggalJanggal(JULI_2026);
    expect(hasil.map((h) => h.tanggalIso)).toEqual(["2026-07-16", "2026-07-15"]);
  });

  it("hari JUMAT tidak ikut tertandai - itu perilaku, bukan kerusakan", () => {
    const hasil = deteksiTanggalJanggal(JULI_2026).map((h) => h.tanggalIso);
    for (const jumat of ["2026-07-03", "2026-07-10", "2026-07-24", "2026-07-31"]) {
      expect(hasil).not.toContain(jumat);
    }
  });

  it("memakai MEDIAN, bukan rata-rata - beberapa hari rusak tidak boleh saling menyembunyikan", () => {
    // Kalau pembandingnya rata-rata, tujuh hari rusak akan mengangkat
    // pembandingnya sendiri sampai tidak ada yang lolos ambang kelipatan.
    const banyakRusak: StatistikTanggal[] = [
      ...Array.from({ length: 10 }, (_, i) => ({
        tanggalIso: `2026-08-${String(i + 1).padStart(2, "0")}`,
        hariKerja: 1000,
        kejadian: 15,
      })),
      ...Array.from({ length: 7 }, (_, i) => ({
        tanggalIso: `2026-08-${String(i + 11).padStart(2, "0")}`,
        hariKerja: 1000,
        kejadian: 300,
      })),
    ];
    const hasil = deteksiTanggalJanggal(banyakRusak);
    expect(hasil).toHaveLength(7);
  });

  it("tanggal dengan sampel terlalu kecil diabaikan", () => {
    const hasil = deteksiTanggalJanggal([
      { tanggalIso: "2026-07-15", hariKerja: 4, kejadian: 4 },
      { tanggalIso: "2026-07-16", hariKerja: 4000, kejadian: 40 },
    ]);
    expect(hasil).toHaveLength(0);
  });

  it("kenaikan kecil di atas nol tidak ditandai kalau belum melewati ambang mutlak", () => {
    // Median 0 -> kelipatan tak hingga, tapi 2% masih jauh di bawah ambang.
    const hasil = deteksiTanggalJanggal([
      { tanggalIso: "2026-07-14", hariKerja: 1000, kejadian: 0 },
      { tanggalIso: "2026-07-15", hariKerja: 1000, kejadian: 20 },
      { tanggalIso: "2026-07-16", hariKerja: 1000, kejadian: 0 },
    ]);
    expect(hasil).toHaveLength(0);
    expect(20 / 10).toBeLessThan(AMBANG_MINIMUM_PERSEN);
  });

  it("daftar kosong tidak melempar error", () => {
    expect(deteksiTanggalJanggal([])).toEqual([]);
  });
});

describe("pengecualian kendala di dalam rekap presensi", () => {
  // Hari nyata Acep Sjaifulloh, 15 Juli 2026: masuk 06:51 (jauh lebih pagi
  // dari jam wajib), lalu jam keluar diisi otomatis 23:59 karena absen
  // pulangnya tidak pernah masuk saat web e-Presensi bermasalah.
  const HARI_ACEP = [
    baris("14-07-2026", "Selasa", "06:43", "16:10", "WFO"),
    baris("15-07-2026", "Rabu", "06:51", "23:59", "WFO", "Lupa presensi pulang"),
    baris("20-07-2026", "Senin", "06:25", "16:28", "WFO"),
  ];

  it("tanpa penanda, hari 23:59 tetap kena Pasal 13 ayat (2)", () => {
    const hasil = rekapDariLaporanPdf(laporan(HARI_ACEP));
    expect(hasil.rekap.jumlahTidakPresensi).toBe(1);
    expect(hasil.kejadianDikecualikanKendala).toBe(0);
  });

  it("dengan penanda, potongannya dibatalkan dan pembatalannya tercatat", () => {
    const hasil = rekapDariLaporanPdf(laporan(HARI_ACEP), JADWAL_KERJA_DEFAULT, new Set(["2026-07-15"]));
    expect(hasil.rekap.jumlahTidakPresensi).toBe(0);
    expect(hasil.kejadianDikecualikanKendala).toBe(1);
    // Pembatalan harus KELIHATAN, bukan mengubah angka diam-diam.
    expect(hasil.catatan.join(" ")).toContain("2026-07-15");
    expect(hasil.catatan.join(" ")).toContain("Pasal 10 ayat (2)");
    const hari15 = hasil.hari.find((h) => h.tanggalIso === "2026-07-15");
    expect(hari15?.kejadianDikecualikanKendala).toBe(1);
    expect(hari15?.kejadianTidakPresensi).toBe(0);
  });

  it("penanda di tanggal LAIN tidak menyentuh hari yang bermasalah", () => {
    const hasil = rekapDariLaporanPdf(laporan(HARI_ACEP), JADWAL_KERJA_DEFAULT, new Set(["2026-07-16"]));
    expect(hasil.rekap.jumlahTidakPresensi).toBe(1);
    expect(hasil.kejadianDikecualikanKendala).toBe(0);
  });

  it("KETERLAMBATAN di tanggal kendala TETAP dihitung - yang gagal cuma sisi presensinya", () => {
    // Masuk 09:20 = 110 menit lewat jam wajib, dikurangi toleransi 60 = 50.
    const telat = [baris("15-07-2026", "Rabu", "09:20", "23:59", "WFO", "Lupa presensi pulang")];
    const hasil = rekapDariLaporanPdf(laporan(telat), JADWAL_KERJA_DEFAULT, new Set(["2026-07-15"]));
    expect(hasil.rekap.jumlahTidakPresensi).toBe(0);
    expect(hasil.rekap.totalMenitTerlambat).toBe(50);
  });

  it("KETIDAKHADIRAN di tanggal kendala TETAP dihitung - sistem rusak bukan berarti orangnya masuk", () => {
    const alpha = [baris("15-07-2026", "Rabu", null, null, "Tidak Hadir")];
    const hasil = rekapDariLaporanPdf(laporan(alpha), JADWAL_KERJA_DEFAULT, new Set(["2026-07-15"]));
    expect(hasil.rekap.jumlahHariAlpha).toBe(1);
  });
});

describe("koreksi jam oleh petugas absensi", () => {
  // 15 Juli 2026: e-Presensi error, jam keluar diisi otomatis 23:59.
  const HARI = [baris("15-07-2026", "Rabu", "06:51", "23:59", "WFO", "Lupa presensi pulang")];
  const KENDALA = new Set(["2026-07-15"]);

  it("koreksi jam pulang membatalkan potongan ayat (2) walau tanggalnya belum ditandai", () => {
    // Petugas sudah memverifikasi bukti pegawai; penanda "lupa" dari sumber
    // tidak berlaku lagi. Ini yang membuat koreksi jam ada gunanya.
    const koreksi = new Map([["2026-07-15", { jamMasukMenit: null, jamKeluarMenit: 16 * 60 }]]);
    const hasil = rekapDariLaporanPdf(laporan(HARI), JADWAL_KERJA_DEFAULT, new Set(), koreksi);
    expect(hasil.rekap.jumlahTidakPresensi).toBe(0);
    expect(hasil.rekap.totalMenitPulangCepat).toBe(0);
  });

  it("jam pulang hasil koreksi DIPERCAYA untuk menghitung pulang cepat", () => {
    // Dikoreksi pulang 15:00 - Rabu jam pulang wajib 16:00, jadi 60 menit
    // pulang cepat. Tanpa koreksi, 23:59 tidak dipercaya dan hasilnya 0.
    const koreksi = new Map([["2026-07-15", { jamMasukMenit: null, jamKeluarMenit: 15 * 60 }]]);
    const hasil = rekapDariLaporanPdf(laporan(HARI), JADWAL_KERJA_DEFAULT, KENDALA, koreksi);
    expect(hasil.rekap.totalMenitPulangCepat).toBe(60);
  });

  it("koreksi jam MASUK menggantikan ketukan sore yang bikin telat ratusan menit", () => {
    // Kasus nyata 15 Juli 2026: masuk tercatat 19:32 -> telat 662 menit,
    // padahal orangnya lupa absen pagi. Petugas mengoreksi jadi 07:20.
    const sore = [baris("15-07-2026", "Rabu", "19:32", "23:59", "WFO")];
    const tanpaKoreksi = rekapDariLaporanPdf(laporan(sore), JADWAL_KERJA_DEFAULT, KENDALA);
    expect(tanpaKoreksi.rekap.totalMenitTerlambat).toBe(662);

    const koreksi = new Map([["2026-07-15", { jamMasukMenit: 7 * 60 + 20, jamKeluarMenit: 16 * 60 }]]);
    const hasil = rekapDariLaporanPdf(laporan(sore), JADWAL_KERJA_DEFAULT, KENDALA, koreksi);
    expect(hasil.rekap.totalMenitTerlambat).toBe(0);
    expect(hasil.rekap.jumlahTidakPresensi).toBe(0);
  });

  it("koreksi TIDAK menghapus keterlambatan yang memang nyata", () => {
    // Dikoreksi masuk 09:00 = 90 menit lewat, dikurangi toleransi 60 = 30.
    // Petugas memperbaiki jam, bukan memutihkan pelanggaran.
    const koreksi = new Map([["2026-07-15", { jamMasukMenit: 9 * 60, jamKeluarMenit: 16 * 60 }]]);
    const hasil = rekapDariLaporanPdf(laporan(HARI), JADWAL_KERJA_DEFAULT, KENDALA, koreksi);
    expect(hasil.rekap.totalMenitTerlambat).toBe(30);
  });

  it("kolom yang dibiarkan kosong memakai jam asli e-Presensi", () => {
    // Cuma jam masuk yang dikoreksi; jam pulang tetap 23:59 dan tetap tidak
    // dipercaya sebagai jam pulang sungguhan (pulang cepat 0, bukan negatif).
    const koreksi = new Map([["2026-07-15", { jamMasukMenit: 7 * 60, jamKeluarMenit: null }]]);
    const hasil = rekapDariLaporanPdf(laporan(HARI), JADWAL_KERJA_DEFAULT, KENDALA, koreksi);
    expect(hasil.rekap.totalMenitTerlambat).toBe(0);
    expect(hasil.rekap.totalMenitPulangCepat).toBe(0);
  });

  it("koreksi dilaporkan sebagai catatan - angka manusia tidak menyamar jadi angka e-Presensi", () => {
    const koreksi = new Map([["2026-07-15", { jamMasukMenit: null, jamKeluarMenit: 16 * 60 }]]);
    const hasil = rekapDariLaporanPdf(laporan(HARI), JADWAL_KERJA_DEFAULT, KENDALA, koreksi);
    expect(hasil.tanggalDikoreksiManual).toEqual(["2026-07-15"]);
    expect(hasil.catatan.join(" ")).toContain("DIKOREKSI MANUAL");
  });

  it("koreksi di tanggal lain tidak menyentuh hari ini", () => {
    const koreksi = new Map([["2026-07-16", { jamMasukMenit: 7 * 60, jamKeluarMenit: 16 * 60 }]]);
    const hasil = rekapDariLaporanPdf(laporan(HARI), JADWAL_KERJA_DEFAULT, new Set(), koreksi);
    expect(hasil.rekap.jumlahTidakPresensi).toBe(1);
    expect(hasil.tanggalDikoreksiManual).toEqual([]);
  });
});
