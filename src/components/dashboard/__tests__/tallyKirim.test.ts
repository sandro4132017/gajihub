import { describe, expect, it } from "vitest";
import { kunciKirim, tallyKirim } from "../tallyKirim";

const A = kunciKirim("Biro Keuangan", 8, 2026);
const B = kunciKirim("Biro Umum", 8, 2026);

describe("tallyKirim", () => {
  it("mengelompokkan baris menurut keadaan unitnya", () => {
    const peta = new Map([
      [A, "TERKIRIM"],
      [B, "DIKEMBALIKAN"],
    ]);
    const hasil = tallyKirim([A, A, A, B, kunciKirim("Setjen", 8, 2026)], peta);
    expect(hasil).toEqual({ terkirim: 3, dikembalikan: 1, belumKirim: 1, total: 5 });
  });

  it("unit yang tidak ada di peta dihitung belum kirim, bukan diabaikan", () => {
    // Kalau baris tanpa pengiriman diam-diam hilang dari cacah, totalnya tidak
    // akan sama dengan jumlah baris - dan angka yang tidak berjumlah membuat
    // orang berhenti percaya seluruh papannya.
    const hasil = tallyKirim([A, B], new Map());
    expect(hasil.belumKirim).toBe(2);
    expect(hasil.total).toBe(2);
  });

  it("status asing diperlakukan belum kirim, bukan dilempar", () => {
    const hasil = tallyKirim([A], new Map([[A, "ENTAH"]]));
    expect(hasil.belumKirim).toBe(1);
  });

  it("tanpa baris menghasilkan nol semua, bukan pecahan NaN", () => {
    expect(tallyKirim([], new Map())).toEqual({
      terkirim: 0,
      dikembalikan: 0,
      belumKirim: 0,
      total: 0,
    });
  });

  it("total selalu sama dengan jumlah ketiganya", () => {
    const peta = new Map([[A, "TERKIRIM"]]);
    const h = tallyKirim([A, A, B, B, B], peta);
    expect(h.terkirim + h.dikembalikan + h.belumKirim).toBe(h.total);
  });
});

describe("kunciKirim", () => {
  it("periode ikut jadi bagian kunci - unit sama beda bulan tidak tertukar", () => {
    expect(kunciKirim("X", 7, 2026)).not.toBe(kunciKirim("X", 8, 2026));
  });
});
