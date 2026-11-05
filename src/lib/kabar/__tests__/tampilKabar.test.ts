import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GAYA_JENIS, jamJakarta, kelompokPerHari, kunciHariJakarta, labelHari, pecahAngka } from "../tampilKabar";

describe("kunciHariJakarta / jamJakarta", () => {
  it("membaca tanggal dan jam menurut WIB, bukan UTC", () => {
    const d = new Date("2026-11-05T17:30:00Z"); // 00.30 WIB hari berikutnya
    expect(kunciHariJakarta(d)).toBe("2026-11-06");
    expect(jamJakarta(d)).toBe("00.30");
    expect(jamJakarta(new Date("2026-11-05T07:05:00Z"))).toBe("14.05");
  });
});

describe("labelHari", () => {
  const sekarang = new Date("2026-11-05T05:00:00Z"); // Kamis, 5 November 2026 WIB

  it("Hari ini, Kemarin, dan tanggal lengkap dengan nama hari", () => {
    expect(labelHari("2026-11-05", sekarang)).toBe("Hari ini");
    expect(labelHari("2026-11-04", sekarang)).toBe("Kemarin");
    expect(labelHari("2026-11-02", sekarang)).toBe("Senin, 2 November 2026");
    expect(labelHari("2026-12-25", sekarang)).toBe("Jumat, 25 Desember 2026");
  });

  it("hari ini ditentukan menurut WIB", () => {
    // 18.00 UTC tanggal 5 = 01.00 WIB tanggal 6.
    expect(labelHari("2026-11-06", new Date("2026-11-05T18:00:00Z"))).toBe("Hari ini");
  });
});

describe("kelompokPerHari", () => {
  it("memecah per hari WIB dan mempertahankan urutan", () => {
    const baris = [
      { id: 1, waktu: "2026-11-05T17:30:00Z" },
      { id: 2, waktu: "2026-11-05T10:00:00Z" },
      { id: 3, waktu: "2026-11-05T16:00:00Z" },
      { id: 4, waktu: new Date("2026-11-04T01:00:00Z") },
    ];
    const hasil = kelompokPerHari(baris);
    expect(hasil.map((h) => h.kunci)).toEqual(["2026-11-06", "2026-11-05", "2026-11-04"]);
    expect(hasil[1].baris.map((b) => b.id)).toEqual([2, 3]);
  });

  it("kosong", () => {
    expect(kelompokPerHari([])).toEqual([]);
  });
});

describe("pecahAngka", () => {
  it("memisahkan segmen angka (mono) dari teks", () => {
    expect(pecahAngka("Memeriksa 3 tabel rekap September 2026 · 5 kali")).toEqual([
      { t: "Memeriksa ", mono: false },
      { t: "3", mono: true },
      { t: " tabel rekap September ", mono: false },
      { t: "2026", mono: true },
      { t: " · ", mono: false },
      { t: "5", mono: true },
      { t: " kali", mono: false },
    ]);
  });

  it("tanda baca di akhir angka tidak ikut segmen mono", () => {
    expect(pecahAngka("Tahun 2026.")).toEqual([
      { t: "Tahun ", mono: false },
      { t: "2026", mono: true },
      { t: ".", mono: false },
    ]);
    expect(pecahAngka("Ada 3, lalu 100.000 unit")).toEqual([
      { t: "Ada ", mono: false },
      { t: "3", mono: true },
      { t: ", lalu ", mono: false },
      { t: "100.000", mono: true },
      { t: " unit", mono: false },
    ]);
  });

  it("tanpa angka satu segmen, kosong tanpa segmen", () => {
    expect(pecahAngka("tanpa angka")).toEqual([{ t: "tanpa angka", mono: false }]);
    expect(pecahAngka("")).toEqual([]);
  });

  it("gabungan segmen selalu merekonstruksi teks asli", () => {
    const teks = "Rekap 9/2026 · 12,5 persen dari 100.000 unit";
    expect(pecahAngka(teks).map((s) => s.t).join("")).toBe(teks);
  });
});

describe("GAYA_JENIS", () => {
  it("setiap jenis punya ikon dan kelas", () => {
    for (const jenis of ["kirim", "kembalikan", "hapus", "ubah", "unggah", "ekspor", "sistem"] as const) {
      expect(GAYA_JENIS[jenis].Ikon).toBeTypeOf("function");
      expect(GAYA_JENIS[jenis].kelas.length).toBeGreaterThan(0);
    }
  });

  it("semua token warna yang dipakai ada di globals.css", () => {
    const css = readFileSync(join(__dirname, "..", "..", "..", "app", "globals.css"), "utf8");
    const token = new Set<string>();
    for (const gaya of Object.values(GAYA_JENIS)) {
      for (const m of gaya.kelas.matchAll(/(?:bg|text|border)-([a-z0-9-]+)/g)) token.add(m[1]);
    }
    for (const nama of token) {
      expect(css, `--color-${nama}`).toContain(`--color-${nama}:`);
    }
  });
});
