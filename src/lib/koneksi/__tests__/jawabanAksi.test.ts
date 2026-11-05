import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PESAN_JARINGAN,
  bacaJawabanAksi,
  kirimAksiJson,
  pesanResponsBukanJson,
} from "../jawabanAksi";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function html(body: string, status: number, opsi: { redirected?: boolean; url?: string } = {}) {
  const r = new Response(body, { status, headers: { "content-type": "text/html" } });
  if (opsi.redirected !== undefined) Object.defineProperty(r, "redirected", { value: opsi.redirected });
  if (opsi.url !== undefined) Object.defineProperty(r, "url", { value: opsi.url });
  return r;
}

describe("bacaJawabanAksi", () => {
  it("meneruskan JSON sukses 200", async () => {
    expect(await bacaJawabanAksi(json({ success: "Terkirim." }))).toEqual({ success: "Terkirim." });
  });

  it("meneruskan error bisnis 400 tanpa tidakPasti", async () => {
    expect(await bacaJawabanAksi(json({ error: "Periode tidak sah." }, 400))).toEqual({
      error: "Periode tidak sah.",
    });
  });

  it("JSON 500 dari route ditandai tidakPasti", async () => {
    const h = await bacaJawabanAksi(json({ error: "Gagal (kode rujukan ab12cd34)" }, 500));
    expect(h.error).toContain("ab12cd34");
    expect(h.tidakPasti).toBe(true);
  });

  it("halaman HTML 500 (blokir firewall) jadi pesan firewall tanpa isi body", async () => {
    const h = await bacaJawabanAksi(html("<html>Web Page Blocked! Attack ID 20000008</html>", 500));
    expect(h.error).toContain("firewall");
    expect(h.error).not.toContain("Web Page Blocked");
    expect(h.error).not.toContain("20000008");
    expect(h.tidakPasti).toBe(true);
  });

  it("502 dan 504 jadi waktu tunggu habis", async () => {
    for (const s of [502, 504]) {
      const h = await bacaJawabanAksi(html("x", s));
      expect(h.error).toContain("Waktu tunggu");
      expect(h.tidakPasti).toBe(true);
    }
  });

  it("401 dan 403 jadi ditolak server/firewall", async () => {
    for (const s of [401, 403]) {
      const h = await bacaJawabanAksi(html("x", s));
      expect(h.error).toContain("menolak");
      expect(h.tidakPasti).toBe(true);
    }
  });

  it("redirect atau URL /login jadi sesi berakhir", async () => {
    const a = await bacaJawabanAksi(html("<form>", 200, { redirected: true, url: "http://x/login" }));
    const b = await bacaJawabanAksi(html("<form>", 200, { url: "http://x/login?next=/kasubag" }));
    expect(a.error).toBe("Sesi berakhir, silakan login ulang.");
    expect(b.error).toBe("Sesi berakhir, silakan login ulang.");
    expect(a.tidakPasti).toBe(true);
  });

  it("JSON rusak atau bukan objek tidak melempar", async () => {
    const rusak = new Response("{x", { status: 200, headers: { "content-type": "application/json" } });
    expect((await bacaJawabanAksi(rusak)).tidakPasti).toBe(true);
    expect((await bacaJawabanAksi(json([1]))).tidakPasti).toBe(true);
    expect((await bacaJawabanAksi(json({}))).tidakPasti).toBe(true);
  });
});

describe("pesanResponsBukanJson", () => {
  it("status lain memberi kalimat umum dengan kode HTTP", () => {
    expect(pesanResponsBukanJson(418, false, "http://x/api")).toContain("418");
  });
});

describe("kirimAksiJson", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetch melempar jadi pesan jaringan dan tidakPasti", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await kirimAksiJson("/api/x", { a: 1 })).toEqual({ error: PESAN_JARINGAN, tidakPasti: true });
  });

  it("mengirim POST JSON dan membaca jawabannya", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ success: "ok" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await kirimAksiJson("/api/x", { a: 1 })).toEqual({ success: "ok" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/x");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"a":1}');
  });
});
