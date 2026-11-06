import { afterEach, describe, expect, it, vi } from "vitest";
import { asalPublik, hostSah, protoSah } from "../asalPublik";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("protoSah", () => {
  it("hanya menerima http/https", () => {
    expect(protoSah("https")).toBe("https");
    expect(protoSah("HTTP, https")).toBe("http");
    expect(protoSah("tnbwas_757_hwlg")).toBeUndefined();
    expect(protoSah("javascript")).toBeUndefined();
    expect(protoSah(null)).toBeUndefined();
  });
});

describe("hostSah", () => {
  it("menerima nama domain, IP, dan port", () => {
    expect(hostSah("gajihub.kemnaker.go.id")).toBe("gajihub.kemnaker.go.id");
    expect(hostSah("192.168.223.207:3002")).toBe("192.168.223.207:3002");
    expect(hostSah("[::1]:3000")).toBe("[::1]:3000");
    expect(hostSah("localhost")).toBe("localhost");
  });
  it("menolak host berisi karakter asing", () => {
    expect(hostSah("evil.com/../x")).toBeUndefined();
    expect(hostSah("a b")).toBeUndefined();
    expect(hostSah("user@evil.com")).toBeUndefined();
    expect(hostSah("")).toBeUndefined();
  });
});

describe("asalPublik dengan header proxy rusak", () => {
  it("protokol palsu tidak menggagalkan pembuatan URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NETWORK_MODE", "INTERNAL");
    const h = new Headers({ host: "192.168.223.207:3002", "x-forwarded-proto": "tnbwas_757_hwlg" });
    const asal = asalPublik(h, "http://192.168.223.207:3002/login");
    expect(asal).toBe("http://192.168.223.207:3002");
    expect(() => new URL("/login", asal)).not.toThrow();
  });
  it("host palsu diabaikan, jatuh ke asal permintaan", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NETWORK_MODE", "INTERNAL");
    vi.stubEnv("NACO_REDIRECT_URI", "");
    const h = new Headers({ "x-forwarded-host": "evil.com/x y" });
    expect(asalPublik(h, "http://192.168.223.207:3002/a")).toBe("http://192.168.223.207:3002");
  });
});

describe("asalPublik - Host header palsu tidak dipantulkan (pentest F-03, CWE-601)", () => {
  const RESMI = "https://gajihub.kemnaker.go.id";
  const siapkan = (mode: "INTERNAL" | "PUBLIC") => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NETWORK_MODE", mode);
    vi.stubEnv("NACO_REDIRECT_URI", "");
  };

  it.each(["INTERNAL", "PUBLIC"] as const)("Host evil.com (%s) -> alamat resmi", (mode) => {
    siapkan(mode);
    expect(asalPublik(new Headers({ host: "evil.com" }), "http://evil.com/login")).toBe(RESMI);
  });

  it("X-Forwarded-Host evil.com juga tidak dipantulkan", () => {
    siapkan("INTERNAL");
    const h = new Headers({ "x-forwarded-host": "evil.com", host: "evil.com" });
    expect(asalPublik(h, "http://evil.com/")).toBe(RESMI);
  });

  it("XFH palsu tapi Host sah -> pakai Host sah", () => {
    siapkan("INTERNAL");
    const h = new Headers({ "x-forwarded-host": "evil.com", host: "192.168.223.206:3002" });
    expect(asalPublik(h, "http://192.168.223.206:3002/")).toBe("http://192.168.223.206:3002");
  });

  it("localhost di produksi -> alamat resmi", () => {
    siapkan("INTERNAL");
    expect(asalPublik(new Headers({ host: "localhost:3002" }), "http://localhost:3002/")).toBe(RESMI);
  });

  it("IP staging dan produksi (port 3002) tetap dipertahankan", () => {
    siapkan("INTERNAL");
    expect(asalPublik(new Headers({ host: "192.168.223.206:3002" }), "http://x/")).toBe("http://192.168.223.206:3002");
    expect(asalPublik(new Headers({ host: "192.168.223.207:3002" }), "http://x/")).toBe("http://192.168.223.207:3002");
  });

  it("req.url berhost evil tidak dipantulkan lewat cadangan", () => {
    siapkan("INTERNAL");
    expect(asalPublik(new Headers(), "http://evil.com/login")).toBe(RESMI);
  });

  it("req.url berhost tepercaya dipakai sebagai cadangan", () => {
    siapkan("INTERNAL");
    expect(asalPublik(new Headers(), "http://192.168.223.207:3002/login")).toBe("http://192.168.223.207:3002");
  });
});
