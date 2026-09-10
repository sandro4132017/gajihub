import { describe, expect, it } from "vitest";
import {
  TEMUAN,
  periksaKesiapanKalkulasi,
  periksaSatuPegawai,
  type FaktaPegawai,
  type RekapUntukPeriksa,
} from "../kesiapanKalkulasi";

const rekapBaik: RekapUntukPeriksa = {
  jumlahHariKerja: 20,
  jumlahHariHadir: 20,
  jumlahHariCuti: 0,
  jumlahHariDinasLuar: 0,
  jumlahHariDiklat: 0,
  jumlahHariTugasBelajar: 0,
  jenisCutiAktif: null,
  bulanCutiKeberapa: null,
};

const pegawaiBaik: FaktaPegawai = {
  nip: "199311012020121014",
  nama: "ABDUL RAHMAN WAHID",
  kelasJabatan: 7,
  rekap: rekapBaik,
  adaPredikat: true,
  jumlahKoreksi: 0,
};

describe("periksaSatuPegawai - data lengkap", () => {
  it("pegawai yang datanya lengkap tidak menghasilkan temuan apa pun", () => {
    expect(periksaSatuPegawai(pegawaiBaik)).toEqual([]);
  });

  it("presensi yang pernah dikoreksi BUKAN temuan", () => {
    // Koreksi jam adalah pekerjaan yang sudah dilakukan dengan benar, bukan
    // cacat data. Dihitung terpisah supaya bisa ditampilkan, tapi tidak boleh
    // membuat orangnya terhitung "perlu diperiksa".
    expect(periksaSatuPegawai({ ...pegawaiBaik, jumlahKoreksi: 3 })).toEqual([]);
  });
});

describe("periksaSatuPegawai - kehadiran", () => {
  it("rekap presensi yang belum ada menghentikan pemeriksaan kehadiran", () => {
    const t = periksaSatuPegawai({ ...pegawaiBaik, rekap: null });
    // SATU sebab, SATU temuan. Tanpa rekap, "hari kerja 0" dan "tidak ada
    // kehadiran" ikut benar semua - dan tiga temuan untuk satu sebab membuat
    // angka di layar berlipat tanpa menambah keterangan.
    expect(t).toEqual(["PRESENSI_BELUM_ADA"]);
  });

  it("hari kerja 0 ditandai sebagai penghalang", () => {
    const t = periksaSatuPegawai({
      ...pegawaiBaik,
      rekap: { ...rekapBaik, jumlahHariKerja: 0, jumlahHariHadir: 0 },
    });
    expect(t).toEqual(["HARI_KERJA_NOL"]);
    expect(TEMUAN.HARI_KERJA_NOL.tingkat).toBe("HALANG");
  });

  it("hari hadir melebihi hari kerja ditandai - gejala kalender libur belum lengkap", () => {
    const t = periksaSatuPegawai({
      ...pegawaiBaik,
      rekap: { ...rekapBaik, jumlahHariKerja: 19, jumlahHariHadir: 21 },
    });
    expect(t).toContain("HADIR_MELEBIHI_HARI_KERJA");
  });

  it("sebulan tanpa jejak kehadiran apa pun ditandai", () => {
    const t = periksaSatuPegawai({
      ...pegawaiBaik,
      rekap: { ...rekapBaik, jumlahHariHadir: 0 },
    });
    expect(t).toContain("TIDAK_ADA_KEHADIRAN");
  });

  it("dinas luar / diklat / tugas belajar dihitung sebagai jejak kehadiran", () => {
    // Orang yang sebulan penuh dinas luar memang nol hari hadir di kantor.
    // Menandainya berarti menandai seluruh peserta diklat panjang tiap bulan.
    for (const kolom of ["jumlahHariDinasLuar", "jumlahHariDiklat", "jumlahHariTugasBelajar"] as const) {
      const t = periksaSatuPegawai({
        ...pegawaiBaik,
        rekap: { ...rekapBaik, jumlahHariHadir: 0, [kolom]: 20 },
      });
      expect(t, kolom).not.toContain("TIDAK_ADA_KEHADIRAN");
    }
  });
});

describe("periksaSatuPegawai - cuti panjang tanpa bulan", () => {
  const cutiSebulan: RekapUntukPeriksa = {
    ...rekapBaik,
    jumlahHariHadir: 0,
    jumlahHariCuti: 20,
    jenisCutiAktif: "CUTI_SAKIT",
    bulanCutiKeberapa: null,
  };

  it("cuti sakit sebulan penuh tanpa keterangan bulan ditandai", () => {
    expect(periksaSatuPegawai({ ...pegawaiBaik, rekap: cutiSebulan })).toContain("CUTI_PANJANG_TANPA_BULAN");
  });

  it("TIDAK ditandai kalau bulannya diketahui", () => {
    const t = periksaSatuPegawai({
      ...pegawaiBaik,
      rekap: { ...cutiSebulan, bulanCutiKeberapa: 2 },
    });
    expect(t).not.toContain("CUTI_PANJANG_TANPA_BULAN");
  });

  it("TIDAK ditandai untuk sakit sehari dua hari", () => {
    // Ambang 80% ada supaya peringatannya berarti. Tanpa itu, tiap orang yang
    // sakit sehari ikut ditandai - pada data nyata 1.500 baris, dan peringatan
    // yang berbunyi 1.500 kali sama saja dengan tidak ada peringatan.
    const t = periksaSatuPegawai({
      ...pegawaiBaik,
      rekap: { ...cutiSebulan, jumlahHariCuti: 2, jumlahHariHadir: 18 },
    });
    expect(t).not.toContain("CUTI_PANJANG_TANPA_BULAN");
  });

  it("TIDAK ditandai untuk cuti tahunan - potongannya tidak bertingkat per bulan", () => {
    const t = periksaSatuPegawai({
      ...pegawaiBaik,
      rekap: { ...cutiSebulan, jenisCutiAktif: "CUTI_TAHUNAN" },
    });
    expect(t).not.toContain("CUTI_PANJANG_TANPA_BULAN");
  });
});

