import { afterEach, describe, expect, it, vi } from "vitest";
import { checkUserStatus, signPdf } from "../esignClient";

// Repo publik: alamat & kredensial Esign Client tidak boleh punya nilai
// cadangan di kode. Env kosong = gagal jelas, bukan memakai kredensial tertanam.
describe("Esign Client tanpa konfigurasi env", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("checkUserStatus: SERVER_ERROR dengan sebab, tanpa memanggil jaringan", async () => {
    vi.stubEnv("ESIGN_API_PASS", "");
    const f = vi.spyOn(globalThis, "fetch");
    const r = await checkUserStatus("1234567890123456"); // sensitive-ok
    expect(r.success).toBe(false);
    expect(r.status).toBe("SERVER_ERROR");
    expect(r.message).toMatch(/belum dikonfigurasi/);
    expect(f).not.toHaveBeenCalled();
    f.mockRestore();
  });

  it("signPdf: gagal, tidak melempar", async () => {
    vi.stubEnv("ESIGN_BASE_URL", "");
    const r = await signPdf({ pdfBuffer: Buffer.from("%PDF"), nik: "1234567890123456", passphrase: "x" } as never); // sensitive-ok
    expect(r.success).toBe(false);
  });
});
