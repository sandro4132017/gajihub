import { describe, it, expect, afterEach } from "vitest";
import { kunciSidikNik, normalkanNik, sidikNik, sidikSama } from "../sidikNik";
import { cariNikDariInfo } from "../sso";

const KUNCI = "kunci-uji-yang-panjangnya-cukup-32-karakter";
const NIK = "3175012345678901";

describe("normalkanNik", () => {
  it("menerima NIK 16 digit, termasuk yang berpemisah", () => {
    expect(normalkanNik(NIK)).toBe(NIK);
    expect(normalkanNik("3175 0123 4567 8901")).toBe(NIK);
    expect(normalkanNik("  3175012345678901  ")).toBe(NIK);
  });

  // Panjangnya yang membedakan NIK dari NIP - dan keduanya hidup berdampingan
  // di sistem ini, jadi tertukar berarti mencari orang di ruang yang salah.
  it("menolak NIP 18 digit - itu bukan NIK", () => {
    expect(normalkanNik("197303072005011001")).toBeNull();
  });

  it("menolak tipe angka - 16 digit sudah melewati batas aman bilangan JSON", () => {
    expect(normalkanNik(3175012345678901)).toBeNull();
  });

  it("tidak membuang sembarang non-digit", () => {
    expect(normalkanNik("31750123/45678901")).toBeNull();
    expect(normalkanNik("3175012345678901@mail")).toBeNull();
  });
});

describe("sidikNik", () => {
  it("tetap sama untuk NIK yang sama, dan berbeda untuk NIK yang berbeda", () => {
    const a = sidikNik(NIK, KUNCI);
    expect(a).toBe(sidikNik(NIK, KUNCI));
    expect(a).not.toBe(sidikNik("3175012345678902", KUNCI));
  });

  // Inti perbedaannya dari hash biasa. NIK itu ruang yang bisa dicacah, jadi
  // tanpa kunci, sidiknya bisa dihitung ulang siapa saja.
  it("berubah total kalau kuncinya berbeda", () => {
    expect(sidikNik(NIK, KUNCI)).not.toBe(sidikNik(NIK, KUNCI + "x"));
  });

  it("bentuk berpemisah menghasilkan sidik yang SAMA - normalisasi dulu, baru HMAC", () => {
    expect(sidikNik("3175 0123 4567 8901", KUNCI)).toBe(sidikNik(NIK, KUNCI));
  });

  it("mengembalikan null untuk yang bukan NIK, bukan melempar", () => {
    expect(sidikNik("197303072005011001", KUNCI)).toBeNull();
    expect(sidikNik(null, KUNCI)).toBeNull();
    expect(sidikNik("", KUNCI)).toBeNull();
  });

  // NIK-nya tidak boleh bisa dibaca balik dari yang tersimpan.
  it("tidak memuat potongan NIK di dalam hasilnya", () => {
    const s = sidikNik(NIK, KUNCI)!;
    expect(s).toMatch(/^[0-9a-f]{64}$/);
    expect(s).not.toContain(NIK);
    expect(s).not.toContain(NIK.slice(0, 8));
  });
});

describe("kunciSidikNik", () => {
  const asli = process.env.SIDIK_NIK_SECRET;
  afterEach(() => {
    if (asli === undefined) delete process.env.SIDIK_NIK_SECRET;
    else process.env.SIDIK_NIK_SECRET = asli;
  });

  // Pelajaran dari getSecretKey() di session.ts, yang diam-diam memakai nilai
  // cadangan yang ada di repo PUBLIK. Kalau fungsi ini punya cadangan, sidik
  // seluruh pegawai bisa dihitung ulang siapa saja.
  it("MELEMPAR kalau kunci belum diisi - tidak pernah memakai nilai cadangan", () => {
    delete process.env.SIDIK_NIK_SECRET;
    expect(() => kunciSidikNik()).toThrow(/SIDIK_NIK_SECRET belum diisi/);
  });

  it("MELEMPAR kalau kuncinya terlalu pendek", () => {
    process.env.SIDIK_NIK_SECRET = "pendek";
    expect(() => kunciSidikNik()).toThrow(/terlalu pendek/);
  });

  it("mengembalikan kunci yang sah", () => {
    process.env.SIDIK_NIK_SECRET = KUNCI;
    expect(kunciSidikNik()).toBe(KUNCI);
  });
});

describe("sidikSama", () => {
  it("benar untuk pasangan yang sama, salah untuk sisanya", () => {
    const s = sidikNik(NIK, KUNCI)!;
    expect(sidikSama(s, s)).toBe(true);
    expect(sidikSama(s, sidikNik("3175012345678902", KUNCI))).toBe(false);
    expect(sidikSama(s, null)).toBe(false);
    expect(sidikSama(null, null)).toBe(false);
    expect(sidikSama(s, "pendek")).toBe(false);
  });
});

describe("cariNikDariInfo - bentuk balasan Naco yang sebenarnya", () => {
  // Bentuk ini DIUKUR dua kali pada 2026-08-31: akun publik DAN akun pegawai.
  // Keduanya identik - username 16 digit, dan tidak ada nilai 18 digit.
  const BALASAN_NACO = {
    data: {
      id: "0f8b2c4e-1a3d-4f5b-9c7e-2d6a8b0c4e1f",
      username: "3175012345678901",
      name: "Nama Pegawai",
      roles: [{ id: "9a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d", name: "user", label: "User" }],
      status: "active",
      email: "orang@kemnaker.go.id",
    },
    meta: { version: "1", hostname: "naco-app" },
  };

  it("menemukan NIK di data.username", () => {
    expect(cariNikDariInfo(BALASAN_NACO, "data.username")).toBe(NIK);
  });

  it("menelusuri sebagai cadangan kalau nama fieldnya berubah", () => {
    expect(cariNikDariInfo(BALASAN_NACO, "data.tidak_ada")).toBe(NIK);
    expect(cariNikDariInfo(BALASAN_NACO, null)).toBe(NIK);
  });

  // UUID memuat banyak digit tapi bukan 16 digit polos - jadi tidak bisa
  // tersangkut sebagai NIK.
  it("tidak tersangkut UUID atau email", () => {
    const tanpaNik = { data: { id: BALASAN_NACO.data.id, email: "a@b.go.id" } };
    expect(cariNikDariInfo(tanpaNik, "data.username")).toBeNull();
    expect(cariNikDariInfo(tanpaNik, null)).toBeNull();
  });

  it("balasan tanpa apa pun yang berbentuk NIK mengembalikan null", () => {
    expect(cariNikDariInfo({}, "data.username")).toBeNull();
    expect(cariNikDariInfo(null, null)).toBeNull();
  });
});
