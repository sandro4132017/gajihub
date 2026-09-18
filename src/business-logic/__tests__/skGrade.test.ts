import { describe, expect, it } from "vitest";
import { skGradeBerlaku, type SkGradeRingkas } from "../skGrade";

const sk = (nomorSk: string, tmt: string, kelasJabatan: number, tanggal = tmt): SkGradeRingkas => ({
  nomorSk,
  tanggalSk: new Date(`${tanggal}T00:00:00Z`),
  tmtBerlaku: new Date(`${tmt}T00:00:00Z`),
  kelasJabatan,
});

describe("skGradeBerlaku", () => {
  it("tidak ada SK sama sekali -> null, bukan menebak", () => {
    expect(skGradeBerlaku([], 7, 2026)).toBeNull();
  });

  it("memakai SK yang berlaku pada periode itu, BUKAN yang terbaru", () => {
    // Inti seluruh modul ini: berkas ADK bisa dibuat jauh setelah periodenya
    // lewat. Ekspor Januari wajib memuat SK era Januari walau sekarang sudah
    // ada SK yang lebih baru.
    const daftar = [sk("SK-LAMA", "2025-01-01", 7), sk("SK-BARU", "2026-05-01", 9)];
    expect(skGradeBerlaku(daftar, 1, 2026)?.nomorSk).toBe("SK-LAMA");
    expect(skGradeBerlaku(daftar, 8, 2026)?.nomorSk).toBe("SK-BARU");
  });

  it("SK yang mulai berlaku SESUDAH periodenya diabaikan", () => {
    expect(skGradeBerlaku([sk("SK-DEPAN", "2026-09-01", 9)], 7, 2026)).toBeNull();
  });

  it("SK yang terbit DI TENGAH periode tetap dipakai untuk periode itu", () => {
    // Ambangnya akhir bulan, bukan awal bulan. Kalau awal bulan yang dipakai,
    // SK yang berlaku 20 Januari terlewat dan Januari mengirim kelas lama.
    expect(skGradeBerlaku([sk("SK-TENGAH", "2026-01-20", 9)], 1, 2026)?.nomorSk).toBe("SK-TENGAH");
  });

  it("hari TERAKHIR bulan masih masuk, hari PERTAMA bulan berikutnya tidak", () => {
    expect(skGradeBerlaku([sk("SK-A", "2026-01-31", 9)], 1, 2026)?.nomorSk).toBe("SK-A");
    expect(skGradeBerlaku([sk("SK-B", "2026-02-01", 9)], 1, 2026)).toBeNull();
  });

  it("lintas tahun: periode Januari memakai SK dari Desember tahun sebelumnya", () => {
    expect(skGradeBerlaku([sk("SK-DES", "2025-12-01", 8)], 1, 2026)?.nomorSk).toBe("SK-DES");
  });

  it("kelas jabatannya ikut terbawa, bukan cuma nomornya", () => {
    expect(skGradeBerlaku([sk("SK-A", "2026-01-01", 11)], 3, 2026)?.kelasJabatan).toBe(11);
  });

  it("dua SK ber-TMT sama: tanggal SK yang lebih baru menang", () => {
    const daftar = [sk("SK-A", "2026-01-01", 7, "2025-12-01"), sk("SK-B", "2026-01-01", 9, "2025-12-20")];
    expect(skGradeBerlaku(daftar, 3, 2026)?.nomorSk).toBe("SK-B");
  });

  it("TMT dan tanggal SK sama-sama kembar: nomor yang menentukan - hasilnya TIDAK boleh acak", () => {
    // Dua ekspor untuk periode yang sama harus memuat nomor SK yang sama.
    // Tanpa penyetara terakhir ini, hasilnya ikut urutan baris dari database.
    const a = sk("SK-001", "2026-01-01", 7);
    const b = sk("SK-002", "2026-01-01", 9);
    expect(skGradeBerlaku([a, b], 3, 2026)?.nomorSk).toBe("SK-002");
    expect(skGradeBerlaku([b, a], 3, 2026)?.nomorSk).toBe("SK-002");
  });

  it("urutan masukan tidak mengubah hasil", () => {
    const daftar = [sk("SK-C", "2026-05-01", 9), sk("SK-A", "2024-01-01", 6), sk("SK-B", "2025-03-01", 7)];
    const maju = skGradeBerlaku(daftar, 8, 2026)?.nomorSk;
    const mundur = skGradeBerlaku([...daftar].reverse(), 8, 2026)?.nomorSk;
    expect(maju).toBe("SK-C");
    expect(mundur).toBe("SK-C");
  });
});
