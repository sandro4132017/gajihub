import type { EKinerjaAdapter } from "./DataSourceAdapter";
import type { CapaianKinerjaInput } from "../types/index";

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
   * Simulasi parsing file upload manual (format asli file e-Kinerja BKN
   * perlu dikonfirmasi - CSV/Excel dengan kolom NIP, Predikat, Periode).
   * Untuk sekarang, terima array langsung sebagai stand-in.
   */
  async importFromUploadedFile(
    _filePath: string
  ): Promise<CapaianKinerjaInput[]> {
    throw new Error(
      "Belum diimplementasi - tunggu contoh format file rekap predikat dari e-Kinerja BKN untuk menentukan parser yang sesuai."
    );
  }

  /** Helper khusus testing/demo untuk seed data tanpa file asli */
  seed(data: CapaianKinerjaInput): void {
    const key = `${data.pegawaiId}-${data.periodeBulan}-${data.periodeTahun}`;
    this.data.set(key, data);
  }
}
