import { afterEach, describe, expect, it, vi } from "vitest";
import { BATAS_WAKTU_SIGN_MS, signPdf } from "../esignClient";
import { klasifikasiGagalBsre } from "../simulasiTte";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** fetch palsu yang tidak pernah menjawab - hanya berhenti saat signal dibatalkan. */
function fetchMacet() {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
        })
    )
  );
}

const OPSI = {
  fileBuffer: Buffer.from("%PDF-1.4 uji"),
  nik: "0000000000000000", // sensitive-ok
  passphrase: "rahasia-uji",
};

describe("signPdf - batas waktu", () => {
  it("bawaannya 60 detik", () => {
    expect(BATAS_WAKTU_SIGN_MS).toBe(60_000);
  });

  it("BSrE tidak menjawab -> gagal 504 dengan pesan batas waktu, tidak menggantung", async () => {
    fetchMacet();
    const r = await signPdf({ ...OPSI, timeoutMs: 20 });
    expect(r.success).toBe(false);
    expect(r.statusCode).toBe(504);
    expect(r.error).toMatch(/batas waktu/i);
    // passphrase tidak pernah ikut di pesan
    expect(r.error).not.toContain("rahasia-uji");
  });

  it("digolongkan NETWORK_TIMEOUT dengan pesan yang menyebut batas waktu", async () => {
    fetchMacet();
    const r = await signPdf({ ...OPSI, timeoutMs: 20 });
    const k = klasifikasiGagalBsre(r);
    expect(k.kategori).toBe("NETWORK_TIMEOUT");
    expect(k.pesanPengguna).toContain("tidak menjawab dalam batas waktu (60 detik)");
  });

  it("galat jaringan biasa tetap pesan koneksi lama", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("fetch failed"); }));
    const r = await signPdf(OPSI);
    expect(r.statusCode).toBe(500);
    expect(r.error).toContain("kesalahan koneksi");
  });
});
