import { describe, it, expect } from "vitest";
import {
  HEADER_EXPORT_PRESENSI_HARIAN,
  jamTeks,
  labelSistemKerja,
  menitKerjaHarian,
  potonganHarian,
  susunExportPresensiHarian,
  type SumberBarisHarian,
} from "../exportPresensiHarian";
import { TARIF_POTONGAN_PASAL_13 } from "../tukin";
import { rincianJamKerjaHari } from "../rincianJamKerjaHarian";
import { tapKeluarMustahil, tapKetukanGanda } from "../presensiPdfKeRekap";

/** Date pada jam:menit tertentu di tanggal yang sama - selalu UTC. */
function jam(tanggal: Date, j: number, m: number): Date {
  return new Date(
    Date.UTC(tanggal.getUTCFullYear(), tanggal.getUTCMonth(), tanggal.getUTCDate(), j, m)
  );
}

function baris(p: Partial<SumberBarisHarian> = {}): SumberBarisHarian {
  return {
    nama: "Contoh Pegawai",
    statusKehadiran: "WFO",
    namaSistemKerja: null,
    tanggal: new Date(Date.UTC(2026, 6, 15)),
    jamMasuk: null,
    jamKeluar: null,
    menitTerlambat: 0,
    menitPulangCepat: 0,
    tidakIkutUpacara: false,
    ...p,
  };
}

describe("header dikunci template", () => {
  it("nama & urutan kolom PERSIS seperti Template_export_presensi_kasubagTU.xlsx", () => {
    // Berkas ini dibaca ulang oleh lembar kerja milik Kasubag TU. Mengganti
    // nama kolom mematahkan rumus di lembar itu TANPA pesan galat, jadi test
    // ini yang menahannya - bukan sekadar mencatat keadaan sekarang.
    expect([...HEADER_EXPORT_PRESENSI_HARIAN]).toEqual([
      "nama_pegawai",
      "nama_sistem_kerja",
      "tanggal",
      "Full tanggal",
      "jam_masuk",
      "jam_keluar",
      "menit_kerja",
      "jumlah_potongan",
      "keterangan",
    ]);
  });

  it("'Full tanggal' TIDAK di-snake_case-kan walau kolom lain begitu", () => {
    expect(HEADER_EXPORT_PRESENSI_HARIAN).toContain("Full tanggal");
    expect(HEADER_EXPORT_PRESENSI_HARIAN).not.toContain("full_tanggal");
  });
});

describe("labelSistemKerja", () => {
  it("teks tersimpan MENANG atas pemetaan balik", () => {
    // Inilah gunanya kolom namaSistemKerja: WFA tidak bisa dipulihkan dari
    // statusKehadiran, karena WFH & WFA dua-duanya tersimpan sebagai "WFH".
    expect(labelSistemKerja("WFA", "WFH")).toBe("WFA");
  });

  it("baris lama (teks null) dipetakan balik dari statusKehadiran", () => {
    expect(labelSistemKerja(null, "ALPHA")).toBe("Tidak Hadir");
    expect(labelSistemKerja(null, "DINAS_LUAR")).toBe("Dinas Keluar");
    expect(labelSistemKerja(null, "UPACARA")).toBe("Upacara Bendera");
    expect(labelSistemKerja(null, "TIDAK_PRESENSI")).toBe("Tidak Presensi");
  });

  it("WFA HILANG pada pemetaan balik - batas ketelitian yang diakui, bukan bug", () => {
    // Kalau suatu saat skema memisahkan WFA, test ini yang gagal lebih dulu.
    expect(labelSistemKerja(null, "WFH")).toBe("WFH");
  });

  it("status tanpa padanan dikembalikan APA ADANYA, bukan dikosongkan", () => {
    // "Sakit" tidak ada di 12 label sistem_kerja e-Presensi mana pun.
    expect(labelSistemKerja(null, "SAKIT")).toBe("SAKIT");
    expect(labelSistemKerja(null, "STATUS_BARU_DARI_EPRESENSI")).toBe("STATUS_BARU_DARI_EPRESENSI");
  });

  it("teks kosong/spasi diperlakukan seperti null", () => {
    expect(labelSistemKerja("", "ALPHA")).toBe("Tidak Hadir");
    expect(labelSistemKerja("   ", "ALPHA")).toBe("Tidak Hadir");
  });
});

