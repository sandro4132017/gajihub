import { describe, it, expect } from "vitest";
import { rekapDariLaporanPdf, kategoriDariStatus } from "../presensiPdfKeRekap";
import type { BarisPresensiPdf, LaporanPresensiPdf, RingkasanSumberPdf } from "../presensiPdf";

/**
 * Semua tanggal, jam, dan status di file ini DISALIN dari 3 file PDF asli
 * (export "Laporan Detail Presensi Harian" e-Presensi):
 *   - rekap-presensi-000000008740-6-2026.pdf (1 pegawai, Juni 2026)
 *   - gadis rekap-presensi-000000008740-5-2026.pdf (1 pegawai, Mei 2026)
 *   - rekap-presensi-Merge.pdf (44 pegawai, Juli 2025)
 * Bukan angka karangan - kalau aturan turunannya berubah, test ini yang
 * jatuh duluan.
 */

const RINGKASAN_KOSONG: RingkasanSumberPdf = {
  tidakHadir: null, izin: null, tugasBelajar: null, lembur: null, tidakPresensi: null,
  cuti: null, upacaraBendera: null, dinasKeluar: null, wfo: null, diklat: null,
  wfh: null, wfa: null, kewajibanJamKerja: null, kekuranganJamKerja: null,
};

function jam(teks: string | null): number | null {
  if (!teks) return null;
  const [h, m] = teks.split(":").map(Number);
  const total = h * 60 + m;
  return total === 0 ? null : total;
}

let urutan = 0;
function baris(
  tanggalTeks: string,
  namaHari: string,
  jamMasuk: string | null,
  jamKeluar: string | null,
  statusTeks: string,
  potonganTeks = ""
): BarisPresensiPdf {
  const [dd, mm, yyyy] = tanggalTeks.split("-").map(Number);
  return {
    nomor: ++urutan,
    halaman: 1,
    tanggalTeks: `${namaHari}, ${tanggalTeks}`,
    namaHari,
    tanggal: dd,
    bulan: mm,
    tahun: yyyy,
    jamMasukMenit: jam(jamMasuk),
    jamKeluarMenit: jam(jamKeluar),
    jamMasukTeks: jamMasuk,
    jamKeluarTeks: jamKeluar,
    lokasiKeluar: null,
    statusTeks,
    potonganTeks,
    aktivitas: null,
  };
}

function laporan(
  isi: BarisPresensiPdf[],
  ringkasan: Partial<RingkasanSumberPdf> = {}
): LaporanPresensiPdf {
  return {
    nip: "199612052018122001",
    nama: "GADIS SUKMA DEWA",
    jabatan: "Analis Pengelolaan Keuangan APBN Ahli Pertama",
    periodeBulan: isi[0]?.bulan ?? 6,
    periodeTahun: isi[0]?.tahun ?? 2026,
    ringkasanSumber: { ...RINGKASAN_KOSONG, ...ringkasan },
    baris: isi,
    halamanMulai: 1,
    peringatan: [],
  };
}

describe("kategoriDariStatus", () => {
  it("mengenali semua status yang muncul di 3 file asli", () => {
    expect(kategoriDariStatus("WFO").kategori).toBe("WFO");
    expect(kategoriDariStatus("WFH").kategori).toBe("WFH_WFA");
    expect(kategoriDariStatus("WFA").kategori).toBe("WFH_WFA");
    expect(kategoriDariStatus("Dinas Keluar").kategori).toBe("DINAS_LUAR");
    expect(kategoriDariStatus("Tidak Hadir").kategori).toBe("TIDAK_HADIR");
    expect(kategoriDariStatus("Lembur").kategori).toBe("LEMBUR");
    expect(kategoriDariStatus("Upacara Bendera").kategori).toBe("UPACARA");
    expect(kategoriDariStatus("Cuti").kategori).toBe("CUTI");
  });

  it('membaca "Cuti - Cuti Sakit <1 bulan" sebagai CUTI, bukan SAKIT', () => {
    // Jebakan urutan pencocokan: string ini mengandung kata "sakit".
    const hasil = kategoriDariStatus("Cuti - Cuti Sakit <1 bulan");
    expect(hasil.kategori).toBe("CUTI");
    expect(hasil.jenisCuti).toBe("Cuti Sakit <1 bulan");
  });

  it("menandai status asing sebagai TIDAK_DIKENALI, bukan menebak", () => {
    expect(kategoriDariStatus("Status Baru Entah Apa").kategori).toBe("TIDAK_DIKENALI");
    expect(kategoriDariStatus("").kategori).toBe("TIDAK_DIKENALI");
  });
});

