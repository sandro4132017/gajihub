import { describe, expect, it } from "vitest";
import {
  bandingkanSatuPegawai,
  ringkasBanding,
  type HariDibandingkan,
} from "../bandingRekapPresensi";
import type { BarisRekapPresensi } from "../rekapPresensi";

const REKAP_NOL: BarisRekapPresensi = {
  nip: "1",
  jumlahHariAlpha: 0,
  jumlahTidakPresensi: 0,
  totalMenitTerlambat: 0,
  totalMenitPulangCepat: 0,
  totalMenitMeninggalkanKantor: 0,
  jumlahTidakIkutUpacara: 0,
  jumlahHariKerja: 23,
  jumlahHariHadir: 0,
  jumlahHariWfo: 0,
  jumlahHariWfhWfa: 0,
  jumlahHariDiklat: 0,
  jumlahHariDinasLuar: 0,
  jumlahHariTugasBelajar: 0,
  jenisCutiAktif: null,
  bulanCutiKeberapa: null,
  jumlahHariCuti: 0,
  totalJamLembur: 0,
  totalJamLemburHariLibur: 0,
  jumlahHariMakanLembur: 0,
  jumlahHariMakanLemburHariLibur: 0,
};

const rekap = (o: Partial<BarisRekapPresensi>): BarisRekapPresensi => ({ ...REKAP_NOL, ...o });
const hari = (
  tanggalIso: string,
  status: string,
  jamMasukMenit: number | null = 450,
  jamKeluarMenit: number | null = 960
): HariDibandingkan => ({ tanggalIso, status, jamMasukMenit, jamKeluarMenit });

const banding = (o: {
  kelasJabatan?: number | null;
  petugas: { rekap: BarisRekapPresensi; hari: HariDibandingkan[] };
  gajihub: { rekap: BarisRekapPresensi; hari: HariDibandingkan[] };
}) =>
  bandingkanSatuPegawai({
    nip: "199001012020011001",
    nama: "Uji Coba",
    satuanKerja: "Biro Keuangan dan Barang Milik Negara",
    kelasJabatan: o.kelasJabatan === undefined ? 10 : o.kelasJabatan,
    petugas: o.petugas,
    gajihub: o.gajihub,
  });

