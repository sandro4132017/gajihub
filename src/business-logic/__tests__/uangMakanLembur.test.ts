import { describe, it, expect } from "vitest";
import { hitungUangMakan } from "../uangMakan";
import { hitungUangLembur, hitungHariBerhakMakanLembur } from "../uangLembur";
import {
  TARIF_UANG_MAKAN_PER_HARI,
  TARIF_UANG_LEMBUR_PER_JAM,
  TARIF_UANG_MAKAN_LEMBUR_PER_HARI,
  golonganRomawi,
} from "../tarifSbm";

const dasar = { pegawaiId: "p1", periodeBulan: 7, periodeTahun: 2026 };

// ---------------------------------------------------------------------------
// Tarif resmi SBM 2026 halaman -13- (item 22.1, 23.1, 23.2)
// ---------------------------------------------------------------------------
describe("tarifSbm - angka resmi SBM 2026", () => {
  it("uang makan: Gol I & II satu tarif, III dan IV sendiri-sendiri (item 22.1)", () => {
    expect(TARIF_UANG_MAKAN_PER_HARI.I).toBe(35_000);
    expect(TARIF_UANG_MAKAN_PER_HARI.II).toBe(35_000);
    expect(TARIF_UANG_MAKAN_PER_HARI.III).toBe(37_000);
    expect(TARIF_UANG_MAKAN_PER_HARI.IV).toBe(41_000);
  });

  it("uang lembur per jam: Gol I dan II BEDA - tidak seperti uang makan (item 23.1)", () => {
    expect(TARIF_UANG_LEMBUR_PER_JAM.I).toBe(18_000);
    expect(TARIF_UANG_LEMBUR_PER_JAM.II).toBe(24_000);
    expect(TARIF_UANG_LEMBUR_PER_JAM.III).toBe(30_000);
    expect(TARIF_UANG_LEMBUR_PER_JAM.IV).toBe(36_000);
    // penjaga supaya tidak ada yang "merapikan" jadi sama dengan uang makan
    expect(TARIF_UANG_LEMBUR_PER_JAM.I).not.toBe(TARIF_UANG_LEMBUR_PER_JAM.II);
  });

  it("uang makan lembur sama besarnya dengan uang makan biasa (item 23.2)", () => {
    expect(TARIF_UANG_MAKAN_LEMBUR_PER_HARI).toEqual(TARIF_UANG_MAKAN_PER_HARI);
  });

  it("golonganRomawi membaca format Pegawai.golongan yang dipakai sistem", () => {
    expect(golonganRomawi("III/d")).toBe("III");
    expect(golonganRomawi("IV/a")).toBe("IV");
    expect(golonganRomawi("II/b")).toBe("II");
    expect(golonganRomawi("I/a")).toBe("I");
  });

  it("golonganRomawi TIDAK menebak kalau tidak terbaca - salah golongan = salah bayar", () => {
    expect(golonganRomawi(null)).toBeNull();
    expect(golonganRomawi("")).toBeNull();
    expect(golonganRomawi("Penata Tk.I")).toBeNull();
  });

  it("golonganRomawi tidak salah baca IV sebagai I, atau III sebagai II", () => {
    expect(golonganRomawi("IV/b")).not.toBe("I");
    expect(golonganRomawi("III/a")).not.toBe("II");
  });
});

