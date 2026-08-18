import { describe, it, expect } from "vitest";
import { rincianUangMakan, labelKelompokTarifUangMakan, type InputRincianUangMakan } from "../rincianUangMakan";
import { hitungUangMakan } from "../uangMakan";
import { TARIF_UANG_MAKAN_PER_HARI } from "../tarifSbm";

const dasar: InputRincianUangMakan = {
  golongan: "III/d",
  jumlahHariWfo: 15,
  jumlahHariWfhWfa: 3,
  jumlahHariDiklat: 0,
  jumlahHariDinasLuar: 0,
  jumlahHariCuti: 0,
  jumlahHariAlpha: 0,
  jumlahHariKerja: 23,
};

describe("rincianUangMakan - tarif dari golongan", () => {
  it("Golongan III memakai tarif Rp 37.000 (SBM 2026 item 22.1)", () => {
    const r = rincianUangMakan(dasar);
    expect(r.kelompokTarif).toBe("III");
    expect(r.tarifPerHari).toBe(37_000);
    expect(r.labelKelompok).toBe("Golongan III");
  });

  it("Golongan I dan II SATU tarif - label mengikuti bunyi SBM", () => {
    for (const g of ["I/a", "II/c"]) {
      const r = rincianUangMakan({ ...dasar, golongan: g });
      expect(r.tarifPerHari).toBe(35_000);
      expect(r.labelKelompok).toBe("Golongan I dan II");
    }
    expect(labelKelompokTarifUangMakan("I")).toBe("Golongan I dan II");
    expect(labelKelompokTarifUangMakan("IV")).toBe("Golongan IV");
  });

  it("Golongan IV memakai tarif Rp 41.000", () => {
    expect(rincianUangMakan({ ...dasar, golongan: "IV/b" }).tarifPerHari).toBe(41_000);
  });

  // Ini penjaga bug yang NYARIS masuk: memakai golonganRomawi() (khusus PNS)
  // akan membuat ~996 pegawai PPPK tampil "tidak dikenali" di layar padahal
  // kalkulasi tetap membayar mereka lewat padanan PPPK.
  it("PPPK ('IX') TETAP dapat tarif, dan padanannya disebut sebagai TODO(confirm)", () => {
    const r = rincianUangMakan({ ...dasar, golongan: "IX" });
    expect(r.tarifPerHari).not.toBeNull();
    expect(r.total).not.toBeNull();
    expect(r.catatan.join(" ")).toMatch(/PPPK/i);
    expect(r.catatan.join(" ")).toMatch(/TODO\(confirm\)/);
  });

  it("golongan yang tidak terbaca TIDAK ditebak - total null + catatan eksplisit", () => {
    for (const g of ["ZZZ", ""]) {
      const r = rincianUangMakan({ ...dasar, golongan: g || null });
      expect(r.tarifPerHari).toBeNull();
      expect(r.total).toBeNull();
      expect(r.catatan.length).toBeGreaterThan(0);
    }
  });
});

describe("rincianUangMakan - hari hadir vs hari dibayar", () => {
  it("Diklat & Dinas Keluar tercatat hadir TAPI tidak dibayar", () => {
    const r = rincianUangMakan({
      ...dasar,
      jumlahHariWfo: 15,
      jumlahHariWfhWfa: 3,
      jumlahHariDiklat: 2,
      jumlahHariDinasLuar: 2,
    });
    expect(r.hariDibayar).toBe(18);
    expect(r.hariHadirTidakDibayar).toBe(4);
    expect(r.total).toBe(18 * 37_000);
    expect(r.catatan.join(" ")).toMatch(/tercatat HADIR tapi tidak dibayar/);

    const diklat = r.baris.find((b) => b.status === "Diklat")!;
    expect(diklat.berhak).toBe(false);
    expect(diklat.alasan).toMatch(/penyelenggara diklat/);
  });

  it("baris berjumlah nol tidak ditampilkan", () => {
    const r = rincianUangMakan(dasar);
    expect(r.baris.map((b) => b.status)).toEqual(["WFO (kerja di kantor)", "WFH / WFA"]);
  });

  it("hari berhak melebihi hari kerja dipotong DAN dijelaskan", () => {
    const r = rincianUangMakan({ ...dasar, jumlahHariWfo: 22, jumlahHariWfhWfa: 4, jumlahHariKerja: 23 });
    expect(r.hariDibayar).toBe(23);
    expect(r.catatan.join(" ")).toMatch(/melebihi hari kerja/);
  });
});

describe("rincianUangMakan konsisten dengan hitungUangMakan (yang membayar)", () => {
  // Penjagaan terpenting: tampilan tidak boleh bercerita beda dari pembayaran.
  const kasus: InputRincianUangMakan[] = [
    dasar,
    { ...dasar, jumlahHariDiklat: 3, jumlahHariDinasLuar: 2 },
    { ...dasar, golongan: "I/a", jumlahHariWfo: 20, jumlahHariWfhWfa: 4 },
    { ...dasar, golongan: "IV/e", jumlahHariWfo: 0, jumlahHariWfhWfa: 0, jumlahHariAlpha: 23 },
    { ...dasar, golongan: "II/b", jumlahHariWfo: 25, jumlahHariWfhWfa: 0, jumlahHariKerja: 21 },
  ];

  it.each(kasus.map((k, i) => [i, k] as const))("kasus %i menghasilkan angka yang sama", (_i, k) => {
    const r = rincianUangMakan(k);
    expect(r.kelompokTarif).not.toBeNull();
    const tarif = TARIF_UANG_MAKAN_PER_HARI[r.kelompokTarif!];

    const dibayar = hitungUangMakan({
      pegawaiId: "p1",
      periodeBulan: 7,
      periodeTahun: 2026,
      jumlahHariWfo: k.jumlahHariWfo,
      jumlahHariWfhWfa: k.jumlahHariWfhWfa,
      jumlahHariKerja: k.jumlahHariKerja,
      tarifHarianUangMakan: tarif,
    });

    expect(r.hariDibayar).toBe(dibayar.jumlahHariDibayar);
    expect(r.total).toBe(dibayar.totalUangMakan);
  });
});
