import { describe, expect, it } from "vitest";
import {
  hitungPtkp,
  kategoriTerDari,
  tanggalAcuanPtkp,
  tarifFinalHonorarium,
  MAKS_TANGGUNGAN_PTKP,
} from "../ptkp";

const pria = (statusKawin: string, jumlahTanggungan: number | null = 0) =>
  hitungPtkp({ statusKawin, jenisKelamin: "L", jumlahTanggungan });

describe("kategoriTerDari - PMK 168/2023", () => {
  it("kategori A", () => {
    for (const k of ["TK/0", "TK/1", "K/0"]) expect(kategoriTerDari(k), k).toBe("A");
  });
  it("kategori B", () => {
    for (const k of ["TK/2", "TK/3", "K/1", "K/2"]) expect(kategoriTerDari(k), k).toBe("B");
  });
  it("kategori C hanya K/3", () => {
    expect(kategoriTerDari("K/3")).toBe("C");
  });
  it("kode di luar daftar tidak dipaksa masuk kategori", () => {
    for (const k of ["K/4", "TK/4", "", "A", "k/3"]) expect(kategoriTerDari(k), k).toBeNull();
  });
});

describe("hitungPtkp - nilai PTKP setahun", () => {
  // Angka acuan dari salindia DJP: 54 / 58,5 / 63 / 67,5 / 72 juta.
  it("TK/0 sampai TK/3", () => {
    expect(pria("B", 0)!.ptkpSetahun).toBe(54_000_000);
    expect(pria("B", 1)!.ptkpSetahun).toBe(58_500_000);
    expect(pria("B", 2)!.ptkpSetahun).toBe(63_000_000);
    expect(pria("B", 3)!.ptkpSetahun).toBe(67_500_000);
  });

  it("K/0 sampai K/3", () => {
    expect(pria("K", 0)!.ptkpSetahun).toBe(58_500_000);
    expect(pria("K", 1)!.ptkpSetahun).toBe(63_000_000);
    expect(pria("K", 2)!.ptkpSetahun).toBe(67_500_000);
    expect(pria("K", 3)!.ptkpSetahun).toBe(72_000_000);
  });

  it("cocok dengan contoh kasus DJP: K/1 = 54jt + 4,5jt + 4,5jt", () => {
    const h = pria("K", 1)!;
    expect(h.kode).toBe("K/1");
    expect(h.ptkpSetahun).toBe(54_000_000 + 4_500_000 + 4_500_000);
  });
});

describe("hitungPtkp - aturan wanita kawin PMK 168/2023", () => {
  it("perempuan berstatus kawin jadi TK/0 berapa pun tanggungannya", () => {
    for (const n of [0, 1, 2, 3, 5]) {
      const h = hitungPtkp({ statusKawin: "K", jenisKelamin: "P", jumlahTanggungan: n })!;
      expect(h.kode, `tanggungan ${n}`).toBe("TK/0");
      expect(h.kategoriTer).toBe("A");
      expect(h.ptkpSetahun).toBe(54_000_000);
      expect(h.tanggunganDipakai).toBe(0);
    }
  });

  it("menyebutkan alasannya, tidak diam-diam", () => {
    const h = hitungPtkp({ statusKawin: "K", jenisKelamin: "P", jumlahTanggungan: 2 })!;
    expect(h.catatan.join(" ")).toContain("PMK 168/2023");
    expect(h.catatan.join(" ")).toContain("surat keterangan");
  });

  it("dengan surat keterangan suami tidak berpenghasilan, kembali dihitung biasa", () => {
    const h = hitungPtkp({
      statusKawin: "K",
      jenisKelamin: "P",
      jumlahTanggungan: 2,
      adaSuratSuamiTidakBerpenghasilan: true,
    })!;
    expect(h.kode).toBe("K/2");
    expect(h.ptkpSetahun).toBe(67_500_000);
  });

  it("aturan ini TIDAK berlaku untuk perempuan yang tidak kawin", () => {
    const h = hitungPtkp({ statusKawin: "B", jenisKelamin: "P", jumlahTanggungan: 2 })!;
    expect(h.kode).toBe("TK/2");
  });

  it("aturan ini TIDAK berlaku untuk laki-laki kawin", () => {
    expect(pria("K", 2)!.kode).toBe("K/2");
  });
});

