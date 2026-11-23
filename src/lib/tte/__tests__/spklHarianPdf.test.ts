import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractText } from "unpdf";
import { tambalMathSumPrecise } from "../../pdfTeks";
import {
  CAP_SEMENTARA,
  JABATAN_TTD_TANPA_TTE,
  generateSpklHarianPdf,
  susunBarisLampiranSpklHarian,
  susunDasarSpklHarian,
  type BarisSpklHarian,
  type DataSpklHarian,
} from "../spklHarianPdf";
import { DASAR_LEMBUR, FOOTER_BSRE, FOOTER_PRATINJAU } from "../pdfLemburBersama";
import { generateNamaFileSpklHarian, generateNomorSpklHarianDefault } from "../lemburTypes";

tambalMathSumPrecise();

const baris = (n: number): BarisSpklHarian[] =>
  Array.from({ length: n }, (_, i) => ({
    nip: `19900101000000${String(i).padStart(4, "0")}`, // sensitive-ok
    nama: `Pegawai Uji ${i + 1}`,
    golongan: "III/c",
    jam: (i % 4) + 1,
    uraian: ["menyusun laporan uji"],
  }));

const data = (o: Partial<DataSpklHarian> = {}): DataSpklHarian => ({
  nomorDokumen: generateNomorSpklHarianDefault("2026-12-10"),
  tanggalIso: "2026-12-10",
  satuanKerja: "Biro Uji Coba",
  baris: baris(2),
  tanpaTte: true,
  ...o,
});

const penandatangan = {
  nama: "Kasubag Uji",
  nip: "198001010000000002", // sensitive-ok
  jabatan: "Kepala Subbagian Tata Usaha Uji",
};

async function teks(buf: Buffer) {
  const { text } = await extractText(new Uint8Array(buf), { mergePages: false });
  const halaman = (text as string[]).map((t) => t.replace(/\s+/g, " "));
  return { semua: halaman.join(" "), halaman };
}

describe("susunBarisLampiranSpklHarian", () => {
  it("NO, NAMA/NIP, GOL, TANGGAL (angka hari), KETERANGAN (-uraian), tanpa jam", () => {
    const [b] = susunBarisLampiranSpklHarian(
      [{ ...baris(1)[0], uraian: ["menyusun laporan uji", "rapat koordinasi"] }],
      "2026-12-05",
    );
    expect(b).toEqual([
      "1",
      "Pegawai Uji 1\n199001010000000000", // sensitive-ok
      "III/c",
      "5",
      "-menyusun laporan uji\n-rapat koordinasi",
    ]);
    expect(b).toHaveLength(5);
  });
  it("uraian kosong tidak mencetak penanda kosong", () => {
    const [b] = susunBarisLampiranSpklHarian([{ ...baris(1)[0], uraian: ["  "] }], "2026-12-10");
    expect(b[4]).toBe("");
  });
});

describe("lemburTypes SPKL harian", () => {
  it("nomor dummy dan nama berkas (akhiran -SEMENTARA opsional)", () => {
    expect(generateNomorSpklHarianDefault("2026-12-10")).toBe("1/1771/KU.02/XII/2026");
    expect(generateNamaFileSpklHarian("2026-12-10", "Biro A/B")).toBe("SPKL Harian 2026-12-10 Biro A B.pdf");
    expect(generateNamaFileSpklHarian("2026-12-10", "Biro A/B", true)).toBe(
      "SPKL Harian 2026-12-10 Biro A B-SEMENTARA.pdf",
    );
  });
});

describe("susunDasarSpklHarian", () => {
  it("2026: DIPA dan tanggalnya dari anggaranLembur; 2027: penanda belum dikonfirmasi", () => {
    const d26 = susunDasarSpklHarian(2026);
    expect(d26).toHaveLength(6);
    expect(d26[2]).toBe(
      "Keputusan Menteri Ketenagakerjaan Republik Indonesia Nomor 195 Tahun 2021 tentang Pengangkatan Pejabat Perbendaharaan Negara pada Satuan Kerja Pusat dan Satuan Kerja Unit Pelaksanaan Teknis Pusat Kementerian Ketenagakerjaan;",
    );
    expect(DASAR_LEMBUR[2]).toContain("Satuan Unit Pelaksanaan Teknis"); // jalur TTE tidak berubah
    expect(d26[4]).toContain("Nomor : SP DIPA-026.01.1.450938/2026 tanggal 1 Desember 2025;");
    const d27 = susunDasarSpklHarian(2027);
    expect(d27[4]).toContain("Tahun 2027");
    expect(d27[4]).toContain("[belum dikonfirmasi]");
    expect(d27[5]).toContain("Tahun Anggaran 2027");
  });
});

