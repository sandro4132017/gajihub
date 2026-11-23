import { describe, expect, it, vi } from "vitest";
import {
  urutanGolongan,
  hitungPegawaiUnikSpklHarian,
  muatDaftarSpklHarian,
  muatDaftarSpklHarianDenganUnik,
  muatRekapSpklHarian,
  susunDaftarSpklHarian,
  susunRekapSpklHarian,
  type BarisPerintahHarian,
} from "../rekapSpklHarian";
import { susunBarisLampiranSpklHarian } from "../../tte/spklHarianPdf";

const SATKER = "Biro Keuangan dan Barang Milik Negara";

const orang = (id: string, nip: string, nama: string, golongan: string | null, jam: number) => ({
  pegawaiId: id,
  nip, // sensitive-ok
  nama,
  golongan,
  jamDiperintahkan: jam,
});

const A = orang("a", "199001010000000021", "ZAINAL UJI", "III/c", 3); // sensitive-ok
const B = orang("b", "199001010000000022", "ANDI UJI", "II/d", 2); // sensitive-ok
const C = orang("c", "199001010000000023", "CICI UJI", null, 4); // sensitive-ok

const perintah = (
  tanggalIso: string,
  kepalaTimNama: string,
  uraianTugas: string,
  anggota: BarisPerintahHarian["anggota"],
): BarisPerintahHarian => ({ tanggalIso, kepalaTimNama, uraianTugas, anggota });

