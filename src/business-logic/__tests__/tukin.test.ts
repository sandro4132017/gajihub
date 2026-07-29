import { describe, it, expect } from "vitest";
import {
  hitungTukin,
  hitungPotonganKehadiranPersen,
  hitungPersenDibayarCuti,
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
        totalMenitPulangCepat: 0,
        totalMenitMeninggalkanKantor: 0,
      jumlahTidakIkutUpacara: 0,
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
        totalMenitPulangCepat: 0,
        totalMenitMeninggalkanKantor: 0,
      jumlahTidakIkutUpacara: 0,
    });
    expect(totalPersen).toBe(0);
    expect(anomali).toHaveLength(0);
  });

  it("potongan 3% per hari alpha - Pasal 13 ayat (1)", () => {
    const { totalPersen } = hitungPotonganKehadiranPersen({
      jumlahHariAlpha: 2,
      jumlahTidakPresensi: 0,
      totalMenitTerlambat: 0,
        totalMenitPulangCepat: 0,
        totalMenitMeninggalkanKantor: 0,
      jumlahTidakIkutUpacara: 0,
    });
    expect(totalPersen).toBeCloseTo(0.06); // 2 x 3%
  });

  it("potongan 0.01% per menit terlambat - Pasal 13 ayat (3)", () => {
    const { totalPersen } = hitungPotonganKehadiranPersen({
      jumlahHariAlpha: 0,
      jumlahTidakPresensi: 0,
      totalMenitTerlambat: 100,
        totalMenitPulangCepat: 0,
        totalMenitMeninggalkanKantor: 0,
      jumlahTidakIkutUpacara: 0,
    });
    expect(totalPersen).toBeCloseTo(0.01); // 100 x 0.0001
  });

  it("SEMUA 6 jenis pelanggaran Pasal 13 dihitung, masing-masing dengan tarifnya", () => {
    // Tabel Permenaker 15/2024 Pasal 13:
    //   ayat (1) tidak hadir tanpa keterangan sah   3%    / hari
    //   ayat (2) tidak presensi masuk atau pulang   1%    / kejadian
    //   ayat (3) terlambat hadir                    0,01% / menit
    //   ayat (3) pulang lebih awal                  0,01% / menit
    //   ayat (3) meninggalkan kantor                0,01% / menit
    //   ayat (4) tidak ikut upacara bendera         3%    / kejadian
    const { totalPersen, rincian } = hitungPotonganKehadiranPersen({
      jumlahHariAlpha: 1, // 3%
      jumlahTidakPresensi: 2, // 2%
      totalMenitTerlambat: 30, // 0,3%
      totalMenitPulangCepat: 20, // 0,2%
      totalMenitMeninggalkanKantor: 10, // 0,1%
      jumlahTidakIkutUpacara: 1, // 3%
    });
    expect(totalPersen).toBeCloseTo(0.086); // 3 + 2 + 0,3 + 0,2 + 0,1 + 3 = 8,6%
    expect(rincian).toHaveLength(6);
    expect(rincian.map((r) => r.dasarHukum)).toEqual([
      "Pasal 13 ayat (1)",
      "Pasal 13 ayat (2)",
      "Pasal 13 ayat (3)",
      "Pasal 13 ayat (3)",
      "Pasal 13 ayat (3)",
      "Pasal 13 ayat (4)",
    ]);
  });

  it("pulang cepat & meninggalkan kantor bertarif SAMA dengan terlambat (ayat 3)", () => {
    const menit = (k: "totalMenitTerlambat" | "totalMenitPulangCepat" | "totalMenitMeninggalkanKantor") =>
      hitungPotonganKehadiranPersen({
        jumlahHariAlpha: 0,
        jumlahTidakPresensi: 0,
        totalMenitTerlambat: 0,
        totalMenitPulangCepat: 0,
        totalMenitMeninggalkanKantor: 0,
        jumlahTidakIkutUpacara: 0,
        [k]: 50,
      }).totalPersen;
    expect(menit("totalMenitTerlambat")).toBeCloseTo(0.005);
    expect(menit("totalMenitPulangCepat")).toBeCloseTo(0.005);
    expect(menit("totalMenitMeninggalkanKantor")).toBeCloseTo(0.005);
  });

  it("potongan upacara dihitung per kejadian - Pasal 13 ayat (4)", () => {
    const { totalPersen } = hitungPotonganKehadiranPersen({
      jumlahHariAlpha: 0,
      jumlahTidakPresensi: 0,
      totalMenitTerlambat: 0,
      totalMenitPulangCepat: 0,
      totalMenitMeninggalkanKantor: 0,
      jumlahTidakIkutUpacara: 2,
    });
    expect(totalPersen).toBeCloseTo(0.06); // 2 x 3%
  });

  it("rincian hanya memuat pelanggaran yang benar-benar terjadi", () => {
    const { rincian } = hitungPotonganKehadiranPersen({
      jumlahHariAlpha: 0,
      jumlahTidakPresensi: 3,
      totalMenitTerlambat: 0,
      totalMenitPulangCepat: 0,
      totalMenitMeninggalkanKantor: 0,
      jumlahTidakIkutUpacara: 0,
    });
    expect(rincian).toHaveLength(1);
    expect(rincian[0]).toMatchObject({
      dasarHukum: "Pasal 13 ayat (2)",
      jumlah: 3,
      satuan: "kejadian",
      tarifPersen: 0.01,
      totalPersen: 0.03,
    });
  });

  it("potongan Pasal 13 dihitung dari BOBOT KEHADIRAN (30%), bukan dari total tukin", () => {
    // 1 hari alpha = 3% dari bobot kehadiran, BUKAN 3% dari total tukin.
    // Bobot kehadiran = 30% x tukin pokok, jadi efek ke total tukin cuma
    // 3% x 30% = 0,9%.
    const input = baseInput();
    input.rekapKehadiran.jumlahHariAlpha = 1;
    const hasil = hitungTukin(input);
    const efekKeTotal = (TUKIN_KELAS_8 - hasil.tukinPokok) / TUKIN_KELAS_8;
    expect(efekKeTotal).toBeCloseTo(0.009); // 0,9%, bukan 3%
  });

  it("flag anomali kalau potongan menghabiskan SELURUH komponen kehadiran", () => {
    // Batasnya 100% dari bobot kehadiran, BUKAN 30%. Test lama memakai 15
    // hari alpha (45%) dan menganggapnya melebihi batas - itu ikut asumsi
    // lama yang keliru, di mana potongan dikurangkan langsung dari angka
    // 0,30 (jadi seolah 3% = 3% dari TOTAL tukin).
    const { totalPersen, anomali } = hitungPotonganKehadiranPersen({
      jumlahHariAlpha: 25, // 75%
      jumlahTidakPresensi: 20, // 20%
      totalMenitTerlambat: 600, // 6%
      totalMenitPulangCepat: 0,
      totalMenitMeninggalkanKantor: 0,
      jumlahTidakIkutUpacara: 0,
    });
    expect(totalPersen).toBeCloseTo(1.01);
    expect(anomali.some((a) => a.includes("melebihi seluruh komponen kehadiran"))).toBe(true);
  });

  it("15 hari alpha = 45% bobot kehadiran, TIDAK menghabiskan komponennya", () => {
    const { totalPersen, anomali } = hitungPotonganKehadiranPersen({
      jumlahHariAlpha: 15,
      jumlahTidakPresensi: 0,
      totalMenitTerlambat: 0,
      totalMenitPulangCepat: 0,
      totalMenitMeninggalkanKantor: 0,
      jumlahTidakIkutUpacara: 0,
    });
    expect(totalPersen).toBeCloseTo(0.45);
    expect(anomali).toHaveLength(0);
  });
});

