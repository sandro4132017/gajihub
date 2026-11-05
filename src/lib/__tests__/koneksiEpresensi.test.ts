import { describe, expect, it } from "vitest";
import {
  kosongkanCacheKoneksiEpresensi,
  klasifikasiKoneksiEpresensi,
  periksaKoneksiEpresensi,
} from "../koneksiEpresensi";
import type { HasilPingEpresensi } from "@/adapters/pingEpresensi";


const galat = (kode: string | null, batasWaktu = false): HasilPingEpresensi => ({
  jenis: "galat",
  kode,
  batasWaktu,
});

const TABEL: Array<[string, HasilPingEpresensi, string, string | undefined]> = [
  ["ok", { jenis: "ok" }, "TERHUBUNG", undefined],
  ["jawaban aneh", { jenis: "jawaban_aneh" }, "TIDAK_DIKETAHUI", undefined],
  ["belum diatur", { jenis: "belum_diatur" }, "GANGGUAN", "KONFIGURASI"],
  ["28P01", galat("28P01"), "GANGGUAN", "KONFIGURASI"],
  ["28000", galat("28000"), "GANGGUAN", "KONFIGURASI"],
  ["3D000", galat("3D000"), "GANGGUAN", "KONFIGURASI"],
  ["42501", galat("42501"), "GANGGUAN", "KONFIGURASI"],
  ["batas waktu", galat(null, true), "GANGGUAN", "BATAS_WAKTU"],
  ["ECONNREFUSED", galat("ECONNREFUSED"), "GANGGUAN", "TIDAK_TERJANGKAU"],
  ["EHOSTUNREACH", galat("EHOSTUNREACH"), "GANGGUAN", "TIDAK_TERJANGKAU"],
  ["ENETUNREACH", galat("ENETUNREACH"), "GANGGUAN", "TIDAK_TERJANGKAU"],
  ["ENOTFOUND", galat("ENOTFOUND"), "GANGGUAN", "TIDAK_TERJANGKAU"],
  ["EAI_AGAIN", galat("EAI_AGAIN"), "GANGGUAN", "TIDAK_TERJANGKAU"],
  ["ETIMEDOUT", galat("ETIMEDOUT"), "GANGGUAN", "TIDAK_TERJANGKAU"],
  ["ECONNRESET", galat("ECONNRESET"), "GANGGUAN", "TIDAK_TERJANGKAU"],
  ["EPIPE", galat("EPIPE"), "GANGGUAN", "TIDAK_TERJANGKAU"],
  ["53300", galat("53300"), "GANGGUAN", "SIBUK"],
  ["57P01", galat("57P01"), "GANGGUAN", "TIDAK_TERJANGKAU"],
  ["08006", galat("08006"), "GANGGUAN", "TIDAK_TERJANGKAU"],
  ["tanpa kode", galat(null), "GANGGUAN", "GALAT_SERVER"],
  ["kode asing", galat("XX000"), "GANGGUAN", "GALAT_SERVER"],
];

describe("klasifikasiKoneksiEpresensi", () => {
  it.each(TABEL)("%s", (_n, hasil, keadaan, sebab) => {
    const k = klasifikasiKoneksiEpresensi(hasil);
    expect(k.keadaan).toBe(keadaan);
    expect(k.sebab).toBe(sebab);
  });

  it("galat apa pun tidak pernah TERHUBUNG", () => {
    for (const [, hasil] of TABEL) {
      if (hasil.jenis === "galat" || hasil.jenis === "belum_diatur") {
        expect(klasifikasiKoneksiEpresensi(hasil).keadaan).not.toBe("TERHUBUNG");
      }
    }
  });
});

describe("periksaKoneksiEpresensi", () => {
  it("hasil tidak memuat alamat, kode galat mentah, atau kata sandi", async () => {
    kosongkanCacheKoneksiEpresensi();
    const h = await periksaKoneksiEpresensi(
      {},
      { ping: async () => galat("ECONNREFUSED") }
    );
    const teks = JSON.stringify(h);
    expect(teks).not.toContain("192.168");
    expect(teks).not.toContain("ECONNREFUSED");
    expect(teks).not.toContain("password");
    expect(h).toMatchObject({ keadaan: "GANGGUAN", sebab: "TIDAK_TERJANGKAU" });
    kosongkanCacheKoneksiEpresensi();
  });
});
