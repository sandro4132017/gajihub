import { describe, it, expect } from "vitest";
import {
  parseRekapPredikatKinerja,
  parsePeriodeRekap,
  normalisasiPredikat,
} from "../rekapPredikatKinerja";

/**
 * Bentuk & isi disalin dari file ASLI "Rekap Penilaian (45).xlsx" (export
 * e-Kinerja BKN, Biro Keuangan dan BMN, periode 6/2026) - bukan karangan,
 * supaya kalau format file berubah test ini yang jatuh duluan.
 */
const MATRIKS_ASLI: unknown[][] = [
  ["3013 - Kementerian Ketenagakerjaan", null, null, null, null, null, null],
  ["Subbagian Tata Usaha", null, null, null, null, null, null],
  ["Periode Bulanan 6 Tahun 2026", null, null, null, null, null, null],
  [null, null, null, null, null, null, null],
  ["No", "NIP", "Nama", "Jabatan", "Rating Hasil Kinerja", "Rating Perilaku Kerja", "Predikat Kinerja Periodik"],
  [1, "200210202025052001", "YUSFRIDA RIZKI PUTRI", "Arsiparis Terampil", "Sesuai Ekspektasi", "Sesuai Ekspektasi", "Baik"],
  [2, "198810012011012009", "KHARINA OLIVIA", "Arsiparis Ahli Muda", "Sesuai Ekspektasi", "Sesuai Ekspektasi", "Baik"],
  [3, "198406162015032004", "WANTI LENA SARI", "Arsiparis Ahli Pertama", "Diatas Ekspektasi", "Diatas Ekspektasi", "Sangat Baik"],
];

describe("parseRekapPredikatKinerja - file asli e-Kinerja BKN", () => {
  it("membaca periode, instansi, dan unit penilaian dari kepala file", () => {
    const hasil = parseRekapPredikatKinerja(MATRIKS_ASLI);
    expect(hasil.error).toBeUndefined();
    expect(hasil.periodeBulan).toBe(6);
    expect(hasil.periodeTahun).toBe(2026);
    expect(hasil.instansi).toBe("3013 - Kementerian Ketenagakerjaan");
    expect(hasil.unitPenilaian).toBe("Subbagian Tata Usaha");
  });

  it("memetakan tiap baris ke predikat + nilai persen sesuai Kepsekjen 82/2025", () => {
    const hasil = parseRekapPredikatKinerja(MATRIKS_ASLI);
    expect(hasil.baris).toHaveLength(3);
    expect(hasil.dilewati).toEqual([]);

    expect(hasil.baris[0]).toMatchObject({
      nip: "200210202025052001",
      nama: "YUSFRIDA RIZKI PUTRI",
      jabatan: "Arsiparis Terampil",
      ratingHasilKinerja: "Sesuai Ekspektasi",
      predikatLabel: "Baik",
      predikat: "BAIK",
      nilaiAngka: 100,
    });
    expect(hasil.baris[2]).toMatchObject({
      nip: "198406162015032004",
      predikatLabel: "Sangat Baik",
      predikat: "SANGAT_BAIK",
      nilaiAngka: 100,
    });
  });

  it("menemukan baris header walau jumlah baris kepala berbeda", () => {
    const denganKepalaTambahan = [
      ["3013 - Kementerian Ketenagakerjaan"],
      ["Sekretariat Jenderal"],
      ["Subbagian Tata Usaha"],
      ["Periode Bulanan 12 Tahun 2025"],
      [],
      [],
      ...MATRIKS_ASLI.slice(4),
    ];
    const hasil = parseRekapPredikatKinerja(denganKepalaTambahan);
    expect(hasil.error).toBeUndefined();
    expect(hasil.periodeBulan).toBe(12);
    expect(hasil.periodeTahun).toBe(2025);
    expect(hasil.baris).toHaveLength(3);
  });
});

