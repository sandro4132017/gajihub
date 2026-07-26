// ============================================================================
// STRUKTUR UNIT ESELON I/II - lookup statis, sumber: "Struktur unit kemnaker
// sd eselon II.xlsx" (dari user, Juli 2026). Dipakai buat mengelompokkan
// satuan kerja (Eselon II, field Pegawai.satuanKerja) ke Unit Eselon I-nya -
// disiapkan supaya dashboard Pimpinan/PPABP nanti gampang dikelompokkan per
// Eselon I, BELUM benar-benar dipakai di UI manapun (murni data referensi).
//
// TODO(confirm) PENTING: mapping ini TIDAK 100% cocok dengan nilai
// Pegawai.satuanKerja hasil import (src/jobs/importPegawaiXlsx.ts, basis
// data ±Januari 2026) - beberapa nama unit di file referensi ini beda
// dengan yang ada di data pegawai (kemungkinan reorganisasi/rename unit,
// file referensi lebih baru). Contoh yang KETAHUAN beda:
//   - File: "Balai Peningkatan Produktivitas Kendari" vs data pegawai:
//     "Balai Pelatihan Vokasi dan Produktivitas Kendari"
//   - File: "Balai Besar Pengembangan Keselamatan dan Kesehatan Kerja
//     Makassar" - tidak ada padanan di data pegawai sama sekali
//   - File: "Direktorat Bina Penempatan dan Pelindungan Pekerja Migran
//     Indonesia" + "Direktorat Bina Penempatan Tenaga Kerja Dalam Negeri"
//     vs data pegawai: "Direktorat Bina Penempatan Tenaga Kerja" +
//     "Direktorat Bina Penempatan Tenaga Kerja Khusus"
//   - File tidak punya "Staf Ahli Bidang Ekonomi/Hubungan Antar Lembaga/
//     Hubungan Internasional" sama sekali, padahal ada di data pegawai
// `getEselon1()` di bawah SENGAJA return undefined (bukan nebak/fuzzy-match)
// buat unit yang tidak ketemu persis - jangan asumsikan cakupan 100%
// sebelum direkonsiliasi manual dengan pihak Biro Organisasi/OSDMA.
// ============================================================================

