import { describe, it, expect } from "vitest";
import { hitungTukin } from "../../business-logic/tukin";
import { hitungUangMakan } from "../../business-logic/uangMakan";
import { hitungUangLembur } from "../../business-logic/uangLembur";
import {
  validasiTukin,
  validasiUangMakan,
  validasiUangLembur,
} from "../validationGate";

describe("validasiTukin", () => {
  it("LOLOS kalau hasil kalkulasi tidak ada anomali", () => {
    const hasil = hitungTukin({
      pegawaiId: "p1",
      periodeBulan: 7,
      periodeTahun: 2026,
      tukinPokokKelasJabatan: 5_000_000,
      rekapKehadiran: {
        pegawaiId: "p1",
        periodeBulan: 7,
        periodeTahun: 2026,
        jumlahHariAlpha: 0,
        jumlahTidakPresensi: 0,
        totalMenitTerlambat: 0,
        ikutUpacaraBendera: true,
        jumlahHariKerja: 22,
        jumlahHariHadir: 22,
        totalJamLembur: 0,
      },
      capaianKinerja: {
        pegawaiId: "p1",
        periodeBulan: 7,
        periodeTahun: 2026,
        nilaiCapaianKinerjaPersen: 90,
      },
    });

    const validasi = validasiTukin(hasil);
    expect(validasi.outcome).toBe("LOLOS");
    expect(validasi.jenis).toBe("TUKIN");
  });

  it("PERLU_REVIEW kalau override cuti Pasal 14 diterapkan", () => {
    const hasil = hitungTukin({
      pegawaiId: "p1",
      periodeBulan: 7,
      periodeTahun: 2026,
      tukinPokokKelasJabatan: 5_000_000,
      rekapKehadiran: {
        pegawaiId: "p1",
        periodeBulan: 7,
        periodeTahun: 2026,
        jumlahHariAlpha: 0,
        jumlahTidakPresensi: 0,
        totalMenitTerlambat: 0,
        ikutUpacaraBendera: true,
        jumlahHariKerja: 22,
        jumlahHariHadir: 22,
        totalJamLembur: 0,
        cutiAktif: { jenis: "CUTI_BESAR", bulanKeberapa: 2 },
      },
      capaianKinerja: {
        pegawaiId: "p1",
        periodeBulan: 7,
        periodeTahun: 2026,
        nilaiCapaianKinerjaPersen: 90,
      },
    });

    const validasi = validasiTukin(hasil);
    expect(validasi.outcome).toBe("PERLU_REVIEW");
    expect(validasi.anomali.length).toBeGreaterThan(0);
  });

  it("PERLU_REVIEW kalau potongan kehadiran melebihi bobot 30%", () => {
    const hasil = hitungTukin({
      pegawaiId: "p1",
      periodeBulan: 7,
      periodeTahun: 2026,
      tukinPokokKelasJabatan: 5_000_000,
      rekapKehadiran: {
        pegawaiId: "p1",
        periodeBulan: 7,
        periodeTahun: 2026,
        jumlahHariAlpha: 15,
        jumlahTidakPresensi: 0,
        totalMenitTerlambat: 0,
        ikutUpacaraBendera: true,
        jumlahHariKerja: 22,
        jumlahHariHadir: 22,
        totalJamLembur: 0,
      },
      capaianKinerja: {
        pegawaiId: "p1",
        periodeBulan: 7,
        periodeTahun: 2026,
        nilaiCapaianKinerjaPersen: 90,
      },
    });

    const validasi = validasiTukin(hasil);
    expect(validasi.outcome).toBe("PERLU_REVIEW");
  });
});

describe("validasiUangMakan", () => {
  it("LOLOS kalau data konsisten", () => {
    const hasil = hitungUangMakan({
      pegawaiId: "p1",
      periodeBulan: 7,
      periodeTahun: 2026,
      jumlahHariKerja: 22,
      jumlahHariHadir: 20,
      tarifHarianUangMakan: 35000,
    });

    expect(validasiUangMakan(hasil).outcome).toBe("LOLOS");
  });

  it("PERLU_REVIEW kalau hari hadir melebihi hari kerja", () => {
    const hasil = hitungUangMakan({
      pegawaiId: "p1",
      periodeBulan: 7,
      periodeTahun: 2026,
      jumlahHariKerja: 20,
      jumlahHariHadir: 25,
      tarifHarianUangMakan: 35000,
    });

    expect(validasiUangMakan(hasil).outcome).toBe("PERLU_REVIEW");
  });
});

describe("validasiUangLembur", () => {
  it("LOLOS kalau jam lembur di bawah batas maksimal", () => {
    const hasil = hitungUangLembur({
      pegawaiId: "p1",
      periodeBulan: 7,
      periodeTahun: 2026,
      totalJamLembur: 10,
      tarifPerJam: 25000,
    });

    expect(validasiUangLembur(hasil).outcome).toBe("LOLOS");
  });

  it("PERLU_REVIEW kalau jam lembur melebihi batas maksimal", () => {
    const hasil = hitungUangLembur({
      pegawaiId: "p1",
      periodeBulan: 7,
      periodeTahun: 2026,
      totalJamLembur: 50,
      tarifPerJam: 25000,
      batasMaksimalJamLembur: 40,
    });

    expect(validasiUangLembur(hasil).outcome).toBe("PERLU_REVIEW");
  });
});
