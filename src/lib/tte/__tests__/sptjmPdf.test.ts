import { describe, it, expect } from "vitest";
import {
  generateDraftSptjm,
  generateNomorSptjmDefault,
  terapkanStempelTteSimulasi,
  type JenisSptjm,
} from "../sptjmPdf";
import { checkUserStatus } from "../esignClient";
import { extractText } from "unpdf";
import { tambalMathSumPrecise } from "../../pdfTeks";

// unpdf memanggil Math.sumPrecise yang belum ada di Node ini. Tanpa tambalan,
// tiap pembacaan PDF memuntahkan TypeError yang tertangkap sebagai Warning -
// test tetap lulus, tapi log-nya banjir dan menyamarkan galat sungguhan.
tambalMathSumPrecise();

describe("checkUserStatus BSrE", () => {
  // MENEMBAK SERVER BSrE SUNGGUHAN (192.168.221.11), jadi DILEWATI secara
  // bawaan. Jalankan dengan TTE_UJI_JARINGAN=1 kalau memang ingin memeriksa
  // sambungannya.
  //
  // KENAPA DILEWATI, bukan diberi timeout lebih panjang: test ini membuat
  // SELURUH `npm test` bergantung pada jaringan sambil hampir tidak menguji
  // apa pun - tiga status sekaligus dianggap lulus, termasuk NETWORK_ERROR.
  // Terukur: 2.957 ms saat lulus, lalu melewati batas 5.000 ms dan
  // menggagalkan rangkaian yang tidak ada hubungannya dengan TTE.
  const ujiJaringan = process.env.TTE_UJI_JARINGAN === "1";
  it.skipIf(!ujiJaringan)(
    "memeriksa status sertifikat akun demo di server BSrE",
    async () => {
      const res = await checkUserStatus("0803202100007062");
      expect(["ISSUE", "NETWORK_ERROR", "SERVER_ERROR"]).toContain(res.status);
      if (res.status === "ISSUE") {
        expect(res.success).toBe(true);
        expect(res.statusCode).toBe(1111);
      }
    },
    30000
  );

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
      // JABATAN DI SINI JABATAN STRUKTURAL, bukan kapasitas menandatangani.
      // Naskah acuan (docs/sptjm) memuat KEDUANYA di tempat berbeda:
      //   blok tanda tangan -> "Pejabat Pembuat Komitmen" (literal di generator)
      //   daftar identitas 3 -> "Jabatan : Kepala Subbagian Tata Usaha"
      // Dulu pemanggilnya mengirim kapasitas sebagai jabatan, dan generator
      // menimpanya diam-diam. Sejak jabatan diambil dari tabel Pegawai,
      // yang dikirim ke sini jabatan struktural yang sebenarnya.
      namaPenandatangan: "Budi Santoso, S.E., M.M.",
      nipPenandatangan: "19800101 200501 1 001",
      jabatanPenandatangan: "Kepala Subbagian Tata Usaha",
      satuanKerja: "Biro Keuangan dan BMN",
      unitEselon1: "Sekretariat Jenderal",
    });

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    const { text } = await extractText(new Uint8Array(pdfBuffer));
    const fullText = text.join(" ").replace(/\s+/g, " ");

    // Memverifikasi elemen penting dokumen naskah dinas
    expect(fullText.toUpperCase()).toContain("KEMENTERIAN KETENAGAKERJAAN");
    expect(fullText).toContain("SURAT PERNYATAAN TANGGUNGJAWAB MUTLAK");
    expect(fullText).toContain(nomor);
    expect(fullText).toContain("Budi Santoso");
    expect(fullText).toContain("19800101 200501 1 001");
    // Kapasitas (literal generator) DAN jabatan struktural harus SAMA-SAMA ada -
    // kalau salah satu hilang, naskahnya menyimpang dari acuan Rokeu.
    expect(fullText).toContain("Pejabat Pembuat Komitmen");
    expect(fullText).toContain("Kepala Subbagian Tata Usaha");
    expect(fullText).toContain(keyword);
  });

  it("merender QR Code murni pada mode previewTte", async () => {
    const draftTanpaQr = await generateDraftSptjm({
      jenis: "SPTJM_TUKIN",
      nomorDokumen: "1/3059/KU.02/VIII/2026",
      periodeBulan: 8,
      periodeTahun: 2026,
      previewTte: false,
    });
    const pdfBuffer = await generateDraftSptjm({
      jenis: "SPTJM_TUKIN",
      nomorDokumen: "1/3059/KU.02/VIII/2026",
      periodeBulan: 8,
      periodeTahun: 2026,
      previewTte: true,
    });

    expect(pdfBuffer.length).toBeGreaterThan(draftTanpaQr.length);
    const { text } = await extractText(new Uint8Array(pdfBuffer));
    const fullText = text.join(" ").replace(/\s+/g, " ");
    expect(fullText).toContain("SURAT PERNYATAAN TANGGUNGJAWAB MUTLAK");
    expect(fullText).not.toContain("Dokumen ini telah ditandatangani secara elektronik");
  });

  it("membubuhkan QR Code murni saat terapkanStempelTteSimulasi", async () => {
    // Identitas DIKIRIM eksplisit. Sebelumnya test ini mengandalkan nilai
    // cadangan di generator yang berisi nama & NIP pejabat sungguhan -
    // cadangan itu sudah dicabut, karena dokumen berdata kurang tidak boleh
    // tercetak rapi atas nama orang yang nyata.
    const draft = await generateDraftSptjm({
      jenis: "SPTJM_LEMBUR",
      nomorDokumen: "1/2903/KU.02/VIII/2026",
      periodeBulan: 8,
      periodeTahun: 2026,
      namaPenandatangan: "Budi Santoso, S.E., M.M.",
      nipPenandatangan: "19800101 200501 1 001",
      jabatanPenandatangan: "Kepala Subbagian Tata Usaha",
    });

    const signed = await terapkanStempelTteSimulasi(draft, {
      namaPenandatangan: "Budi Santoso, S.E., M.M.",
      nipPenandatangan: "19800101 200501 1 001",
      idDokumenBsre: "BSRE-TEST-123456",
      verifyUrl: "https://gajihub.kemnaker.go.id/tte/verify/test",
    });

    expect(signed).toBeInstanceOf(Buffer);
    expect(signed.length).toBeGreaterThan(draft.length);

    const { text } = await extractText(new Uint8Array(signed));
    const fullText = text.join(" ").replace(/\s+/g, " ");
    expect(fullText).toContain("Budi Santoso, S.E.");
    expect(fullText).not.toContain("Dokumen ini telah ditandatangani secara elektronik");
  });
});