// ---------------------------------------------------------------------------
// Uang makan - siapa yang berhak
// ---------------------------------------------------------------------------
describe("hitungUangMakan - hanya WFO & WFH/WFA yang berhak", () => {
  it("membayar hari WFO + WFH/WFA dikali tarif golongan", () => {
    const hasil = hitungUangMakan({
      ...dasar,
      jumlahHariKerja: 22,
      jumlahHariWfo: 15,
      jumlahHariWfhWfa: 5,
      tarifHarianUangMakan: TARIF_UANG_MAKAN_PER_HARI.III,
    });
    expect(hasil.jumlahHariDibayar).toBe(20);
    expect(hasil.totalUangMakan).toBe(20 * 37_000); // 740.000
    expect(hasil.anomali).toHaveLength(0);
  });

  it("hari diklat & dinas keluar TIDAK ikut dibayar", () => {
    // Pegawai hadir 22 hari: 18 WFO, 2 diklat, 2 dinas luar. Yang dibayar
    // cuma 18 - diklat & dinas luar tidak pernah masuk input.
    const hasil = hitungUangMakan({
      ...dasar,
      jumlahHariKerja: 22,
      jumlahHariWfo: 18,
      jumlahHariWfhWfa: 0,
      tarifHarianUangMakan: TARIF_UANG_MAKAN_PER_HARI.III,
    });
    expect(hasil.jumlahHariDibayar).toBe(18);
    expect(hasil.totalUangMakan).toBe(18 * 37_000); // bukan 22 x 37.000
  });

  it("WFH/WFA dibayar sama dengan WFO - tidak ada tarif berbeda", () => {
    const semuaWfo = hitungUangMakan({
      ...dasar, jumlahHariKerja: 22, jumlahHariWfo: 20, jumlahHariWfhWfa: 0,
      tarifHarianUangMakan: TARIF_UANG_MAKAN_PER_HARI.IV,
    });
    const semuaWfh = hitungUangMakan({
      ...dasar, jumlahHariKerja: 22, jumlahHariWfo: 0, jumlahHariWfhWfa: 20,
      tarifHarianUangMakan: TARIF_UANG_MAKAN_PER_HARI.IV,
    });
    expect(semuaWfh.totalUangMakan).toBe(semuaWfo.totalUangMakan);
  });

  it("tarif ikut golongan: Gol IV lebih besar dari Gol I untuk hari yang sama", () => {
    const buat = (tarif: number) =>
      hitungUangMakan({ ...dasar, jumlahHariKerja: 22, jumlahHariWfo: 20, jumlahHariWfhWfa: 0, tarifHarianUangMakan: tarif });
    expect(buat(TARIF_UANG_MAKAN_PER_HARI.IV).totalUangMakan).toBe(20 * 41_000);
    expect(buat(TARIF_UANG_MAKAN_PER_HARI.I).totalUangMakan).toBe(20 * 35_000);
  });

  it("flag anomali kalau hari berhak melebihi hari kerja, dan di-clamp", () => {
    const hasil = hitungUangMakan({
      ...dasar,
      jumlahHariKerja: 20,
      jumlahHariWfo: 18,
      jumlahHariWfhWfa: 7, // total 25 > 20
      tarifHarianUangMakan: TARIF_UANG_MAKAN_PER_HARI.III,
    });
    expect(hasil.jumlahHariDibayar).toBe(20);
    expect(hasil.anomali.some((a) => a.includes("melebihi jumlah hari kerja"))).toBe(true);
  });

  it("tidak ada hari berhak sama sekali = nol, bukan negatif", () => {
    const hasil = hitungUangMakan({
      ...dasar, jumlahHariKerja: 22, jumlahHariWfo: 0, jumlahHariWfhWfa: 0,
      tarifHarianUangMakan: TARIF_UANG_MAKAN_PER_HARI.III,
    });
    expect(hasil.totalUangMakan).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Uang lembur - dua komponen, syarat 2 jam
// ---------------------------------------------------------------------------
describe("hitungUangLembur - uang lembur + uang makan lembur", () => {
  const lembur = (over: Partial<Parameters<typeof hitungUangLembur>[0]> = {}) =>
    hitungUangLembur({
      ...dasar,
      totalJamLembur: 10,
      tarifPerJam: TARIF_UANG_LEMBUR_PER_JAM.III,
      jumlahHariMakanLembur: 4,
      tarifMakanLemburPerHari: TARIF_UANG_MAKAN_LEMBUR_PER_HARI.III,
      ...over,
    });

  it("total = (jam x tarif per jam) + (hari >=2 jam x tarif makan lembur)", () => {
    const hasil = lembur();
    expect(hasil.uangLembur).toBe(10 * 30_000); // 300.000
    expect(hasil.uangMakanLembur).toBe(4 * 37_000); // 148.000
    expect(hasil.totalUangLembur).toBe(448_000);
    expect(hasil.anomali).toHaveLength(0);
  });

  it("lembur di bawah 2 jam sehari: tetap dapat uang lembur, TIDAK dapat uang makan lembur", () => {
    const hasil = lembur({ totalJamLembur: 1, jumlahHariMakanLembur: 0 });
    expect(hasil.uangLembur).toBe(30_000);
    expect(hasil.uangMakanLembur).toBe(0);
    expect(hasil.totalUangLembur).toBe(30_000);
  });

  it("uang makan lembur dihitung per HARI, bukan per jam - 3 jam sehari tetap 1 hari", () => {
    const hasil = lembur({ totalJamLembur: 3, jumlahHariMakanLembur: 1 });
    expect(hasil.uangLembur).toBe(3 * 30_000);
    expect(hasil.uangMakanLembur).toBe(1 * 37_000); // bukan 3 x 37.000
  });

  it("flag anomali kalau jumlah hari makan lembur mustahil dari total jamnya", () => {
    // 5 hari x minimal 2 jam = minimal 10 jam, tapi totalnya cuma 6.
    const hasil = lembur({ totalJamLembur: 6, jumlahHariMakanLembur: 5 });
    expect(hasil.anomali.some((a) => a.includes("tidak konsisten"))).toBe(true);
  });

  it("jam di atas batas maksimal di-cap dan ditandai", () => {
    const hasil = lembur({ totalJamLembur: 52, jumlahHariMakanLembur: 0 });
    expect(hasil.jamLemburDihitung).toBe(40);
    expect(hasil.uangLembur).toBe(40 * 30_000);
    expect(hasil.anomali.some((a) => a.includes("melebihi batas maksimal"))).toBe(true);
  });

  it("tarif lembur ikut golongan - Gol I dan II memang beda", () => {
    const golI = lembur({ tarifPerJam: TARIF_UANG_LEMBUR_PER_JAM.I, jumlahHariMakanLembur: 0 });
    const golII = lembur({ tarifPerJam: TARIF_UANG_LEMBUR_PER_JAM.II, jumlahHariMakanLembur: 0 });
    expect(golI.uangLembur).toBe(10 * 18_000);
    expect(golII.uangLembur).toBe(10 * 24_000);
  });

  it("ada hari makan lembur tapi tarifnya belum diisi: dihitung 0 + ditandai", () => {
    const hasil = lembur({ tarifMakanLemburPerHari: 0 });
    expect(hasil.uangMakanLembur).toBe(0);
    expect(hasil.anomali.some((a) => a.includes("tarif uang makan lemburnya belum diisi"))).toBe(true);
  });
});

describe("hitungHariBerhakMakanLembur", () => {
  it("menghitung hari yang lemburnya mencapai 2 jam", () => {
    expect(hitungHariBerhakMakanLembur([1, 2, 3.5, 0.5])).toBe(2);
  });

  it("tepat 2 jam sudah berhak (batasnya inklusif)", () => {
    expect(hitungHariBerhakMakanLembur([2])).toBe(1);
    expect(hitungHariBerhakMakanLembur([1.99])).toBe(0);
  });

  it("tidak ada lembur sama sekali = 0 hari", () => {
    expect(hitungHariBerhakMakanLembur([])).toBe(0);
  });
});
