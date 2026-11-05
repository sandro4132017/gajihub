import { describe, expect, it } from "vitest";
import { whereIkutAdk } from "../satkerTerkirim";

describe("whereIkutAdk - pegawai uji tidak ikut ke berkas", () => {
  it("selalu mengecualikan sourceSystem DUMMY_UJI, gerbang satker tetap ada", () => {
    const w = whereIkutAdk(10, 2026, ["UNIT A"], null);
    expect(w.pegawai.sourceSystem).toEqual({ not: "DUMMY_UJI" });
    expect(w.pegawai.satuanKerja).toEqual({ in: ["UNIT A"] });
  });

  it("penyaring jenis pegawai tidak menghapus pengecualian dummy", () => {
    const w = whereIkutAdk(10, 2026, ["UNIT A"], "PNS");
    expect(w.pegawai.sourceSystem).toEqual({ not: "DUMMY_UJI" });
    expect(w.pegawai.satuanKerja).toEqual({ in: ["UNIT A"] });
  });
});