describe("susunRekapSpklHarian", () => {
  it("menggabungkan perintah semua kepala tim pada tanggal itu, urut golongan tertinggi dulu", () => {
    const hasil = susunRekapSpklHarian(
      [
        perintah("2026-12-10", "KEPALA SATU", "Laporan", [A, B]),
        perintah("2026-12-10", "KEPALA DUA", "Rekonsiliasi", [C]),
      ],
      SATKER,
      "2026-12-10",
    );
    // Zainal III/c, Andi II/d, Cici tanpa golongan.
    expect(hasil.baris.map((b) => b.nama)).toEqual(["Zainal Uji", "Andi Uji", "Cici Uji"]);
    expect(hasil.ringkasan).toEqual({ jumlahPerintah: 2, jumlahPegawai: 3, totalJam: 9 });
  });

  it("baris memuat nama, NIP, golongan (- bila kosong), jam, dan uraian", () => {
    const hasil = susunRekapSpklHarian(
      [perintah("2026-12-10", "KEPALA DUA", "Rekonsiliasi", [C])],
      SATKER,
      "2026-12-10",
    );
    expect(hasil.baris).toEqual([
      {
        nip: "199001010000000023", // sensitive-ok
        nama: "Cici Uji",
        golongan: "-",
        jam: 4,
        uraian: ["Rekonsiliasi"],
      },
    ]);
  });

  it("pegawai yang golongan dan namanya sama diurutkan menurut NIP", () => {
    const kembar = { ...A, pegawaiId: "c2", nip: "199001010000000020" }; // sensitive-ok
    const hasil = susunRekapSpklHarian([perintah("2026-12-10", "K", "u", [A, kembar])], SATKER, "2026-12-10");
    expect(hasil.baris[0].nip < hasil.baris[1].nip).toBe(true);
  });

  it("pegawai yang sama di dua perintah jadi satu baris: jam dijumlah, uraian digabung tanpa duplikat", () => {
    const hasil = susunRekapSpklHarian(
      [
        perintah("2026-12-10", "KEPALA SATU", "Laporan", [A]),
        perintah("2026-12-10", "KEPALA DUA", "Rekonsiliasi", [{ ...A, jamDiperintahkan: 1 }]),
        perintah("2026-12-10", "KEPALA TIGA", "Laporan", [{ ...A, jamDiperintahkan: 2 }]),
      ],
      SATKER,
      "2026-12-10",
    );
    expect(hasil.baris).toHaveLength(1);
    expect(hasil.baris[0].jam).toBe(6);
    expect(hasil.baris[0].uraian).toEqual(["Laporan", "Rekonsiliasi"]);
    expect(hasil.ringkasan).toEqual({ jumlahPerintah: 3, jumlahPegawai: 1, totalJam: 6 });
  });

  it("perPemberi: jumlah pegawai dan total jam per pemberi perintah, urut nama", () => {
    const hasil = susunRekapSpklHarian(
      [
        perintah("2026-12-10", "KEPALA SATU", "Laporan", [A, B]),
        perintah("2026-12-10", "KEPALA DUA", "Rekonsiliasi", [C]),
        perintah("2026-12-10", "KEPALA SATU", "Lain", [{ ...A, jamDiperintahkan: 1 }]),
      ],
      SATKER,
      "2026-12-10",
    );
    expect(hasil.perPemberi).toEqual([
      { nama: "Kepala Dua", jumlahPegawai: 1, totalJam: 4 },
      { nama: "Kepala Satu", jumlahPegawai: 2, totalJam: 6 },
    ]);
  });

  it("urutan: PNS tertinggi dulu, lalu PPPK tertinggi dulu, lalu tanpa golongan, lalu nama", () => {
    const o = (nip: string, nama: string, gol: string | null) => orang(nip, nip, nama, gol, 1);
    const hasil = susunRekapSpklHarian(
      [
        perintah("2026-12-10", "K", "u", [
          o("n1", "Tanpa Gol", null),
          o("n2", "Pppk Sembilan", "IX"),
          o("n3", "Pns Satu A", "I/a"),
          o("n4", "Pns Empat A", "IV/a"),
          o("n5", "Pppk Tujuh Belas", "XVII"),
          o("n6", "Pns Empat C", "IV/c"),
          o("n7", "Aaa Tanpa", null),
          o("n8", "Pns Tiga D", "III/d"),
        ]),
      ],
      SATKER,
      "2026-12-10",
    );
    expect(hasil.baris.map((b) => b.nama)).toEqual([
      "Pns Empat C",
      "Pns Empat A",
      "Pns Tiga D",
      "Pns Satu A",
      "Pppk Tujuh Belas",
      "Pppk Sembilan",
      "Aaa Tanpa",
      "Tanpa Gol",
    ]);
  });

  it("tanggal lain dibuang (pertahanan kedua)", () => {
    const hasil = susunRekapSpklHarian(
      [perintah("2026-12-11", "K", "u", [A]), perintah("2026-12-10", "K", "u", [B])],
      SATKER,
      "2026-12-10",
    );
    expect(hasil.baris.map((b) => b.nama)).toEqual(["Andi Uji"]);
  });

  it("satker di luar gerbang atau tanggal sebelum berlaku: kosong", () => {
    expect(susunRekapSpklHarian([perintah("2026-12-10", "K", "u", [A])], "Biro Lain", "2026-12-10").baris).toEqual([]);
    expect(susunRekapSpklHarian([perintah("2026-11-20", "K", "u", [A])], SATKER, "2026-11-20").baris).toEqual([]);
  });

  it("perintah tanpa anggota tidak dihitung", () => {
    const hasil = susunRekapSpklHarian([perintah("2026-12-10", "K", "u", [])], SATKER, "2026-12-10");
    expect(hasil.ringkasan).toEqual({ jumlahPerintah: 0, jumlahPegawai: 0, totalJam: 0 });
  });

  it("baris dapat dijadikan lampiran PDF", () => {
    const hasil = susunRekapSpklHarian([perintah("2026-12-10", "KEPALA SATU", "Laporan", [A])], SATKER, "2026-12-10");
    const [r] = susunBarisLampiranSpklHarian(hasil.baris, "2026-12-10");
    expect(r[3]).toBe("10");
    expect(r[4]).toBe("-Laporan");
  });
});

describe("susunDaftarSpklHarian", () => {
  it("satu baris per tanggal ber-perintah, urut naik, dengan ringkasan", () => {
    const daftar = susunDaftarSpklHarian(
      [
        perintah("2026-12-12", "K", "u", [A]),
        perintah("2026-12-10", "K1", "u", [A, B]),
        perintah("2026-12-10", "K2", "u", [C]),
      ],
      SATKER,
    );
    expect(daftar).toEqual([
      {
        tanggalIso: "2026-12-10",
        jumlahPerintah: 2,
        jumlahPegawai: 3,
        totalJam: 9,
        perPemberi: [
          { nama: "K1", jumlahPegawai: 2, totalJam: 5 },
          { nama: "K2", jumlahPegawai: 1, totalJam: 4 },
        ],
      },
      {
        tanggalIso: "2026-12-12",
        jumlahPerintah: 1,
        jumlahPegawai: 1,
        totalJam: 3,
        perPemberi: [{ nama: "K", jumlahPegawai: 1, totalJam: 3 }],
      },
    ]);
  });

  it("tanggal sebelum gerbang dibuang", () => {
    expect(susunDaftarSpklHarian([perintah("2026-11-20", "K", "u", [A])], SATKER)).toEqual([]);
  });
});

