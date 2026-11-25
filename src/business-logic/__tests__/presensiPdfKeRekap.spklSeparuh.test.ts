import { describe, it, expect } from "vitest";
import { rekapDariLaporanPdf, JADWAL_KERJA_DEFAULT } from "../presensiPdfKeRekap";
import type { BarisPresensiPdf, LaporanPresensiPdf, RingkasanSumberPdf } from "../presensiPdf";

// Periode yang separuh di dalam gerbang SPKL: tanggal sebelum berlakuMulai
// tetap perilaku lama (tidak dinolkan), tanggal sesudahnya tunduk pada perintah.

const RINGKASAN_KOSONG: RingkasanSumberPdf = {
  tidakHadir: null, izin: null, tugasBelajar: null, lembur: null, tidakPresensi: null,
  cuti: null, upacaraBendera: null, dinasKeluar: null, wfo: null, diklat: null,
  wfh: null, wfa: null, kewajibanJamKerja: null, kekuranganJamKerja: null,
};

const jam = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null);
let urutan = 0;
function baris(tgl: string, hari: string, masuk: string, keluar: string, status: string): BarisPresensiPdf {
  const [dd, mm, yyyy] = tgl.split("-").map(Number);
  return {
    nomor: ++urutan, halaman: 1, tanggalTeks: `${hari}, ${tgl}`, namaHari: hari,
    tanggal: dd, bulan: mm, tahun: yyyy,
    jamMasukMenit: jam(masuk), jamKeluarMenit: jam(keluar), jamMasukTeks: masuk, jamKeluarTeks: keluar,
    lokasiKeluar: null, statusTeks: status, potonganTeks: "", aktivitas: null,
  };
}
const laporan = (isi: BarisPresensiPdf[]): LaporanPresensiPdf => ({
  nip: "199000100000000021", // sensitive-ok
  nama: "PEGAWAI UJI",
  jabatan: "Analis",
  periodeBulan: 7,
  periodeTahun: 2025,
  ringkasanSumber: RINGKASAN_KOSONG,
  baris: isi,
  halamanMulai: 1,
  peringatan: [],
});

const isi = () => [
  baris("10-07-2025", "Kamis", "07:30", "20:00", "WFO"), // sebelum gerbang: nyata 4
  baris("11-07-2025", "Jumat", "07:30", "19:00", "WFO"), // dalam gerbang: nyata 2, perintah 1
  baris("14-07-2025", "Senin", "07:30", "20:00", "WFO"), // dalam gerbang, tanpa perintah -> 0
];
const dariTanggal11 = (iso: string) => iso >= "2025-07-11";
const jalankan = (perintah: Map<string, number> | null, berlaku: ((iso: string) => boolean) | null) =>
  rekapDariLaporanPdf(laporan(isi()), JADWAL_KERJA_DEFAULT, new Set<string>(), new Map(), new Map(), perintah, berlaku);

describe("SPKL pada periode separuh di dalam gerbang", () => {
  it("tanggal sebelum gerbang memakai perilaku lama, jamLemburNyata null", () => {
    const hasil = jalankan(new Map([["2025-07-11", 1]]), dariTanggal11);
    const h10 = hasil.hari.find((h) => h.tanggalIso === "2025-07-10")!;
    expect(h10.jamLembur).toBe(4);
    expect(h10.jamLemburNyata).toBeNull();
    expect(h10.catatanLembur).toBeNull();
  });

  it("tanggal dalam gerbang dibatasi perintah; tanpa perintah dibayar 0", () => {
    const hasil = jalankan(new Map([["2025-07-11", 1]]), dariTanggal11);
    const h11 = hasil.hari.find((h) => h.tanggalIso === "2025-07-11")!;
    const h14 = hasil.hari.find((h) => h.tanggalIso === "2025-07-14")!;
    expect(h11.jamLembur).toBe(1);
    expect(h11.jamLemburNyata).toBe(2);
    expect(h14.jamLembur).toBe(0);
    expect(h14.jamLemburNyata).toBe(4);
  });

  it("total bulanan = jam lama sebelum gerbang + jam dibayar sesudahnya", () => {
    const hasil = jalankan(new Map([["2025-07-11", 1]]), dariTanggal11);
    expect(hasil.rekap.totalJamLembur).toBe(4 + 1);
    expect(hasil.rekap.jumlahHariLemburHariKerja).toBe(2);
  });

  it("tanpa predikat gerbang = seluruh bulan tunduk SPKL (perilaku 3a)", () => {
    const hasil = jalankan(new Map([["2025-07-11", 1]]), null);
    expect(hasil.rekap.totalJamLembur).toBe(1);
    expect(hasil.hari.every((h) => h.jamLemburNyata !== null)).toBe(true);
  });
});
