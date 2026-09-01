import type { AuthUser } from "../auth/permissions";

/**
 * Scoping visibilitas dashboard (Tukin/Uang Makan/Uang Lembur) per role -
 * dipakai bareng dengan canViewApproverDashboard (blok PEGAWAI, arahkan ke
 * /saya). Role matrix: KASUBAG_TU cuma boleh lihat rekap unit kerjanya
 * SENDIRI, jadi filter satuan kerja di-paksa ke unitnya - query string
 * ?satker=... dari user TIDAK BOLEH bisa dipakai buat intip unit lain. Role
 * lain (PPABP, OSDMA, PIMPINAN, ADMIN) tetap lintas satker sesuai
 * canViewPegawai.
 */
export function resolveSatkerEfektif(akun: AuthUser, satkerDariQuery: string | undefined): string | undefined {
  if (akun.role === "KASUBAG_TU") {
    return akun.satuanKerja ?? undefined;
  }
  return satkerDariQuery;
}

/**
 * Daftar satuan kerja yang ditampilkan di dropdown filter. KASUBAG_TU cuma
 * lihat unitnya sendiri di dropdown (konsisten dengan resolveSatkerEfektif
 * yang memang memaksa query ke unit itu juga) - daripada nampilin semua
 * unit tapi hasil filternya selalu di-override, yang membingungkan.
 */
/**
 * true kalau satuan kerja TIDAK bisa dipilih pemakainya - nilainya sudah
 * ditentukan sistem dari akunnya sendiri.
 *
 * Kembarannya resolveSatkerEfektif dan HARUS selalu sepakat dengannya: kalau
 * yang satu memaksa nilai tapi yang lain masih menampilkan dropdown, yang
 * muncul adalah dropdown yang bisa diklik tapi tidak pernah mengubah apa pun -
 * dan itu terbaca sebagai filter yang rusak, bukan sebagai pembatasan
 * kewenangan. Ada test yang menjaga keduanya tidak lepas satu sama lain.
 */
export function satkerTerkunciUntukAkun(akun: AuthUser): boolean {
  return akun.role === "KASUBAG_TU";
}

export function resolveSatuanKerjaListUntukFilter(akun: AuthUser, semuaSatuanKerja: string[]): string[] {
  if (akun.role === "KASUBAG_TU") {
    return akun.satuanKerja ? [akun.satuanKerja] : [];
  }
  // Nilai kosong dibuang. Ada pegawai yang satuan kerjanya belum terisi di
  // data induk, dan kalau nilainya ikut masuk daftar filter, opsinya tampil
  // sebagai baris tanpa tulisan yang kalau dipilih artinya justru "semua
  // satuan kerja" (nilai "" memang dipakai untuk itu) - membingungkan, dan
  // bertabrakan dengan opsi "Semua satuan kerja" yang memang bernilai "".
  //
  // Memperbaiki pegawainya sendiri dilakukan di /pegawai, bukan di sini.
  return semuaSatuanKerja.filter((s) => s.trim() !== "");
}
