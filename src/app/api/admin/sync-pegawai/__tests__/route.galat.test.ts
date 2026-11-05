import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GalatSumber } from "@/lib/koneksi/galatSumber";

const m = vi.hoisted(() => ({
  ambilUserSesi: vi.fn(),
  periksa: vi.fn(),
  terapkan: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { auditTrail: { create: vi.fn() } } }));
vi.mock("@/auth/getSessionAccount", () => ({ ambilUserSesi: m.ambilUserSesi }));
vi.mock("@/jobs/sinkronPegawaiSiap", () => ({
  periksaSinkronPegawai: m.periksa,
  terapkanSinkronPegawai: m.terapkan,
}));

import { POST as periksa } from "../periksa/route";
import { POST as terapkan } from "../terapkan/route";

const HOST = "192.0.2.55"; // sensitive-ok
const admin = { id: "u1", nip: "199001010000000001", role: "ADMIN", satuanKerja: null, aktif: true }; // sensitive-ok

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => log.mockRestore());

const galatSocket = () =>
  new GalatSumber("SIAP", Object.assign(new Error(`Failed to connect to ${HOST}:1433 - socket hang up`), { code: "ESOCKET" }));

describe("sync-pegawai - galat SIAP", () => {
  it.each([
    ["periksa", periksa, m.periksa],
    ["terapkan", terapkan, m.terapkan],
  ])("%s: ESOCKET -> SIAP disebut dengan nama, tanpa host", async (_n, handler, fn) => {
    m.ambilUserSesi.mockResolvedValue(admin);
    fn.mockRejectedValue(galatSocket());
    const body = await (await handler()).json();
    expect(body.error).toMatch(/SIAP sedang tidak bisa dihubungi/);
    expect(body.error).toContain("kode rujukan");
    expect(body.error).not.toContain(HOST);
    expect(JSON.stringify(log.mock.calls)).not.toContain(HOST);
  });

  it.each([periksa, terapkan])("tanpa sesi tetap 401", async (handler) => {
    m.ambilUserSesi.mockResolvedValue(null);
    expect((await handler()).status).toBe(401);
  });

  it.each([periksa, terapkan])("bukan Admin tetap 403", async (handler) => {
    m.ambilUserSesi.mockResolvedValue({ ...admin, role: "KASUBAG_TU", satuanKerja: "Biro Umum" });
    expect((await handler()).status).toBe(403);
  });
});
