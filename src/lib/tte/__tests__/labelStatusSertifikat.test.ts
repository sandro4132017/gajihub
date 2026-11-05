import { describe, expect, it } from "vitest";
import { labelStatusSertifikat } from "../labelStatusSertifikat";

describe("labelStatusSertifikat", () => {
  it("memetakan status yang dikenal", () => {
    expect(labelStatusSertifikat("ISSUE")).toBe("Aktif, siap dipakai");
    expect(labelStatusSertifikat("NOT_REGISTERED")).toBe("NIK belum terdaftar di BSrE");
    expect(labelStatusSertifikat("BELUM_TERDAFTAR")).toBe("NIK belum terdaftar di BSrE");
    expect(labelStatusSertifikat("NOT_FOUND")).toBe("Layanan BSrE sedang bermasalah");
    expect(labelStatusSertifikat("SERVER_ERROR")).toBe("Layanan BSrE sedang bermasalah");
    expect(labelStatusSertifikat("NETWORK_ERROR")).toBe("Server BSrE tidak terjangkau");
    expect(labelStatusSertifikat("INPUT")).toBe("Menunggu NIK");
    expect(labelStatusSertifikat("REVOKED")).toBe("Sertifikat dicabut");
    expect(labelStatusSertifikat("EXPIRED")).toBe("Sertifikat kedaluwarsa");
  });
  it("status tak dikenal dikembalikan apa adanya", () => {
    expect(labelStatusSertifikat("XYZ")).toBe("XYZ");
    expect(labelStatusSertifikat("UNKNOWN")).toBe("Status sertifikat tidak dikenali");
    expect(labelStatusSertifikat("ERROR")).toBe("Layanan BSrE sedang bermasalah");
  });
});