describe("jamTeks", () => {
  it("tanpa ketukan jadi 00:00 - bukan sel kosong", () => {
    expect(jamTeks(null)).toBe("00:00");
  });

  it("dibaca sebagai UTC, supaya jam tidak bergeser mengikuti zona server", () => {
    expect(jamTeks(new Date(Date.UTC(2026, 6, 15, 7, 18)))).toBe("07:18");
    expect(jamTeks(new Date(Date.UTC(2026, 6, 15, 16, 4)))).toBe("16:04");
    expect(jamTeks(new Date(Date.UTC(2026, 6, 15, 23, 59)))).toBe("23:59");
  });

  it("jam & menit satu digit tetap dua digit", () => {
    expect(jamTeks(new Date(Date.UTC(2026, 6, 15, 8, 5)))).toBe("08:05");
  });
});

describe("menitKerjaHarian", () => {
  const RABU = new Date(Date.UTC(2026, 6, 15)); // indeksHari 3
  const JUMAT = new Date(Date.UTC(2026, 6, 17)); // indeksHari 5
  const SABTU = new Date(Date.UTC(2026, 6, 18)); // indeksHari 6

  it("hari kerja normal 07:30-16:00 = 450 menit - angka yang sama dengan template", () => {
    // 510 menit kotor - 60 menit istirahat. Kalau istirahat tidak dikurangi,
    // hasilnya 510 dan SELURUH kolom akan beda dari yang dipakai petugas.
    expect(menitKerjaHarian({ tanggal: RABU, jamMasuk: jam(RABU, 7, 30), jamKeluar: jam(RABU, 16, 0) })).toBe(450);
  });

  it("Jumat istirahatnya 90 menit, bukan 60 - Pasal 9 ayat (2)", () => {
    // 07:30-16:30 = 540 kotor, dikurangi 90 = 450.
    expect(menitKerjaHarian({ tanggal: JUMAT, jamMasuk: jam(JUMAT, 7, 30), jamKeluar: jam(JUMAT, 16, 30) })).toBe(450);
    // Hari kerja biasa dengan rentang yang sama hasilnya 30 menit lebih besar.
    expect(menitKerjaHarian({ tanggal: RABU, jamMasuk: jam(RABU, 7, 30), jamKeluar: jam(RABU, 16, 30) })).toBe(480);
  });

  it("akhir pekan TIDAK dikurangi istirahat - orang yang tap di hari itu memang lembur", () => {
    // Mengosongkan selnya akan menyembunyikan jam kerja yang nyata.
    expect(menitKerjaHarian({ tanggal: SABTU, jamMasuk: jam(SABTU, 9, 0), jamKeluar: jam(SABTU, 12, 0) })).toBe(180);
  });

  it("salah satu ketukan tidak ada -> null, bukan 0", () => {
    expect(menitKerjaHarian({ tanggal: RABU, jamMasuk: null, jamKeluar: jam(RABU, 16, 0) })).toBeNull();
    expect(menitKerjaHarian({ tanggal: RABU, jamMasuk: jam(RABU, 7, 30), jamKeluar: null })).toBeNull();
    expect(menitKerjaHarian({ tanggal: RABU, jamMasuk: null, jamKeluar: null })).toBeNull();
  });

  it("jam keluar 23:59 -> null, BUKAN belasan jam kerja", () => {
    // 23:59 adalah isian otomatis e-Presensi saat tap pulang tidak masuk.
    // Tanpa penjaga ini, baris nyata di Juli 2026 keluar sebagai 941, 978,
    // bahkan 1.018 menit - angka yang jelas salah tapi terlihat wajar.
    expect(menitKerjaHarian({ tanggal: RABU, jamMasuk: jam(RABU, 7, 18), jamKeluar: jam(RABU, 23, 59) })).toBeNull();
  });

  it("satu ketukan tersalin ke dua kolom -> null", () => {
    // Pola nyata di template contoh: masuk 20:29, keluar 20:30.
    expect(menitKerjaHarian({ tanggal: RABU, jamMasuk: jam(RABU, 20, 29), jamKeluar: jam(RABU, 20, 30) })).toBeNull();
  });

  it("jam keluar pada/sebelum jam masuk wajib -> null", () => {
    // Orang tidak bisa pulang sebelum jam kerjanya dimulai.
    expect(menitKerjaHarian({ tanggal: RABU, jamMasuk: jam(RABU, 6, 0), jamKeluar: jam(RABU, 7, 0) })).toBeNull();
  });

  it("ketukan masuk pada/sesudah jam pulang wajib -> null", () => {
    expect(menitKerjaHarian({ tanggal: RABU, jamMasuk: jam(RABU, 16, 30), jamKeluar: jam(RABU, 18, 0) })).toBeNull();
  });

  it("predikat tap yang dipakai SAMA dengan yang dipakai mesin pembayar", () => {
    // Bukan sekadar mirip: ketukan yang ditolak mesin itu juga ditolak di sini.
    expect(tapKeluarMustahil(23 * 60 + 59)).toBe(true);
    expect(tapKetukanGanda(20 * 60 + 29, 20 * 60 + 30)).toBe(true);
  });

  it("SAMA PERSIS dengan rincianJamKerjaHari().menitKerja di hari kerja", () => {
    // Penjagaan anti-menyimpang. Rumus di rincianJamKerjaHarian.ts sudah diadu
    // ke 1.019 baris berkas petugas (cocok 1.015); kalau salah satu diubah
    // tanpa yang lain, test ini gagal lebih dulu daripada ada orang yang
    // menemukan dua angka berbeda di dua layar.
    for (const [hMasuk, mMasuk, hKeluar, mKeluar] of [
      [7, 30, 16, 0],
      [8, 15, 17, 5],
      [9, 0, 16, 0],
      [6, 45, 15, 30],
    ] as const) {
      const punyaKita = menitKerjaHarian({
        tanggal: RABU,
        jamMasuk: jam(RABU, hMasuk, mMasuk),
        jamKeluar: jam(RABU, hKeluar, mKeluar),
      });
      const punyaMesin = rincianJamKerjaHari({
        tanggalIso: "2026-07-15",
        indeksHari: 3,
        hariLibur: false,
        jamMasukMenit: hMasuk * 60 + mMasuk,
        jamKeluarMenit: hKeluar * 60 + mKeluar,
        masukDikoreksi: true,
        keluarDikoreksi: true,
      }).menitKerja;
      expect(punyaKita).toBe(punyaMesin);
    }
  });
});

