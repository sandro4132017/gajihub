import { describe, it, expect } from "vitest";
import { konversiPredikatKeNilaiPersen } from "../konversiPredikat";
import { TUKIN_POKOK_PER_KELAS_JABATAN } from "../tarifTukinPokok";
import { hitungTukin } from "../tukin";

describe("konversiPredikatKeNilaiPersen", () => {
  it("BAIK dan SANGAT_BAIK = 100%", () => {
    expect(konversiPredikatKeNilaiPersen("BAIK")).toBe(100);
    expect(konversiPredikatKeNilaiPersen("SANGAT_BAIK")).toBe(100);
  });

  it("PERLU_PERBAIKAN = 85%", () => {
    expect(konversiPredikatKeNilaiPersen("PERLU_PERBAIKAN")).toBe(85);
  });

  it("KURANG dan SANGAT_KURANG = 60%", () => {
    expect(konversiPredikatKeNilaiPersen("KURANG")).toBe(60);
    expect(konversiPredikatKeNilaiPersen("SANGAT_KURANG")).toBe(60);
  });
});

/**
 * Cocokin hasil komponenKinerja dari hitungTukin() terhadap angka rupiah
 * yang benar-benar tercetak di Lampiran Kepsekjen 82/2025 (kelas jabatan 8
 * dan 17), supaya kepastian bukan cuma "logikanya benar" tapi juga "angka
 * akhirnya sama persis dengan dokumen resmi".
 */
describe("hitungTukin komponenKinerja cocok dengan tabel Kepsekjen 82/2025", () => {
  const kehadiranSempurna = {
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
  };

  it("kelas jabatan 8, predikat BAIK -> komponenKinerja Rp3.216.605,00", () => {
    const hasil = hitungTukin({
      pegawaiId: "p1",
      periodeBulan: 7,
      periodeTahun: 2026,
      tukinPokokKelasJabatan: TUKIN_POKOK_PER_KELAS_JABATAN[8],
      rekapKehadiran: kehadiranSempurna,
      capaianKinerja: {
        pegawaiId: "p1",
        periodeBulan: 7,
        periodeTahun: 2026,
        nilaiCapaianKinerjaPersen: konversiPredikatKeNilaiPersen("BAIK"),
      },
    });
    expect(hasil.komponenKinerja).toBeCloseTo(3_216_605.0, 2);
  });

  it("kelas jabatan 8, predikat PERLU_PERBAIKAN -> komponenKinerja Rp2.734.114,25", () => {
    const hasil = hitungTukin({
      pegawaiId: "p1",
      periodeBulan: 7,
      periodeTahun: 2026,
      tukinPokokKelasJabatan: TUKIN_POKOK_PER_KELAS_JABATAN[8],
      rekapKehadiran: kehadiranSempurna,
      capaianKinerja: {
        pegawaiId: "p1",
        periodeBulan: 7,
        periodeTahun: 2026,
        nilaiCapaianKinerjaPersen: konversiPredikatKeNilaiPersen("PERLU_PERBAIKAN"),
      },
    });
    expect(hasil.komponenKinerja).toBeCloseTo(2_734_114.25, 2);
  });

  it("kelas jabatan 8, predikat KURANG -> komponenKinerja Rp1.929.963,00", () => {
    const hasil = hitungTukin({
      pegawaiId: "p1",
      periodeBulan: 7,
      periodeTahun: 2026,
      tukinPokokKelasJabatan: TUKIN_POKOK_PER_KELAS_JABATAN[8],
      rekapKehadiran: kehadiranSempurna,
      capaianKinerja: {
        pegawaiId: "p1",
        periodeBulan: 7,
        periodeTahun: 2026,
        nilaiCapaianKinerjaPersen: konversiPredikatKeNilaiPersen("KURANG"),
      },
    });
    expect(hasil.komponenKinerja).toBeCloseTo(1_929_963.0, 2);
  });

  it("kelas jabatan 17, predikat SANGAT_BAIK -> komponenKinerja Rp23.268.000,00", () => {
    const hasil = hitungTukin({
      pegawaiId: "p1",
      periodeBulan: 7,
      periodeTahun: 2026,
      tukinPokokKelasJabatan: TUKIN_POKOK_PER_KELAS_JABATAN[17],
      rekapKehadiran: kehadiranSempurna,
      capaianKinerja: {
        pegawaiId: "p1",
        periodeBulan: 7,
        periodeTahun: 2026,
        nilaiCapaianKinerjaPersen: konversiPredikatKeNilaiPersen("SANGAT_BAIK"),
      },
    });
    expect(hasil.komponenKinerja).toBeCloseTo(23_268_000.0, 2);
  });
});
