// ============================================================================
// PEJABAT PIMPINAN TINGGI (JPT) - pengecualian potongan kehadiran
//
// Modul ini PURE. Yang membaca database ada di pemanggilnya.
//
// APA YANG DIATUR DI SINI
// -----------------------
// Pejabat Pimpinan Tinggi Pratama (setingkat Eselon II) - Kepala Biro,
// Sekretaris Ditjen/Itjen/Badan, Direktur, Inspektur, Kepala Pusat - menerima
// Tunjangan Kinerja komponen kehadiran (30%) SECARA PENUH, tanpa potongan
// Pasal 13, sebagai kompensasi jabatan.
//
// TODO(confirm) - DASAR HUKUMNYA BELUM ADA SALINANNYA. Ini keterangan praktik
// dari user (PPABP Rokeu), BUKAN dari Permenaker 15/2024. Seluruh teks
// Permenaker sudah dibaca (`docs/permenaker-15-2024-tunjangan-kinerja.md`) dan
// TIDAK ADA satu pun pengecualian JPT dari Pasal 13:
//   - Pasal 7 ayat (2) mengecualikan penyampaian aktivitas harian HANYA untuk
//     tugas belajar, diklat, dan cuti.
//   - Pasal 20 ayat (2) huruf b menyebut pejabat pimpinan tinggi pratama
//     sebagai PENANGGUNG JAWAB rekapitulasi kehadiran unit Eselon II - bukan
//     sebagai pihak yang dikecualikan darinya.
// Aturan ini membayar penuh ~50 orang tanpa melihat presensi, jadi WAJIB
// diminta dasarnya (Kepsekjen/SE/nodin) ke Biro OSDMA sebelum dipakai
// membayar sungguhan. Sampai itu ada, setiap pemakaiannya DITANDAI eksplisit
// di hasil kalkulasi - lihat `hitungTukin`.
//
// BUKTI PRAKTIK yang sudah ada (rincian tukin manual Rokeu, Juli 2026):
// Irma Puspita (Kepala Biro Keuangan dan BMN, kelas 15) dibayar
// Rp 19.280.000 dengan kolom potongan NOL, padahal rekap presensi periode
// yang sama mencatat terlambat 40 menit (9 Juli) dan pulang cepat 20 menit
// (10 Juli). Toleransi 60 menit Pasal 9 ayat (3) hanya menjelaskan yang 40
// menit; pulang cepatnya tidak - jadi ada pengecualian lain yang bekerja.
//
// KENAPA KELAS JABATAN, BUKAN KOLOM ESELON
// ----------------------------------------
// `Pegawai` tidak punya kolom eselon, dan SIAP tidak mengirimkannya dalam
// bentuk itu. Yang ada `kelasJabatan`, dan untuk jabatan struktural angkanya
// datang dari `SATKER.JOBGRADE` - sumber yang SAMA yang sudah dipercaya
// menentukan tarif tukin pokok. Diuji ke seluruh data pegawai aktif (5.077
// baris), sebarannya jatuh persis di batas eselon dan tidak ada jabatan lain
// yang nyasar:
//
//   kelas 17 (6 orang)  Sekjen, Irjen, 3 Dirjen, Kepala Badan  -> JPT Madya
//   kelas 16 (4 orang)  Staf Ahli (4 bidang)                   -> JPT Madya
//   kelas 15 (40 orang) Kepala Biro, Direktur, Inspektur I-IV,
//                       Sekretaris Ditjen/Itjen/Badan,
//                       Kepala Pusat, Ka. Sekretariat BNSP     -> JPT Pratama
//
// CARA LAIN YANG SUDAH DIUJI DAN DITOLAK: `unitKerja === satuanKerja`
// (dugaan "kepala unit Eselon II ber-SATKERID tepat 6 digit"). Kelihatan
// masuk akal, tapi kena 3.069 dari 5.077 pegawai - seluruh staf UPT/Balai
// ikut, karena SATKERID mereka memang berhenti di nama balainya. Mati sebagai
// penanda.
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
