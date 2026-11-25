import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Komponen klien di dalam papan butuh router Next - cukup tiruan diam.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/ppabp/adk",
  useSearchParams: () => new URLSearchParams(),
}));

import { PapanProgres, bacaStatusPapan } from "../PapanProgres";
import type { ProgresUnit } from "../../../../business-logic/pengirimanUnit";

const unit = (nama: string, keadaan: ProgresUnit["keadaan"], alasan: string | null = null): ProgresUnit => ({
  satuanKerja: nama,
  keadaan,
  dikirimPada: keadaan === "BELUM_KIRIM" ? null : new Date("2026-11-04T15:11:00Z"),
  alasanKembali: alasan,
});

const PROGRES: ProgresUnit[] = [
  unit("Unit Belum A", "BELUM_KIRIM"),
  unit("Unit Kirim B", "TERKIRIM"),
  unit("Unit Kembali C", "DIKEMBALIKAN", "Periksa potongan presensi"),
  ...Array.from({ length: 12 }, (_, i) => unit(`Unit Lain ${String(i).padStart(2, "0")}`, "BELUM_KIRIM")),
];

const render = (o: Partial<Parameters<typeof PapanProgres>[0]> = {}) =>
  renderToStaticMarkup(
    <PapanProgres
      progres={PROGRES}
      periodeBulan={8}
      periodeTahun={2026}
      bolehKembalikan
      paramDasar={{ bulan: "8", tahun: "2026", adk: "tukin" }}
      {...o}
    />
  );

describe("PapanProgres (Export ADK)", () => {
  it("tab status dengan jumlah, dan saringan status dari URL", () => {
    const html = render();
    expect(html).toContain("Semua (15)");
    expect(html).toContain("Terkirim (1)");
    expect(html).toContain("Dikembalikan (1)");
    expect(html).toContain("Belum Kirim (13)");
    expect(bacaStatusPapan("asing")).toBe("semua");
    const hanyaKirim = render({ status: "terkirim" });
    expect(hanyaKirim).toContain("Unit Kirim B");
    expect(hanyaKirim).not.toContain("Unit Belum A");
  });

  it("PPABP: Terkirim di atas dengan kolom alasan + Kembalikan; Dikembalikan menampilkan alasannya", () => {
    const html = render();
    expect(html.indexOf("Unit Kirim B")).toBeLessThan(html.indexOf("Unit Belum A"));
    expect(html).toContain('placeholder="Yang harus diperbaiki?"');
    expect(html).toContain(">Kembalikan</button>");
    expect(html).toContain("Periksa potongan presensi");
    expect(html).toContain("Dikirim: ");
  });

  it("cari menyaring nama satuan kerja", () => {
    const html = render({ cari: "kembali" });
    expect(html).toContain("Unit Kembali C");
    expect(html).not.toContain("Unit Kirim B");
    expect(html).toContain("Total 1 Unit Kerja");
  });

  it("berhalaman 10 baris; parameter paginasi halUnit/perUnit membawa filter halaman", () => {
    const html = render();
    expect(html).toContain("Unit Lain 06");
    expect(html).not.toContain("Unit Lain 07"); // baris ke-11 ada di halaman 2
    expect(html).toMatch(/halUnit=2/);
    expect(html).toMatch(/adk=tukin/);
    expect(render({ hal: "2" })).toContain("Unit Lain 11");
  });

  it("pembaca tanpa wewenang tidak mendapat tombol Kembalikan", () => {
    expect(render({ bolehKembalikan: false })).not.toContain(">Kembalikan</button>");
  });
});
