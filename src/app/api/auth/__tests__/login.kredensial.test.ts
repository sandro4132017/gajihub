import { describe, expect, it } from "vitest";
import { bersihkanNilaiEnv, putuskanLogin } from "../../../../auth/kredensialLogin";

const NIP = "199001010000000001"; // sensitive-ok
const NIP_LAIN = "199002020000000002"; // sensitive-ok
const NIP_UJI = "999900000000000001"; // sensitive-ok
const SANDI_DEV = "sandi-palsu-dev"; // sensitive-ok

const konfig = { devUser: "akun-uji", devPass: SANDI_DEV, modeInternal: true };

describe("putuskanLogin", () => {
  it("akun dev: username dan sandi cocok -> DEV", () => {
    expect(putuskanLogin({ username: "akun-uji", password: SANDI_DEV }, konfig)).toEqual({ jenis: "DEV" });
  });

  it("akun dev: sandi salah -> null", () => {
    expect(putuskanLogin({ username: "akun-uji", password: "salah" }, konfig)).toBeNull();
  });

  it("NIP dengan sandi = NIP lolos (pemisah dibuang)", () => {
    expect(putuskanLogin({ username: NIP, password: NIP }, konfig)).toEqual({ jenis: "NIP", nip: NIP });
    expect(putuskanLogin({ username: "19900101 0000 000001", password: NIP }, konfig)).toEqual({
      jenis: "NIP",
      nip: NIP,
    });
  });

  it("sandi induk akun dev TIDAK membuka NIP siapa pun", () => {
    expect(putuskanLogin({ username: NIP_LAIN, password: SANDI_DEV }, konfig)).toBeNull();
  });

  it("NIP dengan sandi bukan NIP -> null", () => {
    expect(putuskanLogin({ username: NIP, password: NIP_LAIN }, konfig)).toBeNull();
  });

  it("di luar mode internal jalur NIP mati", () => {
    expect(putuskanLogin({ username: NIP, password: NIP }, { ...konfig, modeInternal: false })).toBeNull();
  });

  it("NIP awalan 9999 ditolak di jalur NIP", () => {
    expect(putuskanLogin({ username: NIP_UJI, password: NIP_UJI }, konfig)).toBeNull();
  });

  it("akun dev tidak aktif bila konfigurasinya kosong", () => {
    expect(putuskanLogin({ username: "", password: "" }, { modeInternal: true })).toBeNull();
    expect(putuskanLogin({ username: "akun-uji", password: SANDI_DEV }, { modeInternal: true })).toBeNull();
  });
});

describe("bersihkanNilaiEnv", () => {
  it("membuang kutip dan spasi", () => {
    expect(bersihkanNilaiEnv(' "abc" ')).toBe("abc");
    expect(bersihkanNilaiEnv(undefined)).toBeUndefined();
  });
});
