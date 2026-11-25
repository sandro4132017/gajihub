import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TabelRincianTukinLengkap, type BarisRincianTukinLengkap } from "../TabelRincianTukinLengkap";

const baris = (o: Partial<BarisRincianTukinLengkap> = {}): BarisRincianTukinLengkap => ({
  id: "p1",
  nip: "199000100000000008", // sensitive-ok
  nama: "Pegawai Contoh",
  golongan: "III/c",
  kelasJabatan: 9,
  tukin: null,
  rekap: null,
  predikat: null,
  ...o,
});

const render = (b: BarisRincianTukinLengkap[]) =>
  renderToStaticMarkup(<TabelRincianTukinLengkap baris={b} hrefNama={() => "#"} />);

/** Isi sel ke-n (0-based) baris data pertama. */
const sel = (html: string, n: number) => {
  const tr = html.slice(html.indexOf("<tbody>"));
  const isi = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]+>/g, ""));
  return isi[n];
};

describe("TabelRincianTukinLengkap - kolom tap tidak wajar", () => {
  it("dua kolom baru tepat sesudah Alpa (M): N jumlah, O persen 1%/kejadian", () => {
    const html = render([baris({ tapTidakWajar: 2 })]);
    const th = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => m[1]);
    expect(th[12]).toBe("Alpa");
    expect(th[13]).toBe("Anomali/Tap Tidak Wajar");
    expect(th[14]).toBe("% Pot Anomali");
    expect(sel(html, 13)).toBe("2");
    expect(sel(html, 14)).toBe("2%");
  });

  it("JPT yang dikecualikan dari potongan kehadiran: 0%", () => {
    const html = render([baris({ kelasJabatan: 17, tapTidakWajar: 3 })]);
    expect(sel(html, 13)).toBe("3");
    expect(sel(html, 14)).toBe("0%");
  });

  it("tidak dihitung pemanggil: tanda strip", () => {
    const html = render([baris()]);
    expect(sel(html, 13)).toBe("-");
    expect(sel(html, 14)).toBe("-");
  });
});
