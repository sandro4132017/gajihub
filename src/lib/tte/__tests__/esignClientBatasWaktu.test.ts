import { afterEach, describe, expect, it, vi } from "vitest";
import { signPdf } from "../esignClient";
import { klasifikasiGagalBsre } from "../simulasiTte";

// signPdf dengan fetch dipalsukan: tanpa jaringan, tanpa BSrE sungguhan.
const PASS = "RAHASIA-uji-987";
const dasar = { fileBuffer: Buffer.from("%PDF-uji"), nik: "1234567890123456", passphrase: PASS }; // sensitive-ok

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("signPdf - batas waktu opsional", () => {
  it("tanpa batasWaktuMs: fetch TIDAK diberi signal (perilaku SPTJM lama)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "application/pdf" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await signPdf(dasar);
    expect(r.success).toBe(true);
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("signal");
  });

  it("tanpa batasWaktuMs: galat fetch tetap berpesan koneksi biasa", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "TimeoutError" })));
    const r = await signPdf(dasar);
    expect(r.error).toBe("Terjadi kesalahan koneksi ke Esign Client BSrE.");
  });

  it("dengan batasWaktuMs: fetch diberi AbortSignal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "application/pdf" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await signPdf({ ...dasar, batasWaktuMs: 60_000 });
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("BSrE tak menjawab sampai batas: gagal bergolongan NETWORK_TIMEOUT, tanpa passphrase", async () => {
    // fetch yang tak pernah menjawab sampai signal-nya habis.
    vi.stubGlobal(
      "fetch",
      vi.fn((_u: string, init: { signal: AbortSignal }) =>
        new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(init.signal.reason))),
      ),
    );
    const r = await signPdf({ ...dasar, batasWaktuMs: 20 });
    expect(r.success).toBe(false);
    expect(r.signedPdfBuffer).toBeUndefined();
    expect(r.error).not.toContain(PASS);
    expect(klasifikasiGagalBsre(r).kategori).toBe("NETWORK_TIMEOUT");
  });
});