const ESELON2_KE_ESELON1: Record<string, string> = {
  "Pusat Data dan Teknologi Informasi Ketenagakerjaan": "Badan Perencanaan dan Pengembangan Ketenagakerjaan",
  "Pusat Pengembangan Kebijakan Ketenagakerjaan": "Badan Perencanaan dan Pengembangan Ketenagakerjaan",
  "Pusat Perencanaan Ketenagakerjaan": "Badan Perencanaan dan Pengembangan Ketenagakerjaan",
  "Sekretariat Badan Perencanaan dan Pengembangan Ketenagakerjaan": "Badan Perencanaan dan Pengembangan Ketenagakerjaan",
  "Direktorat Bina Mediator Hubungan Industrial": "Direktorat Jenderal Pembinaan Hubungan Industrial dan Jaminan Sosial Tenaga Kerja",
  "Direktorat Hubungan Kerja dan Pengupahan": "Direktorat Jenderal Pembinaan Hubungan Industrial dan Jaminan Sosial Tenaga Kerja",
  "Direktorat Jaminan Sosial Tenaga Kerja": "Direktorat Jenderal Pembinaan Hubungan Industrial dan Jaminan Sosial Tenaga Kerja",
  "Direktorat Kelembagaan dan Pencegahan Perselisihan Hubungan Industrial": "Direktorat Jenderal Pembinaan Hubungan Industrial dan Jaminan Sosial Tenaga Kerja",
  "Direktorat Penyelesaian Perselisihan Hubungan Industrial": "Direktorat Jenderal Pembinaan Hubungan Industrial dan Jaminan Sosial Tenaga Kerja",
  "Sekretariat Direktorat Jenderal Pembinaan Hubungan Industrial dan Jaminan Sosial Tenaga Kerja": "Direktorat Jenderal Pembinaan Hubungan Industrial dan Jaminan Sosial Tenaga Kerja",
  "Balai Besar Pelatihan Vokasi dan Produktivitas Bandung": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Balai Besar Pelatihan Vokasi dan Produktivitas Bekasi": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Balai Besar Pelatihan Vokasi dan Produktivitas Makassar": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Balai Besar Pelatihan Vokasi dan Produktivitas Medan": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Balai Besar Pelatihan Vokasi dan Produktivitas Semarang": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Balai Besar Pelatihan Vokasi dan Produktivitas Serang": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Balai Pelatihan Vokasi dan Produktivitas Ambon": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Balai Pelatihan Vokasi dan Produktivitas Banda Aceh": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Balai Pelatihan Vokasi dan Produktivitas Bandung Barat": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Balai Pelatihan Vokasi dan Produktivitas Bantaeng": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Balai Pelatihan Vokasi dan Produktivitas Banyuwangi": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Balai Pelatihan Vokasi dan Produktivitas Belitung": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Balai Pelatihan Vokasi dan Produktivitas Kendari": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Balai Pelatihan Vokasi dan Produktivitas Lombok Timur": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Balai Pelatihan Vokasi dan Produktivitas Padang": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Balai Pelatihan Vokasi dan Produktivitas Pangkajene dan Kepulauan": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Balai Pelatihan Vokasi dan Produktivitas Samarinda": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Balai Pelatihan Vokasi dan Produktivitas Sidoarjo": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Balai Pelatihan Vokasi dan Produktivitas Sorong": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Balai Pelatihan Vokasi dan Produktivitas Surakarta": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Balai Pelatihan Vokasi dan Produktivitas Ternate": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Balai Peningkatan Produktivitas Kendari": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Direktorat Bina Instruktur dan Tenaga Pelatihan": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Direktorat Bina Kelembagaan Pelatihan Vokasi": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Direktorat Bina Peningkatan Produktivitas": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Direktorat Bina Penyelenggaraan Pelatihan Vokasi dan Pemagangan": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Direktorat Bina Standardisasi Kompetensi dan Program Pelatihan": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Sekretariat Badan Nasional Sertifikasi Profesi": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Sekretariat Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas": "Direktorat Jenderal Pembinaan Pelatihan Vokasi dan Produktivitas",
  "Balai Besar Pengembangan Pasar Kerja dan Perluasan Kesempatan Kerja Lembang": "Direktorat Jenderal Pembinaan Penempatan Tenaga Kerja dan Perluasan Kesempatan Kerja",
  "Direktorat Bina Penempatan dan Pelindungan Pekerja Migran Indonesia": "Direktorat Jenderal Pembinaan Penempatan Tenaga Kerja dan Perluasan Kesempatan Kerja",
  "Direktorat Bina Penempatan Tenaga Kerja Dalam Negeri": "Direktorat Jenderal Pembinaan Penempatan Tenaga Kerja dan Perluasan Kesempatan Kerja",
  "Direktorat Bina Pengantar Kerja": "Direktorat Jenderal Pembinaan Penempatan Tenaga Kerja dan Perluasan Kesempatan Kerja",
  "Direktorat Bina Perluasan Kesempatan Kerja": "Direktorat Jenderal Pembinaan Penempatan Tenaga Kerja dan Perluasan Kesempatan Kerja",
  "Direktorat Pengendalian Penggunaan Tenaga Kerja Asing": "Direktorat Jenderal Pembinaan Penempatan Tenaga Kerja dan Perluasan Kesempatan Kerja",
  "Sekretariat Direktorat Jenderal Pembinaan Penempatan Tenaga Kerja dan Perluasan Kesempatan Kerja": "Direktorat Jenderal Pembinaan Penempatan Tenaga Kerja dan Perluasan Kesempatan Kerja",
  "Balai Besar Pengembangan Keselamatan dan Kesehatan Kerja Makassar": "Direktorat Jenderal Pembinaan Pengawasan Ketenagakerjaan dan Keselamatan dan Kesehatan Kerja",
  "Balai Keselamatan dan Kesehatan Kerja Bandung": "Direktorat Jenderal Pembinaan Pengawasan Ketenagakerjaan dan Keselamatan dan Kesehatan Kerja",
  "Balai Keselamatan dan Kesehatan Kerja Jakarta": "Direktorat Jenderal Pembinaan Pengawasan Ketenagakerjaan dan Keselamatan dan Kesehatan Kerja",
  "Balai Keselamatan dan Kesehatan Kerja Medan": "Direktorat Jenderal Pembinaan Pengawasan Ketenagakerjaan dan Keselamatan dan Kesehatan Kerja",
  "Balai Keselamatan dan Kesehatan Kerja Samarinda": "Direktorat Jenderal Pembinaan Pengawasan Ketenagakerjaan dan Keselamatan dan Kesehatan Kerja",
  "Direktorat Bina Kelembagaan Keselamatan dan Kesehatan Kerja": "Direktorat Jenderal Pembinaan Pengawasan Ketenagakerjaan dan Keselamatan dan Kesehatan Kerja",
  "Direktorat Bina Pemeriksaan Norma Ketenagakerjaan": "Direktorat Jenderal Pembinaan Pengawasan Ketenagakerjaan dan Keselamatan dan Kesehatan Kerja",
  "Direktorat Bina Pengawas Ketenagakerjaan dan Penguji Keselamatan dan Kesehatan Kerja": "Direktorat Jenderal Pembinaan Pengawasan Ketenagakerjaan dan Keselamatan dan Kesehatan Kerja",
  "Direktorat Bina Pengujian Keselamatan dan Kesehatan Kerja": "Direktorat Jenderal Pembinaan Pengawasan Ketenagakerjaan dan Keselamatan dan Kesehatan Kerja",
  "Direktorat Bina Sistem Pengawasan Ketenagakerjaan": "Direktorat Jenderal Pembinaan Pengawasan Ketenagakerjaan dan Keselamatan dan Kesehatan Kerja",
  "Sekretariat Direktorat Jenderal Pembinaan Pengawasan Ketenagakerjaan dan Keselamatan dan Kesehatan Kerja": "Direktorat Jenderal Pembinaan Pengawasan Ketenagakerjaan dan Keselamatan dan Kesehatan Kerja",
  "Inspektorat I": "Inspektorat Jenderal",
  "Inspektorat II": "Inspektorat Jenderal",
  "Inspektorat III": "Inspektorat Jenderal",
  "Inspektorat IV": "Inspektorat Jenderal",
  "Sekretariat Inspektorat Jenderal": "Inspektorat Jenderal",
  "Biro Hubungan Masyarakat": "Sekretariat Jenderal",
  "Biro Hukum": "Sekretariat Jenderal",
  "Biro Kerja Sama": "Sekretariat Jenderal",
  "Biro Keuangan dan Barang Milik Negara": "Sekretariat Jenderal",
  "Biro Organisasi dan Sumber Daya Manusia Aparatur": "Sekretariat Jenderal",
  "Biro Perencanaan dan Manajemen Kinerja": "Sekretariat Jenderal",
  "Biro Umum": "Sekretariat Jenderal",
  "Politeknik Ketenagakerjaan": "Sekretariat Jenderal",
  "Pusat Pasar Kerja": "Sekretariat Jenderal",
  "Pusat Pengembangan Sumber Daya Manusia Ketenagakerjaan": "Sekretariat Jenderal",
};

/** Eselon I dari satuanKerja (Eselon II) - undefined kalau tidak ketemu persis di mapping (lihat TODO di atas). */
export function getEselon1(satuanKerja: string): string | undefined {
  return ESELON2_KE_ESELON1[satuanKerja];
}

/** Daftar semua Unit Eselon I unik yang ada di mapping (buat dropdown filter nanti). */
export function daftarEselon1(): string[] {
  return [...new Set(Object.values(ESELON2_KE_ESELON1))].sort();
}
