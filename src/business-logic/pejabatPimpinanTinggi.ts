// ============================================================================
// PEJABAT PIMPINAN TINGGI (JPT) - pengecualian potongan kehadiran
//
// PURE. Yang membaca database ada di pemanggilnya.
//
// JPT Pratama (setingkat Eselon II) - Kepala Biro, Sekretaris Ditjen/Itjen/
// Badan, Direktur, Inspektur, Kepala Pusat - menerima komponen kehadiran
// (30%) SECARA PENUH tanpa potongan Pasal 13, sebagai kompensasi jabatan.
//
// DIPUTUSKAN USER 2026-09-10: aturan ini FINAL, tidak lagi menunggu Biro
// OSDMA. Sebelumnya ditandai TODO(confirm) dan tiap pemakaiannya diperlakukan
// sebagai asumsi.
//
// SATU FAKTA YANG TETAP HARUS DIKETAHUI, dan sengaja tidak dihapus karena
// auditor pasti menanyakannya: pengecualian ini TIDAK ADA di Permenaker
// 15/2024. Teksnya sudah dibaca seluruhnya. Pasal 7 ayat (2) mengecualikan
// penyampaian aktivitas harian hanya untuk tugas belajar, diklat, dan cuti;
// Pasal 20 ayat (2) huruf b justru menempatkan JPT Pratama sebagai PENANGGUNG
// JAWAB rekapitulasi kehadiran unitnya. Dasarnya adalah praktik pembayaran
// yang berjalan (rincian tukin manual Rokeu) ditambah penegasan user sebagai
// pemilik proses - bukan kutipan pasal.
//
// Pemakaiannya TETAP dicatat di hasil kalkulasi. Yang berubah statusnya, bukan
// keterlacakannya: ~50 orang dibayar penuh tanpa melihat presensi, dan itu
// harus selalu bisa ditunjukkan siapa saja dan berapa.
//
// DITURUNKAN DARI KELAS JABATAN, bukan kolom eselon - `Pegawai` tidak punya
// kolomnya dan SIAP tidak mengirimkannya. `kelasJabatan` untuk jabatan
// struktural datang dari SATKER.JOBGRADE, sumber yang sama yang menentukan
// tarif tukin pokok. Diuji ke 5.077 pegawai aktif, sebarannya jatuh persis di
// batas eselon: kelas 17 (6 orang, JPT Madya), 16 (4, Staf Ahli), 15 (40,
// JPT Pratama).
//
// CARA LAIN YANG DIUJI DAN DITOLAK: `unitKerja === satuanKerja` - kena 3.069
// dari 5.077 pegawai karena SATKERID staf UPT/Balai memang berhenti di nama
// balainya. Mati sebagai penanda.
// ============================================================================

/**
 * Kelas jabatan terendah yang dianggap Pejabat Pimpinan Tinggi.
 *
 * 15 = JPT Pratama (Eselon II), 16-17 = JPT Madya (Eselon I).
 *
 * ESELON I IKUT DIKECUALIKAN walau yang ditegaskan user (2026-09-10) cuma
 * "pimpinan unit atau Eselon II". Batas di 15 dipilih karena memisahkannya
 * menghasilkan aturan yang tidak koheren: Kepala Biro (15) dibayar penuh
 * sementara Sekretaris Jenderal (17), atasannya langsung, tetap kena potongan
 * kehadiran.
 *
 * TODO(confirm) YANG TERSISA - CUMA INI: apakah Eselon I (kelas 16-17, 10
 * orang) memang ikut. Kalau ternyata kompensasi ini HANYA untuk Eselon II,
 * ubah pemakaian di bawah jadi `=== 15` - satu tempat, tidak tersebar.
 */
export const KELAS_JABATAN_MINIMUM_JPT = 15;

/**
 * Apakah pemegang kelas jabatan ini dikecualikan dari potongan kehadiran
 * Pasal 13.
 *
 * Kelas jabatan yang TIDAK DIKETAHUI (null) mengembalikan `false` - tidak
 * menebak. Pegawai tanpa kelas jabatan juga tidak bisa dihitung tukinnya sama
 * sekali (tarifnya tidak ketemu), jadi kasus itu memang berhenti lebih awal.
 */
export function dikecualikanPotonganKehadiran(kelasJabatan: number | null | undefined): boolean {
  if (kelasJabatan === null || kelasJabatan === undefined) return false;
  return kelasJabatan >= KELAS_JABATAN_MINIMUM_JPT;
}

/**
 * Jenjang JPT siap tampil. Kelas 16-17 = Madya (Eselon I), 15 = Pratama
 * (Eselon II). Dipakai bareng catatan kalkulasi dan badge di tabel supaya
 * keduanya tidak bisa menyebut jenjang yang berbeda untuk orang yang sama.
 */
export function jenjangPejabatPimpinanTinggi(kelasJabatan: number | null | undefined): string {
  return (kelasJabatan ?? 0) >= 16 ? "Pimpinan Tinggi Madya (Eselon I)" : "Pimpinan Tinggi Pratama (Eselon II)";
}

/** Label siap tampil buat menjelaskan pengecualiannya di UI & catatan kalkulasi. */
export function labelPengecualianKehadiran(kelasJabatan: number | null | undefined): string {
  return `Pejabat ${jenjangPejabatPimpinanTinggi(kelasJabatan)} - komponen kehadiran dibayar penuh`;
}
