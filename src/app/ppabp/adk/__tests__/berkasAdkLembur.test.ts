import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { berkasAdkLemburXlsx } from "../berkasAdkLembur";
import type { PegawaiAdkHarian } from "../../../../business-logic/adkHarian";

/**
 * Penjagaan atas berkas .xlsx ADK Uang Lembur yang diisi ke CETAKAN asli.
 *
 * Yang dijaga di sini bukan cuma nilainya, tapi bahwa FORMULA cetakannya TIDAK
 * ikut tertimpa - "Batas", judul berkas, dan nomor urut menghitung dirinya
 * sendiri, dan menimpanya dengan angka adalah cara paling gampang membuat
 * berkas ini berhenti menyerupai berkas operator.
 */

const P = (nip: string, nama: string, hari: { tanggalIso: string; jam: number }[]): PegawaiAdkHarian => ({
  nip,
  nama,
  hari,
});

async function buka(pegawai: PegawaiAdkHarian[], bulan: number, tahun: number) {
  const buf = await berkasAdkLemburXlsx(pegawai, bulan, tahun);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(new Uint8Array(buf).buffer as ArrayBuffer);
  return wb;
}

const CONTOH = [
  P("197804012009122001", "Nurul Apriyanah, SE.", [
    { tanggalIso: "2026-07-01", jam: 3 }, // Rabu - hari kerja
    { tanggalIso: "2026-07-04", jam: 5 }, // Sabtu - hari libur
  ]),
];

describe("berkasAdkLemburXlsx", () => {
  it("keempat sheet cetakan ikut, tidak ada yang hilang", async () => {
    const wb = await buka(CONTOH, 7, 2026);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["depan", "ref", "pegawai", "hasil"]);
  });

  it("formula cetakan TIDAK ditimpa - Batas, judul, dan nomor urut tetap menghitung sendiri", async () => {
    const ws = (await buka(CONTOH, 7, 2026)).getWorksheet("depan")!;
    expect((ws.getCell("B4").value as { formula: string }).formula).toContain("EOMONTH");
    expect((ws.getCell("C2").value as { formula: string }).formula).toContain("VLOOKUP");
    expect((ws.getCell("C1").value as { formula: string }).formula).toContain("IF(B1=");
    expect((ws.getCell("A6").value as { formula: string }).formula).toBe('IF(B6="","",ROW()-5)');
  });

  it("cuma tiga sel kepala yang ditulis - jenis, tahun, bulan", async () => {
    const ws = (await buka(CONTOH, 7, 2026)).getWorksheet("depan")!;
    expect(ws.getCell("B1").value).toBe("Lembur");
    expect(ws.getCell("B2").value).toBe(2026);
    expect(ws.getCell("B3").value).toBe(7);
  });

  it("gaya sel cetakan bertahan - warna latar baris judul tidak hilang", async () => {
    // Inilah sebab seluruh pendekatan ini dipakai. Kalau assertion ini jatuh,
    // berkasnya sudah kembali seperti hasil pustaka yang tidak bisa menulis
    // gaya, dan kemiripan dengan berkas operator hilang.
    const ws = (await buka(CONTOH, 7, 2026)).getWorksheet("depan")!;
    expect(ws.getCell("A5").fill).toMatchObject({ type: "pattern", pattern: "solid" });
    expect(ws.getCell("D5").alignment).toMatchObject({ horizontal: "center" });
    expect(ws.getColumn(3).width).toBe(47);
  });

  it("baris judul tanggal mengikuti panjang bulan", async () => {
    const juli = (await buka(CONTOH, 7, 2026)).getWorksheet("depan")!;
    expect(juli.getCell("AH5").value).toBe(31);
    const juni = (await buka(CONTOH, 6, 2026)).getWorksheet("depan")!;
    expect(juni.getCell("AH5").value).toBeNull(); // slot ke-31 tidak ada di Juni
    expect(juni.getCell("AG5").value).toBe(30);
  });

  it("formula ringkasan memakai kalender bulan yang diminta, bukan bulan cetakan", async () => {
    // Juli 2026: akhir pekan tanggal 4,5,11,12,18,19,25,26 -> kolom G,H,N,O,U,V,AB,AC.
    const ws = (await buka(CONTOH, 7, 2026)).getWorksheet("depan")!;
    const libur = (ws.getCell("AJ6").value as { formula: string }).formula;
    expect(libur).toBe("SUM(G6,H6,N6,O6,U6,V6,AB6,AC6)");
    // Dicocokkan UTUH, bukan lewat `toContain`: "G6" ikut cocok di dalam
    // "AG6", jadi pemeriksaan substring di sini selalu menyesatkan.
    const kerja = (ws.getCell("AI6").value as { formula: string }).formula;
    expect(kerja).toBe(
      "SUM(D6,E6,F6,I6,J6,K6,L6,M6,P6,Q6,R6,S6,T6,W6,X6,Y6,Z6,AA6,AD6,AE6,AF6,AG6,AH6)"
    );
    // Tidak ada kolom yang dipakai dua kali, dan keduanya menutup 31 slot.
    const kolom = [...kerja.matchAll(/([A-Z]+)6/g)].map((m) => m[1]);
    const kolomLibur = [...libur.matchAll(/([A-Z]+)6/g)].map((m) => m[1]);
    expect(new Set([...kolom, ...kolomLibur]).size).toBe(31);
  });

  it("jam masuk ke kolom tanggalnya, NIP tetap teks", async () => {
    const ws = (await buka(CONTOH, 7, 2026)).getWorksheet("depan")!;
    expect(ws.getCell("D6").value).toBe(3); // tanggal 1
    expect(ws.getCell("G6").value).toBe(5); // tanggal 4
    expect(ws.getCell("E6").value).toBeNull(); // tanggal 2 kosong
    expect(ws.getCell("B6").value).toBe("197804012009122001");
    expect(ws.getCell("B6").numFmt).toBe("@");
  });

  it("sheet hasil = muatan yang disetor, satu baris per hari", async () => {
    const wh = (await buka(CONTOH, 7, 2026)).getWorksheet("hasil")!;
    expect(wh.getCell("A1").value).toBe("197804012009122001");
    expect(wh.getCell("B1").value).toBe("2026-07-01");
    expect(wh.getCell("C1").value).toBe(3);
    expect(wh.getCell("B2").value).toBe("2026-07-04");
    expect(wh.getCell("C2").value).toBe(5);
    // Cetakan dibersihkan, jadi tidak ada sisa baris pegawai lain.
    expect(wh.getCell("A3").value).toBeNull();
  });

  it("cetakan yang ikut repo memang sudah bersih dari data pegawai", async () => {
    // Repo ini publik. Kalau suatu saat cetakannya diganti berkas asli
    // operator, test ini yang jatuh duluan.
    const wb = await buka([], 7, 2026);
    const pegawai = wb.getWorksheet("pegawai")!;
    let berisi = 0;
    pegawai.eachRow({ includeEmpty: false }, (row, nomor) => {
      if (nomor === 1) return; // baris judul NIP|NAMA|GRADE|NILAI
      row.eachCell({ includeEmpty: false }, (sel) => {
        if (sel.value !== null && sel.value !== undefined && String(sel.value) !== "") berisi++;
      });
    });
    expect(berisi).toBe(0);
  });
});
