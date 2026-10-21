import { describe, it, expect } from "vitest";
import { hitungHashBerkas, hashSama, hashUntukDibaca } from "../hashBerkas";

describe("hitungHashBerkas", () => {
  it("SHA-256, 64 karakter heksadesimal huruf kecil", () => {
    const h = hitungHashBerkas(Buffer.from("halo"));
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("nilai yang dihasilkan cocok dengan SHA-256 yang sudah diketahui", () => {
    // sha256 dari string kosong - nilai baku yang bisa diperiksa siapa saja.
    expect(hitungHashBerkas(Buffer.from(""))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("satu bita berubah -> sidiknya berubah", () => {
    expect(hitungHashBerkas(Buffer.from("halo"))).not.toBe(
      hitungHashBerkas(Buffer.from("halp"))
    );
  });

  it("isi yang sama selalu menghasilkan sidik yang sama", () => {
    expect(hitungHashBerkas(Buffer.from("SPTJM"))).toBe(
      hitungHashBerkas(Buffer.from("SPTJM"))
    );
  });
});

describe("hashSama", () => {
  const H = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  it("sama walau beda huruf besar/kecil", () => {
    expect(hashSama(H, H.toUpperCase())).toBe(true);
  });

  it("spasi di tepi diabaikan", () => {
    expect(hashSama(H, "  " + H + "\n")).toBe(true);
  });

  it("keluaran sha256sum yang membawa nama berkas tetap dikenali", () => {
    expect(hashSama(H, `${H}  SPTJM.pdf`)).toBe(true);
  });

  it("nilai berbeda ditolak", () => {
    expect(hashSama(H, "a".repeat(64))).toBe(false);
  });

  it("kosong, null, dan panjang yang salah TIDAK pernah dianggap cocok", () => {
    expect(hashSama(H, "")).toBe(false);
    expect(hashSama(H, null)).toBe(false);
    expect(hashSama(null, null)).toBe(false);
    expect(hashSama("", "")).toBe(false);
    expect(hashSama("abc", "abc")).toBe(false);
  });
});

describe("hashUntukDibaca", () => {
  it("dipecah jadi kelompok delapan", () => {
    const hasil = hashUntukDibaca("a".repeat(64));
    expect(hasil.split(" ")).toHaveLength(8);
    expect(hasil.replace(/ /g, "")).toBe("a".repeat(64));
  });
});
