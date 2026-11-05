import { describe, expect, it, vi } from "vitest";
import { adaLoginKataSandi, bersihkanNilaiEnv, putuskanLogin } from "../../../../auth/kredensialLogin";
import { BATAS_GAGAL, KUNCI_MS, buatHashPenguji, buatPembatas } from "../../../../auth/akunPenguji";

const NIP = "199001010000000001"; // sensitive-ok
const NIP_UJI = "999900000000000001"; // sensitive-ok
const SANDI_DEV = "sandi-palsu-dev"; // sensitive-ok
const SEKARANG = new Date("2026-11-05T03:00:00Z");

const konfig = { devUser: "akun-uji", devPass: SANDI_DEV };

describe("putuskanLogin", () => {
  it("akun dev: username dan sandi cocok -> DEV", () => {
    expect(putuskanLogin({ username: "akun-uji", password: SANDI_DEV }, konfig, SEKARANG, buatPembatas(), buatPembatas())).toEqual({
      jenis: "DEV",
    });
  });

  it("akun dev: sandi salah atau beda panjang -> null tanpa melempar", () => {
    const b = buatPembatas();
    expect(putuskanLogin({ username: "akun-uji", password: "salah" }, konfig, SEKARANG, buatPembatas(), b)).toBeNull();
    expect(putuskanLogin({ username: "akun-uji", password: SANDI_DEV + "x" }, konfig, SEKARANG, buatPembatas(), b)).toBeNull();
  });

  it("NIP=NIP DITOLAK walau akun dev dikonfigurasi, di mode apa pun", () => {
    for (const env of ["INTERNAL", "PUBLIC"]) {
      vi.stubEnv("TEST_NETWORK_MODE", env);
      vi.stubEnv("ALLOW_NIP_LOGIN", "true");
      expect(putuskanLogin({ username: NIP, password: NIP }, konfig, SEKARANG, buatPembatas(), buatPembatas())).toBeNull();
      expect(
        putuskanLogin({ username: "19900101 0000 000001", password: NIP }, konfig, SEKARANG, buatPembatas(), buatPembatas())
      ).toBeNull();
      expect(putuskanLogin({ username: NIP_UJI, password: NIP_UJI }, konfig, SEKARANG, buatPembatas(), buatPembatas())).toBeNull();
      vi.unstubAllEnvs();
    }
  });

  it("sandi induk akun dev TIDAK membuka NIP siapa pun", () => {
    expect(putuskanLogin({ username: NIP, password: SANDI_DEV }, konfig, SEKARANG, buatPembatas(), buatPembatas())).toBeNull();
  });

  it("akun dev tidak aktif bila konfigurasinya kosong", () => {
    expect(putuskanLogin({ username: "", password: "" }, {})).toBeNull();
    expect(putuskanLogin({ username: "akun-uji", password: SANDI_DEV }, {})).toBeNull();
  });
});

describe("pembatas percobaan akun dev", () => {
  it("5 gagal -> terkunci walau sandi benar; log tanpa username/sandi; pulih setelah 15 menit", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pembatasDev = buatPembatas();
    const pembatasPenguji = buatPembatas();
    const coba = (password: string, now = SEKARANG) =>
      putuskanLogin({ username: "akun-uji", password }, konfig, now, pembatasPenguji, pembatasDev);

    for (let i = 0; i < BATAS_GAGAL; i++) expect(coba("salah")).toBeNull();
    expect(coba(SANDI_DEV)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    const teks = JSON.stringify(warn.mock.calls);
    expect(teks).not.toContain("akun-uji");
    expect(teks).not.toContain(SANDI_DEV);

    expect(coba(SANDI_DEV, new Date(SEKARANG.getTime() + KUNCI_MS + 1000))).toEqual({ jenis: "DEV" });
    warn.mockRestore();
  });

  it("terpisah dari pembatas penguji: dev terkunci tidak mengunci penguji", () => {
    const pembatasDev = buatPembatas();
    const pembatasPenguji = buatPembatas();
    const penguji = { user: "penguji-uji", passHash: buatHashPenguji("sandi-penguji-palsu"), berlakuSampai: null }; // sensitive-ok
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < BATAS_GAGAL; i++) {
      putuskanLogin({ username: "akun-uji", password: "salah" }, { ...konfig, penguji }, SEKARANG, pembatasPenguji, pembatasDev);
    }
    expect(pembatasDev.terkunci(SEKARANG.getTime())).toBe(true);
    expect(pembatasPenguji.terkunci(SEKARANG.getTime())).toBe(false);
    expect(
      putuskanLogin({ username: "penguji-uji", password: "sandi-penguji-palsu" }, { ...konfig, penguji }, SEKARANG, pembatasPenguji, pembatasDev) // sensitive-ok
    ).toEqual({ jenis: "PENGUJI" });
    vi.restoreAllMocks();
  });

  it("sukses mereset hitungan gagal", () => {
    const pembatasDev = buatPembatas();
    const coba = (password: string) =>
      putuskanLogin({ username: "akun-uji", password }, konfig, SEKARANG, buatPembatas(), pembatasDev);
    for (let i = 0; i < BATAS_GAGAL - 1; i++) coba("salah");
    expect(coba(SANDI_DEV)).toEqual({ jenis: "DEV" });
    for (let i = 0; i < BATAS_GAGAL - 1; i++) coba("salah");
    expect(coba(SANDI_DEV)).toEqual({ jenis: "DEV" });
  });
});

describe("adaLoginKataSandi (gerbang form login)", () => {
  const sandiHash = buatHashPenguji("sandi-penguji-palsu"); // sensitive-ok

  it("kosong -> form tidak tampil, hanya SSO", () => {
    expect(adaLoginKataSandi({})).toBe(false);
    expect(adaLoginKataSandi({ ALLOW_NIP_LOGIN: "true" })).toBe(false);
    expect(adaLoginKataSandi({ DEV_AUTH_USER: "akun-uji" })).toBe(false);
  });

  it("akun dev lengkap -> tampil", () => {
    expect(adaLoginKataSandi({ DEV_AUTH_USER: "akun-uji", DEV_AUTH_PASS: SANDI_DEV })).toBe(true);
  });

  it("akun penguji aktif -> tampil; kedaluwarsa -> tidak", () => {
    expect(adaLoginKataSandi({ PENGUJI_USER: "penguji-uji", PENGUJI_PASS_HASH: sandiHash }, SEKARANG)).toBe(true);
    expect(
      adaLoginKataSandi(
        { PENGUJI_USER: "penguji-uji", PENGUJI_PASS_HASH: sandiHash, PENGUJI_BERLAKU_SAMPAI: "2020-01-01" },
        SEKARANG
      )
    ).toBe(false);
  });
});

describe("bersihkanNilaiEnv", () => {
  it("membuang kutip dan spasi", () => {
    expect(bersihkanNilaiEnv(' "abc" ')).toBe("abc");
    expect(bersihkanNilaiEnv(undefined)).toBeUndefined();
  });
});
