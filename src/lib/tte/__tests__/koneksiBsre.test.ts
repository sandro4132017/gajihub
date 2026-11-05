import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  klasifikasiKoneksiBsre,
  kosongkanCacheKoneksiBsre,
  periksaKoneksiBsre,
} from "../koneksiBsre";
import type { HasilPingBsre } from "../esignClient";

vi.mock("../esignClient", () => ({ pingLayananBsre: vi.fn() }));

const resp = (status: number, punyaStatusCode: boolean): HasilPingBsre => ({
  jenis: "respons",
  status,
  punyaStatusCode,
});
const OK: HasilPingBsre = resp(200, true);

describe("klasifikasiKoneksiBsre", () => {
  const kasus: Array<[string, HasilPingBsre, string, string | undefined]> = [
    ["200 ber-status", resp(200, true), "TERHUBUNG", undefined],
    ["404 ber-JSON status (NIK tak terdaftar)", resp(404, true), "TERHUBUNG", undefined],
    ["400 ber-JSON status", resp(400, true), "TERHUBUNG", undefined],
    ["500", resp(500, false), "GANGGUAN", "GALAT_SERVER"],
    ["503 ber-JSON", resp(503, true), "GANGGUAN", "GALAT_SERVER"],
    ["401", resp(401, false), "GANGGUAN", "KONFIGURASI"],
    ["403", resp(403, false), "GANGGUAN", "KONFIGURASI"],
    ["404 tanpa status", resp(404, false), "GANGGUAN", "KONFIGURASI"],
    ["408", resp(408, false), "GANGGUAN", "SIBUK"],
    ["429", resp(429, false), "GANGGUAN", "SIBUK"],
    ["batas waktu", { jenis: "galat", batasWaktu: true, ditolak: false }, "GANGGUAN", "BATAS_WAKTU"],
    ["ditolak/fetch failed", { jenis: "galat", batasWaktu: false, ditolak: true }, "GANGGUAN", "TIDAK_TERJANGKAU"],
    ["2xx tak dikenali", resp(200, false), "TIDAK_DIKETAHUI", undefined],
  ];
  it.each(kasus)("%s", (_n, hasil, keadaan, sebab) => {
    const k = klasifikasiKoneksiBsre(hasil);
    expect(k.keadaan).toBe(keadaan);
    expect(k.sebab).toBe(sebab);
  });

  it("galat tidak pernah TERHUBUNG", () => {
    for (const b of [true, false]) {
      expect(
        klasifikasiKoneksiBsre({ jenis: "galat", batasWaktu: b, ditolak: !b }).keadaan
      ).not.toBe("TERHUBUNG");
    }
  });
});

describe("periksaKoneksiBsre", () => {
  let t = 0;
  const sekarang = () => t;
  beforeEach(() => {
    kosongkanCacheKoneksiBsre();
    t = 1_000_000;
  });

  it("dua panggilan dalam 60 detik = satu ping; sesudahnya ping lagi", async () => {
    const ping = vi.fn().mockResolvedValue(OK);
    await periksaKoneksiBsre({}, { sekarang, ping });
    t += 30_000;
    await periksaKoneksiBsre({}, { sekarang, ping });
    expect(ping).toHaveBeenCalledTimes(1);
    t += 31_000;
    await periksaKoneksiBsre({}, { sekarang, ping });
    expect(ping).toHaveBeenCalledTimes(2);
  });

  it("paksa pada umur 10 detik tidak ping; pada 20 detik ping", async () => {
    const ping = vi.fn().mockResolvedValue(OK);
    await periksaKoneksiBsre({}, { sekarang, ping });
    t += 10_000;
    await periksaKoneksiBsre({ paksa: true }, { sekarang, ping });
    expect(ping).toHaveBeenCalledTimes(1);
    t += 10_000;
    await periksaKoneksiBsre({ paksa: true }, { sekarang, ping });
    expect(ping).toHaveBeenCalledTimes(2);
  });

  it("permintaan bersamaan menumpang satu ping", async () => {
    const ping = vi.fn().mockResolvedValue(OK);
    await Promise.all([
      periksaKoneksiBsre({}, { sekarang, ping }),
      periksaKoneksiBsre({}, { sekarang, ping }),
      periksaKoneksiBsre({ paksa: true }, { sekarang, ping }),
    ]);
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it("hasil hanya keadaan/sebab/diperiksaPada, tanpa URL atau pesan galat", async () => {
    const ping = vi
      .fn()
      .mockRejectedValue(new Error("connect ECONNREFUSED http://192.168.221.11/api"));
    const h = await periksaKoneksiBsre({}, { sekarang, ping });
    expect(h.keadaan).toBe("TIDAK_DIKETAHUI");
    expect(Object.keys(h).sort()).toEqual(["diperiksaPada", "keadaan"]);
    expect(JSON.stringify(h)).not.toMatch(/192\.168|ECONNREFUSED|http/);
    expect(h.diperiksaPada).toBe(new Date(t).toISOString());
  });

  it("galat jaringan -> GANGGUAN, bukan TERHUBUNG", async () => {
    const ping = vi.fn().mockResolvedValue({ jenis: "galat", batasWaktu: true, ditolak: false });
    const h = await periksaKoneksiBsre({}, { sekarang, ping });
    expect(h).toMatchObject({ keadaan: "GANGGUAN", sebab: "BATAS_WAKTU" });
  });
});
