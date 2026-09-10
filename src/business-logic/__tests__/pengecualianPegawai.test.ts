import { describe, expect, it } from "vitest";
import {
  ALASAN_PENGECUALIAN,
  KODE_LAINNYA,
  alasanDariKode,
  petunjukKemungkinanKeluar,
  validasiPengecualian,
} from "../pengecualianPegawai";

describe("ALASAN_PENGECUALIAN", () => {
  it("kodenya unik - kode ganda membuat rekapitulasi ke OSDMA salah hitung", () => {
    const kode = ALASAN_PENGECUALIAN.map((a) => a.kode);
    expect(new Set(kode).size).toBe(kode.length);
  });

  it("selalu punya jalan keluar 'Lainnya'", () => {
    // Tanpa ini, orang yang kasusnya tidak ada di daftar akan memilih yang
    // paling mirip - dan itu merusak angka yang dipakai memperbaiki SIAP.
    expect(ALASAN_PENGECUALIAN.some((a) => a.kode === KODE_LAINNYA)).toBe(true);
  });

  it("tiap alasan punya label dan keterangan yang terisi", () => {
    for (const a of ALASAN_PENGECUALIAN) {
      expect(a.label.length, a.kode).toBeGreaterThan(0);
      expect(a.keterangan.length, a.kode).toBeGreaterThan(0);
    }
  });
});

describe("alasanDariKode", () => {
  it("kode yang tidak dikenal menghasilkan null, bukan dilempar", () => {
    expect(alasanDariKode("ENTAH")).toBeNull();
    expect(alasanDariKode("")).toBeNull();
  });
});

describe("validasiPengecualian", () => {
  it("alasan baku tidak wajib dijelaskan", () => {
    expect(validasiPengecualian("MUTASI_KELUAR", "").boleh).toBe(true);
  });

  it("'Lainnya' wajib dijelaskan", () => {
    const h = validasiPengecualian(KODE_LAINNYA, "pindah");
    expect(h.boleh).toBe(false);
    expect(h.alasan).toContain("Lainnya");
  });

  it("'Lainnya' dengan penjelasan cukup diterima", () => {
    expect(validasiPengecualian(KODE_LAINNYA, "Dipekerjakan di BUMN sejak Mei.").boleh).toBe(true);
  });

  it("kode kosong ditolak - bukan diam-diam dianggap 'Lainnya'", () => {
    expect(validasiPengecualian("", "apa pun isinya").boleh).toBe(false);
  });

  it("spasi saja tidak dihitung sebagai penjelasan", () => {
    expect(validasiPengecualian(KODE_LAINNYA, "              ").boleh).toBe(false);
  });
});

describe("petunjukKemungkinanKeluar", () => {
  it("0 hadir + tanpa predikat = ada petunjuk, dan angkanya disebut", () => {
    const t = petunjukKemungkinanKeluar({
      jumlahHariKerja: 23,
      jumlahHariHadir: 0,
      punyaPredikat: false,
      jumlahHariCuti: 0,
      jumlahHariTugasBelajar: 0,
    });
    expect(t).toContain("0 hari hadir dari 23 hari kerja");
  });

  it("tidak pernah menyimpulkan - berhenti di 'kemungkinan'", () => {
    // Kalimat yang menyimpulkan akan dikutip sebagai keputusan sistem, dan
    // yang menekan tombol berhenti memeriksa sendiri.
    const t = petunjukKemungkinanKeluar({
      jumlahHariKerja: 23,
      jumlahHariHadir: 0,
      punyaPredikat: false,
      jumlahHariCuti: 0,
      jumlahHariTugasBelajar: 0,
    })!;
    expect(t).toContain("kemungkinan");
    expect(t).not.toContain("sudah keluar");
  });

  it("pernah hadir sekali pun = tidak ada petunjuk", () => {
    expect(
      petunjukKemungkinanKeluar({ jumlahHariKerja: 23, jumlahHariHadir: 1, punyaPredikat: false, jumlahHariCuti: 0, jumlahHariTugasBelajar: 0 })
    ).toBeNull();
  });

  it("punya predikat = tidak ada petunjuk walau nol hadir", () => {
    // Ada yang menilai kinerjanya, berarti ada yang menganggapnya masih di
    // unit itu. Nol hadir jadi urusan potongan kehadiran, bukan keberadaan.
    expect(
      petunjukKemungkinanKeluar({ jumlahHariKerja: 23, jumlahHariHadir: 0, punyaPredikat: true, jumlahHariCuti: 0, jumlahHariTugasBelajar: 0 })
    ).toBeNull();
  });

  it("sedang CUTI = tidak ada petunjuk, walau nol hadir & tanpa predikat", () => {
    // Diukur pada data 7/2026: 21 dari 87 kasus adalah cuti, banyak di
    // antaranya cuti melahirkan. Menyarankan "kemungkinan sudah keluar" untuk
    // mereka adalah saran yang kalau diikuti menghentikan pembayarannya.
    expect(
      petunjukKemungkinanKeluar({
        jumlahHariKerja: 23, jumlahHariHadir: 0, punyaPredikat: false,
        jumlahHariCuti: 22, jumlahHariTugasBelajar: 0,
      })
    ).toBeNull();
  });

  it("sedang TUGAS BELAJAR = tidak ada petunjuk", () => {
    // 30 dari 87. Engine Tukin sudah punya aturannya sendiri (80%,
    // Permenaker 15/2024) - mereka harus dihitung, bukan dikecualikan.
    expect(
      petunjukKemungkinanKeluar({
        jumlahHariKerja: 23, jumlahHariHadir: 0, punyaPredikat: false,
        jumlahHariCuti: 0, jumlahHariTugasBelajar: 23,
      })
    ).toBeNull();
  });

  it("tanpa hari kerja tidak menghasilkan petunjuk - bukan 0 dari 0", () => {
    expect(
      petunjukKemungkinanKeluar({ jumlahHariKerja: 0, jumlahHariHadir: 0, punyaPredikat: false, jumlahHariCuti: 0, jumlahHariTugasBelajar: 0 })
    ).toBeNull();
  });
});
