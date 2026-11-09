import { describe, expect, it } from "vitest";
import { jenisKelaminTampil } from "../jenisKelamin";

describe("jenisKelaminTampil", () => {
  it("kolom database didahulukan dari NIP", () => {
    expect(jenisKelaminTampil("p", "199001012020121001")).toBe("P"); // sensitive-ok
    expect(jenisKelaminTampil(" L ", null)).toBe("L");
  });

  it("jatuh ke digit ke-15 NIP kalau kolom kosong", () => {
    expect(jenisKelaminTampil(null, "199001012020121001")).toBe("L"); // sensitive-ok
    expect(jenisKelaminTampil("", "19900101 202012 2 001")).toBe("P"); // sensitive-ok
  });

  it("null kalau tidak ada yang bisa dipakai", () => {
    expect(jenisKelaminTampil(null, "199001012020120001")).toBeNull(); // sensitive-ok
    expect(jenisKelaminTampil("X", "12345")).toBeNull();
    expect(jenisKelaminTampil(undefined, undefined)).toBeNull();
  });
});