describe("periksaSatuPegawai - kinerja", () => {
  it("predikat yang belum ada ditandai", () => {
    expect(periksaSatuPegawai({ ...pegawaiBaik, adaPredikat: false })).toContain("PREDIKAT_BELUM_ADA");
  });

  it("predikat pejabat pimpinan tinggi dipisah dari staf biasa", () => {
    // Tindak lanjutnya berbeda: predikat staf ditagih ke penilai di unit ini,
    // predikat JPT ke penilai di atasnya.
    const jpt = periksaSatuPegawai({ ...pegawaiBaik, adaPredikat: false, kelasJabatan: 15 });
    expect(jpt).toContain("PREDIKAT_JPT_BELUM_ADA");
    expect(jpt).not.toContain("PREDIKAT_BELUM_ADA");
  });

  it("kelas jabatan kosong: dilaporkan sebagai kelas kosong, predikatnya tetap staf", () => {
    const t = periksaSatuPegawai({ ...pegawaiBaik, adaPredikat: false, kelasJabatan: null });
    expect(t).toContain("KELAS_JABATAN_KOSONG");
    expect(t).toContain("PREDIKAT_BELUM_ADA");
  });
});

describe("periksaSatuPegawai - identitas", () => {
  it("NIP yang bukan 18 digit ditandai", () => {
    expect(periksaSatuPegawai({ ...pegawaiBaik, nip: "19931101202012101" })).toContain("NIP_TIDAK_SAH");
    // NIP yang tiga digit terakhirnya jadi 000 karena disimpan sebagai angka
    // di Excel TETAP 18 digit - itu cacat yang berbeda dan tidak tertangkap
    // di sini. Tempatnya di jalur unggahan basis data gaji.
    expect(periksaSatuPegawai({ ...pegawaiBaik, nip: "196906202003121000" })).not.toContain("NIP_TIDAK_SAH");
  });
});

describe("periksaKesiapanKalkulasi", () => {
  const unit: FaktaPegawai[] = [
    pegawaiBaik,
    { ...pegawaiBaik, nip: "199311012020121015", nama: "B", jumlahKoreksi: 2 },
    { ...pegawaiBaik, nip: "199311012020121016", nama: "C", adaPredikat: false },
    { ...pegawaiBaik, nip: "199311012020121017", nama: "D", rekap: null },
  ];

  it("menghitung lengkap vs perlu diperiksa", () => {
    const r = periksaKesiapanKalkulasi(unit);
    expect(r.jumlahDiperiksa).toBe(4);
    expect(r.jumlahLengkap).toBe(2);
    expect(r.jumlahPerluDiperiksa).toBe(2);
    expect(r.jumlahTerhalang).toBe(2);
    // Dua angka pertama HARUS menjumlah ke total - kalau tidak, pembacanya
    // kehilangan kepercayaan pada seluruh panel.
    expect(r.jumlahLengkap + r.jumlahPerluDiperiksa).toBe(r.jumlahDiperiksa);
  });

  it("koreksi presensi dihitung terpisah, tidak mengurangi yang lengkap", () => {
    const r = periksaKesiapanKalkulasi(unit);
    expect(r.jumlahAdaKoreksi).toBe(1);
    expect(r.jumlahLengkap).toBe(2);
  });

  it("mengelompokkan per jenis, penghalang lebih dulu", () => {
    const r = periksaKesiapanKalkulasi(unit);
    const tingkat = r.perJenis.map((x) => TEMUAN[x.jenis].tingkat);
    expect(tingkat).toEqual([...tingkat].sort((a, b) => (a === "HALANG" ? -1 : b === "HALANG" ? 1 : 0)));
    const predikat = r.perJenis.find((x) => x.jenis === "PREDIKAT_BELUM_ADA");
    expect(predikat?.jumlah).toBe(1);
    expect(predikat?.pegawai[0]?.nama).toBe("C");
  });

  it("unit kosong tidak meledak", () => {
    const r = periksaKesiapanKalkulasi([]);
    expect(r).toMatchObject({ jumlahDiperiksa: 0, jumlahLengkap: 0, jumlahPerluDiperiksa: 0, perJenis: [] });
  });

  it("tiap jenis temuan punya label dan tindakan yang terisi", () => {
    for (const [jenis, isi] of Object.entries(TEMUAN)) {
      expect(isi.label.length, jenis).toBeGreaterThan(0);
      // Tindakan harus menyebutkan apa yang dilakukan, bukan mengulang label.
      expect(isi.tindakan.length, jenis).toBeGreaterThan(isi.label.length);
    }
  });
});
