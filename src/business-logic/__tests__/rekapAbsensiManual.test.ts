import { describe, expect, it } from "vitest";
import {
  parseRekapAbsensiManual,
  pecahanKeMenit,
  serialKeTanggal,
  samakanStatus,
} from "../rekapAbsensiManual";
import { rekapDariLaporanPdf } from "../presensiPdfKeRekap";

// Susunan kolom persis berkas asli, TERMASUK pergeseran judulnya: kolom
// sesudah "Hari" tidak punya judul, dan "Keterangan Cuti" ada di kolom
// berikutnya - sementara datanya justru sebaliknya.
const JUDUL = [
  "No", "Nama Pegawai", "NIP", "Tanggal", "Hari", "", "Keterangan Cuti",
  "Checkin", "Checkout", "Jam Harus Checkout", "Jam Masuk", "Jam Toleransi Masuk",
  "Jam Pulang", "Jam Toleransi Pulang", "Terlambat", "Menit Kerja",
  "Kekurangan Jam Kerja", "Jumlah Menit Kekurangan Harian", "Persentase Potongan Harian",
];
const NOMOR = JUDUL.map((_, i) => i + 1);

const JAM = (h: number, m: number) => (h * 60 + m) / (24 * 60);
/** 2026-07-06 = Senin. */
const SERIAL_6_JULI_2026 = 46209;

function baris(o: {
  nama?: string; nip?: string; serial?: number; hari?: string; status?: string;
  masuk?: number | null; keluar?: number | null;
}) {
  const r: unknown[] = new Array(19).fill(null);
  r[0] = 1;
  r[1] = o.nama ?? "Uji Coba";
  r[2] = o.nip ?? "199001012020011001";
  r[3] = o.serial ?? SERIAL_6_JULI_2026;
  r[4] = o.hari ?? "Senin";
  r[5] = o.status ?? "WFO";
  r[7] = o.masuk === undefined ? JAM(7, 30) : o.masuk;
  r[8] = o.keluar === undefined ? JAM(16, 0) : o.keluar;
  // Kolom hasil hitungan berkas - sengaja diisi nilai NGAWUR di sebagian test
  // untuk membuktikan parser tidak memakainya.
  r[14] = 999;
  r[15] = -59;
  r[18] = 0.02;
  return r;
}

const sheet = (isi: unknown[][]) => [JUDUL, NOMOR, ...isi];

describe("pecahanKeMenit", () => {
  it("membaca pecahan hari Excel jadi menit", () => {
    expect(pecahanKeMenit(0.3125)).toBe(450); // 07:30
    expect(pecahanKeMenit(0.6666666666666666)).toBe(960); // 16:00
    expect(pecahanKeMenit(0.6875)).toBe(990); // 16:30
  });

  it("NOL dibaca sebagai sel kosong, bukan tengah malam", () => {
    // Baris cuti di berkas asli selalu berisi 0/0. Membacanya sebagai 00:00
    // menghasilkan "terlambat 450 menit" untuk orang yang sedang cuti.
    expect(pecahanKeMenit(0)).toBeNull();
    expect(pecahanKeMenit(null)).toBeNull();
    expect(pecahanKeMenit("")).toBeNull();
  });

  it("sel berisi tanggal+jam tetap terbaca jamnya saja", () => {
    expect(pecahanKeMenit(46209.3125)).toBe(450);
  });
});

describe("serialKeTanggal", () => {
  it("membaca serial Excel dengan epoch 1899-12-30", () => {
    expect(serialKeTanggal(SERIAL_6_JULI_2026)).toEqual({ tanggal: 6, bulan: 7, tahun: 2026 });
  });

  it("menolak nilai yang jelas bukan tanggal", () => {
    expect(serialKeTanggal(0)).toBeNull();
    expect(serialKeTanggal("bukan tanggal")).toBeNull();
    expect(serialKeTanggal(null)).toBeNull();
  });
});

