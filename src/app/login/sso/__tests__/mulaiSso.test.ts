import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";
import { SESSION_COOKIE_NAME } from "../../../../auth/session";

describe("GET /login/sso", () => {
  beforeEach(() => {
    vi.stubEnv("NACO_CLIENT_ID", "klien-uji");
    vi.stubEnv("NACO_CLIENT_SECRET", "rahasia-uji");
    vi.stubEnv("NACO_REDIRECT_URI", "http://localhost:3000/login/sso/callback");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("membuang sesi Gajihub lama sebelum berangkat ke Akun Kemnaker", async () => {
    const req = new NextRequest("http://localhost:3000/login/sso", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=sesi-orang-sebelumnya` },
    });
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/auth?");
    const sesi = res.cookies.get(SESSION_COOKIE_NAME);
    expect(sesi?.value).toBe("");
    expect(res.cookies.get("gajihub_sso_state")?.value).toBeTruthy();
    expect(res.headers.get("location")).not.toContain("prompt=");
  });

  it("NACO_PROMPT diisi = prompt ikut dikirim ke Akun Kemnaker", async () => {
    vi.stubEnv("NACO_PROMPT", '"login"');
    const res = await GET(new NextRequest("http://localhost:3000/login/sso"));
    expect(new URL(res.headers.get("location")!).searchParams.get("prompt")).toBe("login");
  });
});
