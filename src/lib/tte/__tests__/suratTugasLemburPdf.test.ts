import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractText } from "unpdf";
import { tambalMathSumPrecise } from "../../pdfTeks";
import { generateSuratTugasLemburPdf, type DataSuratTugasLembur } from "../suratTugasLemburPdf";
import { FOOTER_BSRE, FOOTER_PRATINJAU, hariTanggalId } from "../pdfLemburBersama";
import { generateNomorSuratTugasLemburDefault } from "../lemburTypes";

tambalMathSumPrecise();

const peserta = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    nip: `19900101000000${String(i).padStart(4, "0")}`, // sensitive-ok
    nama: `Pegawai Uji ${i + 1}`,
    jabatan: "Pengelola Data Uji",
    jamLembur: "17.00 - 20.00",
  }));

const data = (o: Partial<DataSuratTugasLembur> = {}): DataSuratTugasLembur => ({
  nomorDokumen: generateNomorSuratTugasLemburDefault(10, 2026),
  tanggalLembur: "2026-10-14",
  uraianTugas: "menyelesaikan rekapitulasi data uji",
  satuanKerja: "Biro Uji Coba",
  penandatangan: {
    nama: "Kepala Tim Uji",
    nip: "198001010000000001", // sensitive-ok
    jabatan: "Ketua Tim Kerja Uji",
  },
  peserta: peserta(3),
  tanggalDokumen: "13 Oktober 2026",
  ...o,
});

async function teks(buf: Buffer): Promise<{ semua: string; halaman: string[] }> {
  const { text } = await extractText(new Uint8Array(buf), { mergePages: false });
  const halaman = (text as string[]).map((t) => t.replace(/\s+/g, " "));
  return { semua: halaman.join(" "), halaman };
}

describe("generateSuratTugasLemburPdf", () => {
  it("memuat teks perintah lembur dan tidak ada sisa teks WFA/WFO", async () => {
    const { semua } = await teks(await generateSuratTugasLemburPdf(data()));
    expect(semua).toContain("SURAT TUGAS");
    expect(semua).toContain("MENUGASKAN");
    expect(semua).toContain("Nama-nama terlampir");
    expect(semua).toContain("Melaksanakan kerja lembur di luar jam kerja pada Rabu, 14 Oktober 2026");
    expect(semua).toContain("menyelesaikan rekapitulasi data uji");
    expect(semua).toContain("melaporkan hasil kepada pimpinan");
    expect(semua).not.toMatch(/WFA|WFO|work from/i);
  });

  it("footer BSrE ada di SETIAP halaman (Kriteria XI)", async () => {
    const buf = await generateSuratTugasLemburPdf(data({ peserta: peserta(70) }));
    const { halaman } = await teks(buf);
    expect(halaman.length).toBeGreaterThan(2);
    for (const h of halaman) expect(h).toContain(FOOTER_BSRE);
  });

  it("lampiran memuat kolom NO, NIP, NAMA, JABATAN, JAM LEMBUR dan isinya", async () => {
    const { halaman } = await teks(await generateSuratTugasLemburPdf(data()));
    const lampiran = halaman[1];
    for (const k of ["NO", "NIP", "NAMA", "JABATAN", "JAM LEMBUR"]) expect(lampiran).toContain(k);
    expect(lampiran).toContain("Pegawai Uji 2");
    expect(lampiran).toContain("17.00 - 20.00");
  });

  it("penanda koordinat QR '#' tepat satu pada dokumen final, dan nol pada pratinjau", async () => {
    const final = await teks(await generateSuratTugasLemburPdf(data()));
    expect(final.semua.match(/#/g)?.length).toBe(1);
    const draft = await teks(await generateSuratTugasLemburPdf(data({ previewTte: true })));
    expect(draft.semua).not.toContain("#");
    expect(draft.semua).toContain("ruang QR");
  });

  it("'#' di teks bebas (uraian, nama, jabatan) diganti: tetap tepat satu '#' di dokumen final", async () => {
    const buf = await generateSuratTugasLemburPdf(
      data({
        uraianTugas: "Lembur proyek #12",
        penandatangan: { nama: "Kepala #1 Uji", nip: "198001010000000001", jabatan: "Ketua #A" }, // sensitive-ok
        peserta: [{ nip: "199001010000000001", nama: "Pegawai #2", jabatan: "Staf #3", jamLembur: "17.00 - 20.00" }], // sensitive-ok
      }),
    );
    const { semua } = await teks(buf);
    expect(semua.match(/#/g)?.length).toBe(1);
    expect(semua).toContain("Lembur proyek No.12");
  });

  it("footer: final memakai klausul BSrE persis; pratinjau memakai keterangan pratinjau", async () => {
    const final = await teks(await generateSuratTugasLemburPdf(data()));
    expect(final.halaman[0]).toContain(FOOTER_BSRE);
    expect(final.semua).not.toContain("Pratinjau -");
    const draft = await teks(await generateSuratTugasLemburPdf(data({ previewTte: true, peserta: peserta(70) })));
    expect(draft.halaman.length).toBeGreaterThan(2);
    for (const h of draft.halaman) {
      expect(h).toContain(FOOTER_PRATINJAU);
      expect(h).not.toContain("telah ditandatangani secara elektronik");
    }
  });

  it("menyimpan SIGN_Y untuk stempel simulasi dan penanda tangan = kepala tim", async () => {
    const buf = await generateSuratTugasLemburPdf(data());
    const doc = await PDFDocument.load(buf);
    expect(doc.getKeywords()).toMatch(/SIGN_Y:\d+\.\d+/);
    const { halaman } = await teks(buf);
    expect(halaman[0]).toContain("Kepala Tim Uji");
    expect(halaman[0]).toContain("Ketua Tim Kerja Uji");
  });

  it("uraian panjang tetap muat di satu halaman surat (tanda tangan di halaman 1)", async () => {
    const panjang = "kegiatan uji ".repeat(60);
    const buf = await generateSuratTugasLemburPdf(data({ uraianTugas: panjang }));
    const { halaman } = await teks(buf);
    expect(halaman[0]).toContain("Kepala Tim Uji");
  });

  it("karakter di luar WinAnsi tidak membuat pembuatan PDF gagal", async () => {
    const buf = await generateSuratTugasLemburPdf(data({ uraianTugas: "rapat \u2013 \u4e2d\u6587 uji" }));
    expect(buf.length).toBeGreaterThan(1000);
  });
});

describe("hariTanggalId", () => {
  it("memberi nama hari", () => {
    expect(hariTanggalId("2026-10-14")).toBe("Rabu, 14 Oktober 2026");
    expect(hariTanggalId("bukan-tanggal")).toBe("bukan-tanggal");
  });
});
