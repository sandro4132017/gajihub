import { describe, it, expect } from "vitest";
import { bulanSebelumnyaDalamTahun, deltaPersen } from "../deltaPeriode";

describe("deltaPersen", () => {
  it("menghitung kenaikan dan penurunan", () => {
    expect(deltaPersen(120, 100)).toEqual({ persen: 20, arah: "naik" });
    expect(deltaPersen(80, 100)).toEqual({ persen: 20, arah: "turun" });
  });

  it("persennya selalu positif - arahnya yang membedakan", () => {
    expect(deltaPersen(50, 200)?.persen).toBe(75);
    expect(deltaPersen(50, 200)?.arah).toBe("turun");
  });

  // Pembulatan diperiksa SETELAH dibulatkan: selisih 0,4% yang jadi 0 tidak
  // boleh tampil sebagai "naik 0%".
  it("selisih yang membulat ke nol dilaporkan sebagai tetap, bukan naik 0%", () => {
    expect(deltaPersen(100.4, 100)).toEqual({ persen: 0, arah: "tetap" });
    expect(deltaPersen(99.6, 100)).toEqual({ persen: 0, arah: "tetap" });
    expect(deltaPersen(100, 100)).toEqual({ persen: 0, arah: "tetap" });
  });

  /**
   * Pembeda yang paling penting di modul ini. "Tidak ada pembanding" BUKAN
   * "tidak berubah" - di dashboard yang angkanya menyentuh pembayaran,
   * penanda yang mengarang lebih buruk daripada tidak ada penanda.
   */
  it("null kalau tidak ada pembanding - BUKAN 0%", () => {
    expect(deltaPersen(100, null)).toBeNull();
    expect(deltaPersen(100, undefined)).toBeNull();
  });

  it("null kalau periode sebelumnya NOL - kenaikan dari nol bukan persentase", () => {
    expect(deltaPersen(500, 0)).toBeNull();
    expect(deltaPersen(0, 0)).toBeNull();
  });

  it("null untuk angka yang tidak terhingga / NaN", () => {
    expect(deltaPersen(NaN, 100)).toBeNull();
    expect(deltaPersen(100, NaN)).toBeNull();
    expect(deltaPersen(Infinity, 100)).toBeNull();
  });
});

describe("bulanSebelumnyaDalamTahun", () => {
  it("mengembalikan bulan sebelumnya di tahun yang sama", () => {
    expect(bulanSebelumnyaDalamTahun(8)).toBe(7);
    expect(bulanSebelumnyaDalamTahun(2)).toBe(1);
  });

  // Kalau Januari dipetakan ke Desember tahun yang sama, dashboard akan
  // membandingkan periode ini dengan sebelas bulan ke DEPAN.
  it("Januari null - pembandingnya ada di tahun lain yang tidak ditarik", () => {
    expect(bulanSebelumnyaDalamTahun(1)).toBeNull();
  });

  it("nilai bulan yang tidak masuk akal mengembalikan null, bukan melempar", () => {
    expect(bulanSebelumnyaDalamTahun(0)).toBeNull();
    expect(bulanSebelumnyaDalamTahun(13)).toBeNull();
    expect(bulanSebelumnyaDalamTahun(7.5)).toBeNull();
  });
});
