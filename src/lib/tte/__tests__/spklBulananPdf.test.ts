import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractText } from "unpdf";
import { tambalMathSumPrecise } from "../../pdfTeks";
import {
  generateSpklBulananPdf,
  susunBarisLampiranSpkl,
  type DataSpklBulanan,
} from "../spklBulananPdf";
import { FOOTER_BSRE, FOOTER_PRATINJAU } from "../pdfLemburBersama";
import {
  generateNamaFileSpkl,
  generateNomorSpklDefault,
  generateNomorSuratTugasLemburDefault,
} from "../lemburTypes";

tambalMathSumPrecise();

const anggota = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    nip: `19900101000000${String(i).padStart(4, "0")}`, // sensitive-ok
    nama: `Pegawai Uji ${i + 1}`,
    golongan: "III/c",
    entri: [
      { tanggal: 14, uraian: "menyusun laporan uji" },
      { tanggal: 5, uraian: "menyusun laporan uji" },
      { tanggal: 29, uraian: "rapat koordinasi uji" },
    ],
  }));

const data = (o: Partial<DataSpklBulanan> = {}): DataSpklBulanan => ({
  nomorDokumen: generateNomorSpklDefault(10, 2026),
  periodeBulan: 10,
  periodeTahun: 2026,
  satuanKerja: "Biro Uji Coba",
  penandatangan: {
    nama: "Kasubag Uji",
    nip: "198001010000000002", // sensitive-ok
    jabatan: "Kepala Subbagian Tata Usaha Uji",
  },
  anggota: anggota(2),
  tanggalDokumen: "30 September 2026",
  ...o,
});

async function teks(buf: Buffer) {
  const { text } = await extractText(new Uint8Array(buf), { mergePages: false });
  const halaman = (text as string[]).map((t) => t.replace(/\s+/g, " "));
  return { semua: halaman.join(" "), halaman };
}

describe("susunBarisLampiranSpkl", () => {
  it("tanggal unik terurut, uraian unik digabung", () => {
    const [baris] = susunBarisLampiranSpkl(anggota(1));
    expect(baris[0]).toBe("1");
    expect(baris[1]).toContain("Pegawai Uji 1");
    expect(baris[2]).toBe("III/c");
    expect(baris[3]).toBe("5,14,29");
    expect(baris[4]).toBe("- menyusun laporan uji\n- rapat koordinasi uji");
  });
});

describe("generateSpklBulananPdf", () => {
  it("memuat bagian-bagian SPKL dan rentang tanggal bulan", async () => {
    const { semua } = await teks(await generateSpklBulananPdf(data()));
    for (const t of [
      "SURAT PERINTAH KERJA LEMBUR",
      "NOMOR 1/1771/KU.02/X/2026",
      "Menimbang",
      "Dasar",
      "MEMERINTAHKAN",
      "Kepada",
      "Untuk",
      "Pembiayaan",
      "Ditetapkan di Jakarta",
      "Pada tanggal 30 September 2026",
    ]) {
      expect(semua).toContain(t);
    }
    expect(semua).toContain("di Biro Uji Coba;");
    expect(semua).toContain("tanggal 01 s/d 31 Oktober 2026");
    expect(semua).not.toMatch(/WFA|WFO/i);
  });

  it("rentang akhir bulan mengikuti kalender (Februari 2027 = 28)", async () => {
    const { semua } = await teks(await generateSpklBulananPdf(data({ periodeBulan: 2, periodeTahun: 2027 })));
    expect(semua).toContain("tanggal 01 s/d 28 Februari 2027");
  });

  it("DIPA dan akun tercetak sebagai penanda yang belum dikonfirmasi, bukan angka", async () => {
    const { semua } = await teks(await generateSpklBulananPdf(data()));
    expect(semua).toContain("[nomor DIPA belum dikonfirmasi]");
    expect(semua).toContain("[kode akun belum dikonfirmasi]");
  });

  it("footer BSrE di setiap halaman, termasuk lampiran lanskap berhalaman banyak", async () => {
    const buf = await generateSpklBulananPdf(data({ anggota: anggota(60) }));
    const { halaman } = await teks(buf);
    expect(halaman.length).toBeGreaterThan(2);
    for (const h of halaman) expect(h).toContain(FOOTER_BSRE);
    const doc = await PDFDocument.load(buf);
    const { width, height } = doc.getPage(1).getSize();
    expect(width).toBeGreaterThan(height);
  });

  it("kolom lampiran: NO, NAMA/NIP, GOL, TANGGAL, KETERANGAN", async () => {
    const { halaman } = await teks(await generateSpklBulananPdf(data()));
    for (const k of ["NO", "NAMA/NIP", "GOL", "TANGGAL", "KETERANGAN"]) expect(halaman[1]).toContain(k);
    expect(halaman[1]).toContain("5,14,29");
    expect(halaman[1]).toContain("- rapat koordinasi uji");
  });

  it("penanda koordinat '#' satu pada final, nol pada pratinjau; SIGN_Y tersimpan", async () => {
    const buf = await generateSpklBulananPdf(data());
    expect((await teks(buf)).semua.match(/#/g)?.length).toBe(1);
    expect((await PDFDocument.load(buf)).getKeywords()).toMatch(/SIGN_Y:\d+\.\d+/);
    expect((await teks(await generateSpklBulananPdf(data({ previewTte: true })))).semua).not.toContain("#");
  });

  it("'#' di uraian, nama, jabatan, satker diganti: tepat satu '#' di dokumen final", async () => {
    const buf = await generateSpklBulananPdf(
      data({
        satuanKerja: "Biro #7 Uji",
        penandatangan: { nama: "Kasubag #1", nip: "198001010000000002", jabatan: "Kepala #A" }, // sensitive-ok
        anggota: [
          {
            nip: "199001010000000001", // sensitive-ok
            nama: "Pegawai #2",
            golongan: "III/c",
            entri: [{ tanggal: 3, uraian: "Lembur proyek #12" }],
          },
        ],
      }),
    );
    const { semua } = await teks(buf);
    expect(semua.match(/#/g)?.length).toBe(1);
    expect(semua).toContain("Lembur proyek No.12");
  });

  it("footer: final = klausul BSrE persis di tiap halaman; pratinjau = keterangan pratinjau", async () => {
    const final = await teks(await generateSpklBulananPdf(data({ anggota: anggota(60) })));
    for (const h of final.halaman) {
      expect(h).toContain(FOOTER_BSRE);
      expect(h).not.toContain("Pratinjau -");
    }
    const draft = await teks(await generateSpklBulananPdf(data({ previewTte: true, anggota: anggota(60) })));
    for (const h of draft.halaman) {
      expect(h).toContain(FOOTER_PRATINJAU);
      expect(h).not.toContain("telah ditandatangani secara elektronik");
    }
  });
});

describe("lemburTypes", () => {
  it("nomor dan nama berkas", () => {
    expect(generateNomorSuratTugasLemburDefault(3, 2026)).toBe("1/1000/KP.08.01/III/2026");
    expect(generateNomorSpklDefault(10, 2026)).toBe("1/1771/KU.02/X/2026");
    expect(generateNamaFileSpkl(10, 2026, "Biro A/B")).toBe("SPKL - Oktober 2026 Biro A B.pdf");
  });
});