describe("potonganHarian - Pasal 13", () => {
  it("ALPHA dipotong 3% per hari, teksnya sama dengan template", () => {
    expect(potonganHarian({ statusKehadiran: "ALPHA", menitTerlambat: 0, menitPulangCepat: 0, tidakIkutUpacara: false }))
      .toEqual({ persen: 3, keterangan: "Potongan Tidak Hadir (3%)" });
  });

  it("angkanya memang berasal dari TARIF_POTONGAN_PASAL_13, bukan ditulis ulang", () => {
    // Kalau tarifnya diubah di tukin.ts, hasil di sini WAJIB ikut berubah.
    expect(TARIF_POTONGAN_PASAL_13.perHariAlpha * 100).toBe(3);
    expect(TARIF_POTONGAN_PASAL_13.perMenit * 100).toBeCloseTo(0.01, 10);
  });

  it("hari bersih tidak menghasilkan potongan sama sekali", () => {
    expect(potonganHarian({ statusKehadiran: "WFO", menitTerlambat: 0, menitPulangCepat: 0, tidakIkutUpacara: false }))
      .toBeNull();
  });

  it("TIDAK_PRESENSI TIDAK dihitung - jumlah kejadian per hari tidak tersimpan", () => {
    // Menebaknya 1 berarti berpotensi mengurangi potongan seseorang tanpa
    // dasar; menebaknya 2 berarti menambahnya. Dua-duanya menyentuh rupiah.
    expect(
      potonganHarian({ statusKehadiran: "TIDAK_PRESENSI", menitTerlambat: 0, menitPulangCepat: 0, tidakIkutUpacara: false })
    ).toBeNull();
  });

  it("terlambat dipotong 0,01% per menit", () => {
    const p = potonganHarian({ statusKehadiran: "WFO", menitTerlambat: 30, menitPulangCepat: 0, tidakIkutUpacara: false });
    expect(p).toEqual({ persen: 0.3, keterangan: "Potongan Terlambat (30 menit)" });
  });

  it("246 menit jadi 2.46 PERSIS - bukan 2.4600000000000004", () => {
    // Tanpa pembulatan, nilai float itu benar-benar tertulis ke sel Excel.
    // 246 menit adalah angka nyata: total keterlambatan sebulan di rincian
    // tunkin yang pernah diadu ke berkas petugas.
    const p = potonganHarian({ statusKehadiran: "WFO", menitTerlambat: 246, menitPulangCepat: 0, tidakIkutUpacara: false });
    expect(p!.persen).toBe(2.46);
  });

  it("terlambat DAN pulang cepat di hari yang sama dijumlahkan, keterangannya digabung", () => {
    const p = potonganHarian({ statusKehadiran: "WFO", menitTerlambat: 15, menitPulangCepat: 25, tidakIkutUpacara: false });
    expect(p!.persen).toBe(0.4);
    expect(p!.keterangan).toBe("Potongan Terlambat (15 menit); Potongan Pulang Cepat (25 menit)");
  });

  it("tidak ikut upacara dipotong 3% per kejadian", () => {
    const p = potonganHarian({ statusKehadiran: "WFO", menitTerlambat: 0, menitPulangCepat: 0, tidakIkutUpacara: true });
    expect(p).toEqual({ persen: 3, keterangan: "Potongan Tidak Ikut Upacara (3%)" });
  });

  it("menit negatif atau nol tidak pernah menghasilkan potongan", () => {
    expect(potonganHarian({ statusKehadiran: "WFO", menitTerlambat: -5, menitPulangCepat: 0, tidakIkutUpacara: false }))
      .toBeNull();
  });
});

