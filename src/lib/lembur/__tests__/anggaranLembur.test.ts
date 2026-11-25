import { describe, expect, it } from "vitest";
import { anggaranUntukTahun, BELUM_DIKONFIRMASI } from "../anggaranLembur";

describe("anggaranUntukTahun", () => {
  it("2026 terdaftar", () => {
    const a = anggaranUntukTahun(2026);
    expect(a.terdaftar).toBe(true);
    expect(a.nomorDipa).toBe("DIPA-026.01.1.450938/2026");
    expect(a.tanggalDipa).toBe("1 Desember 2025");
    expect(a.akun).toBe("026.01.WA.2158.EBA.994.001.A.512211");
  });
  it("tahun lain: penanda belum dikonfirmasi, tidak menebak", () => {
    const a = anggaranUntukTahun(2027);
    expect(a.terdaftar).toBe(false);
    expect([a.nomorDipa, a.tanggalDipa, a.akun]).toEqual([BELUM_DIKONFIRMASI, BELUM_DIKONFIRMASI, BELUM_DIKONFIRMASI]);
  });
});
