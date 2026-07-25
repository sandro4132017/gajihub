import { describe, it, expect } from "vitest";
import {
  hitungTukin,
  hitungPotonganKehadiranPersen,
  hitungPersenOverrideCuti,
} from "../tukin";
import type { TukinInput } from "../../types/index";

// Nilai tukin pokok kelas jabatan 8 sesuai Lampiran Permenaker 15/2024
const TUKIN_KELAS_8 = 4_595_150;

function baseInput(overrides: Partial<TukinInput> = {}): TukinInput {
  return {
    pegawaiId: "pegawai-1",
    periodeBulan: 7,
    periodeTahun: 2026,
    tukinPokokKelasJabatan: TUKIN_KELAS_8,
    rekapKehadiran: {
      pegawaiId: "pegawai-1",
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
      pegawaiId: "pegawai-1",
      periodeBulan: 7,
      periodeTahun: 2026,
      nilaiCapaianKinerjaPersen: 100,
    },
    ...overrides,
  };
}

describe("hitungPotonganKehadiranPersen - Pasal 13", () => {
  it("tidak ada potongan jika kehadiran sempurna", () => {
    const { totalPersen, anomali } = hitungPotonganKehadiranPersen({
      jumlahHariAlpha: 0,
      jumlahTidakPresensi: 0,
      totalMenitTerlambat: 0,
      ikutUpacaraBendera: true,
    });
    expect(totalPersen).toBe(0);
    expect(anomali).toHaveLength(0);
  });

  it("potongan 3% per hari alpha - Pasal 13 ayat (1)", () => {
    const { totalPersen } = hitungPotonganKehadiranPersen({
      jumlahHariAlpha: 2,
      jumlahTidakPresensi: 0,
      totalMenitTerlambat: 0,
      ikutUpacaraBendera: true,
    });
    expect(totalPersen).toBeCloseTo(0.06); // 2 x 3%
  });

  it("potongan 0.01% per menit terlambat - Pasal 13 ayat (3)", () => {
    const { totalPersen } = hitungPotonganKehadiranPersen({
      jumlahHariAlpha: 0,
      jumlahTidakPresensi: 0,
      totalMenitTerlambat: 100,
      ikutUpacaraBendera: true,
    });
    expect(totalPersen).toBeCloseTo(0.01); // 100 x 0.0001
  });

  it("flag anomali jika total potongan melebihi bobot kehadiran 30%", () => {
    const { totalPersen, anomali } = hitungPotonganKehadiranPersen({
      jumlahHariAlpha: 15, // 15 x 3% = 45% > 30%
      jumlahTidakPresensi: 0,
      totalMenitTerlambat: 0,
      ikutUpacaraBendera: true,
    });
    expect(totalPersen).toBeCloseTo(0.45);
    expect(anomali.some((a) => a.includes("melebihi bobot kehadiran"))).toBe(true);
  });
});

describe("hitungPersenOverrideCuti - Pasal 14", () => {
  it("null jika tidak ada cuti aktif", () => {
    expect(hitungPersenOverrideCuti(undefined)).toBeNull();
  });

  it("cuti tahunan tetap 100%", () => {
    expect(hitungPersenOverrideCuti({ jenis: "CUTI_TAHUNAN" })).toBe(1.0);
  });

  it("cuti besar bulan pertama 50%, bulan kedua 75%, bulan ketiga 90%", () => {
    expect(
      hitungPersenOverrideCuti({ jenis: "CUTI_BESAR", bulanKeberapa: 1 })
    ).toBe(0.5);
    expect(
      hitungPersenOverrideCuti({ jenis: "CUTI_BESAR", bulanKeberapa: 2 })
    ).toBe(0.75);
    expect(
      hitungPersenOverrideCuti({ jenis: "CUTI_BESAR", bulanKeberapa: 3 })
    ).toBe(0.9);
  });

  it("cuti sakit bulan pertama tidak dipotong (100%), bulan keempat 0%", () => {
    expect(
      hitungPersenOverrideCuti({ jenis: "CUTI_SAKIT", bulanKeberapa: 1 })
    ).toBe(1.0);
    expect(
      hitungPersenOverrideCuti({ jenis: "CUTI_SAKIT", bulanKeberapa: 4 })
    ).toBe(0);
  });
});

describe("hitungTukin - integrasi penuh", () => {
  it("kehadiran & kinerja sempurna menghasilkan tukin penuh", () => {
    const result = hitungTukin(baseInput());
    expect(result.tukinBersih).toBeCloseTo(TUKIN_KELAS_8);
    expect(result.overrideCutiDiterapkan).toBe(false);
    expect(result.anomali).toHaveLength(0);
  });

  it("capaian kinerja 80% mengurangi komponen kinerja proporsional", () => {
    const result = hitungTukin(
      baseInput({
        capaianKinerja: {
          pegawaiId: "pegawai-1",
          periodeBulan: 7,
          periodeTahun: 2026,
          nilaiCapaianKinerjaPersen: 80,
        },
      })
    );
    const expectedKomponenKinerja = TUKIN_KELAS_8 * 0.7 * 0.8;
    expect(result.komponenKinerja).toBeCloseTo(expectedKomponenKinerja);
  });

  it("override cuti besar mengabaikan hasil kalkulasi kehadiran normal", () => {
    const result = hitungTukin(
      baseInput({
        rekapKehadiran: {
          pegawaiId: "pegawai-1",
          periodeBulan: 7,
          periodeTahun: 2026,
          jumlahHariAlpha: 3, // seharusnya kena potongan besar
          jumlahTidakPresensi: 0,
          totalMenitTerlambat: 0,
          ikutUpacaraBendera: true,
          jumlahHariKerja: 22,
          jumlahHariHadir: 22,
          totalJamLembur: 0,
          cutiAktif: { jenis: "CUTI_BESAR", bulanKeberapa: 1 },
        },
      })
    );
    expect(result.overrideCutiDiterapkan).toBe(true);
    expect(result.tukinPokok).toBeCloseTo(TUKIN_KELAS_8 * 0.5);
  });

  it("PPh mengurangi tukin bersih sesuai tarif efektif", () => {
    const result = hitungTukin(baseInput({ tarifPphEfektif: 0.05 }));
    expect(result.potonganPph).toBeCloseTo(TUKIN_KELAS_8 * 0.05);
    expect(result.tukinBersih).toBeCloseTo(TUKIN_KELAS_8 * 0.95);
  });

  it("tidak pernah menghasilkan tukinBersih negatif", () => {
    const result = hitungTukin(
      baseInput({
        capaianKinerja: {
          pegawaiId: "pegawai-1",
          periodeBulan: 7,
          periodeTahun: 2026,
          nilaiCapaianKinerjaPersen: 0,
        },
        rekapKehadiran: {
          pegawaiId: "pegawai-1",
          periodeBulan: 7,
          periodeTahun: 2026,
          jumlahHariAlpha: 30,
          jumlahTidakPresensi: 0,
          totalMenitTerlambat: 0,
          ikutUpacaraBendera: false,
          jumlahHariKerja: 22,
          jumlahHariHadir: 22,
          totalJamLembur: 0,
        },
        tarifPphEfektif: 0.05,
      })
    );
    expect(result.tukinBersih).toBeGreaterThanOrEqual(0);
  });
});
