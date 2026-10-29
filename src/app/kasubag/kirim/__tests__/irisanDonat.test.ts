import { describe, expect, it } from "vitest";
import { irisanDonat } from "../irisanDonat";

const KELILING = 100;

describe("irisanDonat", () => {
  it("busurnya menutup keliling tanpa sisa - tidak ada celah putih palsu", () => {
    // Tiga irisan sama besar. Kalau geometrinya memakai persen yang sudah
    // dibulatkan (33+33+33), sisa 1% muncul sebagai garis di cincin yang
    // terbaca sebagai kategori keempat.
    const r = irisanDonat([{ kunci: "a", nilai: 1 }, { kunci: "b", nilai: 1 }, { kunci: "c", nilai: 1 }], KELILING);
    const jumlah = r.reduce((n, x) => n + x.panjangBusur, 0);
    expect(jumlah).toBeCloseTo(KELILING, 10);
  });

  it("satu kategori 100% tetap menggambar cincin penuh", () => {
    // Keadaan paling sering di papan ini: awal periode semua belum kirim,
    // akhir periode semua terkirim. Inilah kasus yang membuat <path> busur
    // menggambar KEKOSONGAN, dan alasan pendekatan dasharray dipilih.
    const r = irisanDonat([{ kunci: "terkirim", nilai: 7 }, { kunci: "belum", nilai: 0 }], KELILING);
    expect(r[0].panjangBusur).toBe(KELILING);
    expect(r[0].persen).toBe(100);
    expect(r[1].panjangBusur).toBe(0);
  });

  it("irisan berurutan tidak saling menimpa", () => {
    const r = irisanDonat([{ kunci: "a", nilai: 25 }, { kunci: "b", nilai: 75 }], KELILING);
    expect(r[0].geser).toBe(-0);
    expect(r[1].geser).toBeCloseTo(-25, 10);
  });

  it("total nol menghasilkan cincin kosong, bukan NaN", () => {
    // NaN pada stroke-dasharray membuat SVG-nya hilang total tanpa galat -
    // dan periode tanpa satuan kerja terlihat seperti halaman rusak.
    const r = irisanDonat([{ kunci: "a", nilai: 0 }, { kunci: "b", nilai: 0 }], KELILING);
    for (const x of r) {
      expect(Number.isNaN(x.panjangBusur)).toBe(false);
      expect(x.panjangBusur).toBe(0);
      expect(x.persen).toBe(0);
    }
  });

  it("nilai negatif diperlakukan nol, tidak menarik busur mundur", () => {
    const r = irisanDonat([{ kunci: "a", nilai: -5 }, { kunci: "b", nilai: 10 }], KELILING);
    expect(r[0].panjangBusur).toBe(0);
    expect(r[1].panjangBusur).toBe(KELILING);
  });

  it("persen dibulatkan tapi busurnya tidak", () => {
    const r = irisanDonat([{ kunci: "a", nilai: 1 }, { kunci: "b", nilai: 2 }], 3);
    expect(r[0].persen).toBe(33);
    expect(r[0].panjangBusur).toBeCloseTo(1, 10);
  });

  it("daftar kosong menghasilkan daftar kosong", () => {
    expect(irisanDonat([], KELILING)).toEqual([]);
  });
});

describe("irisanDonat - mulaiPecahan", () => {
  it("irisan pertama selalu mulai di 0", () => {
    const r = irisanDonat([{ kunci: "a", nilai: 3 }, { kunci: "b", nilai: 1 }], KELILING);
    expect(r[0].mulaiPecahan).toBe(0);
  });

  it("titik mulai menaik dan tidak pernah melewati 1", () => {
    // Dipakai menjadwalkan animasi. Nilai yang menurun atau melebihi 1
    // membuat irisan belakang bergerak duluan - urutannya jadi kebalikan
    // arah jarum jam tanpa ada yang memintanya.
    const r = irisanDonat(
      [{ kunci: "a", nilai: 5 }, { kunci: "b", nilai: 3 }, { kunci: "c", nilai: 2 }],
      KELILING
    );
    expect(r.map((x) => x.mulaiPecahan)).toEqual([0, 0.5, 0.8]);
    for (const x of r) expect(x.mulaiPecahan).toBeLessThanOrEqual(1);
  });

  it("sepadan dengan geser - keduanya menyatakan hal yang sama", () => {
    // `geser` = -mulaiPecahan * keliling. Kalau keduanya pernah berbeda,
    // animasinya akan berjalan di titik yang bukan tempat irisannya digambar.
    const r = irisanDonat([{ kunci: "a", nilai: 1 }, { kunci: "b", nilai: 2 }], KELILING);
    for (const x of r) expect(x.geser).toBeCloseTo(-x.mulaiPecahan * KELILING, 10);
  });

  it("total nol tidak menggeser apa pun", () => {
    const r = irisanDonat([{ kunci: "a", nilai: 0 }, { kunci: "b", nilai: 0 }], KELILING);
    expect(r.map((x) => x.mulaiPecahan)).toEqual([0, 0]);
  });
});
