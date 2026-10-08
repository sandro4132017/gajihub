import { describe, it, expect } from "vitest";
import { formatUkuranBerkas, kompresGambarKlien } from "../clientImageCompress";

describe("formatUkuranBerkas", () => {
  it("memformat ukuran byte dengan benar", () => {
    expect(formatUkuranBerkas(0)).toBe("0 B");
    expect(formatUkuranBerkas(500)).toBe("500 B");
    expect(formatUkuranBerkas(1024)).toBe("1.0 KB");
    expect(formatUkuranBerkas(250 * 1024)).toBe("250.0 KB");
    expect(formatUkuranBerkas(2.5 * 1024 * 1024)).toBe("2.50 MB");
  });
});

describe("kompresGambarKlien", () => {
  it("mengembalikan berkas PDF tanpa kompresi canvas", async () => {
    const dummyPdf = new File(["%PDF-1.4 dummy content"], "dokumen-sk.pdf", {
      type: "application/pdf",
    });

    const result = await kompresGambarKlien(dummyPdf);
    expect(result.file.name).toBe("dokumen-sk.pdf");
    expect(result.file.type).toBe("application/pdf");
    expect(result.originalSize).toBe(dummyPdf.size);
    expect(result.compressedSize).toBe(dummyPdf.size);
    expect(result.reductionPercentage).toBe(0);
  });
});