describe("generateSpklHarianPdf", () => {
  it("halaman 1 memuat bagian SPKL dengan tanggal tunggal dan pembiayaan DIPA 2026", async () => {
    const { halaman, semua } = await teks(await generateSpklHarianPdf(data()));
    for (const t of [
      "SURAT PERINTAH KERJA LEMBUR",
      "NOMOR 1/1771/KU.02/XII/2026",
      "Menimbang",
      "Dasar",
      "MEMERINTAHKAN",
      "Kepada",
      "Untuk",
      "Pembiayaan",
      "Ditetapkan di Jakarta",
      "Pada tanggal 10 Desember 2026",
    ]) {
      expect(halaman[0]).toContain(t);
    }
    expect(semua).toContain("di Biro Uji Coba;");
    expect(semua).toContain("Satuan Kerja Unit Pelaksanaan Teknis Pusat");
    expect(semua).toContain("pada tanggal 10 Desember 2026.");
    expect(semua).toContain("DIPA-026.01.1.450938/2026 tanggal 1 Desember 2025;");
    expect(semua).toContain("Akun : 026.01.WA.2158.EBA.994.001.A.512211");
    expect(semua).not.toContain("s/d");
    // Halaman 1 tanpa NIP.
    expect(halaman[0]).not.toMatch(/NIP/);
  });

  it("tahun 2027: nomor DIPA dan akun dicetak sebagai penanda belum dikonfirmasi", async () => {
    const { semua } = await teks(
      await generateSpklHarianPdf(
        data({ tanggalIso: "2027-01-12", nomorDokumen: generateNomorSpklHarianDefault("2027-01-12") }),
      ),
    );
    expect(semua).toContain("[belum dikonfirmasi]");
    expect(semua).not.toContain("450938");
    expect(semua).not.toContain("512211");
  });

  it("memakai nama singkat satker di kalimat dan kepala lampiran", async () => {
    const { halaman } = await teks(await generateSpklHarianPdf(data({ namaSingkat: "Biro Pendek" })));
    expect(halaman[0]).toContain("di Biro Pendek;");
    expect(halaman[1]).toContain("Pejabat Pembuat Komitmen Biro Pendek, Biro Pendek Sekretariat Jenderal Kemnaker Tanggal 10 Desember 2026");
  });

  it("lampiran portrait: NO, NAMA/NIP, GOL, TANGGAL (Desember), KETERANGAN; tanpa JAM dan tanpa Kepala Tim", async () => {
    const buf = await generateSpklHarianPdf(data());
    const { halaman } = await teks(buf);
    expect(halaman[1]).toContain("Lampiran");
    expect(halaman[1]).toContain("PEJABAT/PEGAWAI YANG MELAKSANAKAN PERINTAH KERJA LEMBUR");
    for (const k of ["NO", "NAMA/NIP", "GOL", "TANGGAL (Desember)", "KETERANGAN"]) expect(halaman[1]).toContain(k);
    expect(halaman[1]).not.toContain("JAM");
    expect(halaman[1]).not.toContain("Kepala Tim");
    expect(halaman[1]).toContain("Pegawai Uji 1");
    expect(halaman[1]).toContain("-menyusun laporan uji");
    const { width, height } = (await PDFDocument.load(buf)).getPage(1).getSize();
    expect(height).toBeGreaterThan(width);
  });

  it("tanpaTte: tanpa footer BSrE, tanpa '#', tanpa SIGN_Y; tanpa catatan; nama kosong -> garis titik-titik di kedua blok", async () => {
    const buf = await generateSpklHarianPdf(data({ baris: baris(60) }));
    const { semua, halaman } = await teks(buf);
    expect(halaman.length).toBeGreaterThan(2);
    for (const h of halaman) {
      expect(h).not.toContain("telah ditandatangani secara elektronik");
      expect(h).not.toContain(FOOTER_BSRE);
    }
    expect(semua).not.toContain("#");
    expect((await PDFDocument.load(buf)).getKeywords() ?? "").not.toMatch(/SIGN_Y/);
    expect(semua).toContain(JABATAN_TTD_TANPA_TTE);
    expect(semua).not.toContain("dibentuk otomatis"); // keputusan user: tanpa catatan
    expect(semua.match(/\.{10,}/g)?.length).toBeGreaterThanOrEqual(3); // nama p.1, nama + NIP lampiran
  });

  it("blok tanda tangan muncul dua kali (halaman 1 dan akhir lampiran), lampiran dengan NIP", async () => {
    const { halaman } = await teks(
      await generateSpklHarianPdf(
        data({
          jabatanPenandatangan: "Kepala Biro Uji",
          kepalaBiro: { nama: "Kepala Biro Palsu", nip: "198001010000000009" }, // sensitive-ok
        }),
      ),
    );
    const semua = halaman.join(" ");
    expect(semua.match(/Kepala Biro Palsu/g)).toHaveLength(2);
    expect(halaman[0]).toContain("Kepala Biro Uji");
    expect(halaman[0]).not.toContain("198001010000000009");
    const akhir = halaman[halaman.length - 1];
    expect(akhir).toContain("Kepala Biro Uji,");
    expect(akhir).toContain("Setjen Kemnaker");
    expect(akhir).toContain("NIP. 198001010000000009");
  });

  it("sementara: cap di SETIAP halaman dan judul metadata; tanpa sementara: tanpa cap", async () => {
    const buf = await generateSpklHarianPdf(data({ baris: baris(60), sementara: true }));
    const { halaman } = await teks(buf);
    expect(halaman.length).toBeGreaterThan(2);
    for (const h of halaman) expect(h).toContain(CAP_SEMENTARA);
    expect((await PDFDocument.load(buf)).getTitle()).toContain("SEMENTARA");

    const final = await generateSpklHarianPdf(data({ baris: baris(60) }));
    const hasil = await teks(final);
    expect(hasil.semua).not.toContain("SEMENTARA");
    expect((await PDFDocument.load(final)).getTitle()).not.toContain("SEMENTARA");
  });

  it("jalur TTE (tanpaTte tidak diset): footer BSrE di tiap halaman, satu '#', SIGN_Y tersimpan", async () => {
    const buf = await generateSpklHarianPdf(data({ tanpaTte: undefined, penandatangan, baris: baris(60) }));
    const { semua, halaman } = await teks(buf);
    for (const h of halaman) expect(h).toContain(FOOTER_BSRE);
    expect(semua.match(/#/g)?.length).toBe(1);
    expect((await PDFDocument.load(buf)).getKeywords()).toMatch(/SIGN_Y:\d+\.\d+/);
    expect(semua).not.toContain("dibentuk otomatis");
  });

  it("jalur TTE pratinjau: footer pratinjau, tanpa '#'", async () => {
    const buf = await generateSpklHarianPdf(data({ tanpaTte: undefined, penandatangan, previewTte: true }));
    const { semua, halaman } = await teks(buf);
    for (const h of halaman) expect(h).toContain(FOOTER_PRATINJAU);
    expect(semua).not.toContain("#");
  });

  it("jalur TTE tanpa penandatangan ditolak", async () => {
    await expect(generateSpklHarianPdf(data({ tanpaTte: undefined }))).rejects.toThrow(/Penandatangan/);
  });

  it("'#' di nama, uraian, satker diganti sehingga tanpaTte tetap tanpa '#'", async () => {
    const { semua } = await teks(
      await generateSpklHarianPdf(
        data({
          satuanKerja: "Biro #7 Uji",
          baris: [{ ...baris(1)[0], nama: "Pegawai #2", uraian: ["Lembur proyek #12"] }],
        }),
      ),
    );
    expect(semua).not.toContain("#");
    expect(semua).toContain("Lembur proyek No.12");
  });
});
