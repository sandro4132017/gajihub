import { describe, it, expect } from "vitest";
import {
  KOLOM_REKAP_PRESENSI,
  KOLOM_REKAP_TUKIN,
  labelJenisCuti,
  susunRekapPresensiExcel,
  susunRekapTukinExcel,
  type BarisRekapPresensi,
  type BarisRekapTukin,
} from "../rekapUnitExcel";

const presensiKosong: BarisRekapPresensi = {
  nip: "197303072005011001",
  nama: "Budi Santoso",
  jabatan: "Analis Keuangan",
  golongan: "III/c",
  jumlahHariKerja: 0,
  jumlahHariHadir: 0,
  jumlahHariWfo: 0,
  jumlahHariWfhWfa: 0,
  jumlahHariDiklat: 0,
  jumlahHariDinasLuar: 0,
  jumlahHariTugasBelajar: 0,
  jumlahHariAlpha: 0,
  jumlahTidakPresensi: 0,
  totalMenitTerlambat: 0,
  totalMenitPulangCepat: 0,
  totalMenitMeninggalkanKantor: 0,
  jumlahTidakIkutUpacara: 0,
  jenisCutiAktif: null,
  bulanCutiKeberapa: null,
  jumlahHariCuti: 0,
  totalJamLembur: 0,
  totalJamLemburHariLibur: 0,
  jumlahHariMakanLembur: 0,
  jumlahHariMakanLemburHariLibur: 0,
};

describe("susunRekapPresensiExcel", () => {
  it("menyusun satu baris per pegawai, bernomor urut, dengan lebar kolom seragam", () => {
    const hasil = susunRekapPresensiExcel([
      { ...presensiKosong, nama: "Budi" },
      { ...presensiKosong, nip: "198005152010012002", nama: "Ani" },
    ]);
    expect(hasil.baris).toHaveLength(2);
    expect(hasil.baris[0][0]).toBe(1);
    expect(hasil.baris[1][0]).toBe(2);
    // Header, tiap baris, dan baris total WAJIB sama lebarnya - kalau tidak,
    // kolom di Excel bergeser dan angka terbaca di bawah judul yang salah.
    expect(hasil.header).toHaveLength(KOLOM_REKAP_PRESENSI.length);
    for (const b of hasil.baris) expect(b).toHaveLength(KOLOM_REKAP_PRESENSI.length);
    expect(hasil.total).toHaveLength(KOLOM_REKAP_PRESENSI.length);
  });

  // NIP harus tetap STRING sepanjang lapisan murni. Begitu jadi number, 18
  // digit melewati presisi float dan tiga digit terakhirnya berubah nol.
  it("mempertahankan NIP sebagai teks, bukan angka", () => {
    const hasil = susunRekapPresensiExcel([presensiKosong]);
    expect(hasil.baris[0][1]).toBe("197303072005011001");
    expect(typeof hasil.baris[0][1]).toBe("string");
  });

  it("menjumlahkan kolom kuantitas di baris total", () => {
    const hasil = susunRekapPresensiExcel([
      { ...presensiKosong, jumlahHariAlpha: 2, totalMenitTerlambat: 30, totalJamLembur: 4 },
      { ...presensiKosong, jumlahHariAlpha: 1, totalMenitTerlambat: 15, totalJamLembur: 2.5 },
    ]);
    const i = (nama: string) => KOLOM_REKAP_PRESENSI.indexOf(nama as never);
    expect(hasil.total[i("Alpha (hari)")]).toBe(3);
    expect(hasil.total[i("Terlambat (menit)")]).toBe(45);
    expect(hasil.total[i("Jam Lembur")]).toBe(6.5);
    expect(hasil.total[2]).toBe("TOTAL");
  });

  // Ini yang paling gampang salah dan paling sulit ketahuan: angkanya numerik
  // dan penjumlahannya "berhasil", tapi hasilnya tidak berarti apa-apa.
  it("TIDAK menjumlahkan 'Cuti Bulan Ke-' - itu penanda urutan, bukan kuantitas", () => {
    const hasil = susunRekapPresensiExcel([
      { ...presensiKosong, jenisCutiAktif: "CUTI_SAKIT", bulanCutiKeberapa: 2, jumlahHariCuti: 10 },
      { ...presensiKosong, jenisCutiAktif: "CUTI_SAKIT", bulanCutiKeberapa: 3, jumlahHariCuti: 12 },
    ]);
    const i = (nama: string) => KOLOM_REKAP_PRESENSI.indexOf(nama as never);
    expect(hasil.total[i("Cuti Bulan Ke-")]).toBe("");
    // Hari cuti tetap dijumlahkan - itu memang kuantitas.
    expect(hasil.total[i("Hari Cuti")]).toBe(22);
  });

  it("menuliskan jenis cuti dalam bentuk yang terbaca, kosong kalau tidak cuti", () => {
    const i = KOLOM_REKAP_PRESENSI.indexOf("Jenis Cuti" as never);
    expect(susunRekapPresensiExcel([presensiKosong]).baris[0][i]).toBe("");
    expect(
      susunRekapPresensiExcel([{ ...presensiKosong, jenisCutiAktif: "CUTI_SAKIT" }]).baris[0][i]
    ).toBe("Cuti Sakit");
  });

  it("jabatan & golongan kosong jadi sel kosong, bukan tulisan null", () => {
    const hasil = susunRekapPresensiExcel([{ ...presensiKosong, jabatan: null, golongan: null }]);
    expect(hasil.baris[0][3]).toBe("");
    expect(hasil.baris[0][4]).toBe("");
  });

  it("daftar kosong tetap menghasilkan header dan total, bukan error", () => {
    const hasil = susunRekapPresensiExcel([]);
    expect(hasil.baris).toHaveLength(0);
    expect(hasil.header).toHaveLength(KOLOM_REKAP_PRESENSI.length);
    expect(hasil.total[2]).toBe("TOTAL");
  });
});

