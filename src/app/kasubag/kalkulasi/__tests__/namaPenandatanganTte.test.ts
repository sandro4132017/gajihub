import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Modal TTE menampilkan "Penandatangan (PPK): <nama>". Nama itu harus sampai
// dari halaman Kalkulasi ke modal; tanpa sambungan ini kolomnya kosong dan
// penanda tangan tidak bisa memeriksa nama yang akan tercetak.

const dir = join(__dirname, "..");
const baca = (f: string) => readFileSync(join(dir, f), "utf8");

describe("nama penanda tangan SPTJM sampai ke modal TTE", () => {
  it("halaman Kalkulasi mengoper namaPenandatangan ke ketiga PanelTteSptjm", () => {
    const src = baca("page.tsx");
    const panel = src.match(/<PanelTteSptjm\b[\s\S]*?\/>/g) ?? [];
    expect(panel.length).toBe(3);
    for (const p of panel) expect(p).toMatch(/namaPenandatangan=\{namaPenandatanganSptjm\}/);
    expect(src).toMatch(/namaCetakPegawai\(pegawaiPenandatangan\)/);
  });

  it("PanelTteSptjm meneruskannya sebagai namaPenandatanganDefault ke modal", () => {
    const src = baca("PanelTteSptjm.tsx");
    const modal = src.match(/<ModalPassphraseTte\b[\s\S]*?\/>/)?.[0] ?? "";
    expect(modal).toMatch(/namaPenandatanganDefault=\{namaPenandatangan\}/);
  });
});
