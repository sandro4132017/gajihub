import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { aksi } = vi.hoisted(() => ({ aksi: vi.fn() }));

vi.mock("../../../../kasubag/kirim/actions", () => ({ kirimRekapUnitAction: aksi }));

import { POST } from "../route";
import { GalatSumber } from "../../../../../lib/koneksi/galatSumber";

const URL_ROUTE = "http://localhost/api/kasubag/kirim";

function req(body: unknown, mentah = false) {
  return new NextRequest(URL_ROUTE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: mentah ? (body as string) : JSON.stringify(body),
  });
}

describe("POST /api/kasubag/kirim", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    aksi.mockReset();
    logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("meneruskan hanya field daftar putih, angka jadi string", async () => {
    aksi.mockResolvedValue({ success: "ok" });
    const res = await POST(req({ bulan: 9, tahun: 2026, pernyataan: "ya", catatan: "catatan palsu", satuanKerja: "Biro Lain", fieldAsing: "x", role: "PPABP" }));
    const fd = aksi.mock.calls[0][1] as FormData;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: "ok" });
    expect(fd.get("bulan")).toBe("9");
    expect(fd.get("tahun")).toBe("2026");
    expect(fd.get("pernyataan")).toBe("ya");
    expect(fd.get("catatan")).toBe("catatan palsu");
    // satuanKerja diambil aksi dari sesi, tidak boleh datang dari body.
    expect(fd.has("satuanKerja")).toBe(false);
    expect(fd.has("fieldAsing")).toBe(false);
    expect(fd.has("role")).toBe(false);
  });

  it("JSON rusak atau bukan objek menghasilkan 400 tanpa memanggil aksi", async () => {
    for (const r of [req("{rusak", true), req(["x"]), req(null), req(5)]) {
      const res = await POST(r);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Format permintaan tidak valid." });
    }
    expect(aksi).not.toHaveBeenCalled();
  });

  it("error bisnis dari aksi diteruskan apa adanya dengan status 400", async () => {
    aksi.mockResolvedValue({ error: "Periode tidak sah." });
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Periode tidak sah." });
  });

  it("aksi melempar galat: 500 pesan awam tanpa IP, satu baris log, ref sama", async () => {
    const asli = Object.assign(new Error("connect ECONNREFUSED 10.1.2.3:5432"), { code: "ECONNREFUSED" });
    aksi.mockRejectedValue(new GalatSumber("GAJIHUB_DB", asli));
    const res = await POST(req({}));
    const { error } = (await res.json()) as { error: string };
    expect(res.status).toBe(500);
    expect(error).not.toContain("10.1.2.3");
    expect(error).toContain("kode rujukan");
    expect(logSpy).toHaveBeenCalledTimes(1);
    const baris = String(logSpy.mock.calls[0][0]);
    const ref = /ref=(\w+)/.exec(baris)?.[1];
    expect(ref).toBeTruthy();
    expect(error).toContain(ref as string);
    expect(baris).not.toContain("10.1.2.3");
  });
});
