import { describe, it, expect } from "vitest";
import {
  ISTIRAHAT_MENIT,
  JAM_TAP_PULANG_HILANG,
  jamDariMenit,
  kejadianTidakPresensiHari,
  potonganHarianPersen,
  rincianJamKerjaHari,
} from "../rincianJamKerjaHarian";
import { hitungPotonganKehadiranPersen } from "../tukin";

const MENIT = (j: number, m: number) => j * 60 + m;

/** Senin 2026-07-06. */
const SENIN = { tanggalIso: "2026-07-06", indeksHari: 1, hariLibur: false };
/** Jumat 2026-07-10. */
const JUMAT = { tanggalIso: "2026-07-10", indeksHari: 5, hariLibur: false };

describe("rincianJamKerjaHari - hari normal", () => {
  it("hari kerja penuh Senin: 07:30-16:00 menghasilkan 450 menit kerja tanpa kekurangan", () => {
    const r = rincianJamKerjaHari({
      ...SENIN,
      jamMasukMenit: MENIT(7, 30),
      jamKeluarMenit: MENIT(16, 0),
    });

    expect(r.istirahatMenit).toBe(60);
    expect(r.jamHarusPulangMenit).toBe(MENIT(16, 0));
    expect(r.menitKerja).toBe(450); // 7,5 jam Pasal 9 ayat (1)
    expect(r.menitTerlambat).toBe(0);
    expect(r.kekuranganJamKerjaMenit).toBe(0);
    expect(r.totalMenitKekuranganHarian).toBe(0);
  });

  it("Jumat istirahatnya 90 menit, jadi 07:30-16:30 tetap 450 menit kerja", () => {
    const r = rincianJamKerjaHari({
      ...JUMAT,
      jamMasukMenit: MENIT(7, 30),
      jamKeluarMenit: MENIT(16, 30),
    });

    expect(r.istirahatMenit).toBe(90);
    expect(r.jamPulangWajibMenit).toBe(MENIT(16, 30));
    expect(r.jamToleransiPulangMenit).toBe(MENIT(17, 30));
    expect(r.jamHarusPulangMenit).toBe(MENIT(16, 30));
    expect(r.menitKerja).toBe(450);
    expect(r.kekuranganJamKerjaMenit).toBe(0);
  });

  it("jam toleransi masuk 08:30 dan toleransi pulang 17:00 diturunkan dari toleransi Pasal 9 ayat (3)", () => {
    const r = rincianJamKerjaHari({ ...SENIN, jamMasukMenit: MENIT(7, 30), jamKeluarMenit: MENIT(16, 0) });
    expect(r.jamMasukWajibMenit).toBe(MENIT(7, 30));
    expect(r.jamToleransiMasukMenit).toBe(MENIT(8, 30));
    expect(r.jamToleransiPulangMenit).toBe(MENIT(17, 0));
  });

  it("datang 08:30 tepat belum terlambat - toleransi 60 menit dikurangkan, bukan ambang", () => {
    const r = rincianJamKerjaHari({ ...SENIN, jamMasukMenit: MENIT(8, 30), jamKeluarMenit: MENIT(17, 0) });
    expect(r.menitTerlambat).toBe(0);
    // Kewajibannya bergeser: 08:30 + 7,5 jam + 60 = 17:00.
    expect(r.jamHarusPulangMenit).toBe(MENIT(17, 0));
    expect(r.kekuranganJamKerjaMenit).toBe(0);
  });
});

