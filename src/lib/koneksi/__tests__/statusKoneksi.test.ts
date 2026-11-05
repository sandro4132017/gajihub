import { beforeEach, describe, expect, it, vi } from "vitest";
import { buatPemeriksaKoneksi } from "../statusKoneksi";

const ping = vi.fn();
const p = buatPemeriksaKoneksi<string>({
  label: "Layanan Palsu",
  ping,
  klasifikasi: (h) =>
    h === "ok" ? { keadaan: "TERHUBUNG" } : { keadaan: "GANGGUAN", sebab: "BATAS_WAKTU" },
});

let t = 0;
const sekarang = () => t;

beforeEach(() => {
  p.kosongkanCache();
  ping.mockReset();
  ping.mockResolvedValue("ok");
  t = 1_000_000;
});

describe("buatPemeriksaKoneksi", () => {
  it("dua panggilan dalam 60 dtk = 1 ping; sesudahnya 2", async () => {
    await p.periksa({}, { sekarang });
    t += 30_000;
    await p.periksa({}, { sekarang });
    expect(ping).toHaveBeenCalledTimes(1);
    t += 31_000;
    await p.periksa({}, { sekarang });
    expect(ping).toHaveBeenCalledTimes(2);
  });

  it("paksa umur 10 dtk tidak ping, 20 dtk ping", async () => {
    await p.periksa({}, { sekarang });
    t += 10_000;
    await p.periksa({ paksa: true }, { sekarang });
    expect(ping).toHaveBeenCalledTimes(1);
    t += 10_000;
    await p.periksa({ paksa: true }, { sekarang });
    expect(ping).toHaveBeenCalledTimes(2);
  });

  it("tiga permintaan bersamaan = 1 ping", async () => {
    await Promise.all([
      p.periksa({}, { sekarang }),
      p.periksa({}, { sekarang }),
      p.periksa({ paksa: true }, { sekarang }),
    ]);
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it("ping melempar -> TIDAK_DIKETAHUI, hanya kunci keadaan & diperiksaPada", async () => {
    ping.mockRejectedValue(new Error("rahasia 192.168.1.1"));
    const h = await p.periksa({}, { sekarang });
    expect(h.keadaan).toBe("TIDAK_DIKETAHUI");
    expect(Object.keys(h).sort()).toEqual(["diperiksaPada", "keadaan"]);
    expect(JSON.stringify(h)).not.toContain("192.168");
  });

  it("console.warn hanya saat berganti, memuat label dan keadaan saja", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await p.periksa({}, { sekarang });
    expect(warn).not.toHaveBeenCalled();
    ping.mockResolvedValue("mati");
    t += 61_000;
    await p.periksa({}, { sekarang });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("Layanan Palsu");
    warn.mockRestore();
  });
});
