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

describe('"kekurangan jam kerja" TIDAK boleh jadi potongan (Pasal 13 ayat 3)', () => {
  const bersih = {
    jumlahHariAlpha: 0,
    jumlahTidakPresensi: 0,
    totalMenitTerlambat: 0,
    totalMenitPulangCepat: 0,
    totalMenitMeninggalkanKantor: 0,
    jumlahTidakIkutUpacara: 0,
  };

  // Blok ini dulu MENGUJI KEBALIKANNYA (kekurangan jam kerja bertarif
  // 0,01%/menit, ditambahkan 2026-08-06). Dicabut 2026-08-07 setelah teks
  // pasalnya dibaca langsung: ayat (3) menyebut TEPAT TIGA hal - "terlambat
  // hadir, pulang cepat, atau meninggalkan kantor" - dan Pasal 12 huruf c
  // yang dirujuknya menyebut tiga hal yang sama. Kekurangan jam kerja tidak
  // ada di keduanya.
  //
  // Test-nya sengaja dibalik, bukan dihapus: kalau suatu saat ada yang
  // menambahkannya kembali "supaya lengkap", inilah yang jatuh duluan.

  it("ayat (3) cuma punya TIGA baris bertarif per menit", () => {
    const { rincian } = hitungPotonganKehadiranPersen({
      ...bersih,
      totalMenitTerlambat: 10,
      totalMenitPulangCepat: 10,
      totalMenitMeninggalkanKantor: 10,
    });
    const perMenit = rincian.filter((r) => r.satuan === "menit");
    expect(perMenit).toHaveLength(3);
    expect(perMenit.map((r) => r.jenis)).toEqual([
      "Terlambat hadir",
      "Pulang lebih awal",
      "Meninggalkan kantor tanpa izin",
    ]);
  });

  it("tidak ada baris bernama 'Kekurangan jam kerja' di rincian manapun", () => {
    const { rincian } = hitungPotonganKehadiranPersen({
      ...bersih,
      jumlahHariAlpha: 1,
      jumlahTidakPresensi: 1,
      totalMenitTerlambat: 30,
      totalMenitPulangCepat: 30,
      totalMenitMeninggalkanKantor: 30,
      jumlahTidakIkutUpacara: 1,
    });
    expect(rincian.some((r) => /kekurangan jam/i.test(r.jenis))).toBe(false);
  });

  it("seluruh rincian Pasal 13 berjumlah 6 baris, bukan 7", () => {
    const { rincian, totalPersen } = hitungPotonganKehadiranPersen({
      jumlahHariAlpha: 1, // 3%
      jumlahTidakPresensi: 2, // 2%
      totalMenitTerlambat: 30, // 0,3%
      totalMenitPulangCepat: 20, // 0,2%
      totalMenitMeninggalkanKantor: 10, // 0,1%
      jumlahTidakIkutUpacara: 1, // 3%
    });
    expect(rincian).toHaveLength(6);
    expect(totalPersen).toBeCloseTo(0.086); // 3 + 2 + 0,3 + 0,2 + 0,1 + 3 = 8,6%
  });
});

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
    // Teks Permenaker 15/2024 Pasal 13, dikutip dari pasalnya:
    //   ayat (1) tidak hadir kerja tanpa keterangan sah   3%    / hari
    //   ayat (2) tidak presensi kehadiran/kepulangan      1%    / setiap kali
    //   ayat (3) terlambat hadir                          0,01% / menit
    //   ayat (3) pulang cepat                             0,01% / menit
    //   ayat (3) meninggalkan kantor                      0,01% / menit
    //   ayat (4) tidak ikut upacara bendera               3%    / kejadian
    //
    // ENAM, bukan tujuh. "Kekurangan jam kerja" sempat ditambahkan sebagai
    // baris ketujuh lalu dicabut - lihat describe di atas.
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

  it("potongan upacara 3% per kejadian - Pasal 13 ayat (4)", () => {
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

  it("lupa presensi dihitung SETIAP KALI, bukan per hari - Pasal 13 ayat (2)", () => {
    // Frasa "setiap kali tidak melakukan presensi" ada eksplisit di ayat (2),
    // jadi satu hari yang lupa presensi masuk DAN pulang = 2 kejadian = 2%.
    // Sempat diubah jadi per hari lalu dikembalikan - jangan diubah lagi
    // tanpa dasar tertulis.
    const { rincian, totalPersen } = hitungPotonganKehadiranPersen({
      jumlahHariAlpha: 0,
      jumlahTidakPresensi: 2,
      totalMenitTerlambat: 0,
      totalMenitPulangCepat: 0,
      totalMenitMeninggalkanKantor: 0,
      jumlahTidakIkutUpacara: 0,
    });
    expect(rincian[0].satuan).toBe("kejadian");
    expect(totalPersen).toBeCloseTo(0.02);
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

  describe("cuti sakit gugur kandungan (huruf e) - 1% PER HARI di atas 1 bulan", () => {
    // Satu-satunya ketentuan cuti Pasal 14 yang tarifnya HARIAN. Kutipan
    // pasalnya: "0% untuk sakit sampai dengan 1 bulan; dan 1% PERHARI untuk
    // Cuti sakit karena gugur kandungan di atas 1 bulan sampai dengan 1,5
    // bulan." Sempat diubah jadi per bulan lalu dikembalikan - jangan
    // "diseragamkan" lagi dengan jenis cuti lain.
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

    it("HARINYA yang menentukan, bukan bulan keberapa", () => {
      // Penjaga khusus: kalau suatu saat ini diubah jadi bertingkat per bulan
      // seperti cuti sakit biasa, test ini yang jatuh duluan.
      const a = hitungPersenDibayarCuti({
        jenis: "CUTI_SAKIT_GUGUR_KANDUNGAN",
        bulanKeberapa: 2,
        jumlahHariCuti: 32,
      })!.persenDibayar;
      const b = hitungPersenDibayarCuti({
        jenis: "CUTI_SAKIT_GUGUR_KANDUNGAN",
        bulanKeberapa: 2,
        jumlahHariCuti: 44,
      })!.persenDibayar;
      expect(a).toBeCloseTo(0.98); // 2 hari lewat
      expect(b).toBeCloseTo(0.86); // 14 hari lewat
      expect(a).not.toBeCloseTo(b);
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

  describe("tugas belajar - 80% (Permenaker 15/2024)", () => {
    it("presensi & kinerja bersih: dibayar 80% tukin pokok kelas jabatan", () => {
      const input = baseInput();
      input.rekapKehadiran.tugasBelajar = true;
      expect(hitungTukin(input).tukinPokok).toBeCloseTo(TUKIN_KELAS_8 * 0.8);
    });

    it("PENGALI atas hasil perhitungan, bukan pengganti - potongan tetap berlaku", () => {
      // Pegawai tugas belajar tetap presensi (harinya berstatus TB, bukan
      // alpha), jadi Pasal 13 TIDAK dimatikan. Kalau memang ada pelanggaran
      // di periode itu, potongannya tetap dihitung lalu hasilnya dikali 80%.
      const input = baseInput();
      input.rekapKehadiran.tugasBelajar = true;
      input.rekapKehadiran.jumlahHariAlpha = 1; // 3% dari bobot kehadiran

      const tanpaTb = baseInput();
      tanpaTb.rekapKehadiran.jumlahHariAlpha = 1;

      expect(hitungTukin(input).tukinPokok).toBeCloseTo(hitungTukin(tanpaTb).tukinPokok * 0.8);
      expect(hitungTukin(input).rincianPotonganKehadiran).toHaveLength(1);
    });

    it("predikat kinerja tetap berpengaruh", () => {
      // Nominalnya diturunkan dari e-Presensi & e-Kinerja lalu dikali 80% -
      // bukan angka mati 80% x tarif kelas.
      const input = baseInput();
      input.rekapKehadiran.tugasBelajar = true;
      input.capaianKinerja.nilaiCapaianKinerjaPersen = 60; // predikat "Kurang"

      const penuh = baseInput();
      penuh.rekapKehadiran.tugasBelajar = true;

      expect(hitungTukin(input).tukinPokok).toBeLessThan(hitungTukin(penuh).tukinPokok);
    });

    it("menandai anomali kalau tugas belajar bersamaan dengan cuti", () => {
      const input = baseInput();
      input.rekapKehadiran.tugasBelajar = true;
      input.rekapKehadiran.cutiAktif = { jenis: "CUTI_SAKIT", bulanKeberapa: 2 };
      const hasil = hitungTukin(input);
      // Override cuti dulu (50%), baru dikali 80%.
      expect(hasil.tukinPokok).toBeCloseTo(TUKIN_KELAS_8 * 0.5 * 0.8);
      expect(hasil.anomali.some((a) => a.includes("SEKALIGUS sedang cuti"))).toBe(true);
    });

    it("tanpa flag tugas belajar, perhitungan normal tidak berubah", () => {
      const hasil = hitungTukin(baseInput());
      expect(hasil.tukinPokok).toBeCloseTo(TUKIN_KELAS_8);
    });
  });

  it("cuti besar & cuti sakit berbasis BULAN - hari ke berapa pun sama hasilnya", () => {
    // Aturan user: "mau harinya berapa hari tetap kena 50% selagi itu bulan
    // ke-2, berlaku bulan lain juga". Cuti gugur kandungan SENGAJA tidak ikut
    // di sini - pasalnya memang mengaturnya per hari.
    for (const jenis of ["CUTI_BESAR", "CUTI_SAKIT"] as const) {
      const awalBulan = hitungPersenDibayarCuti({ jenis, bulanKeberapa: 2, jumlahHariCuti: 32 })!.persenDibayar;
      const akhirBulan = hitungPersenDibayarCuti({ jenis, bulanKeberapa: 2, jumlahHariCuti: 59 })!.persenDibayar;
      expect(awalBulan).toBeCloseTo(akhirBulan);
    }
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

describe("cuti yang TIDAK memotong tidak boleh menghapus potongan Pasal 13", () => {
  // Bug nyata yang aktif 2026-08-07 begitu jenis cuti ditarik otomatis:
  // override Pasal 14 dijalankan untuk SEMUA jenis cuti termasuk yang persen
  // dibayarnya 100%, dan karena override menimpa tukinPokok dengan
  // `tarif x persen`, cuti tahunan SATU HARI menghapus seluruh potongan
  // kehadiran sebulan. 16 dari 46 pegawai Biro Keuangan kena, Rp 634.959.
  const dgn = (cutiAktif?: { jenis: "CUTI_TAHUNAN" | "CUTI_BESAR"; bulanKeberapa?: number; jumlahHariCuti?: number }) =>
    hitungTukin(
      baseInput({
        rekapKehadiran: {
          ...baseInput().rekapKehadiran,
          totalMenitTerlambat: 100, // 1% dari bobot kehadiran
          jumlahHariKerja: 22,
          cutiAktif,
        },
      })
    );

  it("cuti tahunan TIDAK menghapus potongan keterlambatan", () => {
    const tanpaCuti = dgn();
    const cutiTahunan = dgn({ jenis: "CUTI_TAHUNAN", jumlahHariCuti: 1 });
    expect(cutiTahunan.tukinPokok).toBeCloseTo(tanpaCuti.tukinPokok, 6);
    // Dan potongannya memang ada - kalau tidak, test ini lolos karena
    // kebetulan keduanya sama-sama penuh.
    expect(tanpaCuti.tukinPokok).toBeLessThan(TUKIN_KELAS_8);
  });

  it("angkanya cocok dengan rincian tukin manual Rokeu", () => {
    // AHMAD HENDA FIRMANSYAH, kelas 8, Juli 2026: potongan Pasal 13 sebesar
    // 2,22% dari bobot kehadiran, lalu cuti tahunan 1 hari. Rincian manual
    // menulis "Dibayarkan" Rp 4.564.546 - artinya potongannya TETAP berlaku.
    const hasil = hitungTukin(
      baseInput({
        rekapKehadiran: {
          ...baseInput().rekapKehadiran,
          totalMenitTerlambat: 22,
          jumlahTidakPresensi: 2,
          jumlahHariKerja: 23,
          cutiAktif: { jenis: "CUTI_TAHUNAN", jumlahHariCuti: 1 },
        },
      })
    );
    // 2,22% x (30% x 4.595.150) = Rp 30.603,7
    expect(Math.round(hasil.tukinPokok)).toBe(4_564_546);
  });

  it("cuti yang MEMANG memotong tetap menimpa (perilaku lama dipertahankan)", () => {
    const hasil = dgn({ jenis: "CUTI_BESAR", bulanKeberapa: 1, jumlahHariCuti: 20 });
    // Cuti besar bulan I: dipotong 50%, jadi dibayar 50% dari tarif kelas.
    expect(hasil.tukinPokok).toBeCloseTo(TUKIN_KELAS_8 * 0.5, 6);
    expect(hasil.overrideCutiDiterapkan).toBe(true);
  });

  it("overrideCutiDiterapkan false untuk cuti yang tidak memotong", () => {
    // Dipakai UI buat menjelaskan kenapa kehadiran + kinerja tidak menjumlah
    // ke tukinPokok. Kalau tetap true padahal tidak ada yang ditimpa,
    // penandanya muncul tanpa ada yang perlu dicek.
    expect(dgn({ jenis: "CUTI_TAHUNAN", jumlahHariCuti: 1 }).overrideCutiDiterapkan).toBe(false);
    expect(dgn().overrideCutiDiterapkan).toBe(false);
  });
});

describe("cuti beberapa hari yang memotong SEBULAN PENUH (Pasal 14)", () => {
  function dgnCuti(jumlahHariCuti: number) {
    return hitungTukin(
      baseInput({
        rekapKehadiran: {
          ...baseInput().rekapKehadiran,
          jumlahHariKerja: 22,
          cutiAktif: { jenis: "CUTI_DI_LUAR_TANGGUNGAN_NEGARA", jumlahHariCuti },
        },
      })
    );
  }

  it("cuti 1 hari yang menghapus tukin sebulan WAJIB ditandai", () => {
    // Kasus nyata Juli 2026: tiga pegawai punya CLTN / cuti sakit >3 bulan
    // sebanyak satu hari saja. Pasal 14 tidak mengatur pembagian harian, jadi
    // potongannya tetap sebulan penuh - itu harus dilihat manusia, bukan
    // langsung dibayarkan.
    const hasil = dgnCuti(1);
    expect(hasil.tukinPokok).toBe(0);
    expect(hasil.anomali.join(" ")).toContain("PERIKSA MANUAL");
    expect(hasil.anomali.join(" ")).toContain("SATU BULAN PENUH");
  });

  it("cuti yang memang sebulan penuh TIDAK ikut ditandai", () => {
    // Kalau semua cuti panjang ikut ditandai, penandanya kehilangan arti.
    const hasil = dgnCuti(22);
    expect(hasil.tukinPokok).toBe(0);
    expect(hasil.anomali.join(" ")).not.toContain("PERIKSA MANUAL");
  });

  it("cuti yang TIDAK memotong tidak ikut ditandai walau cuma 1 hari", () => {
    const hasil = hitungTukin(
      baseInput({
        rekapKehadiran: {
          ...baseInput().rekapKehadiran,
          jumlahHariKerja: 22,
          cutiAktif: { jenis: "CUTI_TAHUNAN", jumlahHariCuti: 1 },
        },
      })
    );
    expect(hasil.anomali.join(" ")).not.toContain("PERIKSA MANUAL");
  });
});
