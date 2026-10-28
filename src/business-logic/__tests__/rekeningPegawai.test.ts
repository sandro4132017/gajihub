import { describe, expect, it } from "vitest";
import { parseRekeningBerkas, parseRekeningPegawai } from "../rekeningPegawai";

// Semua NIP & nomor rekening di bawah PALSU - dibuat untuk test.
const NIP_A = "199001012015031001"; // sensitive-ok
const NIP_B = "199202022019032002"; // sensitive-ok
const NIP_C = "199303032021211003"; // sensitive-ok
const KODE_BNI = "520009000990";

/** Bentuk ekspor aplikasi: judul huruf kecil bergaris bawah, seperti berkas rekening Setjen. */
const JUDUL_EKSPOR = ["nip", "nama_pegawai", "kdbankspan", "rekening", "nama_rekening", "nama_bank"];

const baris = (nip: string, rek: string, namaRek = "PEMILIK UJI") => [nip, "PEGAWAI UJI", KODE_BNI, rek, namaRek, "BANK BNI"];

describe("parseRekeningPegawai - judul kolom bergaris bawah", () => {
  it("nama_bank & nama_rekening dikenali, bukan 'Kolom wajib tidak ditemukan: Nama Bank'", () => {
    const hasil = parseRekeningPegawai([JUDUL_EKSPOR, baris(NIP_A, "0123456789")]);
    expect(hasil.error).toBeUndefined();
    expect(hasil.baris).toHaveLength(1);
    expect(hasil.baris[0].nip).toBe(NIP_A);
    expect(hasil.baris[0].namaRekening).toBe("PEMILIK UJI");
  });

  it("kolom Nama Rekening yang ditaruh SEBELUM kolom Rekening tidak mengisi nomor rekening", () => {
    const judul = ["nip", "kdbankspan", "nama_bank", "nama_rekening", "rekening"];
    const hasil = parseRekeningPegawai([judul, [NIP_A, KODE_BNI, "BANK BNI", "PEMILIK UJI", "0123456789"]]);
    expect(hasil.baris[0].nomorRekening).toBe("0123456789");
    expect(hasil.baris[0].namaRekening).toBe("PEMILIK UJI");
  });

  it("judul bergaya ADK tukin (berspasi, huruf besar) tetap terbaca", () => {
    const judul = ["NIP", "Kode Bank SPAN", "Nama Bank", "Nomor Rekening", "Nama Rekening"];
    const hasil = parseRekeningPegawai([judul, [NIP_A, KODE_BNI, "BANK BNI", "0123456789", "PEMILIK UJI"]]);
    expect(hasil.error).toBeUndefined();
    expect(hasil.baris[0].nomorRekening).toBe("0123456789");
  });
});

describe("parseRekeningBerkas - seluruh sheet", () => {
  it("sheet KEDUA ikut dibaca - PPPK tidak hilang diam-diam", () => {
    const hasil = parseRekeningBerkas([
      { nama: "PNS", matriks: [JUDUL_EKSPOR, baris(NIP_A, "0123456789"), baris(NIP_B, "0223456789")] },
      { nama: "PPPK", matriks: [JUDUL_EKSPOR, baris(NIP_C, "0323456789")] },
    ]);
    expect(hasil.error).toBeUndefined();
    expect(hasil.baris.map((b) => b.nip).sort()).toEqual([NIP_A, NIP_B, NIP_C].sort());
    expect(hasil.perSheet).toEqual([
      { nama: "PNS", jumlah: 2 },
      { nama: "PPPK", jumlah: 1 },
    ]);
  });

  it("sheet tanpa daftar rekening (catatan) dilewati dan disebut, bukan menggagalkan berkas", () => {
    const hasil = parseRekeningBerkas([
      { nama: "Catatan", matriks: [["Data per Oktober 2026"]] },
      { nama: "PNS", matriks: [JUDUL_EKSPOR, baris(NIP_A, "0123456789")] },
    ]);
    expect(hasil.error).toBeUndefined();
    expect(hasil.baris).toHaveLength(1);
    expect(hasil.perSheet[0]).toMatchObject({ nama: "Catatan", jumlah: 0 });
    expect(hasil.perSheet[0].dilewatiKarena).toBeTruthy();
  });

  it("sheet berjudul tapi kolom wajibnya kurang MENGGAGALKAN seluruh berkas - tidak disimpan sebagian", () => {
    const hasil = parseRekeningBerkas([
      { nama: "PNS", matriks: [JUDUL_EKSPOR, baris(NIP_A, "0123456789")] },
      { nama: "PPPK", matriks: [["nip", "rekening"], [NIP_C, "0323456789"]] },
    ]);
    expect(hasil.error).toMatch(/Sheet "PPPK"/);
    expect(hasil.baris).toHaveLength(0);
  });

  it("tidak ada sheet yang berisi daftar rekening -> galat yang menyebut sebabnya", () => {
    const hasil = parseRekeningBerkas([{ nama: "Sheet1", matriks: [["apa saja"]] }]);
    expect(hasil.error).toMatch(/Baris header tidak ketemu/);
  });

  it("NIP ganda dengan rekening SAMA disimpan sekali", () => {
    const hasil = parseRekeningBerkas([
      { nama: "PNS", matriks: [JUDUL_EKSPOR, baris(NIP_A, "0123456789")] },
      { nama: "PPPK", matriks: [JUDUL_EKSPOR, baris(NIP_A, "0123456789")] },
    ]);
    expect(hasil.baris).toHaveLength(1);
    expect(hasil.dilewati).toHaveLength(0);
  });

  it("NIP ganda dengan rekening BERBEDA dilewati semuanya - tidak diputuskan oleh urutan baris", () => {
    const hasil = parseRekeningBerkas([
      { nama: "PNS", matriks: [JUDUL_EKSPOR, baris(NIP_A, "0123456789"), baris(NIP_B, "0223456789")] },
      { nama: "PPPK", matriks: [JUDUL_EKSPOR, baris(NIP_A, "0999999999")] },
    ]);
    expect(hasil.baris.map((b) => b.nip)).toEqual([NIP_B]);
    expect(hasil.dilewati).toEqual([
      expect.objectContaining({ nip: NIP_A, alasan: expect.stringMatching(/lebih dari sekali/) }),
    ]);
  });
});
