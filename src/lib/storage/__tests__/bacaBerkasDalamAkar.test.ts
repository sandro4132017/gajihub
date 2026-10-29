import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { realpath, readFile } = vi.hoisted(() => ({ realpath: vi.fn(), readFile: vi.fn() }));
vi.mock("fs/promises", () => ({ default: { realpath, readFile }, realpath, readFile }));

import { bacaBerkasDalamAkar } from "../berkasPrivat";

const AKAR = path.resolve("/akar-uji/uploads");
const DIR_TTE = path.join(AKAR, "tte");
const BERKAS = path.join(DIR_TTE, "Biro Umum", "2026-08", "draft_1.pdf");

beforeEach(() => {
  realpath.mockReset();
  readFile.mockReset();
  readFile.mockResolvedValue(Buffer.from("%PDF-"));
});

describe("bacaBerkasDalamAkar - symlink", () => {
  it("berkas biasa (lokasi asli di dalam folder jenis) dibaca", async () => {
    realpath.mockImplementation(async (p: string) => p);
    await expect(bacaBerkasDalamAkar(BERKAS, "tte", AKAR)).resolves.toBeInstanceOf(Buffer);
    expect(readFile).toHaveBeenCalledWith(BERKAS);
  });

  it("symlink yang menunjuk ke LUAR penyimpanan ditolak sebagai ENOENT, tanpa membaca", async () => {
    realpath.mockImplementation(async (p: string) => (p === BERKAS ? path.resolve("/proyek/.env") : p));
    await expect(bacaBerkasDalamAkar(BERKAS, "tte", AKAR)).rejects.toMatchObject({ code: "ENOENT" });
    expect(readFile).not.toHaveBeenCalled();
  });

  it("symlink ke folder jenis LAIN ditolak (tte tidak boleh membaca bukti-dukung)", async () => {
    realpath.mockImplementation(async (p: string) =>
      p === BERKAS ? path.join(AKAR, "bukti-dukung", "Biro Umum", "x.jpg") : p
    );
    await expect(bacaBerkasDalamAkar(BERKAS, "tte", AKAR)).rejects.toMatchObject({ code: "ENOENT" });
    expect(readFile).not.toHaveBeenCalled();
  });

  it("folder jenis itu sendiri bukan berkas yang sah", async () => {
    realpath.mockImplementation(async (p: string) => (p === BERKAS ? DIR_TTE : p));
    await expect(bacaBerkasDalamAkar(BERKAS, "tte", AKAR)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
