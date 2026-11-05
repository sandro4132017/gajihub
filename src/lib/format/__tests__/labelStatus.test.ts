import { describe, expect, it } from "vitest";
import {
  labelJenisPembayaran,
  labelSumberDataPegawai,
  labelStatusPegawai,
  labelStatusSkKgb,
} from "../labelStatus";

describe("labelStatus", () => {
  it("status pegawai", () => {
    expect(labelStatusPegawai("AKTIF")).toBe("Aktif");
    expect(labelStatusPegawai("USULAN_CPNS")).toBe("Usulan CPNS");
    expect(labelStatusPegawai("NONAKTIF")).toBe("Tidak aktif");
    expect(labelStatusPegawai("LAIN")).toBe("LAIN");
  });
  it("sumber data", () => {
    expect(labelSumberDataPegawai("SIAP_MSSQL")).toBe("SIAP");
    expect(labelSumberDataPegawai("SIAP")).toBe("SIAP");
    expect(labelSumberDataPegawai("EXCEL")).toBe("EXCEL");
  });
  it("jenis pembayaran", () => {
    expect(labelJenisPembayaran("TUKIN")).toBe("Tunjangan Kinerja");
    expect(labelJenisPembayaran("GAJI")).toBe("Gaji");
    expect(labelJenisPembayaran("X")).toBe("X");
  });
  it("status SK KGB", () => {
    expect(labelStatusSkKgb("DIAJUKAN")).toBe("Menunggu persetujuan");
    expect(labelStatusSkKgb("DISETUJUI")).toBe("Disetujui");
    expect(labelStatusSkKgb("DITOLAK")).toBe("Ditolak");
    expect(labelStatusSkKgb("?")).toBe("?");
  });
});
