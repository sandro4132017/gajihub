import { describe, expect, it } from "vitest";
import { slugSatker } from "../slugSatker";

describe("slugSatker", () => {
  it("kosong/null tidak menambah apa-apa ke nama berkas", () => {
    expect(slugSatker(null)).toBe("");
    expect(slugSatker(undefined)).toBe("");
    expect(slugSatker("")).toBe("");
  });

  it("nama unit jadi potongan berawalan tanda hubung", () => {
    expect(slugSatker("Biro Keuangan dan Barang Milik Negara")).toBe("-biro-keuangan-dan-barang-milik");
  });

  it("tidak pernah berakhir dengan tanda hubung", () => {
    // Pemotongan 32 huruf bisa jatuh tepat di spasi. Tanpa perapian, nama
    // berkasnya jadi "...-biro-keuangan--pns" dengan hubung ganda.
    for (const nama of [
      "Balai Besar Pelatihan Vokasi dan Produktivitas Bandung",
      "Direktorat Jenderal Pembinaan Pengawasan Ketenagakerjaan",
      "Sekretariat Jenderal Kementerian Ketenagakerjaan RI",
    ]) {
      expect(slugSatker(nama)).not.toMatch(/-$/);
      expect(slugSatker(nama)).not.toContain("--");
    }
  });

  it("panjangnya dibatasi - nama berkas tidak boleh ikut sepanjang nama unit", () => {
    const s = slugSatker("Balai Besar Pelatihan Vokasi dan Produktivitas Bandung");
    expect(s.length).toBeLessThanOrEqual(33); // 32 + tanda hubung di depan
  });

  it("tanda baca tidak bocor ke nama berkas", () => {
    // Nama berkas dipakai di header Content-Disposition; karakter seperti
    // "/" atau kutip di sana bukan cuma jelek, tapi bisa merusak headernya.
    expect(slugSatker('Biro "Keuangan"/BMN, Setjen')).toMatch(/^-[a-z0-9-]+$/);
  });

  it("nama yang seluruhnya tanda baca tidak menghasilkan hubung menggantung", () => {
    expect(slugSatker("---")).toBe("");
  });
});
