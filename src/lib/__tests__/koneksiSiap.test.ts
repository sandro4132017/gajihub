import { describe, expect, it, vi } from "vitest";
import {
  kosongkanCacheKoneksiSiap,
  klasifikasiKoneksiSiap,
  periksaKoneksiSiap,
} from "../koneksiSiap";
import type { HasilPingSiap } from "@/adapters/pingSiap";

const galat = (kode: string | null, batasWaktu = false): HasilPingSiap => ({
  jenis: "galat",
  kode,
  batasWaktu,
});

const TABEL: Array<[string, HasilPingSiap, string, string | undefined]> = [
  ["ok", { jenis: "ok" }, "TERHUBUNG", undefined],
  ["jawaban aneh", { jenis: "jawaban_aneh" }, "TIDAK_DIKETAHUI", undefined],
  ["belum diatur", { jenis: "belum_diatur" }, "GANGGUAN", "KONFIGURASI"],
  ["ELOGIN", galat("ELOGIN"), "GANGGUAN", "KONFIGURASI"],
  ["EENCRYPT", galat("EENCRYPT"), "GANGGUAN", "KONFIGURASI"],
  ["batas waktu", galat(null, true), "GANGGUAN", "BATAS_WAKTU"],
  ["ETIMEOUT", galat("ETIMEOUT"), "GANGGUAN", "BATAS_WAKTU"],
  ["ESOCKET", galat("ESOCKET"), "GANGGUAN", "TIDAK_TERJANGKAU"],
  ["EINSTLOOKUP", galat("EINSTLOOKUP"), "GANGGUAN", "TIDAK_TERJANGKAU"],
  ["ECONNRESET", galat("ECONNRESET"), "GANGGUAN", "TIDAK_TERJANGKAU"],
  ["EREQUEST", galat("EREQUEST"), "GANGGUAN", "GALAT_SERVER"],
  ["tanpa kode", galat(null), "GANGGUAN", "GALAT_SERVER"],
  ["kode asing", galat("EXYZ"), "GANGGUAN", "GALAT_SERVER"],
];

describe("klasifikasiKoneksiSiap", () => {
  it.each(TABEL)("%s", (_n, hasil, keadaan, sebab) => {
    const k = klasifikasiKoneksiSiap(hasil);
    expect(k.keadaan).toBe(keadaan);
    expect(k.sebab).toBe(sebab);
  });
});

describe("periksaKoneksiSiap", () => {
  it("hasil tidak memuat alamat, kode galat mentah, atau kata sandi", async () => {
    kosongkanCacheKoneksiSiap();
    const h = await periksaKoneksiSiap({}, { ping: async () => galat("ESOCKET") });
    const teks = JSON.stringify(h);
    expect(teks).not.toContain("192.168");
    expect(teks).not.toContain("ESOCKET");
    expect(teks).not.toContain("password");
    expect(h).toMatchObject({ keadaan: "GANGGUAN", sebab: "TIDAK_TERJANGKAU" });
    kosongkanCacheKoneksiSiap();
  });

  it("cache: pemanggilan kedua dalam 60 detik tidak mem-ping lagi", async () => {
    kosongkanCacheKoneksiSiap();
    const ping = vi.fn(async (): Promise<HasilPingSiap> => ({ jenis: "ok" }));
    let t = 1_000_000;
    const dep = { ping, sekarang: () => t };
    await periksaKoneksiSiap({}, dep);
    t += 30_000;
    await periksaKoneksiSiap({}, dep);
    expect(ping).toHaveBeenCalledTimes(1);
    t += 31_000;
    await periksaKoneksiSiap({}, dep);
    expect(ping).toHaveBeenCalledTimes(2);
    kosongkanCacheKoneksiSiap();
  });
});
