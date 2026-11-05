import { afterEach, describe, expect, it, vi } from "vitest";
import { checkUserStatus } from "../esignClient";
import { bolehFallbackAkunDemo } from "../simulasiTte";

const NIK_DEMO = "0803202100007062"; // sensitive-ok

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("bolehFallbackAkunDemo", () => {
  it("false di production, true di luar production", () => {
    expect(bolehFallbackAkunDemo({ NODE_ENV: "production" })).toBe(false);
    expect(bolehFallbackAkunDemo({ NODE_ENV: "development" })).toBe(true);
    expect(bolehFallbackAkunDemo({})).toBe(true);
  });
});

describe("checkUserStatus - fallback akun demo", () => {
  function fetch503() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 503, headers: { "content-type": "application/json" } }))
    );
  }

  it("production + NIK demo + 503 -> SERVER_ERROR tanpa teks Akun Demo", async () => {
    vi.stubEnv("NODE_ENV", "production");
    fetch503();
    const r = await checkUserStatus(NIK_DEMO);
    expect(r.success).toBe(false);
    expect(r.status).toBe("SERVER_ERROR");
    expect(r.message).not.toMatch(/Akun Demo/i);
  });

  it("production + fetch melempar -> NETWORK_ERROR", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("fetch failed"); }));
    const r = await checkUserStatus(NIK_DEMO);
    expect(r.success).toBe(false);
    expect(r.status).toBe("NETWORK_ERROR");
  });

  it("development tetap ISSUE (503)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    fetch503();
    const r = await checkUserStatus(NIK_DEMO);
    expect(r.status).toBe("ISSUE");
  });

  it("development tetap ISSUE (fetch melempar)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("fetch failed"); }));
    const r = await checkUserStatus(NIK_DEMO);
    expect(r.status).toBe("ISSUE");
  });
});
