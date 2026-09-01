import { describe, it, expect } from "vitest";
import { langkahTutupBulan, type KeadaanTutupBulan } from "../langkahTutupBulan";

const lengkap: KeadaanTutupBulan = {
  totalPegawai: 47,
  jumlahRekapPresensi: 47,
  jumlahPredikat: 47,
  jumlahKalkulasi: 47,
};

describe("langkahTutupBulan", () => {
  it("menyarankan PRESENSI kalau rekap presensi belum lengkap", () => {
    const l = langkahTutupBulan({ ...lengkap, jumlahRekapPresensi: 30, jumlahPredikat: 0, jumlahKalkulasi: 0 });
    expect(l).toEqual({ jenis: "PRESENSI", sudah: 30, dari: 47 });
  });

  it("menyarankan PREDIKAT sesudah presensi lengkap", () => {
    const l = langkahTutupBulan({ ...lengkap, jumlahPredikat: 35, jumlahKalkulasi: 0 });
    expect(l).toEqual({ jenis: "PREDIKAT", sudah: 35, dari: 47 });
  });

  it("menyarankan HITUNG hanya setelah kedua bahan lengkap", () => {
    const l = langkahTutupBulan({ ...lengkap, jumlahKalkulasi: 12 });
    expect(l).toEqual({ jenis: "HITUNG", sudah: 12, dari: 47 });
  });

  /**
   * INI PENJAGA UTAMANYA, dan sebabnya nyata.
   *
   * Menghitung ulang mereset seluruh approval unit ke DRAFT. Kalau dashboard
   * menyarankan "Hitung unit" selagi presensi/predikat masih kurang, orang akan
   * menghitung, lalu bahannya lengkap, lalu menghitung lagi - dan approval yang
   * sudah dikumpulkan hilang. Biro Keuangan 7/2026: 278 baris ApprovalLog untuk
   * 47 pegawai, siklusnya terulang tiga kali.
   */
  it("TIDAK PERNAH menyarankan HITUNG selama masih ada bahan yang kurang", () => {
    const kurangPresensi = langkahTutupBulan({
      totalPegawai: 47,
      jumlahRekapPresensi: 46,
      jumlahPredikat: 47,
      jumlahKalkulasi: 0,
    });
    const kurangPredikat = langkahTutupBulan({
      totalPegawai: 47,
      jumlahRekapPresensi: 47,
      jumlahPredikat: 46,
      jumlahKalkulasi: 0,
    });
    expect(kurangPresensi?.jenis).not.toBe("HITUNG");
    expect(kurangPredikat?.jenis).not.toBe("HITUNG");
    // Presensi didahulukan karena ia yang lebih dulu di alur bulanan.
    expect(kurangPresensi?.jenis).toBe("PRESENSI");
    expect(kurangPredikat?.jenis).toBe("PREDIKAT");
  });

  it("null kalau semuanya sudah lengkap - tidak ada panel 'semua beres'", () => {
    expect(langkahTutupBulan(lengkap)).toBeNull();
  });

  it("null kalau unit tidak punya pegawai aktif", () => {
    expect(
      langkahTutupBulan({ totalPegawai: 0, jumlahRekapPresensi: 0, jumlahPredikat: 0, jumlahKalkulasi: 0 })
    ).toBeNull();
  });

  // Bisa terjadi betulan: pegawai pensiun sesudah rekapnya dibuat, jadi
  // pembaginya menyusut sementara jumlah barisnya tidak. Itu BUKAN alasan
  // menyuruh orang menarik presensi lagi.
  it("jumlah MELEBIHI total pegawai dianggap lengkap, bukan kurang", () => {
    expect(
      langkahTutupBulan({
        totalPegawai: 45,
        jumlahRekapPresensi: 47,
        jumlahPredikat: 47,
        jumlahKalkulasi: 47,
      })
    ).toBeNull();
  });
});
