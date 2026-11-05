import { describe, expect, it, vi } from "vitest";
import {
  BATAS_GAGAL,
  KUNCI_MS,
  akhirHariWib,
  buatHashPenguji,
  buatPembatas,
  cocokkanPassword,
  konfigPenguji,
} from "../akunPenguji";
import { putuskanLogin } from "../kredensialLogin";

const SANDI = "sandi-penguji-palsu"; // sensitive-ok
const HASH = buatHashPenguji(SANDI);
const ENV = { PENGUJI_USER: "penguji-uji", PENGUJI_PASS_HASH: HASH };
const SEKARANG = new Date("2026-11-10T03:00:00Z");

describe("hash penguji", () => {
  it("format scrypt:N:r:p:salt:hash tanpa karakter $", () => {
    expect(HASH.split(":")).toHaveLength(6);
    expect(HASH.startsWith("scrypt:")).toBe(true);
    expect(HASH).not.toContain("$");
  });

  it("sandi benar cocok, salah tidak, hash rusak tidak", () => {
    expect(cocokkanPassword(SANDI, HASH)).toBe(true);
    expect(cocokkanPassword("salah", HASH)).toBe(false);
    expect(cocokkanPassword(SANDI, "bukan-hash")).toBe(false);
  });

  it("garam acak: dua hash dari sandi sama berbeda tapi sama-sama cocok", () => {
    const lain = buatHashPenguji(SANDI);
    expect(lain).not.toBe(HASH);
    expect(cocokkanPassword(SANDI, lain)).toBe(true);
  });

  it("parameter di luar batas ditolak", () => {
    const [, , r, p, salt, hash] = HASH.split(":");
    expect(cocokkanPassword(SANDI, ["scrypt", "3", r, p, salt, hash].join(":"))).toBe(false);
    expect(cocokkanPassword(SANDI, ["scrypt", String(2 ** 18), r, p, salt, hash].join(":"))).toBe(false);
    expect(cocokkanPassword(SANDI, ["scrypt", "16384", "9", p, salt, hash].join(":"))).toBe(false);
  });
});

describe("konfigPenguji", () => {
  it("aktif bila user dan hash terisi", () => {
    expect(konfigPenguji(ENV, SEKARANG)?.user).toBe("penguji-uji");
  });

  it("mati bila salah satu kosong atau hash rusak", () => {
    expect(konfigPenguji({}, SEKARANG)).toBeNull();
    expect(konfigPenguji({ PENGUJI_USER: "x" }, SEKARANG)).toBeNull();
    expect(konfigPenguji({ ...ENV, PENGUJI_PASS_HASH: "rusak" }, SEKARANG)).toBeNull();
  });

  it("berlaku sampai 23:59:59 WIB pada tanggal yang ditulis", () => {
    const env = { ...ENV, PENGUJI_BERLAKU_SAMPAI: "2026-11-10" };
    expect(akhirHariWib("2026-11-10")?.toISOString()).toBe("2026-11-10T16:59:59.000Z");
    expect(konfigPenguji(env, new Date("2026-11-10T16:59:59Z"))).not.toBeNull();
    expect(konfigPenguji(env, new Date("2026-11-10T17:00:00Z"))).toBeNull();
  });

  it("tanggal rusak = mati", () => {
    for (const t of ["10-11-2026", "2026-13-01", "2026-02-30", "besok"]) {
      expect(konfigPenguji({ ...ENV, PENGUJI_BERLAKU_SAMPAI: t }, SEKARANG), t).toBeNull();
    }
  });

  it("tanda kutip pembungkus dibuang", () => {
    expect(konfigPenguji({ PENGUJI_USER: '"penguji-uji"', PENGUJI_PASS_HASH: `"${HASH}"` }, SEKARANG)).not.toBeNull();
  });
});

describe("pembatas percobaan", () => {
  it("terkunci setelah 5 gagal, lepas setelah 15 menit", () => {
    const b = buatPembatas();
    const t0 = 1_000_000;
    for (let i = 0; i < BATAS_GAGAL - 1; i++) b.catatGagal(t0 + i);
    expect(b.terkunci(t0 + 10)).toBe(false);
    b.catatGagal(t0 + 10);
    expect(b.terkunci(t0 + 11)).toBe(true);
    expect(b.terkunci(t0 + 10 + KUNCI_MS)).toBe(false);
  });

  it("gagal yang sudah lewat jendela 15 menit tidak dihitung", () => {
    const b = buatPembatas();
    for (let i = 0; i < BATAS_GAGAL - 1; i++) b.catatGagal(i);
    b.catatGagal(KUNCI_MS + 1000);
    expect(b.terkunci(KUNCI_MS + 1001)).toBe(false);
  });
});

describe("putuskanLogin jalur penguji", () => {
  const penguji = konfigPenguji(ENV, SEKARANG);
  const konfig = { modeInternal: false, penguji };

  it("sandi benar -> PENGUJI, di luar mode internal sekalipun", () => {
    const b = buatPembatas();
    expect(putuskanLogin({ username: "penguji-uji", password: SANDI }, konfig, SEKARANG, b)).toEqual({
      jenis: "PENGUJI",
    });
  });

  it("sandi salah -> null, lima kali -> terkunci (null juga) walau sandi benar", () => {
    const b = buatPembatas();
    for (let i = 0; i < BATAS_GAGAL; i++) {
      expect(putuskanLogin({ username: "penguji-uji", password: "salah" }, konfig, SEKARANG, b)).toBeNull();
    }
    expect(putuskanLogin({ username: "penguji-uji", password: SANDI }, konfig, SEKARANG, b)).toBeNull();
  });

  it("terkunci dicatat ke log server tanpa username atau sandi", () => {
    const b = buatPembatas();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < BATAS_GAGAL; i++) putuskanLogin({ username: "penguji-uji", password: "salah" }, konfig, SEKARANG, b);
    putuskanLogin({ username: "penguji-uji", password: SANDI }, konfig, SEKARANG, b);
    expect(warn).toHaveBeenCalledTimes(1);
    const teks = JSON.stringify(warn.mock.calls);
    expect(teks).not.toContain("penguji-uji");
    expect(teks).not.toContain(SANDI);
    warn.mockRestore();
  });

  it("konfigurasi mati -> username penguji tidak dikenal", () => {
    expect(
      putuskanLogin({ username: "penguji-uji", password: SANDI }, { modeInternal: false, penguji: null }, SEKARANG)
    ).toBeNull();
  });
});