describe("susunExportPresensiHarian", () => {
  it("potongan ditulis NEGATIF, mengikuti template", () => {
    const [r] = susunExportPresensiHarian([baris({ statusKehadiran: "ALPHA" })]);
    expect(r.jumlahPotongan).toBe(-3);
    expect(r.keterangan).toBe("Potongan Tidak Hadir (3%)");
  });

  it("hari tanpa potongan: sel angka null & keterangan kosong, bukan 0 dan bukan '-'", () => {
    const [r] = susunExportPresensiHarian([baris()]);
    expect(r.jumlahPotongan).toBeNull();
    expect(r.keterangan).toBe("");
  });

  it("menitKerja DIHITUNG dari jam masuk & keluar - bukan diambil dari sumber", () => {
    const rabu = new Date(Date.UTC(2026, 6, 15));
    const [r] = susunExportPresensiHarian([
      baris({ tanggal: rabu, jamMasuk: jam(rabu, 7, 30), jamKeluar: jam(rabu, 16, 0) }),
    ]);
    expect(r.menitKerja).toBe(450);
  });

  it("satu ketukan hilang -> sel KOSONG, bukan 0", () => {
    const rabu = new Date(Date.UTC(2026, 6, 15));
    const [r] = susunExportPresensiHarian([
      baris({ tanggal: rabu, jamMasuk: jam(rabu, 7, 30), jamKeluar: null }),
    ]);
    expect(r.menitKerja).toBeNull();
  });

  it("urutan baris TIDAK diubah - itu tanggung jawab query pemanggil", () => {
    const hasil = susunExportPresensiHarian([
      baris({ nama: "Zulkifli", tanggal: new Date(Date.UTC(2026, 6, 1)) }),
      baris({ nama: "Ahmad", tanggal: new Date(Date.UTC(2026, 6, 2)) }),
    ]);
    expect(hasil.map((r) => r.namaPegawai)).toEqual(["Zulkifli", "Ahmad"]);
  });

  it("satu nilai tanggal dipakai untuk kolom C dan D - formatnya yang beda, bukan datanya", () => {
    const t = new Date(Date.UTC(2024, 2, 6));
    const [r] = susunExportPresensiHarian([baris({ tanggal: t })]);
    expect(r.tanggal.getTime()).toBe(t.getTime());
  });

  it("baris Izin tanpa ketukan meniru e-Presensi: 00:00 di kedua kolom jam", () => {
    const [r] = susunExportPresensiHarian([
      baris({ statusKehadiran: "IZIN", namaSistemKerja: "Izin", jamMasuk: null, jamKeluar: null }),
    ]);
    expect(r.namaSistemKerja).toBe("Izin");
    expect(r.jamMasuk).toBe("00:00");
    expect(r.jamKeluar).toBe("00:00");
    expect(r.jumlahPotongan).toBeNull();
  });
});