describe("rekapDariLaporanPdf - entri ganda", () => {
  it('membuang baris "Tidak Hadir" otomatis kalau tanggalnya sudah punya status lain', () => {
    // Kasus nyata 22-06-2026: satu tanggal punya baris Cuti Tahunan DAN
    // baris Tidak Hadir. Kalau tidak dibuang, pegawai kena potongan 3%
    // untuk hari yang sebenarnya cuti.
    const hasil = rekapDariLaporanPdf(
      laporan([
        baris("22-06-2026", "Senin", "00:00", "00:00", "Cuti - Cuti Tahunan"),
        baris("22-06-2026", "Senin", "00:00", "00:00", "Tidak Hadir"),
      ])
    );
    expect(hasil.rekap.jumlahHariAlpha).toBe(0);
    expect(hasil.dibuang).toHaveLength(1);
    expect(hasil.dibuang[0].statusTeks).toBe("Tidak Hadir");
  });

  it('menggabungkan dua baris "Tidak Hadir" pada tanggal sama jadi SATU hari alpha', () => {
    // Ada 17 tanggal seperti ini di file uji Juli 2025. Dua baris = potongan
    // 6% padahal Pasal 13 ayat (1) cuma 3% per HARI.
    const hasil = rekapDariLaporanPdf(
      laporan([
        baris("21-07-2025", "Senin", "00:00", "00:00", "Tidak Hadir"),
        baris("21-07-2025", "Senin", "00:00", "00:00", "Tidak Hadir"),
        baris("22-07-2025", "Selasa", "00:00", "00:00", "Tidak Hadir"),
      ])
    );
    expect(hasil.rekap.jumlahHariAlpha).toBe(2);
    expect(hasil.dibuang).toHaveLength(1);
  });

  it("memberi catatan kalau dua status BERBEDA (bukan Tidak Hadir) di tanggal sama", () => {
    const hasil = rekapDariLaporanPdf(
      laporan([
        baris("23-06-2026", "Selasa", "08:00", "16:30", "WFO"),
        baris("23-06-2026", "Selasa", "09:00", "17:00", "Dinas Keluar"),
      ])
    );
    expect(hasil.rekap.jumlahHariWfo).toBe(1);
    expect(hasil.rekap.jumlahHariDinasLuar).toBe(0);
    expect(hasil.catatan.join(" ")).toContain("status berbeda di tanggal yang sama");
  });
});

