import { describe, it, expect } from "vitest";
import {
  generateDraftSptjm,
  generateNomorSptjmDefault,
  terapkanStempelTteSimulasi,
  type JenisSptjm,
} from "../sptjmPdf";
import { checkUserStatus } from "../esignClient";
import { extractText } from "unpdf";

describe("checkUserStatus BSrE", () => {
  it("memeriksa status sertifikat akun demo di server BSrE", async () => {
    const res = await checkUserStatus("0803202100007062");
    expect(["ISSUE", "NETWORK_ERROR", "SERVER_ERROR"]).toContain(res.status);
    if (res.status === "ISSUE") {
      expect(res.success).toBe(true);
      expect(res.statusCode).toBe(1111);
    }
  });

  it("menangani NIK kosong dengan status INPUT", async () => {
    const res = await checkUserStatus("");
    expect(res.status).toBe("INPUT");
    expect(res.success).toBe(false);
  });
});

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

  it("merender QR Code dan label pada mode previewTte", async () => {
    const pdfBuffer = await generateDraftSptjm({
      jenis: "SPTJM_TUKIN",
      nomorDokumen: "1/3059/KU.02/VIII/2026",
      periodeBulan: 8,
      periodeTahun: 2026,
      previewTte: true,
    });

    const { text } = await extractText(new Uint8Array(pdfBuffer));
    const fullText = text.join(" ");
    expect(fullText).toContain("DITANDATANGANI SECARA ELEKTRONIK");
    expect(fullText).toContain("[ PRATINJAU DOKUMEN TTE ]");
  });

  it("membubuhkan QR Code asli dan segel visual BSrE saat terapkanStempelTteSimulasi", async () => {
    const draft = await generateDraftSptjm({
      jenis: "SPTJM_LEMBUR",
      nomorDokumen: "1/2903/KU.02/VIII/2026",
      periodeBulan: 8,
      periodeTahun: 2026,
    });

    const signed = await terapkanStempelTteSimulasi(draft, {
      namaPenandatangan: "Alpha Sandro Adithyaswara, S.Sos., M.M.",
      nipPenandatangan: "19870323 201503 1 002",
      idDokumenBsre: "BSRE-TEST-123456",
      verifyUrl: "https://gajihub.kemnaker.go.id/tte/verify/test",
    });

    expect(signed).toBeInstanceOf(Buffer);
    expect(signed.length).toBeGreaterThan(draft.length);

    const { text } = await extractText(new Uint8Array(signed));
    const fullText = text.join(" ");
    expect(fullText).toContain("DITANDATANGANI SECARA ELEKTRONIK");
    expect(fullText).toContain("Balai Sertifikasi Elektronik (BSrE)");
    expect(fullText).toContain("BSRE-TEST-123456");
  });
});
