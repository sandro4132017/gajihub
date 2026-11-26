import { describe, expect, it } from "vitest";
import { adaLoginKataSandi, kredensialDev } from "../kredensialLogin";

const DEV = { DEV_AUTH_USER: "uji", DEV_AUTH_PASS: "sandi-uji" }; // sensitive-ok

describe("kredensialDev - akun uji coba (ADMIN + semua role)", () => {
  it("mode INTERNAL / kosong: berlaku", () => {
    expect(kredensialDev(DEV)).toEqual({ devUser: "uji", devPass: "sandi-uji" });
    expect(kredensialDev({ ...DEV, NETWORK_MODE: '"INTERNAL"' }).devUser).toBe("uji");
  });

  it("mode PUBLIC: MATI kecuali dibuka sengaja", () => {
    expect(kredensialDev({ ...DEV, NETWORK_MODE: "PUBLIC" })).toEqual({});
    expect(adaLoginKataSandi({ ...DEV, NETWORK_MODE: "public" })).toBe(false);
    expect(kredensialDev({ ...DEV, NETWORK_MODE: "PUBLIC", DEV_AUTH_IZINKAN_PUBLIK: "true" }).devUser).toBe("uji");
  });
});
