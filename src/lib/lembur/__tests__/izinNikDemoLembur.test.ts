import { describe, expect, it } from "vitest";
import { izinkanNikDemoLembur } from "../izinNikDemoLembur";
import { SATKER_DUMMY } from "../../dataUji";

// Data palsu - sensitive-ok
const NIP_DEV = "100000000000000001"; // sensitive-ok
const NIP_LAIN = "100000000000000002"; // sensitive-ok
const PILOT = "Biro Keuangan dan Barang Milik Negara";
const HIDUP = { TTE_IZINKAN_NIK_DEMO: "true", DEV_AUTH_NIP: NIP_DEV };

describe("izinkanNikDemoLembur", () => {
  it("sakelar TTE_IZINKAN_NIK_DEMO mati -> selalu ditolak, termasuk unit uji & akun dev", () => {
    const env = { DEV_AUTH_NIP: NIP_DEV };
    expect(izinkanNikDemoLembur({ satuanKerja: SATKER_DUMMY, nip: NIP_LAIN }, env)).toBe(false);
    expect(izinkanNikDemoLembur({ satuanKerja: PILOT, nip: NIP_DEV }, env)).toBe(false);
  });
  it("unit uji -> boleh", () => {
    expect(izinkanNikDemoLembur({ satuanKerja: SATKER_DUMMY, nip: NIP_LAIN }, HIDUP)).toBe(true);
  });
  it("akun dev (NIP = DEV_AUTH_NIP) di satker sungguhan -> boleh", () => {
    expect(izinkanNikDemoLembur({ satuanKerja: PILOT, nip: NIP_DEV }, HIDUP)).toBe(true);
    expect(izinkanNikDemoLembur({ satuanKerja: PILOT, nip: ` ${NIP_DEV} ` }, { ...HIDUP, DEV_AUTH_NIP: `"${NIP_DEV}"` })).toBe(true);
  });
  it("pegawai lain di satker sungguhan -> ditolak", () => {
    expect(izinkanNikDemoLembur({ satuanKerja: PILOT, nip: NIP_LAIN }, HIDUP)).toBe(false);
  });
  it("DEV_AUTH_NIP kosong tidak membuka siapa pun", () => {
    const env = { TTE_IZINKAN_NIK_DEMO: "true", DEV_AUTH_NIP: "" };
    expect(izinkanNikDemoLembur({ satuanKerja: PILOT, nip: "" }, env)).toBe(false);
    expect(izinkanNikDemoLembur({ satuanKerja: PILOT, nip: null }, env)).toBe(false);
  });
});
