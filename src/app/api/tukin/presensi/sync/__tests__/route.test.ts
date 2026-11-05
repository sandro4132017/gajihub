import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GalatSumber } from "../../../../../../lib/koneksi/galatSumber";

const HOST_PALSU = "198.51.100.20"; // sensitive-ok

const m = vi.hoisted(() => ({ aksi: vi.fn() }));
vi.mock("../../../../../tukin/presensi/actionsSync", () => ({ tarikPresensiEpresensiAction: m.aksi }));

import { POST } from "../route";

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/tukin/presensi/sync", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

let spy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  m.aksi.mockReset();
  spy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => spy.mockRestore());

describe("POST /api/tukin/presensi/sync", () => {
  it("galat tak terduga: 500, pesan awam tanpa IP, satu log dengan ref yang sama", async () => {
    m.aksi.mockRejectedValue(
      new GalatSumber(
        "EPRESENSI",
        Object.assign(new Error(`connect ECONNREFUSED ${HOST_PALSU}:5432`), { code: "ECONNREFUSED" })
      )
    );
    const r = await POST(req({ bulan: 9, tahun: 2026 }));
    const body = await r.json();
    expect(r.status).toBe(500);
    expect(body.error).toContain("e-Presensi sedang tidak bisa dihubungi");
    expect(body.error).toContain("kode rujukan");
    expect(body.error).not.toContain(HOST_PALSU);
    expect(spy).toHaveBeenCalledTimes(1);
    const baris = String(spy.mock.calls[0][0]);
    expect(baris).not.toContain(HOST_PALSU);
    expect(body.error).toContain(/ref=([0-9a-f]{8})/.exec(baris)![1]);
  });

  it("error hasil aksi tetap 400 dan diteruskan; sukses 200; JSON rusak 400", async () => {
    m.aksi.mockResolvedValueOnce({ error: "Periode tidak valid." });
    const a = await POST(req({ bulan: 99, tahun: 2026 }));
    expect(a.status).toBe(400);
    expect((await a.json()).error).toBe("Periode tidak valid.");
    m.aksi.mockResolvedValueOnce({ ringkasan: {} });
    expect((await POST(req({ bulan: 9, tahun: 2026 }))).status).toBe(200);
    expect((await POST(req("bukan json"))).status).toBe(400);
  });
});
