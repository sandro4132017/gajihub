import { describe, expect, it } from "vitest";
import { jenisPegawaiDariKodeSiap } from "../jenisPegawai";

describe("jenisPegawaiDariKodeSiap", () => {
  it("memetakan tiga kode aktif SIAP", () => {
    expect(jenisPegawaiDariKodeSiap("1")).toBe("CPNS");
    expect(jenisPegawaiDariKodeSiap("2")).toBe("PNS");
    expect(jenisPegawaiDariKodeSiap("23")).toBe("PPPK");
  });

  it("merapikan spasi seperti kolom char SQL Server", () => {
    expect(jenisPegawaiDariKodeSiap(" 23 ")).toBe("PPPK");
  });

  it("kode bukan jenis kepegawaian (pensiun, berhenti, tak dikenal) jadi null", () => {
    expect(jenisPegawaiDariKodeSiap("3")).toBeNull();
    expect(jenisPegawaiDariKodeSiap("8")).toBeNull();
    expect(jenisPegawaiDariKodeSiap("9")).toBeNull();
    expect(jenisPegawaiDariKodeSiap("")).toBeNull();
    expect(jenisPegawaiDariKodeSiap(null)).toBeNull();
    expect(jenisPegawaiDariKodeSiap(undefined)).toBeNull();
  });
});