describe("hitungPtkp - batas tanggungan", () => {
  it(`dijepit di ${MAKS_TANGGUNGAN_PTKP} dan selisihnya dicatat`, () => {
    const h = pria("K", 5)!;
    expect(h.kode).toBe("K/3");
    expect(h.tanggunganDipakai).toBe(3);
    expect(h.catatan.join(" ")).toContain("5");
  });

  it("tanggungan null atau negatif dianggap nol, bukan NaN", () => {
    expect(pria("K", null)!.kode).toBe("K/0");
    expect(pria("K", -2)!.kode).toBe("K/0");
  });

  it("pecahan dibulatkan ke bawah - tidak ada setengah tanggungan", () => {
    expect(pria("K", 2.9)!.kode).toBe("K/2");
  });
});

describe("hitungPtkp - status yang tidak bisa ditentukan", () => {
  it("status kawin tak dikenal menghasilkan null, BUKAN ditebak jadi TK/0", () => {
    // 93 pegawai di SIAP ada dalam keadaan ini. Menebaknya menempatkan mereka
    // di kategori tarif yang belum tentu benar, setiap bulan.
    for (const s of [null, "", "   ", "(", "X", "1"]) {
      expect(hitungPtkp({ statusKawin: s, jenisKelamin: "L", jumlahTanggungan: 1 }), String(s)).toBeNull();
    }
  });

  it("cerai, janda, dan duda diperlakukan tidak kawin tapi tetap punya tanggungan", () => {
    for (const s of ["C", "J", "D"]) {
      const h = pria(s, 2)!;
      expect(h.kode, s).toBe("TK/2");
      expect(h.catatan.join(" "), s).toContain("tidak kawin");
    }
  });

  it("belum kawin tidak diberi catatan tambahan - memang keadaan biasa", () => {
    expect(pria("B", 1)!.catatan).toEqual([]);
  });
});

describe("hitungPtkp - kerapian masukan", () => {
  it("nilai SIAP yang berpadding spasi & huruf kecil tetap terbaca", () => {
    const h = hitungPtkp({ statusKawin: " k ", jenisKelamin: " p ", jumlahTanggungan: 1 })!;
    expect(h.kode).toBe("TK/0");
  });

  it("kategori TER selalu sepadan dengan kodenya", () => {
    for (const s of ["K", "B", "C", "J", "D"]) {
      for (const n of [0, 1, 2, 3]) {
        const h = pria(s, n)!;
        expect(h.kategoriTer, `${s}/${n}`).toBe(kategoriTerDari(h.kode));
      }
    }
  });
});

describe("tarifFinalHonorarium - PPh 21 final atas honorarium APBN/APBD", () => {
  it("Golongan I dan II bertarif 0%", () => {
    for (const g of ["I", "I/c", "I/d", "II/a", "II/d"]) {
      expect(tarifFinalHonorarium(g)!.tarif, g).toBe(0);
    }
  });

  it("Golongan III bertarif 5%", () => {
    for (const g of ["III", "III/a", "III/b", "III/c", "III/d"]) {
      expect(tarifFinalHonorarium(g)!.tarif, g).toBe(0.05);
    }
  });

  it("Golongan IV bertarif 15%", () => {
    for (const g of ["IV/a", "IV/b", "IV/c", "IV/d", "IV/e"]) {
      expect(tarifFinalHonorarium(g)!.tarif, g).toBe(0.15);
    }
  });

  it("sufiks ruang tidak mengubah tarif, cuma golongan pokoknya yang dipakai", () => {
    expect(tarifFinalHonorarium("III/a")!.golonganPokok).toBe("III");
    expect(tarifFinalHonorarium("III/d")!.golonganPokok).toBe("III");
  });

  it("golongan PPPK TIDAK ditebak - tabel tarifnya tidak menyebut PPPK", () => {
    // ~1.000 pegawai di data ini bergolongan PPPK berupa angka Romawi tanpa
    // sufiks. Memetakan "IX" ke golongan IV berarti memotong 15% atas dasar
    // yang tidak ada di peraturannya.
    for (const g of ["V", "VII", "IX", "X"]) {
      expect(tarifFinalHonorarium(g), g).toBeNull();
    }
  });

  it("golongan kosong atau tidak dikenal menghasilkan null", () => {
    for (const g of [null, "", "   ", "XYZ", "3"]) {
      expect(tarifFinalHonorarium(g), String(g)).toBeNull();
    }
  });

  it("nilai berpadding & huruf kecil tetap terbaca", () => {
    expect(tarifFinalHonorarium(" iv/b ")!.tarif).toBe(0.15);
  });
});

describe("tanggalAcuanPtkp", () => {
  it("selalu 1 Januari tahun yang diminta, dalam UTC", () => {
    const d = tanggalAcuanPtkp(2026);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(1);
  });
});
