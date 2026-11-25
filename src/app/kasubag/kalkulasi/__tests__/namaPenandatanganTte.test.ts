import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Modal TTE menampilkan "Penandatangan (PPK): <nama>". Nama itu harus sampai
// dari halaman Kalkulasi ke modal; tanpa sambungan ini kolomnya kosong dan
// penanda tangan tidak bisa memeriksa nama yang akan tercetak.
//
// Rantainya: page.tsx -> TahapTteSptjm (satu <PanelTteSptjm> dirender untuk
// tiga jenis lewat URUTAN_SPTJM) -> PanelTteSptjm -> ModalPassphraseTte.

const dir = join(__dirname, "..");
const baca = (f: string) => readFileSync(join(dir, f), "utf8");

describe("nama penanda tangan SPTJM sampai ke modal TTE", () => {
  it("halaman Kalkulasi mengoper namaPenandatangan ke TahapTteSptjm", () => {
    const src = baca("page.tsx");
    const tahap = src.match(/<TahapTteSptjm\b[\s\S]*?\/>/)?.[0] ?? "";
    expect(tahap).toMatch(/namaPenandatangan=\{namaPenandatanganSptjm\}/);
    expect(src).toMatch(/namaCetakPegawai\(pegawaiPenandatangan\)/);
  });

  it("TahapTteSptjm merender PanelTteSptjm untuk ketiga jenis dan meneruskan namanya", () => {
    const src = baca("TahapTteSptjm.tsx");
    expect(src).toMatch(/URUTAN_SPTJM\.map\(/);
    const panel = src.match(/<PanelTteSptjm\b[\s\S]*?\/>/g) ?? [];
    expect(panel.length).toBe(1);
    expect(panel[0]).toMatch(/namaPenandatangan=\{namaPenandatangan\}/);
  });

  it("PanelTteSptjm meneruskannya sebagai namaPenandatanganDefault ke modal", () => {
    const src = baca("PanelTteSptjm.tsx");
    const modal = src.match(/<ModalPassphraseTte\b[\s\S]*?\/>/)?.[0] ?? "";
    expect(modal).toMatch(/namaPenandatanganDefault=\{namaPenandatangan\}/);
  });

  it("ModalPassphraseTte tidak menyimpan passphrase di penyimpanan peramban", () => {
    const src = readFileSync(join(dir, "../../tte/ModalPassphraseTte.tsx"), "utf8");
    expect(src).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
  });
});