describe("hitungPegawaiUnikSpklHarian", () => {
  it("pegawai yang lembur di beberapa tanggal/perintah dihitung sekali", () => {
    const n = hitungPegawaiUnikSpklHarian(
      [
        perintah("2026-12-10", "K1", "u", [A, B]),
        perintah("2026-12-11", "K1", "u", [A]),
        perintah("2026-12-11", "K2", "u", [A, C]),
      ],
      SATKER,
    );
    expect(n).toBe(3); // orang-hari = 5
  });

  it("tanggal di luar gerbang tidak dihitung", () => {
    expect(hitungPegawaiUnikSpklHarian([perintah("2026-11-20", "K", "u", [A])], SATKER)).toBe(0);
  });
});

describe("pemuat", () => {
  const dbPalsu = (baris: unknown[]) => {
    const findMany = vi.fn().mockResolvedValue(baris);
    return { db: { perintahLembur: { findMany } } as never, findMany };
  };
  const rowDb = (tanggal: string) => ({
    tanggal: new Date(`${tanggal}T00:00:00Z`),
    uraianTugas: "Laporan",
    kepalaTim: { nama: "KEPALA UJI" },
    anggota: [
      {
        pegawaiId: "a",
        jamDiperintahkan: 3,
        pegawai: { nip: "199001010000000021", nama: "ZAINAL UJI", golongan: "III/c" }, // sensitive-ok
      },
    ],
  });

  it("muatRekapSpklHarian: satu query, hanya TERKIRIM, satker dan tanggal persis, anggota terkirim", async () => {
    const { db, findMany } = dbPalsu([rowDb("2026-12-10")]);
    const hasil = await muatRekapSpklHarian(db, SATKER, "2026-12-10");
    expect(findMany).toHaveBeenCalledTimes(1);
    const arg = findMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      satuanKerja: SATKER,
      status: "TERKIRIM",
      tanggal: new Date(Date.UTC(2026, 11, 10)),
    });
    expect(arg.select.anggota.where).toEqual({ terkirim: true });
    expect(hasil.baris).toHaveLength(1);
    expect(hasil.perPemberi[0].nama).toBe("Kepala Uji");
  });

  it("muatDaftarSpklHarianDenganUnik: tetap satu query, mengembalikan jumlah pegawai unik", async () => {
    const { db, findMany } = dbPalsu([rowDb("2026-12-10"), rowDb("2026-12-11")]);
    const hasil = await muatDaftarSpklHarianDenganUnik(db, SATKER, 12, 2026);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(hasil.daftar).toHaveLength(2);
    expect(hasil.jumlahPegawaiUnik).toBe(1); // pegawai yang sama di dua tanggal
  });

  it("muatDaftarSpklHarian: rentang satu bulan", async () => {
    const { db, findMany } = dbPalsu([rowDb("2026-12-10")]);
    const daftar = await muatDaftarSpklHarian(db, SATKER, 12, 2026);
    expect(findMany.mock.calls[0][0].where.tanggal).toEqual({
      gte: new Date(Date.UTC(2026, 11, 1)),
      lt: new Date(Date.UTC(2027, 0, 1)),
    });
    expect(daftar).toEqual([
      {
        tanggalIso: "2026-12-10",
        jumlahPerintah: 1,
        jumlahPegawai: 1,
        totalJam: 3,
        perPemberi: [{ nama: "Kepala Uji", jumlahPegawai: 1, totalJam: 3 }],
      },
    ]);
  });
});

describe("urutanGolongan", () => {
  it("PNS sebelum PPPK sebelum tanpa golongan", () => {
    expect(urutanGolongan("I/a")[0]).toBe(0);
    expect(urutanGolongan("IX")[0]).toBe(1);
    expect(urutanGolongan(null)[0]).toBe(2);
    expect(urutanGolongan("tidak jelas")[0]).toBe(2);
  });
});
