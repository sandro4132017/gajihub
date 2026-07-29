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
        totalMenitPulangCepat: 0,
        totalMenitMeninggalkanKantor: 0,
        jumlahTidakIkutUpacara: 0,
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
        totalMenitPulangCepat: 0,
        totalMenitMeninggalkanKantor: 0,
        jumlahTidakIkutUpacara: 0,
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

  // Batas anomalinya SEKARANG 100% dari bobot kehadiran, bukan 30% dari total
  // tukin - lihat perbaikan aritmatika potongan Pasal 13 di business-logic/
  // tukin.ts. 15 hari alpha (45% bobot kehadiran) sudah tidak lagi dianggap
  // melebihi batas, jadi dipakai kombinasi yang benar-benar menghabiskan
  // komponen kehadiran.
  it("PERLU_REVIEW kalau potongan menghabiskan seluruh komponen kehadiran", () => {
    const hasil = hitungTukin({
      pegawaiId: "p1",
      periodeBulan: 7,
      periodeTahun: 2026,
      tukinPokokKelasJabatan: 5_000_000,
      rekapKehadiran: {
        pegawaiId: "p1",
        periodeBulan: 7,
        periodeTahun: 2026,
        jumlahHariAlpha: 25,
        jumlahTidakPresensi: 20,
        totalMenitTerlambat: 600,
        totalMenitPulangCepat: 0,
        totalMenitMeninggalkanKantor: 0,
        jumlahTidakIkutUpacara: 0,
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
      jumlahHariWfo: 20,
      jumlahHariWfhWfa: 0,
      tarifHarianUangMakan: 35000,
    });

    expect(validasiUangMakan(hasil).outcome).toBe("LOLOS");
  });

  it("PERLU_REVIEW kalau hari berhak uang makan melebihi hari kerja", () => {
    const hasil = hitungUangMakan({
      pegawaiId: "p1",
      periodeBulan: 7,
      periodeTahun: 2026,
      jumlahHariKerja: 20,
      jumlahHariWfo: 25,
      jumlahHariWfhWfa: 0,
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