describe("rekapDariLaporanPdf - potongan Pasal 13", () => {
  it("menghitung keterlambatan dari 07:30, sama persis dengan catatan di PDF", () => {
    // 5 baris WFO asli Juni 2026 + 3 baris WFH. Catatan e-Presensi sendiri
    // menyebut 95 & 96 menit untuk dua baris pertama.
    const hasil = rekapDariLaporanPdf(
      laporan([
        baris("15-06-2026", "Senin", "09:05", "18:13", "WFO"), // 95
        baris("09-06-2026", "Selasa", "09:06", "18:02", "WFO"), // 96
        baris("03-06-2026", "Rabu", "07:40", "16:35", "WFO"), // 10
        baris("02-06-2026", "Selasa", "06:21", "16:37", "WFO"), // 0 (datang awal)
        baris("26-06-2026", "Jumat", "07:59", "17:21", "WFH"), // 29
      ])
    );
    expect(hasil.rekap.totalMenitTerlambat).toBe(95 + 96 + 10 + 29);
    expect(hasil.rekap.totalMenitPulangCepat).toBe(0);
  });

  it("memotong pulang cepat 16:00 Senin-Kamis dan 16:30 Jumat", () => {
    const hasil = rekapDariLaporanPdf(
      laporan([
        baris("03-06-2026", "Rabu", "07:30", "15:40", "WFO"), // 20 menit
        baris("05-06-2026", "Jumat", "07:30", "16:10", "WFO"), // 20 menit
        baris("04-06-2026", "Kamis", "07:30", "16:00", "WFO"), // pas, 0
      ])
    );
    expect(hasil.rekap.totalMenitPulangCepat).toBe(40);
  });

  it("TIDAK memotong terlambat/pulang cepat untuk Dinas Keluar & Diklat", () => {
    // Jam presensi dinas mengikuti perjalanan, bukan jam kantor. Di file asli
    // baris Dinas Keluar jam 11:22 pun tidak pernah ditandai terlambat.
    const hasil = rekapDariLaporanPdf(
      laporan([
        baris("23-06-2026", "Selasa", "11:22", "17:15", "Dinas Keluar"),
        baris("24-06-2026", "Rabu", "10:00", "12:00", "Diklat"),
      ])
    );
    expect(hasil.rekap.totalMenitTerlambat).toBe(0);
    expect(hasil.rekap.totalMenitPulangCepat).toBe(0);
    expect(hasil.rekap.jumlahHariDinasLuar).toBe(1);
    expect(hasil.rekap.jumlahHariDiklat).toBe(1);
  });

  it("menghitung 1 kejadian tidak presensi kalau sel jam pulang kosong", () => {
    const hasil = rekapDariLaporanPdf(
      laporan([baris("13-05-2026", "Rabu", "06:05", null, "Dinas Keluar")])
    );
    expect(hasil.rekap.jumlahTidakPresensi).toBe(1);
  });

  it('membaca penanda "lupa presensi" dari kolom Potongan, tanpa memakai angkanya', () => {
    // Jam keluar 23:59 kelihatan valid - satu-satunya penanda bahwa presensi
    // pulangnya terlewat ada di teks kolom Potongan.
    const hasil = rekapDariLaporanPdf(
      laporan([
        baris("04-06-2026", "Kamis", "09:20", "23:59", "WFO", "-1.83 | Potongan telat presensi 110 menit -1.17 | Potongan lupa presensi 1.1666666666666667%"),
      ])
    );
    expect(hasil.rekap.jumlahTidakPresensi).toBe(1);
    // Keterlambatan tetap dihitung dari jam masuk yang masih masuk akal.
    expect(hasil.rekap.totalMenitTerlambat).toBe(110);
    // Angka -1.83 / -1.17 dari PDF TIDAK boleh bocor ke mana pun.
    expect(hasil.rekap.totalMenitPulangCepat).toBe(0);
  });

  it("tidak menagih keterlambatan dari ketukan sore yang jelas bukan presensi pagi", () => {
    // Kasus nyata: WFO dengan jam masuk 19:46 dan jam pulang 19:47 - satu
    // ketukan sore yang disalin ke dua kolom. Kalau dibaca mentah, jadi
    // "terlambat 736 menit" alias potongan 7,36% dari bobot kehadiran.
    const hasil = rekapDariLaporanPdf(
      laporan([baris("09-07-2025", "Rabu", "19:46", "19:47", "WFO", "-1 | Potongan lupa presensi 1%")])
    );
    expect(hasil.rekap.totalMenitTerlambat).toBe(0);
    expect(hasil.rekap.jumlahTidakPresensi).toBe(1);
  });

  it("tidak pernah menurunkan potongan tidak-ikut-upacara (datanya memang tidak ada)", () => {
    const hasil = rekapDariLaporanPdf(
      laporan([baris("01-06-2026", "Senin", "07:10", "07:53", "Upacara Bendera")])
    );
    expect(hasil.rekap.jumlahTidakIkutUpacara).toBe(0);
    // Status ini artinya pegawai IKUT upacara - dan tanggalnya sering libur
    // nasional, jadi tidak ikut dihitung sebagai hari kerja WFO.
    expect(hasil.rekap.jumlahHariWfo).toBe(0);
    expect(hasil.catatan.join(" ")).toContain("Upacara Bendera");
  });

  it("tidak pernah menurunkan menit meninggalkan kantor (tidak ada di export)", () => {
    const hasil = rekapDariLaporanPdf(laporan([baris("03-06-2026", "Rabu", "07:40", "16:35", "WFO")]));
    expect(hasil.rekap.totalMenitMeninggalkanKantor).toBe(0);
  });
});

describe("rekapDariLaporanPdf - akhir pekan", () => {
  it("tidak menghitung potongan apa pun di Sabtu/Minggu", () => {
    // Semua baris tanpa presensi pulang di file uji adalah Dinas Keluar hari
    // Sabtu. Menagih 1% untuk hari tanpa kewajiban kerja jelas keliru.
    const hasil = rekapDariLaporanPdf(
      laporan([baris("19-07-2025", "Sabtu", "04:38", null, "Dinas Keluar")])
    );
    expect(hasil.rekap.jumlahTidakPresensi).toBe(0);
    expect(hasil.rekap.totalMenitTerlambat).toBe(0);
  });

  it("tidak memberi hak uang makan untuk WFO di akhir pekan", () => {
    const hasil = rekapDariLaporanPdf(
      laporan([baris("26-07-2025", "Sabtu", "09:00", "17:00", "WFO")])
    );
    expect(hasil.rekap.jumlahHariWfo).toBe(0);
    expect(hasil.catatan.join(" ")).toContain("akhir pekan");
  });
});

