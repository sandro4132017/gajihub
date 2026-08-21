// ============================================================================
// PEJABAT PIMPINAN TINGGI (JPT) - pengecualian potongan kehadiran
//
// PURE. Yang membaca database ada di pemanggilnya.
//
// JPT Pratama (setingkat Eselon II) - Kepala Biro, Sekretaris Ditjen/Itjen/
// Badan, Direktur, Inspektur, Kepala Pusat - menerima komponen kehadiran
// (30%) SECARA PENUH tanpa potongan Pasal 13, sebagai kompensasi jabatan.
//
// TODO(confirm) - DASAR HUKUMNYA BELUM ADA SALINANNYA. Ini keterangan praktik
// dari PPABP Rokeu, BUKAN dari Permenaker 15/2024. Teks Permenaker sudah
// dibaca seluruhnya dan TIDAK ADA pengecualian JPT dari Pasal 13 - Pasal 20
// ayat (2) huruf b justru menempatkan JPT Pratama sebagai PENANGGUNG JAWAB
// rekapitulasi kehadiran unitnya. Aturan ini membayar penuh ~50 orang tanpa
// melihat presensi, jadi WAJIB diminta dasarnya ke Biro OSDMA sebelum dipakai
// membayar. Sampai itu ada, tiap pemakaiannya DITANDAI di hasil kalkulasi.
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
 * ESELON I IKUT DIKECUALIKAN walau yang disebut user cuma Eselon II. Batas di
 * 15 dipilih karena memisahkannya menghasilkan aturan yang tidak koheren:
 * Kepala Biro (15) dibayar penuh sementara Sekretaris Jenderal (17), atasannya
 * langsung, tetap kena potongan kehadiran. TODO(confirm): kalau ternyata
 * kompensasi ini memang HANYA untuk Eselon II, ubah pemakaian di bawah jadi
 * `=== 15` - satu tempat, tidak tersebar.
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
