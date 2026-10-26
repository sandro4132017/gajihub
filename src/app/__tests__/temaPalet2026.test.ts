import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ============================================================================
// PENJAGA TEMA PALET 2026 (uji coba di dashboard PPABP).
//
// Nilai tema hidup di globals.css, dan hex di CSS tidak diperiksa siapa pun
// waktu diganti. Test ini membaca blok temanya LANGSUNG dari berkas itu lalu
// menghitung ulang kontras teksnya - supaya mengganti satu hex jadi warna
// yang tidak terbaca membuat test gagal, bukan membuat pil "Belum Dikirim"
// diam-diam tidak terbaca.
// ============================================================================

const css = fs.readFileSync(path.resolve(__dirname, "../globals.css"), "utf8");

function blok(selektor: string): Record<string, string> {
  const awal = css.indexOf(`${selektor} {`);
  if (awal < 0) throw new Error(`blok ${selektor} tidak ditemukan`);
  const isi = css.slice(awal, css.indexOf("}", awal));
  const hasil: Record<string, string> = {};
  for (const m of isi.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) hasil[m[1]] = m[2].trim();
  return hasil;
}

function luminans(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function kontras(a: string, b: string): number {
  const [terang, gelap] = [luminans(a), luminans(b)].sort((x, y) => y - x);
  return (terang + 0.05) / (gelap + 0.05);
}

const tema = blok('[data-tema="palet-2026"]');
const t = (nama: string) => {
  const v = tema[`--color-${nama}`];
  if (!v) throw new Error(`--color-${nama} tidak ada di tema`);
  return v;
};

describe("tema palet 2026 - kontras teks", () => {
  // Pasangan teks-di-atas-latar yang BENAR-BENAR muncul di dashboard PPABP.
  const pasangan: [string, string, string][] = [
    ["ink di latar halaman", "ink", "bg"],
    ["ink di kartu", "ink", "surface"],
    ["ink-2 di latar halaman", "ink-2", "bg"],
    ["muted di latar halaman", "muted", "bg"],
    ["muted di surface-2", "muted", "surface-2"],
    ["tautan (teal-deep) di kartu", "teal-deep", "surface"],
    ["navy di teal-tint (lencana)", "navy", "teal-tint"],
    ['pil "Terkirim"', "green", "green-tint"],
    ['pil "Belum Dikirim"', "gold-deep", "gold-tint"],
    ['pil "Dikembalikan"', "red", "red-tint"],
  ];

  for (const [nama, depan, latar] of pasangan) {
    it(`${nama} >= 4,5:1 (WCAG AA teks kecil)`, () => {
      expect(kontras(t(depan), t(latar))).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("teks putih di tombol utama >= 4,5:1", () => {
    expect(kontras("#ffffff", t("teal"))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("tema palet 2026 - cakupan", () => {
  it("warna primer palet benar-benar terpasang", () => {
    expect(t("navy").toLowerCase()).toBe("#123b5d");
    expect(t("biru").toLowerCase()).toBe("#3473a7");
    expect(t("bg").toLowerCase()).toBe("#f6f6f6");
  });

  it("TIDAK menyentuh token sidebar - sidebar tetap seperti semula", () => {
    // Sidebar ada di luar pembungkus tema, tapi token --color-nav-* yang ikut
    // ditimpa di sini akan tetap tidak berpengaruh - dan menyesatkan orang
    // yang membacanya. Lebih baik tidak ada sama sekali.
    expect(Object.keys(tema).some((k) => k.startsWith("--color-nav-"))).toBe(false);
  });

  it("keempat slot cahaya punya nilai bawaan di :root - dashboard Pimpinan tidak kehilangan warnanya", () => {
    // Pimpinan memakai kartu yang sama TANPA tema. Kalau nilai bawaannya
    // hilang, var() kosong dan cahaya kartunya lenyap tanpa error apa pun.
    const akar = blok(":root");
    for (const n of [1, 2, 3, 4]) {
      for (const bagian of ["latar", "ikon-latar", "ikon-warna"]) {
        expect(akar[`--cahaya-${n}-${bagian}`], `--cahaya-${n}-${bagian}`).toBeTruthy();
        expect(tema[`--cahaya-${n}-${bagian}`], `tema --cahaya-${n}-${bagian}`).toBeTruthy();
      }
    }
  });
});
