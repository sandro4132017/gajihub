import type { AuthUser } from "../auth/permissions";

/**
 * Scoping visibilitas dashboard (Tukin/Uang Makan/Uang Lembur) per role -
 * dipakai bareng dengan canViewDataPayroll (blok ADMIN_SISTEM total). Role
 * matrix: KASUBAG_TU cuma boleh lihat rekap unit kerjanya SENDIRI, jadi
 * filter satuan kerja di-paksa ke unitnya - query string ?satker=... dari
 * user TIDAK BOLEH bisa dipakai buat intip unit lain. Role lain (PPABP,
 * BIRO_OSDMA, ITJEN, PIMPINAN) tetap lintas satker sesuai canViewPegawai.
 *
 * TODO: PEGAWAI belum diblokir dari halaman ini sama sekali (dashboard
 * self-service PEGAWAI belum dibangun - lihat CLAUDE.md) - jangan
 * asumsikan fungsi ini menutup celah itu juga.
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
export function resolveSatuanKerjaListUntukFilter(akun: AuthUser, semuaSatuanKerja: string[]): string[] {
  if (akun.role === "KASUBAG_TU") {
    return akun.satuanKerja ? [akun.satuanKerja] : [];
  }
  return semuaSatuanKerja;
}