describe("hitungPersenDibayarCuti - Pasal 14", () => {
  it("null jika tidak ada cuti aktif", () => {
    expect(hitungPersenDibayarCuti(undefined)).toBeNull();
  });

  it("cuti tahunan/melahirkan/alasan penting/besar <1 bulan tetap dibayar 100% (huruf a & b)", () => {
    for (const jenis of [
      "CUTI_TAHUNAN",
      "CUTI_MELAHIRKAN_ANAK_1_2_3",
      "CUTI_ALASAN_PENTING",
      "CUTI_BESAR_KURANG_1_BULAN",
    ] as const) {
      expect(hitungPersenDibayarCuti({ jenis })?.persenDibayar).toBe(1.0);
    }
  });

  // MENGGANTIKAN test lama yang menyatakan "cuti besar bulan pertama 50%,
  // bulan kedua 75%, bulan ketiga 90%" sebagai persen DIBAYAR. Pasal 14
  // huruf c menulis angka itu sebagai "dibayarkan setelah DIKURANGI
  // persentase sebesar", jadi 75% dan 90% adalah POTONGAN. Perilaku lama
  // membuat tukin makin BESAR makin lama cuti - kebalikan dari maksud pasal.
  it("cuti besar: dipotong 50/75/90% -> dibayar 50/25/10% (huruf c)", () => {
    expect(hitungPersenDibayarCuti({ jenis: "CUTI_BESAR", bulanKeberapa: 1 })?.persenDibayar).toBeCloseTo(0.5);
    expect(hitungPersenDibayarCuti({ jenis: "CUTI_BESAR", bulanKeberapa: 2 })?.persenDibayar).toBeCloseTo(0.25);
    expect(hitungPersenDibayarCuti({ jenis: "CUTI_BESAR", bulanKeberapa: 3 })?.persenDibayar).toBeCloseTo(0.1);
  });

  it("cuti besar makin lama TIDAK boleh makin besar bayarannya", () => {
    const b1 = hitungPersenDibayarCuti({ jenis: "CUTI_BESAR", bulanKeberapa: 1 })!.persenDibayar;
    const b2 = hitungPersenDibayarCuti({ jenis: "CUTI_BESAR", bulanKeberapa: 2 })!.persenDibayar;
    const b3 = hitungPersenDibayarCuti({ jenis: "CUTI_BESAR", bulanKeberapa: 3 })!.persenDibayar;
    expect(b1).toBeGreaterThan(b2);
    expect(b2).toBeGreaterThan(b3);
  });

  it("cuti besar bulan ke-4 dst tidak diatur pasal - pakai bulan ketiga + ditandai anomali", () => {
    const hasil = hitungPersenDibayarCuti({ jenis: "CUTI_BESAR", bulanKeberapa: 4 })!;
    expect(hasil.persenDibayar).toBeCloseTo(0.1);
    expect(hasil.anomali.some((a) => a.includes("tidak diatur di Pasal 14 huruf c"))).toBe(true);
  });

  it("cuti sakit: dipotong 0/50/75% lalu 100% di atas 3 bulan (huruf d)", () => {
    expect(hitungPersenDibayarCuti({ jenis: "CUTI_SAKIT", bulanKeberapa: 1 })?.persenDibayar).toBeCloseTo(1.0);
    expect(hitungPersenDibayarCuti({ jenis: "CUTI_SAKIT", bulanKeberapa: 2 })?.persenDibayar).toBeCloseTo(0.5);
    expect(hitungPersenDibayarCuti({ jenis: "CUTI_SAKIT", bulanKeberapa: 3 })?.persenDibayar).toBeCloseTo(0.25);
    expect(hitungPersenDibayarCuti({ jenis: "CUTI_SAKIT", bulanKeberapa: 4 })?.persenDibayar).toBe(0);
  });

  it("cuti besar & cuti sakit dibaca dengan cara yang SAMA (kalimat pasalnya identik)", () => {
    // Dipasang khusus supaya keduanya tidak bisa lagi diam-diam beda tafsir:
    // sama-sama "dibayarkan setelah dikurangi persentase sebesar 75%".
    const besar = hitungPersenDibayarCuti({ jenis: "CUTI_BESAR", bulanKeberapa: 2 })!.persenDibayar;
    const sakit = hitungPersenDibayarCuti({ jenis: "CUTI_SAKIT", bulanKeberapa: 3 })!.persenDibayar;
    expect(besar).toBeCloseTo(sakit); // dua-duanya dipotong 75% -> dibayar 25%
  });

  describe("cuti sakit gugur kandungan (huruf e) - 1% per hari di atas 1 bulan", () => {
    it("sampai dengan 1 bulan (30 hari) dibayar penuh", () => {
      expect(hitungPersenDibayarCuti({ jenis: "CUTI_SAKIT_GUGUR_KANDUNGAN", jumlahHariCuti: 30 })?.persenDibayar).toBe(1.0);
    });

    it("35 hari: 5 hari di atas 1 bulan -> dipotong 5% -> dibayar 95%", () => {
      expect(
        hitungPersenDibayarCuti({ jenis: "CUTI_SAKIT_GUGUR_KANDUNGAN", jumlahHariCuti: 35 })?.persenDibayar
      ).toBeCloseTo(0.95);
    });

    it("45 hari (batas 1,5 bulan): 15 hari -> dipotong 15% -> dibayar 85%", () => {
      expect(
        hitungPersenDibayarCuti({ jenis: "CUTI_SAKIT_GUGUR_KANDUNGAN", jumlahHariCuti: 45 })?.persenDibayar
      ).toBeCloseTo(0.85);
    });

    it("di atas 45 hari: dihitung sampai batas saja + ditandai anomali", () => {
      const hasil = hitungPersenDibayarCuti({ jenis: "CUTI_SAKIT_GUGUR_KANDUNGAN", jumlahHariCuti: 60 })!;
      expect(hasil.persenDibayar).toBeCloseTo(0.85);
      expect(hasil.anomali.some((a) => a.includes("melebihi 1,5 bulan"))).toBe(true);
    });

    it("tanpa jumlah hari: TIDAK menebak - dibayar penuh tapi ditandai anomali", () => {
      const hasil = hitungPersenDibayarCuti({ jenis: "CUTI_SAKIT_GUGUR_KANDUNGAN" })!;
      expect(hasil.persenDibayar).toBe(1.0);
      expect(hasil.anomali.some((a) => a.includes("jumlah hari cuti tidak diisi"))).toBe(true);
    });
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
        totalMenitPulangCepat: 0,
        totalMenitMeninggalkanKantor: 0,
          jumlahTidakIkutUpacara: 0,
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
        totalMenitPulangCepat: 0,
        totalMenitMeninggalkanKantor: 0,
          jumlahTidakIkutUpacara: 1,
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
