import { describe, expect, it } from "vitest";
import { pilihPeriodeDefault, periodeSekarang, resolvePeriode } from "../periodeDefault";

const P = (bulan: number, tahun: number) => ({ bulan, tahun });

describe("pilihPeriodeDefault", () => {
  it("memakai periode berjalan kalau datanya memang sudah ada", () => {
    const tersedia = [P(5, 2026), P(7, 2026), P(8, 2026)];
    expect(pilihPeriodeDefault(tersedia, P(8, 2026))).toEqual(P(8, 2026));
  });

  it("jatuh ke periode terbaru yang ada datanya kalau bulan berjalan kosong", () => {
    // Kasus nyata: Agustus 2026 belum punya predikat kinerja, Juli punya.
    const tersedia = [P(5, 2026), P(7, 2026)];
    expect(pilihPeriodeDefault(tersedia, P(8, 2026))).toEqual(P(7, 2026));
  });

  it("membandingkan tahun dulu, baru bulan", () => {
    const tersedia = [P(12, 2026), P(1, 2027)];
    expect(pilihPeriodeDefault(tersedia, P(6, 2027))).toEqual(P(1, 2027));
  });

  it("tidak peduli urutan masukan", () => {
    const acak = [P(3, 2026), P(11, 2026), P(1, 2026), P(7, 2026)];
    expect(pilihPeriodeDefault(acak, P(12, 2026))).toEqual(P(11, 2026));
  });

  it("balik ke periode berjalan kalau tidak ada data sama sekali", () => {
    // Database kosong (mis. server baru) - halaman tetap harus bisa dibuka.
    expect(pilihPeriodeDefault([], P(8, 2026))).toEqual(P(8, 2026));
  });

  it("tidak membuang periode di masa depan", () => {
    // Kalau ada yang sengaja memasukkan data lebih awal, halamannya harus
    // tetap bisa dicapai lewat link sidebar yang tanpa query string.
    expect(pilihPeriodeDefault([P(9, 2026), P(7, 2026)], P(8, 2026))).toEqual(P(9, 2026));
  });
});

describe("periodeSekarang", () => {
  it("bulan dihitung 1-12, bukan 0-11", () => {
    expect(periodeSekarang(new Date("2026-01-15T00:00:00Z"))).toEqual(P(1, 2026));
    expect(periodeSekarang(new Date("2026-12-31T00:00:00Z"))).toEqual(P(12, 2026));
  });
});

describe("resolvePeriode", () => {
  const tersedia = [P(5, 2026), P(7, 2026)];
  const waktu = new Date("2026-08-10T00:00:00Z");

  it("query string yang lengkap dipakai apa adanya", () => {
    expect(resolvePeriode("3", "2026", tersedia, waktu)).toEqual(P(3, 2026));
  });

  it("periode yang dipilih user TIDAK dipindahkan walau kosong", () => {
    // Kalau user membuka Agustus dan Agustus memang kosong, itu jawaban yang
    // benar - memindahkannya diam-diam ke Juli justru menyembunyikan fakta.
    expect(resolvePeriode("8", "2026", tersedia, waktu)).toEqual(P(8, 2026));
  });

  it("tanpa query string jatuh ke periode terbaru yang ada datanya", () => {
    expect(resolvePeriode(undefined, undefined, tersedia, waktu)).toEqual(P(7, 2026));
  });

  it("bulan saja: bulannya menang, tahun ikut periode default", () => {
    expect(resolvePeriode("3", undefined, tersedia, waktu)).toEqual(P(3, 2026));
  });

  it("tahun saja: tahunnya menang, bulan ikut periode default", () => {
    expect(resolvePeriode(undefined, "2027", tersedia, waktu)).toEqual(P(7, 2027));
  });

  it("nilai ngawur diabaikan, bukan bikin NaN", () => {
    // Query string datang dari luar - "?bulan=abc" dulu menghasilkan NaN yang
    // diteruskan ke query Prisma dan mengembalikan nol baris tanpa penjelasan.
    for (const b of ["abc", "0", "13", "-1", "7.5", ""]) {
      expect(resolvePeriode(b, undefined, tersedia, waktu)).toEqual(P(7, 2026));
    }
    for (const t of ["abc", "26", ""]) {
      expect(resolvePeriode(undefined, t, tersedia, waktu)).toEqual(P(7, 2026));
    }
  });
});