describe("bandingkanSatuPegawai - beda harian", () => {
  it("data identik menghasilkan NOL beda", () => {
    const h = [hari("2026-07-06", "WFO"), hari("2026-07-07", "WFO")];
    const r = banding({ petugas: { rekap: rekap({}), hari: h }, gajihub: { rekap: rekap({}), hari: h } });
    expect(r.bedaHarian).toHaveLength(0);
    expect(r.bedaAngka).toHaveLength(0);
    expect(r.selisihRupiah).toBe(0);
  });

  it("WFO lawan WFH ditandai TIDAK berdampak", () => {
    // Keduanya wajib jam kerja & berhak uang makan tarif sama - tertukar di
    // antara keduanya tidak menggeser rupiah sepeser pun.
    const r = banding({
      petugas: { rekap: rekap({}), hari: [hari("2026-07-06", "WFO")] },
      gajihub: { rekap: rekap({}), hari: [hari("2026-07-06", "WFH")] },
    });
    expect(r.bedaHarian).toHaveLength(1);
    expect(r.bedaHarian[0].jenis).toBe("STATUS");
    expect(r.bedaHarian[0].berdampak).toBe(false);
  });

  it("status lama HADIR/TERLAMBAT dianggap sama dengan WFO", () => {
    const r = banding({
      petugas: { rekap: rekap({}), hari: [hari("2026-07-06", "WFO")] },
      gajihub: { rekap: rekap({}), hari: [hari("2026-07-06", "HADIR")] },
    });
    expect(r.bedaHarian).toHaveLength(0);
  });

  it("WFO lawan DINAS_LUAR ditandai BERDAMPAK", () => {
    // Gajihub membebaskan Dinas Luar dari keterlambatan; berkas petugas tidak.
    // Ini kasus Dian Nurlita 14 Juli 2026 (99 menit lawan 2 menit).
    const r = banding({
      petugas: { rekap: rekap({}), hari: [hari("2026-07-14", "WFO", 607)] },
      gajihub: { rekap: rekap({}), hari: [hari("2026-07-14", "DINAS_LUAR", 607)] },
    });
    expect(r.bedaHarian[0].berdampak).toBe(true);
  });

  it("CUTI lawan ALPHA ditandai BERDAMPAK - 3% per hari", () => {
    const r = banding({
      petugas: { rekap: rekap({}), hari: [hari("2026-07-06", "CUTI", null, null)] },
      gajihub: { rekap: rekap({}), hari: [hari("2026-07-06", "ALPHA", null, null)] },
    });
    expect(r.bedaHarian[0].berdampak).toBe(true);
  });

  it("beda jam masuk & jam keluar dilaporkan terpisah", () => {
    const r = banding({
      petugas: { rekap: rekap({}), hari: [hari("2026-07-06", "WFO", 500, 970)] },
      gajihub: { rekap: rekap({}), hari: [hari("2026-07-06", "WFO", 450, 960)] },
    });
    expect(r.bedaHarian.map((b) => b.jenis).sort()).toEqual(["JAM_KELUAR", "JAM_MASUK"]);
    expect(r.bedaHarian.find((b) => b.jenis === "JAM_MASUK")!.petugas).toBe("08:20");
    expect(r.bedaHarian.find((b) => b.jenis === "JAM_MASUK")!.gajihub).toBe("07:30");
  });

  it("23:59 di Gajihub lawan jam terisi di petugas diarahkan ke alur kendala", () => {
    // Persis pola 15 Juli 2026: petugas mengetik ulang 16:06, Gajihub memuat
    // 23:59 mentah dari e-Presensi. Jawabannya bukan mengetik di Excel.
    const r = banding({
      petugas: { rekap: rekap({}), hari: [hari("2026-07-15", "WFO", 476, 966)] },
      gajihub: { rekap: rekap({}), hari: [hari("2026-07-15", "WFO", 476, 1439)] },
    });
    const b = r.bedaHarian.find((x) => x.jenis === "JAM_KELUAR")!;
    expect(b.gajihub).toBe("23:59");
    expect(b.keterangan).toContain("Data e-Presensi Bermasalah");
  });

  it("tanggal yang cuma ada di satu sisi dilaporkan, bukan diabaikan", () => {
    const r = banding({
      petugas: { rekap: rekap({}), hari: [hari("2026-07-06", "WFO"), hari("2026-07-07", "WFO")] },
      gajihub: { rekap: rekap({}), hari: [hari("2026-07-06", "WFO"), hari("2026-07-08", "WFO")] },
    });
    expect(r.bedaHarian.map((b) => b.jenis)).toEqual(["HANYA_PETUGAS", "HANYA_GAJIHUB"]);
    expect(r.jumlahHariDibandingkan).toBe(1);
  });

  it("beda diurutkan menurut tanggal", () => {
    const r = banding({
      petugas: {
        rekap: rekap({}),
        hari: [hari("2026-07-20", "CUTI", null, null), hari("2026-07-06", "WFO", 500)],
      },
      gajihub: {
        rekap: rekap({}),
        hari: [hari("2026-07-20", "ALPHA", null, null), hari("2026-07-06", "WFO", 450)],
      },
    });
    expect(r.bedaHarian.map((b) => b.tanggalIso)).toEqual(["2026-07-06", "2026-07-20"]);
  });
});