describe("rincianJamKerjaHari - batas checkout bergeser tapi dibatasi toleransi pulang", () => {
  it("terlambat menggeser jam harus pulang, dan kekurangan diukur dari batas itu", () => {
    // Masuk 09:00 -> harus pulang 09:00 + 7,5 jam + 60 = 17:30, tapi dibatasi
    // jam toleransi pulang 17:00.
    const r = rincianJamKerjaHari({ ...SENIN, jamMasukMenit: MENIT(9, 0), jamKeluarMenit: MENIT(16, 0) });

    expect(r.jamHarusPulangMenit).toBe(MENIT(17, 30));
    expect(r.batasCheckoutMenit).toBe(MENIT(17, 0)); // di-cap
    expect(r.menitTerlambat).toBe(30); // 09:00 - 08:30
    expect(r.kekuranganJamKerjaMenit).toBe(60); // 17:00 - 16:00
    expect(r.totalMenitKekuranganHarian).toBe(90);
  });

  it("PENTING: kekurangan jam kerja BUKAN pulang cepat - orang ini pulang tepat waktu", () => {
    const r = rincianJamKerjaHari({ ...SENIN, jamMasukMenit: MENIT(9, 0), jamKeluarMenit: MENIT(16, 0) });

    // Yang DIBAYARKAN (Pasal 13 ayat (3)) mengukur ke patokan tetap 16:00,
    // jadi pulang cepatnya 0 - sementara kolom kekurangan di atas 60 menit.
    const pulangCepatYangDibayarkan = Math.max(0, r.jamPulangWajibMenit! - MENIT(16, 0));
    expect(pulangCepatYangDibayarkan).toBe(0);
    expect(r.kekuranganJamKerjaMenit).toBe(60);
  });

  it("datang lebih pagi tidak membuat kewajiban pulang lebih cepat dari jam pulang wajib", () => {
    // Masuk 06:00 -> 06:00 + 7,5 jam + 60 = 14:30, TAPI batasnya tetap 16:00.
    const r = rincianJamKerjaHari({ ...SENIN, jamMasukMenit: MENIT(6, 0), jamKeluarMenit: MENIT(15, 0) });

    expect(r.jamHarusPulangMenit).toBe(MENIT(14, 30));
    expect(r.batasCheckoutMenit).toBe(MENIT(16, 0)); // max(...) menjaga lantainya
    expect(r.kekuranganJamKerjaMenit).toBe(60);
  });

  it("pulang lewat batas tidak menghasilkan kekurangan negatif", () => {
    const r = rincianJamKerjaHari({ ...SENIN, jamMasukMenit: MENIT(7, 30), jamKeluarMenit: MENIT(20, 0) });
    expect(r.kekuranganJamKerjaMenit).toBe(0);
    expect(r.menitKerja).toBe(690); // (20:00 - 07:30) - 60
  });
});

describe("rincianJamKerjaHari - ketukan hilang & hari libur", () => {
  it("tanpa ketukan pulang, menit kerja & kekurangan null - BUKAN nol", () => {
    const r = rincianJamKerjaHari({ ...SENIN, jamMasukMenit: MENIT(7, 30), jamKeluarMenit: null });
    expect(r.menitKerja).toBeNull();
    expect(r.kekuranganJamKerjaMenit).toBeNull();
    expect(r.totalMenitKekuranganHarian).toBeNull();
    // Keterlambatan tetap terbaca - datanya memang ada.
    expect(r.menitTerlambat).toBe(0);
  });

  it("tanpa ketukan masuk, jam harus pulang null dan batasnya jatuh ke jam pulang wajib", () => {
    const r = rincianJamKerjaHari({ ...SENIN, jamMasukMenit: null, jamKeluarMenit: MENIT(15, 0) });
    expect(r.jamHarusPulangMenit).toBeNull();
    expect(r.batasCheckoutMenit).toBe(MENIT(16, 0));
    expect(r.kekuranganJamKerjaMenit).toBe(60);
  });

  it("Sabtu tidak punya kewajiban apa pun walau ada ketukan", () => {
    const r = rincianJamKerjaHari({
      tanggalIso: "2026-07-11",
      indeksHari: 6,
      hariLibur: false, // akhir pekan dikenali dari jadwalnya sendiri
      jamMasukMenit: MENIT(8, 0),
      jamKeluarMenit: MENIT(17, 0),
    });

    expect(r.hariLibur).toBe(true);
    expect(r.jamPulangWajibMenit).toBeNull();
    expect(r.jamHarusPulangMenit).toBeNull();
    expect(r.menitTerlambat).toBe(0);
    expect(r.kekuranganJamKerjaMenit).toBeNull();
  });

  it("tanggal merah di hari kerja diperlakukan sama persis dengan Sabtu/Minggu", () => {
    const r = rincianJamKerjaHari({
      tanggalIso: "2026-06-01", // Hari Lahir Pancasila, jatuh Senin
      indeksHari: 1,
      hariLibur: true,
      jamMasukMenit: MENIT(10, 0),
      jamKeluarMenit: MENIT(11, 0),
    });

    expect(r.hariLibur).toBe(true);
    expect(r.menitTerlambat).toBe(0);
    expect(r.totalMenitKekuranganHarian).toBeNull();
  });

  it("ISTIRAHAT_MENIT mengikuti Pasal 9 ayat (2): Senin-Kamis 60, Jumat 90", () => {
    expect([...ISTIRAHAT_MENIT]).toEqual([null, 60, 60, 60, 60, 90, null]);
  });
});

