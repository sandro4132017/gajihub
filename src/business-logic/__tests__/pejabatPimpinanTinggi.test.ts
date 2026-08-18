import { describe, expect, it } from "vitest";
import {
  KELAS_JABATAN_MINIMUM_JPT,
  dikecualikanPotonganKehadiran,
  labelPengecualianKehadiran,
} from "../pejabatPimpinanTinggi";
import { hitungTukin } from "../tukin";
import { TUKIN_POKOK_PER_KELAS_JABATAN } from "../tarifTukinPokok";
import type { RekapKehadiranPeriode, TukinInput } from "../../types";

describe("dikecualikanPotonganKehadiran", () => {
  it("kelas 15 (JPT Pratama / Eselon II) dikecualikan", () => {
    expect(dikecualikanPotonganKehadiran(15)).toBe(true);
  });

  it("kelas 16 & 17 (JPT Madya / Eselon I) ikut dikecualikan", () => {
    expect(dikecualikanPotonganKehadiran(16)).toBe(true);
    expect(dikecualikanPotonganKehadiran(17)).toBe(true);
  });

  it("kelas 14 ke bawah TIDAK dikecualikan - batasnya tepat di 15", () => {
    expect(KELAS_JABATAN_MINIMUM_JPT).toBe(15);
    for (let k = 1; k <= 14; k++) expect(dikecualikanPotonganKehadiran(k)).toBe(false);
  });

  it("kelas jabatan tidak diketahui TIDAK ditebak sebagai pejabat", () => {
    expect(dikecualikanPotonganKehadiran(null)).toBe(false);
    expect(dikecualikanPotonganKehadiran(undefined)).toBe(false);
  });

  it("label membedakan Eselon I dan Eselon II", () => {
    expect(labelPengecualianKehadiran(15)).toContain("Eselon II");
    expect(labelPengecualianKehadiran(17)).toContain("Eselon I)");
  });
});

/**
 * Kasus nyata: IRMA PUSPITA, Kepala Biro Keuangan dan BMN (kelas 15),
 * periode 7/2026. Rekap presensi Gajihub mencatat terlambat 40 menit dan
 * pulang cepat 20 menit, TAPI rincian tukin manual Rokeu membayarnya penuh
 * Rp 19.280.000 dengan kolom potongan NOL.
 */
describe("hitungTukin - pengecualian Pejabat Pimpinan Tinggi", () => {
  const rekap: RekapKehadiranPeriode = {
    pegawaiId: "198501202008012002",
    periodeBulan: 7,
    periodeTahun: 2026,
    jumlahHariKerja: 23,
    jumlahHariHadir: 23,
    totalJamLembur: 0,
    jumlahHariAlpha: 0,
    jumlahTidakPresensi: 0,
    totalMenitTerlambat: 40,
    totalMenitPulangCepat: 20,
    totalMenitMeninggalkanKantor: 0,
    jumlahTidakIkutUpacara: 0,
  };

  const dasar: TukinInput = {
    pegawaiId: "198501202008012002",
    periodeBulan: 7,
    periodeTahun: 2026,
    tukinPokokKelasJabatan: TUKIN_POKOK_PER_KELAS_JABATAN[15]!,
    rekapKehadiran: rekap,
    capaianKinerja: {
      pegawaiId: "198501202008012002",
      periodeBulan: 7,
      periodeTahun: 2026,
      nilaiCapaianKinerjaPersen: 100,
    },
  };

  it("tanpa pengecualian, potongan Pasal 13 tetap berlaku (perilaku lama tidak berubah)", () => {
    const hasil = hitungTukin(dasar);
    expect(hasil.pengecualianPotonganKehadiran).toBe(false);
    expect(hasil.potonganKehadiranPersen).toBeGreaterThan(0);
    expect(hasil.tukinBersih).toBeLessThan(dasar.tukinPokokKelasJabatan);
  });

  it("dengan pengecualian, dibayar PENUH sesuai tarif kelas 15", () => {
    const hasil = hitungTukin({ ...dasar, dikecualikanPotonganKehadiran: true });
    expect(hasil.pengecualianPotonganKehadiran).toBe(true);
    expect(hasil.potonganKehadiranPersen).toBe(0);
    expect(hasil.komponenKehadiranSetelahPotongan).toBeCloseTo(hasil.bobotKehadiran, 6);
    // Rp 19.280.000 - angka yang tertulis di rincian manual Rokeu Juli 2026.
    expect(Math.round(hasil.tukinBersih)).toBe(19_280_000);
  });

  it("pelanggarannya TIDAK dihapus - rincian & persen sebelum pengecualian tetap ada", () => {
    const hasil = hitungTukin({ ...dasar, dikecualikanPotonganKehadiran: true });
    expect(hasil.rincianPotonganKehadiran.length).toBeGreaterThan(0);
    expect(hasil.potonganKehadiranPersenSebelumPengecualian).toBeGreaterThan(0);
    const polos = hitungTukin(dasar);
    expect(hasil.potonganKehadiranPersenSebelumPengecualian).toBeCloseTo(polos.potonganKehadiranPersen, 10);
  });

  it("pemakaiannya selalu dicatat, supaya nominal tidak naik diam-diam", () => {
    const hasil = hitungTukin({ ...dasar, dikecualikanPotonganKehadiran: true });
    expect(hasil.anomali.some((a) => a.includes("Pejabat Pimpinan Tinggi"))).toBe(true);
    expect(hasil.anomali.some((a) => a.includes("TODO(confirm)"))).toBe(true);
  });

  it("tidak mencatat apa-apa kalau memang tidak ada pelanggaran buat dikecualikan", () => {
    const bersih: TukinInput = {
      ...dasar,
      rekapKehadiran: { ...rekap, totalMenitTerlambat: 0, totalMenitPulangCepat: 0 },
      dikecualikanPotonganKehadiran: true,
    };
    const hasil = hitungTukin(bersih);
    expect(hasil.anomali.some((a) => a.includes("Pejabat Pimpinan Tinggi"))).toBe(false);
  });

  it("pengecualian HANYA mematikan Pasal 13 - bobot kinerja 70% tetap berlaku", () => {
    const kurang = hitungTukin({
      ...dasar,
      dikecualikanPotonganKehadiran: true,
      capaianKinerja: { ...dasar.capaianKinerja, nilaiCapaianKinerjaPersen: 60 },
    });
    // Kehadiran penuh (30%) + kinerja 60% dari bobot 70% = 30% + 42% = 72%.
    expect(Math.round(kurang.tukinBersih)).toBe(Math.round(dasar.tukinPokokKelasJabatan * 0.72));
  });
});
