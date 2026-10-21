import { describe, it, expect } from "vitest";
import { ASAL_TEPERCAYA, hostAsalTepercaya } from "../asalTepercaya";

describe("hostAsalTepercaya - asal milik sendiri", () => {
  it("domain resmi diterima", () => {
    expect(hostAsalTepercaya("https://gajihub.kemnaker.go.id")).toBe(
      "gajihub.kemnaker.go.id"
    );
  });

  it("subdomain kemnaker lain diterima lewat pola bintang", () => {
    expect(hostAsalTepercaya("https://apa-saja.kemnaker.go.id")).toBe(
      "apa-saja.kemnaker.go.id"
    );
  });

  it("IP internal dengan port diterima", () => {
    expect(hostAsalTepercaya("http://192.168.221.44:3002")).toBe(
      "192.168.221.44:3002"
    );
  });

  it("localhost diterima - pengembangan lokal tidak boleh ikut mati", () => {
    expect(hostAsalTepercaya("http://localhost:3000")).toBe("localhost:3000");
  });

  it("huruf besar tidak membuatnya ditolak", () => {
    expect(hostAsalTepercaya("https://GAJIHUB.KEMNAKER.GO.ID")).toBe(
      "gajihub.kemnaker.go.id"
    );
  });
});

describe("hostAsalTepercaya - yang WAJIB ditolak", () => {
  // Inilah sebabnya berkas ini ada: dulu asal APA PUN diselaraskan, jadi
  // penahan CSRF bawaan Next selalu lolos.
  const DITOLAK = [
    ["situs penyerang", "https://penyerang.example"],
    ["menyamar dengan awalan", "https://gajihub.kemnaker.go.id.jahat.example"],
    ["domain induk polos, bukan subdomain", "https://kemnaker.go.id"],
    ["kebetulan berakhiran sama", "https://bukankemnaker.go.id"],
    ["port yang tidak terdaftar", "http://192.168.221.44:9999"],
    ["skema bukan web", "file:///etc/passwd"],
    ["Origin kosong", ""],
    ["Origin bernilai null (sandbox/iframe)", "null"],
    ["bukan URL sama sekali", "bukan-url"],
  ] as const;

  for (const [label, nilai] of DITOLAK) {
    it(`ditolak - ${label}`, () => {
      expect(hostAsalTepercaya(nilai)).toBeNull();
    });
  }

  it("Origin yang tidak ada (null) ditolak", () => {
    expect(hostAsalTepercaya(null)).toBeNull();
  });
});

describe("daftar ini WAJIB sama dengan allowedOrigins di next.config.mjs", () => {
  // Dua daftar yang harus sama pasti berbeda cepat atau lambat. Kalau yang
  // satu ditambah dan yang lain tidak, gejalanya: form jalan di satu jalur
  // dan ditolak di jalur lain - sangat sulit ditelusuri.
  it("isinya identik, urutan tidak diperhitungkan", async () => {
    const konfig = await import("../../../next.config.mjs");
    const dariKonfig: string[] =
      konfig.default?.experimental?.serverActions?.allowedOrigins ?? [];

    expect(dariKonfig.length).toBeGreaterThan(0);
    expect([...dariKonfig].sort()).toEqual([...ASAL_TEPERCAYA].sort());
  });
});
