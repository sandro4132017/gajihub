// ============================================================================
// ADAPTER PATTERN - kontrak buat semua sumber data eksternal
//
// KENAPA INI PENTING:
// Akses API resmi ke e-Kinerja BKN dan SAKTI masih informal (belum ada
// PKS/MoU per catatan RAP). Supaya piloting September 2026 tetap bisa jalan
// tanpa nunggu akses resmi, SEMUA pemanggilan data eksternal HARUS lewat
// interface ini - implementasi konkretnya bisa Mock (baca file/upload manual)
// atau Real (API asli), tanpa mengubah kode business logic engine sama sekali.
//
// Cara pakai: business logic engine & job scheduler HANYA bergantung pada
// interface ini (DataSourceAdapter), TIDAK PERNAH import MockXxxAdapter atau
// RealXxxAdapter secara langsung. Pemilihan implementasi mana yang dipakai
// terjadi di satu tempat (composition root / dependency injection), biasanya
// lewat environment variable, misal: DATA_SOURCE_MODE=mock|api
// ============================================================================

import type {
  RekapKehadiranPeriode,
  CapaianKinerjaInput,
} from "../types/index";

export interface PegawaiRecord {
  nip: string;
  nama: string;
  unitKerja: string;
  satuanKerja: string;
  statusPegawai: string;
  jabatan?: string;
  golongan?: string;
  kelasJabatan?: number; // dipakai untuk lookup tukinPokokKelasJabatan
}

/** Adapter untuk aplikasi SIAP - sumber data identitas & SK kepegawaian */
export interface SiapAdapter {
  getPegawaiAktif(satuanKerja?: string): Promise<PegawaiRecord[]>;
  getPegawaiByNip(nip: string): Promise<PegawaiRecord | null>;
}

/** Adapter untuk aplikasi e-Presensi - sumber data kehadiran harian */
export interface PresensiAdapter {
  getRekapKehadiranPeriode(
    nip: string,
    periodeBulan: number,
    periodeTahun: number
  ): Promise<RekapKehadiranPeriode>;
}

/**
 * Adapter untuk e-Kinerja BKN.
 * PENTING: sesuai workaround di RAP, cara resmi saat ini adalah satker
 * mengunduh file rekap predikat dari portal e-Kinerja BKN lalu upload ke
 * portal Gajihub - BUKAN pull otomatis via API (karena akses API belum ada
 * dasar formalnya). MockEKinerjaAdapter mengimplementasikan alur upload
 * manual ini; RealEKinerjaAdapter (API) baru dibuat setelah PKS/MoU dengan
 * BKN selesai.
 */
export interface EKinerjaAdapter {
  getCapaianKinerjaPeriode(
    nip: string,
    periodeBulan: number,
    periodeTahun: number
  ): Promise<CapaianKinerjaInput | null>;
  /** Untuk MockEKinerjaAdapter: proses file upload manual jadi data terstruktur */
  importFromUploadedFile?(filePath: string): Promise<CapaianKinerjaInput[]>;
}

export interface DataSourceBundle {
  siap: SiapAdapter;
  presensi: PresensiAdapter;
  eKinerja: EKinerjaAdapter;
}
