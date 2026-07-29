// Default import (bukan named) - file ini jalan lewat tsx/CJS (skrip & test),
// BUKAN lewat bundler Next. Di kode app (Server Action) justru kebalikannya,
// lihat catatan di src/app/ppabp/gaji-induk/actions.ts.
import XLSX from "xlsx";
import type { EKinerjaAdapter } from "./DataSourceAdapter";
import type { CapaianKinerjaInput } from "../types/index";
import { parseRekapPredikatKinerja } from "../business-logic/rekapPredikatKinerja";

/**
 * Mock implementation yang mensimulasikan workaround saat ini: satker
 * mengunduh file rekap predikat dari portal e-Kinerja BKN lalu meng-upload
 * ke portal Gajihub. Method importFromUploadedFile mensimulasikan parsing
 * file tersebut jadi data terstruktur.
 *
 * TODO(saat PKS/MoU BKN selesai): buat RealEKinerjaAdapter yang menarik data
 * ini langsung via API BKN, implementasikan interface EKinerjaAdapter yang
 * sama, lalu tinggal ganti wiring di composition root - tidak ada kode lain
 * yang perlu berubah.
 */
export class MockEKinerjaAdapter implements EKinerjaAdapter {
  private data = new Map<string, CapaianKinerjaInput>();

  async getCapaianKinerjaPeriode(
    nip: string,
    periodeBulan: number,
    periodeTahun: number
  ): Promise<CapaianKinerjaInput | null> {
    const key = `${nip}-${periodeBulan}-${periodeTahun}`;
    return this.data.get(key) ?? null;
  }

  /**
   * Parsing file "Rekap Penilaian" hasil export portal e-Kinerja BKN.
   *
   * Dulu melempar error karena contoh filenya belum ada; sekarang formatnya
   * sudah diketahui dan pemetaannya ada di
   * src/business-logic/rekapPredikatKinerja.ts (PURE - dipakai bareng
   * Server Action upload di /predikat-kinerja, jadi CLI dan UI tidak punya
   * dua parser yang bisa berbeda perilaku).
   *
   * CATATAN: `pegawaiId` di hasil diisi NIP, konsisten dengan pemakaian
   * CapaianKinerjaInput di kalkulasi Tukin yang sudah ada
   * (src/app/kasubag/kalkulasi/actions.ts juga mengoper `pegawai.nip`).
   * Baris yang predikatnya tidak dikenali TIDAK ikut dikembalikan - lihat
   * `dilewati` kalau perlu tahu alasannya per baris.
   */
  async importFromUploadedFile(filePath: string): Promise<CapaianKinerjaInput[]> {
    const wb = XLSX.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error(`File ${filePath} tidak punya sheet yang bisa dibaca.`);

    const matriks = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: null });
    const hasil = parseRekapPredikatKinerja(matriks);
    if (hasil.error) throw new Error(hasil.error);

    return hasil.baris.map((b) => ({
      pegawaiId: b.nip,
      periodeBulan: hasil.periodeBulan,
      periodeTahun: hasil.periodeTahun,
      nilaiCapaianKinerjaPersen: b.nilaiAngka,
    }));
  }

  /** Helper khusus testing/demo untuk seed data tanpa file asli */
  seed(data: CapaianKinerjaInput): void {
    const key = `${data.pegawaiId}-${data.periodeBulan}-${data.periodeTahun}`;
    this.data.set(key, data);
  }
}
