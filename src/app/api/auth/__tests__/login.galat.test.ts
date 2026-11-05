import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ findUser: vi.fn(), findPegawai: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: m.findUser }, pegawai: { findUnique: m.findPegawai } },
}));
vi.mock("../../../../lib/prisma", () => ({
  prisma: { user: { findUnique: m.findUser }, pegawai: { findUnique: m.findPegawai } },
}));

import { POST } from "../login/route";

const NIP = "199001010000000001"; // sensitive-ok
const HOST = "192.0.2.99"; // sensitive-ok

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.stubEnv("ALLOW_NIP_LOGIN", "true");
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  log.mockRestore();
});

describe("POST /api/auth/login - galat database", () => {
  it("P1001 berisi host -> status 500, pesan awam tanpa host", async () => {
    m.findUser.mockRejectedValue(
      Object.assign(new Error(`Can't reach database server at ${HOST}:5432`), { code: "P1001" })
    );
    m.findPegawai.mockResolvedValue(null);
    const req = new Request("http://x/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: NIP, password: NIP }),
    });
    const res = await POST(req as never);
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Gajihub sedang tidak bisa membaca atau menyimpan data/);
    expect(body.error).not.toContain(HOST);
    expect(JSON.stringify(log.mock.calls)).not.toContain(HOST);
  });
});
