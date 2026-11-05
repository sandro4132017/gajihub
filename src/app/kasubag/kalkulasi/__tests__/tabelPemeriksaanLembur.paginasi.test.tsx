import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../actions", () => ({
  koreksiJamLemburHarianAction: vi.fn(),
  hapusKoreksiJamLemburHarianAction: vi.fn(),
}));

import { TabelPemeriksaanLembur, type BarisPemeriksaanLembur } from "../TabelPemeriksaanLembur";

const baris = (i: number, jam: number): BarisPemeriksaanLembur => ({
  pegawaiId: `p${i}`,
  nip: `00000000000000000${i}`.slice(-18), // sensitive-ok
  nama: `Pegawai Uji ${String(i).padStart(2, "0")}`,
  jamHariKerja: jam,
  jamHariLibur: 0,
  totalTersimpan: jam,
  jamHarian: jam,
  rincianHari: [],
});

// 12 berlembur + 3 tanpa lembur (tidak tampil di tabel).
const SEMUA = [
  ...Array.from({ length: 12 }, (_, i) => baris(i + 1, 2)),
  ...Array.from({ length: 3 }, (_, i) => baris(i + 20, 0)),
];

const render = (halaman?: string, perHalaman?: string) =>
  renderToStaticMarkup(
    <TabelPemeriksaanLembur
      baris={SEMUA}
      periodeBulan={7}
      periodeTahun={2026}
      halaman={halaman}
      perHalaman={perHalaman}
      paramPaginasi="bulan=7&tahun=2026"
    />
  );

const jumlahBaris = (html: string) => (html.match(/Pegawai Uji \d\d/g) ?? []).length;

describe("TabelPemeriksaanLembur - paginasi", () => {
  it("bawaan menampilkan 10 baris, ringkasan tetap menghitung semua", () => {
    const html = render();
    expect(jumlahBaris(html)).toBe(10);
    expect(html).toContain("12 pegawai berlembur");
    expect(html).toContain("halLembur=2");
    expect(html).toContain("#tabel-lembur");
  });

  it("halaman 2 berisi sisa 2 baris", () => {
    const html = render("2", "10");
    expect(jumlahBaris(html)).toBe(2);
    expect(html).toContain("Pegawai Uji 11");
    expect(html).not.toContain("Pegawai Uji 01");
  });
});
