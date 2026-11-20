import { describe, expect, it } from "vitest";
import { SPKL_AKTIF, berlakuMulaiSpkl } from "../gerbangSpkl";

describe("berlakuMulaiSpkl", () => {
  it("mengembalikan tanggal mulai satker pilot (dicocokkan persis setelah trim)", () => {
    const { satuanKerja, berlakuMulai } = SPKL_AKTIF[0];
    expect(berlakuMulaiSpkl(satuanKerja)).toBe(berlakuMulai);
    expect(berlakuMulaiSpkl(`  ${satuanKerja} `)).toBe(berlakuMulai);
  });

  it.each([null, undefined, "", "   ", "Biro Lain", "Biro Keuangan"])("satker %j: null", (s) => {
    expect(berlakuMulaiSpkl(s)).toBeNull();
  });
});
