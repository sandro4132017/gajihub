import { describe, it, expect } from "vitest";
import {
  PANJANG_MIN_ALASAN_KOREKSI,
  MAKS_BUKTI_KOREKSI_BITA,
  EKSTENSI_BUKTI_KOREKSI,
  validasiAlasanKoreksi,
  validasiBuktiKoreksi,
  butuhBukti,
  periodeDariTanggal,
} from "../koreksiPresensi";

describe("konstanta", () => {
  it("nilai sesuai keputusan", () => {
    expect(PANJANG_MIN_ALASAN_KOREKSI).toBe(15);
    expect(MAKS_BUKTI_KOREKSI_BITA).toBe(2 * 1024 * 1024);
    expect([...EKSTENSI_BUKTI_KOREKSI]).toEqual([".jpg", ".jpeg", ".png", ".pdf"]);
  });
});

describe("validasiAlasanKoreksi", () => {
  it("14 karakter ditolak, 15 lolos", () => {
    expect(validasiAlasanKoreksi("a".repeat(14))).toMatch(/minimal 15 karakter/);
    expect(validasiAlasanKoreksi("a".repeat(15))).toBeNull();
  });
  it("spasi di ujung tidak dihitung", () => {
    expect(validasiAlasanKoreksi("   " + "a".repeat(10) + "   ")).not.toBeNull();
  });
});

describe("validasiBuktiKoreksi", () => {
  it("jpg/jpeg/png/pdf lolos, huruf besar pun", () => {
    for (const nama of ["a.jpg", "a.JPEG", "a.png", "foto.final.PDF"]) {
      expect(validasiBuktiKoreksi({ nama, ukuran: 100 }).ok).toBe(true);
    }
    expect(validasiBuktiKoreksi({ nama: "a.PDF", ukuran: 1 })).toEqual({ ok: true, ekstensi: "pdf" });
  });
  it("tipe lain ditolak (webp, exe, tanpa ekstensi)", () => {
    for (const nama of ["a.webp", "a.exe", "a", "a.pdf.exe"]) {
      expect(validasiBuktiKoreksi({ nama, ukuran: 100 }).ok).toBe(false);
    }
  });
  it("batas 2 MB tepat lolos, lebih sebita ditolak, kosong ditolak", () => {
    expect(validasiBuktiKoreksi({ nama: "a.png", ukuran: MAKS_BUKTI_KOREKSI_BITA }).ok).toBe(true);
    expect(validasiBuktiKoreksi({ nama: "a.png", ukuran: MAKS_BUKTI_KOREKSI_BITA + 1 }).ok).toBe(false);
    expect(validasiBuktiKoreksi({ nama: "a.png", ukuran: 0 }).ok).toBe(false);
  });
});

describe("butuhBukti (per sisi)", () => {
  const tanpa = { jamMasuk: null, jamKeluar: null };
  const REF = "bukti-koreksi/x/y/z.jpg";
  const TIDAK = { masuk: false, keluar: false };
  const lama = (o: Partial<{ jamMasuk: string | null; jamKeluar: string | null; buktiRef: string | null; buktiRefKeluar: string | null }> = {}) => ({
    jamMasuk: "07:15",
    jamKeluar: "16:00",
    buktiRef: REF,
    buktiRefKeluar: REF,
    ...o,
  });

  it("hanya jam lembur -> tidak ada sisi yang wajib", () => {
    expect(butuhBukti(tanpa, null)).toEqual(TIDAK);
    expect(butuhBukti(tanpa, lama({ buktiRef: null, buktiRefKeluar: null }))).toEqual(TIDAK);
  });
  it("jam masuk saja baru -> hanya bukti masuk wajib", () => {
    expect(butuhBukti({ jamMasuk: "07:15", jamKeluar: null }, null)).toEqual({ masuk: true, keluar: false });
  });
  it("jam pulang saja baru -> hanya bukti pulang wajib", () => {
    expect(butuhBukti({ jamMasuk: null, jamKeluar: "16:00" }, null)).toEqual({ masuk: false, keluar: true });
  });
  it("keduanya baru -> dua-duanya wajib", () => {
    expect(butuhBukti({ jamMasuk: "07:15", jamKeluar: "16:00" }, null)).toEqual({ masuk: true, keluar: true });
  });
  it("koreksi lama tanpa bukti di sisi itu -> wajib walau jam tidak berubah", () => {
    expect(
      butuhBukti({ jamMasuk: "07:15", jamKeluar: "16:00" }, lama({ buktiRef: null }))
    ).toEqual({ masuk: true, keluar: false });
    expect(
      butuhBukti({ jamMasuk: "07:15", jamKeluar: "16:00" }, lama({ buktiRefKeluar: null }))
    ).toEqual({ masuk: false, keluar: true });
  });
  it("bukti dan jam tidak berubah -> bukti lama dipakai", () => {
    expect(butuhBukti({ jamMasuk: "07:15", jamKeluar: "16:00" }, lama())).toEqual(TIDAK);
  });
  it("hanya jam masuk berubah -> hanya bukti masuk baru; pulang pakai bukti lama", () => {
    expect(butuhBukti({ jamMasuk: "07:20", jamKeluar: "16:00" }, lama())).toEqual({ masuk: true, keluar: false });
  });
  it("hanya jam pulang berubah -> hanya bukti pulang baru", () => {
    expect(butuhBukti({ jamMasuk: "07:15", jamKeluar: "16:30" }, lama())).toEqual({ masuk: false, keluar: true });
  });
  it("sisi yang dikosongkan (null) tidak butuh bukti walau koreksi lama punya jam", () => {
    expect(butuhBukti({ jamMasuk: null, jamKeluar: "16:00" }, lama({ buktiRefKeluar: null }))).toEqual({
      masuk: false,
      keluar: true,
    });
  });
});

describe("periodeDariTanggal", () => {
  it("memakai bulan & tahun UTC dari tanggal", () => {
    expect(periodeDariTanggal(new Date(Date.UTC(2026, 5, 5)))).toEqual({ bulan: 6, tahun: 2026 });
    expect(periodeDariTanggal(new Date(Date.UTC(2026, 11, 31)))).toEqual({ bulan: 12, tahun: 2026 });
    expect(periodeDariTanggal(new Date(Date.UTC(2027, 0, 1)))).toEqual({ bulan: 1, tahun: 2027 });
  });
});
