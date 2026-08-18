import { describe, it, expect } from "vitest";
import { hitungUangMakan } from "../uangMakan";
import { hitungUangLembur, hitungHariBerhakMakanLembur } from "../uangLembur";
import {
  TARIF_UANG_MAKAN_PER_HARI,
  TARIF_UANG_LEMBUR_PER_JAM,
  TARIF_UANG_MAKAN_LEMBUR_PER_HARI,
  golonganRomawi,
  golonganPppkKeKurungSbm,
  kurungTarifSbm,
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

  it("golonganRomawi MENOLAK angka romawi telanjang - itu format PPPK, bukan PNS", () => {
    // Ini perbaikan bug, bukan pengetatan kosmetik: sebelumnya "III" milik
    // PPPK dibaca sebagai PNS Gol III dan dibayar Rp 37.000/hari +
    // Rp 30.000/jam tanpa peringatan apa pun. Ada 5 pegawai nyata yang kena
    // (semuanya PENGELOLA UMUM OPERASIONAL, kelas jabatan 4, TMT 2025).
    expect(golonganRomawi("III")).toBeNull();
    expect(golonganRomawi("I")).toBeNull();
    expect(golonganRomawi("IX")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Padanan golongan PPPK -> kurung tarif SBM
// ---------------------------------------------------------------------------
describe("tarifSbm - golongan PPPK", () => {
  it("memetakan jenjang PPPK ke kurung tarif SBM sesuai kesetaraan pendidikan", () => {
    expect(golonganPppkKeKurungSbm("V")).toBe("II"); // SMA
    expect(golonganPppkKeKurungSbm("VII")).toBe("II"); // D3
    expect(golonganPppkKeKurungSbm("IX")).toBe("III"); // S1 / Ahli Pertama
    expect(golonganPppkKeKurungSbm("X")).toBe("III"); // S2
    expect(golonganPppkKeKurungSbm("XI")).toBe("IV");
  });

  it("jenjang PPPK bawah (I-IV) TIDAK sama artinya dengan golongan PNS I-IV", () => {
    // Penjaga paling penting di file ini. PPPK gol III itu jenjang terbawah
    // (setara SD/SMP), sementara PNS Gol III setara S1 - beda Rp 2.000/hari
    // dan Rp 6.000/jam. Menyamakan keduanya = salah bayar yang tidak
    // menimbulkan error apa pun.
    expect(golonganPppkKeKurungSbm("III")).toBe("I");
    expect(golonganPppkKeKurungSbm("III")).not.toBe("III");
    expect(kurungTarifSbm("III")).toBe("I");
    expect(kurungTarifSbm("III/d")).toBe("III");
  });

  it("golonganPppkKeKurungSbm tidak mengklaim format PNS", () => {
    expect(golonganPppkKeKurungSbm("III/d")).toBeNull();
    expect(golonganPppkKeKurungSbm("IV/a")).toBeNull();
  });

  it("di luar skala I-XVII tetap null - tidak ditebak", () => {
    expect(golonganPppkKeKurungSbm("XVIII")).toBeNull();
    expect(golonganPppkKeKurungSbm("XX")).toBeNull();
    expect(kurungTarifSbm("Penata Tk.I")).toBeNull();
    expect(kurungTarifSbm(null)).toBeNull();
  });

  it("kurungTarifSbm menangani PNS dan PPPK lewat satu pintu", () => {
    expect(kurungTarifSbm("IV/a")).toBe("IV");
    expect(kurungTarifSbm("II/c")).toBe("II");
    expect(kurungTarifSbm("IX")).toBe("III");
    expect(kurungTarifSbm("V")).toBe("II");
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
// Pembulatan ke bawah - aturan user 2026-08-06
// ---------------------------------------------------------------------------
describe("hitungUangLembur - sisa menit dipangkas ke jam penuh", () => {
  const lembur = (over: Partial<Parameters<typeof hitungUangLembur>[0]> = {}) =>
    hitungUangLembur({ ...dasar, totalJamLembur: 0, tarifPerJam: TARIF_UANG_LEMBUR_PER_JAM.III, ...over });

  it("1 jam 59 menit dibayar 1 jam, bukan 2 jam", () => {
    // 1 jam 59 menit = 1 + 59/60 = 1,9833... jam
    const hasil = lembur({ totalJamLembur: 1 + 59 / 60 });
    expect(hasil.jamLemburDihitung).toBe(1);
    expect(hasil.uangLembur).toBe(1 * 30_000);
  });

  it("jam yang sudah bulat tidak berubah", () => {
    expect(lembur({ totalJamLembur: 7 }).jamLemburDihitung).toBe(7);
  });

  it("kurang dari 1 jam tidak dibayar sama sekali", () => {
    const hasil = lembur({ totalJamLembur: 0.75 });
    expect(hasil.jamLemburDihitung).toBe(0);
    expect(hasil.uangLembur).toBe(0);
  });

  it("hari kerja & hari libur dipangkas MASING-MASING, bukan setelah dijumlah", () => {
    // 1,5 + 1,5 = 3 kalau dijumlah dulu baru dibulatkan (3 jam), tapi
    // masing-masing floor -> 1 + 1 = 2 jam. Yang benar yang kedua: sisa menit
    // di hari kerja tidak boleh menambal sisa menit di hari libur, tarifnya
    // pun beda.
    const hasil = lembur({ totalJamLembur: 1.5, totalJamLemburHariLibur: 1.5 });
    expect(hasil.jamLemburHariKerja).toBe(1);
    expect(hasil.jamLemburHariLibur).toBe(1);
    expect(hasil.jamLemburDihitung).toBe(2);
  });

  it("sisa menit tidak ikut menghabiskan kuota batas maksimal", () => {
    // 40,9 jam dipangkas jadi 40 -> pas di batas, tidak ada yang hangus
    // gara-gara desimal.
    const hasil = lembur({ totalJamLembur: 40.9, batasMaksimalJamLembur: 40 });
    expect(hasil.jamLemburDihitung).toBe(40);
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

// ---------------------------------------------------------------------------
// Lembur hari libur & pengecualian WFH/WFA
// ---------------------------------------------------------------------------
describe("hitungUangLembur - hari libur / tanggal merah", () => {
  const gol3 = { tarifPerJam: TARIF_UANG_LEMBUR_PER_JAM.III, tarifMakanLemburPerHari: TARIF_UANG_MAKAN_LEMBUR_PER_HARI.III };

  it("jam lembur hari libur dibayar 2x tarif per jam", () => {
    const hasil = hitungUangLembur({
      ...dasar, ...gol3,
      totalJamLembur: 0,
      totalJamLemburHariLibur: 5,
      jumlahHariMakanLemburHariLibur: 1,
      jumlahHariWfo: 20,
    });
    expect(hasil.uangLembur).toBe(5 * 30_000 * 2); // 300.000, bukan 150.000
    expect(hasil.jamLemburHariLibur).toBe(5);
    expect(hasil.jamLemburHariKerja).toBe(0);
  });

  it("jam hari kerja & hari libur dihitung dengan tarif masing-masing", () => {
    const hasil = hitungUangLembur({
      ...dasar, ...gol3,
      totalJamLembur: 4, // hari kerja
      totalJamLemburHariLibur: 3, // tanggal merah
      jumlahHariMakanLembur: 1,
      jumlahHariMakanLemburHariLibur: 1,
      jumlahHariWfo: 20,
    });
    expect(hasil.uangLembur).toBe(4 * 30_000 + 3 * 30_000 * 2); // 120.000 + 180.000
    expect(hasil.jamLemburDihitung).toBe(7);
  });

  it("uang makan lembur TIDAK ikut dikali 2 di hari libur (penggantian konsumsi)", () => {
    const hasil = hitungUangLembur({
      ...dasar, ...gol3,
      totalJamLembur: 0,
      totalJamLemburHariLibur: 4,
      jumlahHariMakanLemburHariLibur: 2,
      jumlahHariWfo: 20,
    });
    expect(hasil.uangMakanLembur).toBe(2 * 37_000); // bukan 2 x 37.000 x 2
  });

  it("kalau kena batas maksimal, jam hari libur diprioritaskan (tarifnya lebih tinggi)", () => {
    const hasil = hitungUangLembur({
      ...dasar, ...gol3,
      totalJamLembur: 35,
      totalJamLemburHariLibur: 10, // total 45 > batas 40
      jumlahHariWfo: 20,
    });
    expect(hasil.jamLemburHariLibur).toBe(10);
    expect(hasil.jamLemburHariKerja).toBe(30);
    expect(hasil.jamLemburDihitung).toBe(40);
    expect(hasil.anomali.some((a) => a.includes("melebihi batas maksimal"))).toBe(true);
  });
});

describe("hitungUangLembur - WFH/WFA tidak dapat lembur", () => {
  it("klaim jam lembur tanpa satu pun hari WFO ditandai janggal", () => {
    const hasil = hitungUangLembur({
      ...dasar,
      totalJamLembur: 8,
      tarifPerJam: TARIF_UANG_LEMBUR_PER_JAM.III,
      jumlahHariWfo: 0, // seluruhnya WFH/WFA
    });
    expect(hasil.anomali.some((a) => a.includes("tidak punya hari WFO"))).toBe(true);
  });

  it("pegawai dengan hari WFO wajar TIDAK ditandai", () => {
    const hasil = hitungUangLembur({
      ...dasar,
      totalJamLembur: 8,
      tarifPerJam: TARIF_UANG_LEMBUR_PER_JAM.III,
      jumlahHariWfo: 18,
    });
    expect(hasil.anomali.some((a) => a.includes("tidak punya hari WFO"))).toBe(false);
  });

  it("tanpa jam lembur sama sekali, pegawai full WFH tidak ditandai apa-apa", () => {
    const hasil = hitungUangLembur({
      ...dasar,
      totalJamLembur: 0,
      tarifPerJam: TARIF_UANG_LEMBUR_PER_JAM.III,
      jumlahHariWfo: 0,
    });
    expect(hasil.anomali).toHaveLength(0);
  });
});
