import { describe, expect, it } from "vitest";
import {
  kelasJabatanEfektif,
  semuaSkPenurunanBerlaku,
  skMencakupPeriode,
  type SkPenurunanKelas,
} from "../kelasJabatanEfektif";

/** Kasus nyata: Galih Febian Azhar, turun kelas 7 -> 6 selama 1 tahun. */
const GALIH: SkPenurunanKelas = {
  status: "DISETUJUI",
  periodeMulaiBulan: 7,
  periodeMulaiTahun: 2026,
  periodeSelesaiBulan: 6,
  periodeSelesaiTahun: 2027,
  kelasJabatanSelamaHukuman: 6,
  nomorSk: "SK-UJI/2026",
};

describe("skMencakupPeriode", () => {
  it('"selama 1 tahun" = 12 periode, batas atas inklusif', () => {
    expect(skMencakupPeriode(GALIH, 6, 2026)).toBe(false); // sebelum mulai
    expect(skMencakupPeriode(GALIH, 7, 2026)).toBe(true); // periode pertama
    expect(skMencakupPeriode(GALIH, 12, 2026)).toBe(true);
    expect(skMencakupPeriode(GALIH, 1, 2027)).toBe(true); // ganti tahun
    expect(skMencakupPeriode(GALIH, 6, 2027)).toBe(true); // periode ke-12
    expect(skMencakupPeriode(GALIH, 7, 2027)).toBe(false); // sudah selesai
  });

  it("hitung periodenya persis 12", () => {
    let n = 0;
    for (let t = 2026; t <= 2027; t++) for (let b = 1; b <= 12; b++) if (skMencakupPeriode(GALIH, b, t)) n++;
    expect(n).toBe(12);
  });

  it("tanpa periode selesai, berlaku terus", () => {
    const terbuka = { ...GALIH, periodeSelesaiBulan: null, periodeSelesaiTahun: null };
    expect(skMencakupPeriode(terbuka, 7, 2026)).toBe(true);
    expect(skMencakupPeriode(terbuka, 1, 2035)).toBe(true);
    expect(skMencakupPeriode(terbuka, 6, 2026)).toBe(false);
  });
});

describe("kelasJabatanEfektif", () => {
  it("menurunkan kelas selama masa hukuman", () => {
    const h = kelasJabatanEfektif(7, [GALIH], 7, 2026);
    expect(h.kelas).toBe(6);
    expect(h.kelasDasar).toBe(7);
    expect(h.sk?.nomorSk).toBe("SK-UJI/2026");
  });

  it("kembali ke kelas dasar setelah masa hukuman lewat", () => {
    const h = kelasJabatanEfektif(7, [GALIH], 7, 2027);
    expect(h.kelas).toBe(7);
    expect(h.sk).toBeNull();
  });

  it("periode SEBELUM hukuman tidak terpengaruh", () => {
    expect(kelasJabatanEfektif(7, [GALIH], 5, 2026).kelas).toBe(7);
  });

  it("SK yang belum DISETUJUI TIDAK memotong apa pun", () => {
    // Memotong pembayaran atas dasar usulan yang belum diputuskan OSDMA jelas
    // keliru - lebih mudah membayar kekurangan nanti daripada menarik kembali
    // uang yang sudah dipotong tanpa dasar.
    for (const status of ["DIAJUKAN", "DITOLAK", ""]) {
      expect(kelasJabatanEfektif(7, [{ ...GALIH, status }], 7, 2026).kelas).toBe(7);
    }
  });

  it("SK tanpa penurunan kelas (mis. teguran) tidak mengubah apa pun", () => {
    const teguran = { ...GALIH, kelasJabatanSelamaHukuman: null };
    expect(kelasJabatanEfektif(7, [teguran], 7, 2026).kelas).toBe(7);
  });

  it("kelas dasar null tetap null - tidak ditebak", () => {
    expect(kelasJabatanEfektif(null, [], 7, 2026).kelas).toBeNull();
  });

  it("kalau ada dua SK bertumpang, dipakai kelas TERENDAH", () => {
    const kedua = { ...GALIH, kelasJabatanSelamaHukuman: 5, nomorSk: "SK-UJI-2/2026" };
    const h = kelasJabatanEfektif(7, [GALIH, kedua], 7, 2026);
    expect(h.kelas).toBe(5);
    expect(semuaSkPenurunanBerlaku([GALIH, kedua], 7, 2026)).toHaveLength(2);
  });

  it("semuaSkPenurunanBerlaku cuma memuat yang DISETUJUI & benar-benar mencakup", () => {
    const diajukan = { ...GALIH, status: "DIAJUKAN" };
    expect(semuaSkPenurunanBerlaku([GALIH, diajukan], 7, 2026)).toHaveLength(1);
    expect(semuaSkPenurunanBerlaku([GALIH], 7, 2027)).toHaveLength(0);
  });
});
