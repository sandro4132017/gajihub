import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PilPredikat, labelPredikat } from "../PilPredikat";
import { TabelRincianUnit } from "../../../app/tukin/TabelRincianUnit";

describe("PilPredikat", () => {
  it("kode enum tidak pernah tampil mentah", () => {
    expect(labelPredikat("SANGAT_BAIK")).toBe("Sangat Baik");
    expect(labelPredikat("PERLU_PERBAIKAN")).toBe("Perlu Perbaikan");
    expect(labelPredikat("Baik")).toBe("Baik");
    expect(labelPredikat("KODE_ASING")).toBe("KODE ASING");
  });

  it("warna mengikuti dampak: Sangat Baik hijau, Baik biru, Kurang merah", () => {
    expect(renderToStaticMarkup(<PilPredikat nilai="SANGAT_BAIK" />)).toContain("text-green");
    expect(renderToStaticMarkup(<PilPredikat nilai="Baik" />)).toContain("text-biru-deep");
    expect(renderToStaticMarkup(<PilPredikat nilai="KURANG" />)).toContain("text-red");
  });
});

describe("TabelRincianUnit (Dashboard Tukin PPABP)", () => {
  const html = renderToStaticMarkup(
    <TabelRincianUnit
      satuanKerja="Unit Uji"
      periode="Agustus 2026"
      baris={[
        {
          id: "a",
          nip: "000000000000000001", // sensitive-ok
          nama: "Pegawai Uji",
          kelasJabatan: 7,
          nominalTukin: 3_000_000,
          predikat: "SANGAT_BAIK",
          dibayarkan: 3_000_000,
          catatanAnomali: null,
        },
        {
          id: "b",
          nip: "000000000000000002", // sensitive-ok
          nama: "Pegawai Uji Dua",
          kelasJabatan: 7,
          nominalTukin: 3_000_000,
          predikat: "BAIK",
          dibayarkan: 2_940_000,
          catatanAnomali: null,
        },
      ]}
    />
  );

  it("capaian kinerja berupa pil berlabel, tanpa garis bawah", () => {
    expect(html).toContain(">Sangat Baik</span>");
    expect(html).not.toContain("SANGAT_BAIK");
  });

  it("0% hijau, potongan oranye, rupiah ber-Rp", () => {
    expect(html).toMatch(/text-green[^>]*>0%</);
    expect(html).toMatch(/text-gold-deep[^>]*>2%</);
    expect(html).toContain("Rp 2.940.000");
  });
});