describe("parseRekapPredikatKinerja - baris & file yang ditolak", () => {
  it("melewati baris dengan predikat yang tidak dikenali, TIDAK menebak", () => {
    const matriks = [
      ...MATRIKS_ASLI,
      [4, "199999999999999999", "SI ANU", "Analis", "Sesuai Ekspektasi", "Sesuai Ekspektasi", "Istimewa"],
    ];
    const hasil = parseRekapPredikatKinerja(matriks);
    expect(hasil.baris).toHaveLength(3);
    expect(hasil.dilewati).toHaveLength(1);
    expect(hasil.dilewati[0].nip).toBe("199999999999999999");
    expect(hasil.dilewati[0].alasan).toContain('"Istimewa" tidak dikenali');
    // nomor baris = nomor baris Excel yang dilihat user
    expect(hasil.dilewati[0].nomorBaris).toBe(9);
  });

  it("melewati baris yang NIP atau predikatnya kosong", () => {
    const matriks = [
      ...MATRIKS_ASLI,
      [4, null, "TANPA NIP", "Analis", null, null, "Baik"],
      [5, "197611232006041015", "TANPA PREDIKAT", "Analis", null, null, null],
    ];
    const hasil = parseRekapPredikatKinerja(matriks);
    expect(hasil.baris).toHaveLength(3);
    expect(hasil.dilewati.map((d) => d.alasan)).toEqual([
      "kolom NIP kosong",
      "kolom Predikat Kinerja Periodik kosong",
    ]);
  });

  it("baris benar-benar kosong dilewati diam-diam, tidak jadi laporan", () => {
    const hasil = parseRekapPredikatKinerja([...MATRIKS_ASLI, [null, null, null], []]);
    expect(hasil.baris).toHaveLength(3);
    expect(hasil.dilewati).toEqual([]);
  });

  it("menolak file yang bukan rekap penilaian (tanpa kolom NIP/Predikat)", () => {
    const hasil = parseRekapPredikatKinerja([["Nama", "Gaji"], ["Budi", 1000]]);
    expect(hasil.error).toContain("Baris header tidak ketemu");
    expect(hasil.baris).toEqual([]);
  });

  it("menolak rekap TAHUNAN dengan pesan yang menjelaskan jalan keluarnya", () => {
    const matriks = [
      ["3013 - Kementerian Ketenagakerjaan"],
      ["Subbagian Tata Usaha"],
      ["Periode Tahunan 2026"],
      [],
      ...MATRIKS_ASLI.slice(4),
    ];
    const hasil = parseRekapPredikatKinerja(matriks);
    expect(hasil.error).toContain("rekap TAHUNAN");
    expect(hasil.error).toContain("BULANAN");
    expect(hasil.baris).toEqual([]);
  });

  it("menolak file tanpa baris periode", () => {
    const matriks = [["3013 - Kementerian Ketenagakerjaan"], [], ...MATRIKS_ASLI.slice(4)];
    const hasil = parseRekapPredikatKinerja(matriks);
    expect(hasil.error).toContain("Periode tidak bisa dibaca");
  });
});

describe("parsePeriodeRekap", () => {
  it("membaca bentuk baku dari e-Kinerja", () => {
    expect(parsePeriodeRekap("Periode Bulanan 6 Tahun 2026")).toEqual({ ok: true, bulan: 6, tahun: 2026 });
    expect(parsePeriodeRekap("  periode   bulanan   11   tahun   2027 ")).toEqual({ ok: true, bulan: 11, tahun: 2027 });
  });

  it("menolak bulan di luar 1-12", () => {
    const hasil = parsePeriodeRekap("Periode Bulanan 13 Tahun 2026");
    expect(hasil.ok).toBe(false);
  });
});

describe("normalisasiPredikat", () => {
  it("mengenali semua label resmi tanpa peduli huruf besar/kecil & spasi ganda", () => {
    expect(normalisasiPredikat("Sangat Baik")).toBe("SANGAT_BAIK");
    expect(normalisasiPredikat("  baik ")).toBe("BAIK");
    expect(normalisasiPredikat("BUTUH  PERBAIKAN")).toBe("PERLU_PERBAIKAN");
    expect(normalisasiPredikat("Perlu Perbaikan")).toBe("PERLU_PERBAIKAN");
    expect(normalisasiPredikat("Kurang")).toBe("KURANG");
    expect(normalisasiPredikat("Sangat Kurang")).toBe("SANGAT_KURANG");
  });

  it("TIDAK mencocokkan sebagian - 'Sangat Baik' bukan 'Baik'", () => {
    // Kalau pakai includes(), "Sangat Baik" bisa salah kena "BAIK" duluan.
    expect(normalisasiPredikat("Sangat Baik")).not.toBe("BAIK");
    expect(normalisasiPredikat("Sangat Kurang")).not.toBe("KURANG");
  });

  it("mengembalikan null buat label asing, kosong, atau non-teks", () => {
    expect(normalisasiPredikat("Istimewa")).toBeNull();
    expect(normalisasiPredikat("")).toBeNull();
    expect(normalisasiPredikat(null)).toBeNull();
    expect(normalisasiPredikat(123)).toBeNull();
  });
});
