import { describe, expect, it } from "vitest";
import { susunPesanPerintahLembur } from "../pesanPerintahLembur";
import { BATAS_NAMA_PER_PESAN } from "../pengingatAbsen";

const dasar = {
  tanggalTeks: "Kamis, 10 Desember 2026",
  kepalaTimNama: "KEPALA UJI",
  satuanKerja: "Biro Uji",
  nomorSurat: "001/SPKL/2026",
  uraianTugas: "Menyelesaikan rekonsiliasi akhir tahun",
  anggota: [
    { nama: "ANGGOTA SATU", jam: 3 },
    { nama: "ANGGOTA DUA", jam: 2 },
  ],
};

describe("susunPesanPerintahLembur", () => {
  it("anggota kosong -> null", () => {
    expect(susunPesanPerintahLembur({ ...dasar, anggota: [] })).toBeNull();
  });

  it("memuat tanggal, satker, kepala tim, nomor, tugas, nama, jam, dan penanda TTE", () => {
    const p = susunPesanPerintahLembur(dasar)!;
    expect(p).toContain("*PERINTAH LEMBUR*");
    expect(p).toContain("Kamis, 10 Desember 2026");
    expect(p).toContain("Biro Uji");
    expect(p).toContain("KEPALA UJI");
    expect(p).toContain("001/SPKL/2026");
    expect(p).toContain("Menyelesaikan rekonsiliasi akhir tahun");
    expect(p).toContain("• ANGGOTA SATU — *3 jam*");
    expect(p).toContain("ditandatangani secara elektronik");
  });

  it("nomor surat kosong tidak mencetak baris nomor", () => {
    const p = susunPesanPerintahLembur({ ...dasar, nomorSurat: null })!;
    expect(p).not.toContain("Nomor surat");
  });

  it("tidak pernah memuat deret 18 angka, termasuk dari uraian tugas", () => {
    const p = susunPesanPerintahLembur({
      ...dasar,
      uraianTugas: "Bantu 199001010000000021 menyiapkan laporan", // sensitive-ok
    })!;
    expect(p).not.toMatch(/\d{18}/);
    expect(p).toContain("[nomor dihapus]");
  });

  it("uraian dijadikan satu baris dan dipotong", () => {
    const p = susunPesanPerintahLembur({ ...dasar, uraianTugas: `a\nb\n${"x".repeat(500)}` })!;
    const baris = p.split("\n").find((b) => b.startsWith("Tugas: "))!;
    expect(baris.startsWith("Tugas: a b x")).toBe(true);
    expect(baris.length).toBeLessThan(330);
    expect(baris.endsWith("...")).toBe(true);
  });

  it("memotong di BATAS_NAMA_PER_PESAN dan menyebut sisanya", () => {
    const banyak = Array.from({ length: BATAS_NAMA_PER_PESAN + 7 }, (_, i) => ({ nama: `PEGAWAI ${i}`, jam: 1 }));
    const p = susunPesanPerintahLembur({ ...dasar, anggota: banyak })!;
    expect(p.split("\n").filter((b) => b.startsWith("• ")).length).toBe(BATAS_NAMA_PER_PESAN);
    expect(p).toContain("_...dan 7 pegawai lainnya_");
  });

  it("tepat di batas tidak menambah baris sisa", () => {
    const pas = Array.from({ length: BATAS_NAMA_PER_PESAN }, (_, i) => ({ nama: `P ${i}`, jam: 1 }));
    expect(susunPesanPerintahLembur({ ...dasar, anggota: pas })!).not.toContain("lainnya");
  });

  it("hanya memakai penanda WhatsApp (*tebal*, _miring_, butir), tanpa markdown lain", () => {
    const p = susunPesanPerintahLembur(dasar)!;
    expect(p).not.toMatch(/\*\*|#|`|\[.*\]\(.*\)/);
  });
  it("penanda format di data (uraian, nama, nomor) dibuang supaya tidak merusak pesan", () => {
    const p = susunPesanPerintahLembur({
      ...dasar,
      uraianTugas: "Rekap *penting* _segera_ ~coret~ `kode`",
      nomorSurat: "1/*1000*/KP.08.01",
      anggota: [{ nama: "Nama_Palsu*", jam: 2 }],
    })!;
    expect(p).toContain("Tugas: Rekap penting segera coret kode");
    expect(p).toContain("Nomor surat: 1/1000/KP.08.01");
    expect(p).toContain("• NamaPalsu — *2 jam*");
  });
});