describe("potonganHarianPersen", () => {
  it("memakai tarif Pasal 13 dan menghasilkan PECAHAN, bukan satuan persen", () => {
    const p = potonganHarianPersen({
      hariAlpha: false,
      kejadianTidakPresensi: 0,
      menitTerlambat: 30,
      menitPulangCepat: 0,
      menitMeninggalkanKantor: 0,
      tidakIkutUpacara: false,
    });
    expect(p).toBeCloseTo(0.003, 10); // 30 x 0,01% = 0,3%
  });

  it("lupa presensi dihitung PER KETUKAN - dua ketukan hilang = 2%", () => {
    const p = potonganHarianPersen({
      hariAlpha: false,
      kejadianTidakPresensi: 2,
      menitTerlambat: 0,
      menitPulangCepat: 0,
      menitMeninggalkanKantor: 0,
      tidakIkutUpacara: false,
    });
    expect(p).toBeCloseTo(0.02, 10);
  });

  it("alpha 3% dan tidak ikut upacara 3% bisa berlaku bersamaan", () => {
    const p = potonganHarianPersen({
      hariAlpha: true,
      kejadianTidakPresensi: 0,
      menitTerlambat: 0,
      menitPulangCepat: 0,
      menitMeninggalkanKantor: 0,
      tidakIkutUpacara: true,
    });
    expect(p).toBeCloseTo(0.06, 10);
  });

  it("penjumlahan per hari SAMA dengan mesin yang membayar (hitungPotonganKehadiranPersen)", () => {
    // Tiga hari: satu alpha, satu telat 40 menit + pulang cepat 20, satu lupa
    // presensi 1 ketukan. Kalau kedua jalur bisa berbeda, tabel di layar akan
    // bercerita lain dari kas - itu yang dijaga test ini.
    const hari = [
      { hariAlpha: true, kejadianTidakPresensi: 0, menitTerlambat: 0, menitPulangCepat: 0, menitMeninggalkanKantor: 0, tidakIkutUpacara: false },
      { hariAlpha: false, kejadianTidakPresensi: 0, menitTerlambat: 40, menitPulangCepat: 20, menitMeninggalkanKantor: 0, tidakIkutUpacara: false },
      { hariAlpha: false, kejadianTidakPresensi: 1, menitTerlambat: 0, menitPulangCepat: 0, menitMeninggalkanKantor: 0, tidakIkutUpacara: false },
    ];

    const jumlahHarian = hari.reduce((a, h) => a + potonganHarianPersen(h), 0);
    const dariMesin = hitungPotonganKehadiranPersen({
      jumlahHariAlpha: 1,
      jumlahTidakPresensi: 1,
      totalMenitTerlambat: 40,
      totalMenitPulangCepat: 20,
      totalMenitMeninggalkanKantor: 0,
      jumlahTidakIkutUpacara: 0,
    }).totalPersen;

    expect(jumlahHarian).toBeCloseTo(dariMesin, 10);
  });
});

describe("kejadianTidakPresensiHari", () => {
  const dasar = {
    wajibPresensi: true,
    hariLibur: false,
    jamMasukMenit: MENIT(7, 30),
    jamKeluarMenit: MENIT(16, 0),
    dikecualikanKendala: false,
    dikoreksiManual: false,
  };

  it("hari lengkap tidak menghasilkan kejadian", () => {
    expect(kejadianTidakPresensiHari(dasar)).toBe(0);
  });

  it("dihitung PER KETUKAN - dua-duanya hilang berarti 2 kejadian", () => {
    expect(kejadianTidakPresensiHari({ ...dasar, jamMasukMenit: null })).toBe(1);
    expect(kejadianTidakPresensiHari({ ...dasar, jamKeluarMenit: null })).toBe(1);
    expect(kejadianTidakPresensiHari({ ...dasar, jamMasukMenit: null, jamKeluarMenit: null })).toBe(2);
  });

  it("jam keluar 23:59 dibaca sebagai tap pulang yang hilang", () => {
    expect(kejadianTidakPresensiHari({ ...dasar, jamKeluarMenit: JAM_TAP_PULANG_HILANG })).toBe(1);
  });

  it("koreksi petugas mematikan penanda 23:59 - jamnya sudah diverifikasi manusia", () => {
    expect(
      kejadianTidakPresensiHari({ ...dasar, jamKeluarMenit: JAM_TAP_PULANG_HILANG, dikoreksiManual: true })
    ).toBe(0);
  });

  it("kendala e-Presensi membatalkan kejadian - Pasal 10 ayat (2)", () => {
    expect(kejadianTidakPresensiHari({ ...dasar, jamKeluarMenit: null, dikecualikanKendala: true })).toBe(0);
  });

  it("status yang tidak mewajibkan presensi kantor (dinas/diklat) tidak kena", () => {
    expect(kejadianTidakPresensiHari({ ...dasar, jamKeluarMenit: null, wajibPresensi: false })).toBe(0);
  });

  it("hari libur tidak kena walau ketukannya hilang", () => {
    expect(kejadianTidakPresensiHari({ ...dasar, jamKeluarMenit: null, hariLibur: true })).toBe(0);
  });
});

describe("jamDariMenit", () => {
  it("memformat dengan dua digit", () => {
    expect(jamDariMenit(450)).toBe("07:30");
    expect(jamDariMenit(0)).toBe("00:00");
    expect(jamDariMenit(MENIT(16, 5))).toBe("16:05");
  });

  it("null tetap null - pemanggil yang memutuskan tampilannya", () => {
    expect(jamDariMenit(null)).toBeNull();
  });
});