describe("labelJenisCuti", () => {
  it("mengubah nilai enum jadi teks yang terbaca", () => {
    expect(labelJenisCuti("CUTI_SAKIT")).toBe("Cuti Sakit");
    expect(labelJenisCuti("CUTI_SAKIT_GUGUR_KANDUNGAN")).toBe("Cuti Sakit Gugur Kandungan");
    expect(labelJenisCuti("CUTI_MELAHIRKAN_ANAK_1_2_3")).toBe("Cuti Melahirkan Anak 1 2 3");
  });
});

const tukinKosong: BarisRekapTukin = {
  nip: "197303072005011001",
  nama: "Budi Santoso",
  jabatan: "Analis Keuangan",
  kelasJabatan: 9,
  tukinPokok: 5_079_200,
  komponenKehadiran: 1_523_760,
  komponenKinerja: 3_555_440,
  potonganPph: 0,
  tukinBersih: 5_079_200,
  status: "DRAFT",
  catatanAnomali: null,
};

describe("susunRekapTukinExcel", () => {
  it("menjumlahkan seluruh kolom rupiah di baris total", () => {
    const hasil = susunRekapTukinExcel([
      tukinKosong,
      { ...tukinKosong, nip: "198005152010012002", tukinPokok: 1_000_000, tukinBersih: 900_000, potonganPph: 100_000 },
    ]);
    const i = (nama: string) => KOLOM_REKAP_TUKIN.indexOf(nama as never);
    expect(hasil.total[i("Tukin Pokok")]).toBe(6_079_200);
    expect(hasil.total[i("Potongan PPh")]).toBe(100_000);
    expect(hasil.total[i("Tukin Bersih")]).toBe(5_979_200);
    expect(hasil.total[2]).toBe("TOTAL");
  });

  // Status WAJIB ada di berkas. Tanpa kolom ini, rekap berisi baris DRAFT
  // terbaca seolah seluruhnya sudah disetujui - dan itu berkas yang dipakai
  // orang memutuskan pembayaran.
  it("membawa kolom Status apa adanya, bukan hanya yang APPROVED", () => {
    const hasil = susunRekapTukinExcel([
      { ...tukinKosong, status: "DRAFT" },
      { ...tukinKosong, nip: "198005152010012002", status: "APPROVED" },
      { ...tukinKosong, nip: "199001012015031003", status: "SELISIH" },
    ]);
    const i = KOLOM_REKAP_TUKIN.indexOf("Status" as never);
    expect(hasil.baris.map((b) => b[i])).toEqual(["DRAFT", "APPROVED", "SELISIH"]);
  });

  // Kelas jabatan kosong berarti tukin pokoknya memang tidak bisa dihitung.
  // Mengisinya nol menyamarkan fakta itu jadi "kelasnya nol".
  it("kelas jabatan kosong tetap kosong, tidak dijadikan nol", () => {
    const hasil = susunRekapTukinExcel([{ ...tukinKosong, kelasJabatan: null }]);
    expect(hasil.baris[0][4]).toBe("");
  });

  it("mempertahankan NIP sebagai teks", () => {
    expect(susunRekapTukinExcel([tukinKosong]).baris[0][1]).toBe("197303072005011001");
  });

  it("lebar header, baris, dan total seragam", () => {
    const hasil = susunRekapTukinExcel([tukinKosong]);
    expect(hasil.header).toHaveLength(KOLOM_REKAP_TUKIN.length);
    expect(hasil.baris[0]).toHaveLength(KOLOM_REKAP_TUKIN.length);
    expect(hasil.total).toHaveLength(KOLOM_REKAP_TUKIN.length);
  });
});