describe("bandingkanSatuPegawai - angka & rupiah", () => {
  it("hanya angka yang benar-benar beda yang dilaporkan", () => {
    const r = banding({
      petugas: { rekap: rekap({ totalMenitTerlambat: 99, jumlahHariWfo: 13 }), hari: [] },
      gajihub: { rekap: rekap({ totalMenitTerlambat: 2, jumlahHariWfo: 13 }), hari: [] },
    });
    expect(r.bedaAngka).toHaveLength(1);
    expect(r.bedaAngka[0]).toEqual({ label: "Menit terlambat", petugas: 99, gajihub: 2, satuan: "menit" });
  });

  it("selisih rupiah dihitung dari tarif kelas jabatan x 30% x selisih persen", () => {
    // Kelas 10 = Rp 5.979.200. Selisih 97 menit x 0,01% = 0,97% dari bobot
    // kehadiran: 5.979.200 x 0,30 x 0,0097 = Rp 17.399,472 -> Rp 17.399.
    const r = banding({
      kelasJabatan: 10,
      petugas: { rekap: rekap({ totalMenitTerlambat: 99 }), hari: [] },
      gajihub: { rekap: rekap({ totalMenitTerlambat: 2 }), hari: [] },
    });
    expect(r.potonganPersenPetugas).toBeCloseTo(0.99, 6);
    expect(r.potonganPersenGajihub).toBeCloseTo(0.02, 6);
    expect(r.selisihRupiah).toBe(17399);
  });

  it("POSITIF berarti Gajihub membayar lebih besar dari hitungan petugas", () => {
    // Petugas memotong lebih banyak -> Gajihub membayar lebih -> positif.
    const r = banding({
      petugas: { rekap: rekap({ jumlahHariAlpha: 1 }), hari: [] },
      gajihub: { rekap: rekap({ jumlahHariAlpha: 0 }), hari: [] },
    });
    expect(r.selisihRupiah).toBeGreaterThan(0);

    const kebalikan = banding({
      petugas: { rekap: rekap({ jumlahHariAlpha: 0 }), hari: [] },
      gajihub: { rekap: rekap({ jumlahHariAlpha: 1 }), hari: [] },
    });
    expect(kebalikan.selisihRupiah).toBeLessThan(0);
  });

  it("kelas jabatan tidak diketahui: rupiah null, persen TETAP dilaporkan", () => {
    // Menebak kelas jabatan berarti menebak tarif berarti menebak nominal.
    const r = banding({
      kelasJabatan: null,
      petugas: { rekap: rekap({ totalMenitTerlambat: 99 }), hari: [] },
      gajihub: { rekap: rekap({ totalMenitTerlambat: 2 }), hari: [] },
    });
    expect(r.selisihRupiah).toBeNull();
    expect(r.potonganPersenPetugas).toBeCloseTo(0.99, 6);
  });
});

describe("ringkasBanding", () => {
  const buat = (bedaStatus: [string, string][], kelas: number | null = 10) =>
    banding({
      kelasJabatan: kelas,
      petugas: { rekap: rekap({}), hari: bedaStatus.map(([p], i) => hari(`2026-07-0${i + 1}`, p)) },
      gajihub: { rekap: rekap({}), hari: bedaStatus.map(([, g], i) => hari(`2026-07-0${i + 1}`, g)) },
    });

  it("memisahkan beda berdampak dari yang tidak", () => {
    const r = ringkasBanding([
      buat([
        ["WFO", "WFH"], // tidak berdampak
        ["CUTI", "ALPHA"], // berdampak
        ["WFO", "DINAS_LUAR"], // berdampak
      ]),
    ]);
    expect(r.jumlahBedaBerdampak).toBe(2);
    expect(r.jumlahBedaTidakBerdampak).toBe(1);
  });

  it("menghitung pegawai yang datanya identik", () => {
    const identik = buat([["WFO", "WFO"]]);
    const beda = buat([["CUTI", "ALPHA"]]);
    const r = ringkasBanding([identik, beda]);
    expect(r.jumlahPegawai).toBe(2);
    expect(r.jumlahPegawaiIdentik).toBe(1);
  });

  it("rupiah dijumlahkan MUTLAK - besarnya taruhan, bukan saling menghapus", () => {
    // Dua selisih berlawanan arah TIDAK boleh menghasilkan "nol masalah".
    const lebih = banding({
      petugas: { rekap: rekap({ jumlahHariAlpha: 1 }), hari: [] },
      gajihub: { rekap: rekap({ jumlahHariAlpha: 0 }), hari: [] },
    });
    const kurang = banding({
      petugas: { rekap: rekap({ jumlahHariAlpha: 0 }), hari: [] },
      gajihub: { rekap: rekap({ jumlahHariAlpha: 1 }), hari: [] },
    });
    expect(lebih.selisihRupiah! + kurang.selisihRupiah!).toBe(0);
    expect(ringkasBanding([lebih, kurang]).totalSelisihRupiahMutlak).toBeGreaterThan(0);
  });

  it("menghitung pegawai yang kelas jabatannya tidak diketahui", () => {
    const r = ringkasBanding([buat([["WFO", "WFO"]], null), buat([["WFO", "WFO"]], 10)]);
    expect(r.jumlahTanpaKelasJabatan).toBe(1);
  });
});
