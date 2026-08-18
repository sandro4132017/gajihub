import { describe, it, expect } from "vitest";
import { hitungPaginasi, UKURAN_HALAMAN, UKURAN_HALAMAN_DEFAULT } from "../Paginasi";

describe("hitungPaginasi", () => {
  it("default 10 baris per halaman, mulai dari halaman 1", () => {
    const p = hitungPaginasi(81, undefined, undefined);
    expect(p.perHalaman).toBe(UKURAN_HALAMAN_DEFAULT);
    expect(p.halaman).toBe(1);
    expect(p.mulai).toBe(0);
    expect(p.selesai).toBe(10);
    expect(p.totalHalaman).toBe(9); // 81 / 10 dibulatkan ke atas
  });

  it("memotong halaman terakhir sesuai sisa baris, bukan penuh", () => {
    const p = hitungPaginasi(81, "9", "10");
    expect(p.mulai).toBe(80);
    expect(p.selesai).toBe(81); // bukan 90
  });

  it("menerima semua ukuran halaman yang ditawarkan", () => {
    for (const n of UKURAN_HALAMAN) {
      expect(hitungPaginasi(500, "1", String(n)).perHalaman).toBe(n);
    }
  });

  // Query string datang dari luar - nilai ngawur tidak boleh bikin halaman
  // error atau menghasilkan slice yang aneh.
  it("menolak ukuran halaman di luar daftar", () => {
    for (const buruk of ["7", "1000", "0", "-5", "abc", ""]) {
      expect(hitungPaginasi(100, "1", buruk).perHalaman, `per=${buruk}`).toBe(UKURAN_HALAMAN_DEFAULT);
    }
  });

  it("menjepit nomor halaman ke rentang yang sah", () => {
    expect(hitungPaginasi(81, "0", "10").halaman).toBe(1);
    expect(hitungPaginasi(81, "-3", "10").halaman).toBe(1);
    expect(hitungPaginasi(81, "999", "10").halaman).toBe(9);
    expect(hitungPaginasi(81, "abc", "10").halaman).toBe(1);
    expect(hitungPaginasi(81, "2.5", "10").halaman).toBe(1);
  });

  it("data kosong tetap menghasilkan 1 halaman, bukan 0", () => {
    const p = hitungPaginasi(0, undefined, undefined);
    expect(p.totalHalaman).toBe(1);
    expect(p.halaman).toBe(1);
    expect(p.mulai).toBe(0);
    expect(p.selesai).toBe(0);
  });

  it("jumlah baris pas kelipatan ukuran halaman tidak menyisakan halaman kosong", () => {
    const p = hitungPaginasi(100, "1", "50");
    expect(p.totalHalaman).toBe(2);
  });

  it("seluruh baris terjangkau persis sekali kalau halaman ditelusuri berurutan", () => {
    // Penjagaan paling penting: tidak ada baris yang terlewat atau dobel.
    const total = 81;
    const terlihat: number[] = [];
    const totalHalaman = hitungPaginasi(total, "1", "20").totalHalaman;
    for (let h = 1; h <= totalHalaman; h++) {
      const p = hitungPaginasi(total, String(h), "20");
      for (let i = p.mulai; i < p.selesai; i++) terlihat.push(i);
    }
    expect(terlihat).toEqual(Array.from({ length: total }, (_, i) => i));
  });
});
