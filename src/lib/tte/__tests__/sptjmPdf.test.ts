import { describe, it, expect } from "vitest";
import {
  generateDraftSptjm,
  generateNomorSptjmDefault,
  type JenisSptjm,
} from "../sptjmPdf";
import { extractText } from "unpdf";

describe("generateNomorSptjmDefault (Opsi A)", () => {
  it("menghasilkan nomor dokumen dengan bulan Romawi yang benar", () => {
    expect(generateNomorSptjmDefault("SPTJM_LEMBUR", 8, 2026)).toBe("1/2903/KU.02/VIII/2026");
    expect(generateNomorSptjmDefault("SPTJM_TUKIN", 9, 2026)).toBe("1/3059/KU.02/IX/2026");
    expect(generateNomorSptjmDefault("SPTJM_UANG_MAKAN", 10, 2026)).toBe("1/3106/KU.02/X/2026");
  });
});

describe("generateDraftSptjm Universal", () => {
  const jenisList: { jenis: JenisSptjm; keyword: string }[] = [
    { jenis: "SPTJM_LEMBUR", keyword: "Pembayaran Uang Lembur" },
    { jenis: "SPTJM_TUKIN", keyword: "Pembayaran Tunjangan Kinerja Susulan" },
    { jenis: "SPTJM_UANG_MAKAN", keyword: "pembayaran uang makan" },
  ];

  it.each(jenisList)("membuat PDF valid untuk $jenis", async ({ jenis, keyword }) => {
    const nomor = generateNomorSptjmDefault(jenis, 9, 2026);
    const pdfBuffer = await generateDraftSptjm({
      jenis,
      nomorDokumen: nomor,
      periodeBulan: 9,
      periodeTahun: 2026,
      namaPenandatangan: "Alpha Sandro Adithyaswara, S.Sos., M.M.",
      nipPenandatangan: "19870323 201503 1 002",
      jabatanPenandatangan: "Pejabat Pembuat Komitmen",
      satuanKerja: "Biro Keuangan dan BMN",
      unitEselon1: "Sekretariat Jenderal",
    });

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    const { text } = await extractText(new Uint8Array(pdfBuffer));
    const fullText = text.join(" ");

    // Memverifikasi elemen penting dokumen naskah dinas
    expect(fullText.toUpperCase()).toContain("KEMENTERIAN KETENAGAKERJAAN");
    expect(fullText).toContain("SURAT PERNYATAAN TANGGUNGJAWAB MUTLAK");
    expect(fullText).toContain(nomor);
    expect(fullText).toContain("Alpha Sandro Adithyaswara");
    expect(fullText).toContain("19870323 201503 1 002");
    expect(fullText).toContain("Pejabat Pembuat Komitmen");
    expect(fullText).toContain(keyword);
    expect(fullText).toContain("Balai Sertifikasi Elektronik (BSrE)");
  });
});
