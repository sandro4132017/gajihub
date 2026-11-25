import { describe, it, expect } from "vitest";
import { rekapDariLaporanPdf, JADWAL_KERJA_DEFAULT } from "../presensiPdfKeRekap";
import type { BarisPresensiPdf, LaporanPresensiPdf, RingkasanSumberPdf } from "../presensiPdf";

// Catatan "lembur HARI KERJA (tarif 1x)" tidak boleh tampil untuk hari yang
// jam dibayarnya jadi 0 karena tidak ada perintah lembur (SPKL).

const RINGKASAN_KOSONG: RingkasanSumberPdf = {
  tidakHadir: null, izin: null, tugasBelajar: null, lembur: null, tidakPresensi: null,
  cuti: null, upacaraBendera: null, dinasKeluar: null, wfo: null, diklat: null,
  wfh: null, wfa: null, kewajibanJamKerja: null, kekuranganJamKerja: null,
};

const jam = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const barisLembur: BarisPresensiPdf = {
  nomor: 1, halaman: 1, tanggalTeks: "Selasa, 07-07-2026", namaHari: "Selasa",
  tanggal: 7, bulan: 7, tahun: 2026,
  jamMasukMenit: jam("07:30"), jamKeluarMenit: jam("19:00"), jamMasukTeks: "07:30", jamKeluarTeks: "19:00",
  lokasiKeluar: null, statusTeks: "Lembur", potonganTeks: "", aktivitas: null,
};
const laporan: LaporanPresensiPdf = {
  nip: "199000100000000022", // sensitive-ok
  nama: "PEGAWAI UJI",
  jabatan: "Analis",
  periodeBulan: 7,
  periodeTahun: 2026,
  ringkasanSumber: RINGKASAN_KOSONG,
  baris: [barisLembur],
  halamanMulai: 1,
  peringatan: [],
};
const jalankan = (perintah: Map<string, number> | null) =>
  rekapDariLaporanPdf(laporan, JADWAL_KERJA_DEFAULT, new Set<string>(), new Map(), new Map(), perintah, null);
const adaCatatanTarif = (catatan: string[]) => catatan.some((c) => c.includes("lembur HARI KERJA (tarif 1x)"));

describe("catatan lembur hari kerja tarif 1x", () => {
  it("tanpa SPKL: catatan tetap tampil (perilaku lama)", () => {
    const hasil = jalankan(null);
    expect(hasil.rekap.totalJamLembur).toBeGreaterThan(0);
    expect(adaCatatanTarif(hasil.catatan)).toBe(true);
  });

  it("SPKL tanpa perintah di tanggal itu: jam dibayar 0, catatan tarif 1x tidak tampil", () => {
    const hasil = jalankan(new Map());
    expect(hasil.rekap.totalJamLembur).toBe(0);
    expect(adaCatatanTarif(hasil.catatan)).toBe(false);
  });
});