describe("rekapDariLaporanPdf - uang lembur", () => {
  it("menghitung lembur akhir pekan penuh dari jam masuk sampai jam pulang", () => {
    // Sabtu 02-05-2026, 10:43-19:43 = 9 jam.
    const hasil = rekapDariLaporanPdf(
      laporan([baris("02-05-2026", "Sabtu", "10:43", "19:43", "Lembur")])
    );
    expect(hasil.rekap.totalJamLemburHariLibur).toBe(9);
    expect(hasil.rekap.totalJamLembur).toBe(0);
    expect(hasil.rekap.jumlahHariMakanLemburHariLibur).toBe(1);
  });

  it("di hari kerja, lembur baru dihitung setelah jam pulang wajib", () => {
    // Masuk 08:00 pulang 19:00 di hari Rabu: yang jadi lembur cuma
    // 16:00-19:00 = 3 jam, bukan 11 jam.
    const hasil = rekapDariLaporanPdf(
      laporan([baris("08-07-2025", "Selasa", "08:00", "19:00", "Lembur")])
    );
    expect(hasil.rekap.totalJamLembur).toBe(3);
    expect(hasil.rekap.totalJamLemburHariLibur).toBe(0);
    expect(hasil.catatan.join(" ")).toContain("libur nasional");
  });

  it("tidak memberi uang makan lembur kalau blok lemburnya di bawah 2 jam", () => {
    // SBM 2026 item 23.2: minimal 2 jam berturut-turut.
    const hasil = rekapDariLaporanPdf(
      laporan([baris("27-07-2025", "Minggu", "10:00", "11:30", "Lembur")])
    );
    expect(hasil.rekap.totalJamLemburHariLibur).toBe(1.5);
    expect(hasil.rekap.jumlahHariMakanLemburHariLibur).toBe(0);
  });

  it("TIDAK menghitung lembur dari baris WFO yang pulangnya malam", () => {
    // Lembur harus diperintahkan; pulang malam tanpa status "Lembur" cuma
    // pulang telat. Di file uji ada WFO yang pulang 23:59.
    const hasil = rekapDariLaporanPdf(
      laporan([baris("01-07-2025", "Selasa", "08:10", "22:00", "WFO")])
    );
    expect(hasil.rekap.totalJamLembur).toBe(0);
    expect(hasil.rekap.totalJamLemburHariLibur).toBe(0);
  });
});

describe("rekapDariLaporanPdf - hari kerja & cek silang", () => {
  it('menurunkan jumlah hari kerja dari "Kewajiban Jam Kerja" (7,5 jam/hari)', () => {
    const hasil = rekapDariLaporanPdf(
      laporan([baris("03-06-2026", "Rabu", "07:30", "16:00", "WFO")], { kewajibanJamKerja: 150 })
    );
    expect(hasil.rekap.jumlahHariKerja).toBe(20);
  });

  it("melaporkan selisih dengan Summary Presensi bawaan PDF, tanpa mengikutinya", () => {
    // Summary bilang 1 hari tidak hadir, tapi baris gandanya sudah dibuang.
    const hasil = rekapDariLaporanPdf(
      laporan(
        [
          baris("22-06-2026", "Senin", "00:00", "00:00", "Cuti - Cuti Tahunan"),
          baris("22-06-2026", "Senin", "00:00", "00:00", "Tidak Hadir"),
        ],
        { tidakHadir: 1, cuti: 1 }
      )
    );
    expect(hasil.rekap.jumlahHariAlpha).toBe(0);
    expect(hasil.selisihRingkasan).toEqual([{ label: "Tidak Hadir", sumberPdf: 1, gajihub: 0 }]);
    expect(hasil.catatan.join(" ")).toContain("entri ganda");
  });

  it("memberi tahu kalau blok Summary di file memang tidak sinkron dengan tabelnya", () => {
    // Nyata di export Juli 2025: 28 baris detail, summary cuma menghitung 2.
    const isi = [
      baris("30-07-2025", "Rabu", "08:16", "16:56", "WFO"),
      baris("29-07-2025", "Selasa", "08:51", "17:20", "WFO"),
      baris("28-07-2025", "Senin", "09:11", "18:53", "WFO"),
      baris("25-07-2025", "Jumat", "00:00", "00:00", "Tidak Hadir"),
      baris("24-07-2025", "Kamis", "00:00", "00:00", "Tidak Hadir"),
      baris("23-07-2025", "Rabu", "09:29", "18:30", "WFO"),
    ];
    const hasil = rekapDariLaporanPdf(laporan(isi, { wfo: 1, tidakHadir: 1 }));
    expect(hasil.rekap.jumlahHariWfo).toBe(4);
    expect(hasil.rekap.jumlahHariAlpha).toBe(2);
    expect(hasil.catatan.join(" ")).toContain("tidak sinkron dengan tabel detailnya");
  });
});
