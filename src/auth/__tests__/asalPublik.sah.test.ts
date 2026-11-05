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