describe("samakanStatus", () => {
  it("menyisipkan tanda hubung supaya jenis cutinya terbaca", () => {
    // Tanpa ini kategoriDariStatus() mengembalikan jenisCuti null, dan Pasal 14
    // tidak pernah berjalan - pegawai cuti besar terbayar penuh.
    expect(samakanStatus("Cuti tahunan")).toBe("Cuti - Cuti tahunan");
    expect(samakanStatus("Cuti Bersalin")).toBe("Cuti - Cuti Bersalin");
  });

  it("tidak menyentuh status yang sudah bertanda hubung atau bukan cuti", () => {
    expect(samakanStatus("Cuti - Cuti Besar II")).toBe("Cuti - Cuti Besar II");
    expect(samakanStatus("WFO")).toBe("WFO");
    expect(samakanStatus("Dinas Luar")).toBe("Dinas Luar");
  });
});

describe("parseRekapAbsensiManual", () => {
  it("membaca baris jadi laporan per pegawai", () => {
    const hasil = parseRekapAbsensiManual(
      sheet([
        baris({ nip: "111", nama: "Ani" }),
        baris({ nip: "111", nama: "Ani", serial: SERIAL_6_JULI_2026 + 1, hari: "Selasa" }),
        baris({ nip: "222", nama: "Budi" }),
      ])
    );
    expect(hasil.laporan).toHaveLength(2);
    const ani = hasil.laporan.find((l) => l.nip === "111")!;
    expect(ani.nama).toBe("Ani");
    expect(ani.periodeBulan).toBe(7);
    expect(ani.periodeTahun).toBe(2026);
    expect(ani.baris).toHaveLength(2);
    expect(ani.baris[0].jamMasukTeks).toBe("07:30");
    expect(ani.baris[0].jamKeluarTeks).toBe("16:00");
  });

  it("kolom status dicari lewat POSISI, bukan judul", () => {
    // Judul kolom status kosong di berkas asli; kalau dicari lewat judul,
    // "Keterangan Cuti" yang keambil dan seluruh status jadi kosong.
    const hasil = parseRekapAbsensiManual(sheet([baris({ status: "Dinas Luar" })]));
    expect(hasil.laporan[0].baris[0].statusTeks).toBe("Dinas Luar");
  });

  it("TIDAK memakai kolom hitungan berkas (Terlambat / Menit Kerja)", () => {
    // Kolom Terlambat diisi 999 dan Menit Kerja -59 di helper baris(). Kalau
    // parser memungutnya, rekap hasil mesin Gajihub akan ikut ngawur.
    const hasil = parseRekapAbsensiManual(sheet([baris({ masuk: JAM(7, 30) })]));
    const rekap = rekapDariLaporanPdf(hasil.laporan[0]);
    expect(rekap.rekap.totalMenitTerlambat).toBe(0);
    expect(hasil.laporan[0].baris[0].menitKerja).toBeNull();
  });

  it("hasilnya bisa langsung dihitung mesin Pasal 13 yang sama", () => {
    // Masuk 09:10 = 100 menit lewat 07:30; toleransi 60 -> 40 menit.
    const hasil = parseRekapAbsensiManual(sheet([baris({ masuk: JAM(9, 10) })]));
    const rekap = rekapDariLaporanPdf(hasil.laporan[0]);
    expect(rekap.rekap.totalMenitTerlambat).toBe(40);
    expect(rekap.rekap.jumlahHariWfo).toBe(1);
  });

  it("keterlambatan pada Dinas Luar TIDAK dihitung - beda dari berkas petugas", () => {
    // Inilah penyaringan yang selama ini dikerjakan petugas dengan tangan.
    const hasil = parseRekapAbsensiManual(
      sheet([baris({ status: "Dinas Luar", masuk: JAM(10, 0) })])
    );
    expect(rekapDariLaporanPdf(hasil.laporan[0]).rekap.totalMenitTerlambat).toBe(0);
  });

  it("jenis cuti terbawa sampai ke rekap", () => {
    const hasil = parseRekapAbsensiManual(
      sheet([baris({ status: "Cuti tahunan", masuk: 0, keluar: 0 })])
    );
    const rekap = rekapDariLaporanPdf(hasil.laporan[0]);
    expect(rekap.rekap.jenisCutiAktif).toBe("CUTI_TAHUNAN");
    expect(rekap.rekap.jumlahHariCuti).toBe(1);
  });

  it("jam keluar LEBIH PAGI dari jam masuk wajib bukan ketukan pulang", () => {
    // Kasus nyata: Nurul Apriyanah 1 Juli 2026 WFO, masuk 06:03 keluar 06:06.
    // Dibaca mentah jadi "pulang cepat 594 menit" - padahal rincian tunkin
    // resmi cuma menagihnya 8 menit sebulan. Orang tidak bisa pulang sebelum
    // jam kerjanya dimulai.
    const hasil = parseRekapAbsensiManual(
      sheet([baris({ masuk: JAM(6, 3), keluar: JAM(6, 6) })])
    );
    expect(hasil.laporan[0].baris[0].jamKeluarMenit).toBeNull();
    const rekap = rekapDariLaporanPdf(hasil.laporan[0]);
    expect(rekap.rekap.totalMenitPulangCepat).toBe(0);
    // Tetap dihitung sebagai kejadian Pasal 13 ayat (2) - tap pulangnya memang
    // tidak ada, sama seperti sisi e-Presensi yang mengisinya 23:59.
    expect(rekap.rekap.jumlahTidakPresensi).toBe(1);
  });

  it("satu ketukan tersalin ke dua kolom juga bukan ketukan pulang", () => {
    // Selisih semenit di SORE hari - pola yang sama sudah didokumentasikan di
    // jalur PDF ("masuk 19:46, pulang 19:47").
    const hasil = parseRekapAbsensiManual(
      sheet([baris({ masuk: JAM(20, 0), keluar: JAM(20, 1) })])
    );
    expect(hasil.laporan[0].baris[0].jamKeluarMenit).toBeNull();
    expect(rekapDariLaporanPdf(hasil.laporan[0]).rekap.totalMenitPulangCepat).toBe(0);
  });

  it("jam keluar yang WAJAR tidak diutak-atik", () => {
    // Penjaga supaya aturan di atas tidak kebablasan memakan hari normal.
    const hasil = parseRekapAbsensiManual(
      sheet([baris({ masuk: JAM(7, 30), keluar: JAM(15, 30) })])
    );
    expect(hasil.laporan[0].baris[0].jamKeluarTeks).toBe("15:30");
    // Pulang 15:30 dari wajib 16:00 = 30 menit pulang cepat, tetap ditagih.
    expect(rekapDariLaporanPdf(hasil.laporan[0]).rekap.totalMenitPulangCepat).toBe(30);
  });

  it("baris tanpa NIP atau tanggal DILEWATI dengan alasan, bukan diam-diam", () => {
    const hasil = parseRekapAbsensiManual(
      sheet([baris({}), baris({ nip: "" }), baris({ serial: 0 })])
    );
    expect(hasil.laporan).toHaveLength(1);
    expect(hasil.dilewati).toHaveLength(2);
    expect(hasil.dilewati.map((d) => d.alasan).join(" ")).toContain("NIP kosong");
    expect(hasil.dilewati.map((d) => d.alasan).join(" ")).toContain("tanggal tidak terbaca");
  });

  it("nomor baris yang dilaporkan sama dengan yang dilihat user di Excel", () => {
    const hasil = parseRekapAbsensiManual(sheet([baris({}), baris({ nip: "" })]));
    // judul=1, nomor=2, data mulai baris 3 -> baris rusak ada di baris 4.
    expect(hasil.dilewati[0].baris).toBe(4);
  });

  it("menolak sheet yang kolom wajibnya tidak ada", () => {
    const hasil = parseRekapAbsensiManual([["Kolom", "Ngawur"], ["1", "2"], ["a", "b"]]);
    expect(hasil.laporan).toHaveLength(0);
    expect(hasil.peringatan[0]).toContain("Kolom wajib tidak ketemu");
    expect(hasil.peringatan[0]).toContain("NIP");
  });

  it("sheet kosong tidak melempar error", () => {
    expect(parseRekapAbsensiManual([]).laporan).toHaveLength(0);
    expect(parseRekapAbsensiManual([[]]).laporan).toHaveLength(0);
  });

  it("periode diambil dari bulan yang paling banyak muncul", () => {
    const hasil = parseRekapAbsensiManual(
      sheet([
        baris({ serial: SERIAL_6_JULI_2026 - 6 }), // 30 Juni
        baris({ serial: SERIAL_6_JULI_2026 }),
        baris({ serial: SERIAL_6_JULI_2026 + 1 }),
      ])
    );
    expect(hasil.laporan[0].periodeBulan).toBe(7);
  });
});
