// ============================================================================
// AUTHORIZATION LAYER - pure function per kombinasi role x aksi.
// Lihat CLAUDE.md bagian "Role matrix" untuk definisi lengkap 7 role dan
// cakupan aksesnya - file ini implementasi dari tabel itu.
//
// PENTING: file ini BELUM disambungkan ke middleware/route/dashboard
// manapun (itu langkah 3, belum dikerjakan). Semua fungsi di sini pure -
// tidak ada I/O, cuma logika keputusan izin/tolak berdasarkan data yang
// dikasih si pemanggil. Caller (nanti di langkah 3) yang tanggung jawab
// ngambil data User/Pegawai/Sanggahan dari database lalu panggil fungsi
// yang sesuai sebelum ngizinin aksi.
//
// KONVENSI: setiap fungsi return boolean murni (true = boleh). Nama fungsi
// pakai prefix "can" sesuai style yang diminta. Kalau kombinasi role x aksi
// TIDAK disebut eksplisit di role matrix, defaultnya DITOLAK (bukan
// diizinkan) - lihat komentar per fungsi buat referensi baris di role
// matrix yang jadi acuan.
// ============================================================================

import type { Role } from "@prisma/client";

/** Subset field User yang dibutuhkan buat cek izin - bukan full Prisma User. */
export interface AuthUser {
  nip: string;
  role: Role;
  satuanKerja: string | null;
  aktif: boolean;
}

export interface TargetPegawai {
  nip: string;
  satuanKerja: string;
}

export interface TargetSanggahan {
  pengajuNip: string;
  satuanKerjaPegawai: string;
}

function cekRole(user: AuthUser, role: Role): boolean {
  return user.aktif && user.role === role;
}

/**
 * PPABP di-scope ke satuanKerja SETELAH di-scale per-satker (TODO(confirm)
 * di schema.prisma model User) - untuk sekarang (pilot: 1 PPABP pusat)
 * satuanKerja = NULL berarti berwenang lintas SEMUA satker.
 */
function cekPpabp(user: AuthUser, targetSatuanKerja?: string): boolean {
  if (!cekRole(user, "PPABP")) return false;
  if (user.satuanKerja === null) return true; // PPABP pusat, lintas satker
  return user.satuanKerja === targetSatuanKerja;
}

// ---------------------------------------------------------------------------
// PEGAWAI - self-service, data sendiri saja
// ---------------------------------------------------------------------------

/**
 * Lihat presensi/predikat kinerja/estimasi pendapatan/histori pembayaran
 * SENDIRI. Role matrix: "TIDAK BOLEH lihat data pegawai lain".
 */
export function canViewDataSendiri(user: AuthUser, targetNip: string): boolean {
  return cekRole(user, "PEGAWAI") && user.nip === targetNip;
}

/**
 * Ajukan sanggahan atas data sendiri. Schema Sanggahan mencatat: "pengaju
 * HARUS pegawai yang sama dengan targetnya - sanggahan diri sendiri, bukan
 * diwakilkan" (lihat komentar model Sanggahan).
 */
export function canAjukanSanggahan(user: AuthUser, targetPegawaiNip: string): boolean {
  return cekRole(user, "PEGAWAI") && user.nip === targetPegawaiNip;
}

/** Upload bukti pendukung HANYA buat sanggahan yang diajukan sendiri. */
export function canUploadBuktiPendukung(user: AuthUser, sanggahan: TargetSanggahan): boolean {
  return cekRole(user, "PEGAWAI") && user.nip === sanggahan.pengajuNip;
}

/** Lihat status sanggahan sendiri - berlaku buat siapapun yang jadi pengaju (biasanya PEGAWAI). */
export function canLihatStatusSanggahanSendiri(user: AuthUser, sanggahan: TargetSanggahan): boolean {
  return user.aktif && user.nip === sanggahan.pengajuNip;
}

// ---------------------------------------------------------------------------
// KASUBAG_TU - verifikator tingkat satker, scoping lewat User.satuanKerja
// ---------------------------------------------------------------------------

/** Lihat rekap SELURUH pegawai di satuan kerjanya sendiri saja. */
export function canViewRekapUnitKerja(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekRole(user, "KASUBAG_TU") && user.satuanKerja === targetSatuanKerja;
}

/** Verifikasi (tahap 1) sanggahan yang masuk dari pegawai di unitnya sendiri. */
export function canVerifikasiSanggahanTahap1(user: AuthUser, sanggahan: TargetSanggahan): boolean {
  return cekRole(user, "KASUBAG_TU") && user.satuanKerja === sanggahan.satuanKerjaPegawai;
}

/**
 * Approval jenjang 1 kalkulasi Tukin/Uang Makan/Uang Lembur - HANYA buat
 * unit kerjanya sendiri. Role matrix: "TIDAK BOLEH approval final atau
 * lihat unit lain".
 */
export function canApproveJenjang1(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekRole(user, "KASUBAG_TU") && user.satuanKerja === targetSatuanKerja;
}

/** Monitor status rekonsiliasi (ReconciliationStatus) unitnya sendiri. */
export function canMonitorRekonsiliasiUnit(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekRole(user, "KASUBAG_TU") && user.satuanKerja === targetSatuanKerja;
}

// ---------------------------------------------------------------------------
// PPABP - approval jenjang final, lintas satker (asumsi pilot: 1 PPABP pusat)
// ---------------------------------------------------------------------------

/**
 * Approval jenjang FINAL (jenjang terakhir sebelum status APPROVED, siap
 * kirim ke Web Gaji/SAKTI). targetSatuanKerja opsional - kalau PPABP-nya
 * scoped per-satker (belum terjadi di pilot), WAJIB diisi dan dicocokkan.
 */
export function canApproveJenjangFinal(user: AuthUser, targetSatuanKerja?: string): boolean {
  return cekPpabp(user, targetSatuanKerja);
}

/** Handle kasus SELISIH (hasil rekonsiliasi data sumber tidak cocok). */
export function canHandleSelisih(user: AuthUser, targetSatuanKerja?: string): boolean {
  return cekPpabp(user, targetSatuanKerja);
}

/** Generate file output (ADK) untuk Web Gaji Kemenkeu & SAKTI. */
export function canGenerateAdk(user: AuthUser): boolean {
  return cekRole(user, "PPABP");
}

/** Lihat status rekonsiliasi LINTAS satker (dalam kewenangannya). */
export function canViewRekonsiliasiLintasSatker(user: AuthUser, targetSatuanKerja?: string): boolean {
  return cekPpabp(user, targetSatuanKerja);
}

// ---------------------------------------------------------------------------
// BIRO_OSDMA - data steward, TIDAK BOLEH approval pembayaran
// ---------------------------------------------------------------------------

/** Review & approve perubahan data master pegawai (SK, mutasi, kenaikan pangkat) yang disengketakan. */
export function canReviewPerubahanDataMaster(user: AuthUser): boolean {
  return cekRole(user, "BIRO_OSDMA");
}

/** Verifikasi sanggahan tahap lanjutan (kalau diteruskan dari Kasubag TU - lihat TODO alur di model Sanggahan). */
export function canVerifikasiSanggahanTahapOsdma(user: AuthUser): boolean {
  return cekRole(user, "BIRO_OSDMA");
}

/** Monitor kepatuhan penggunaan data & lihat log akses (pola pemakaian, BUKAN data personal satu-satu). */
export function canMonitorKepatuhanData(user: AuthUser): boolean {
  return cekRole(user, "BIRO_OSDMA");
}

// ---------------------------------------------------------------------------
// ADMIN_SISTEM - kewenangan TEKNIS saja, SENGAJA tidak boleh data payroll
// ---------------------------------------------------------------------------

export function canKelolaAssignmentRole(user: AuthUser): boolean {
  return cekRole(user, "ADMIN_SISTEM");
}

export function canMonitorKesehatanSistem(user: AuthUser): boolean {
  return cekRole(user, "ADMIN_SISTEM");
}

export function canKonfigurasiAdapter(user: AuthUser): boolean {
  return cekRole(user, "ADMIN_SISTEM");
}

/**
 * Guard EKSPLISIT: ADMIN_SISTEM TIDAK BOLEH lihat data substantif payroll
 * (kalkulasi Tukin/Uang Makan/Uang Lembur individual) - ini pemisahan
 * kewenangan teknis vs bisnis dari role matrix, JANGAN dilonggarkan.
 * Dipakai sebagai guard tambahan di fungsi-fungsi lain yang berhubungan
 * dengan data payroll (lihat canViewPegawai).
 */
export function canViewDataPayroll(user: AuthUser): boolean {
  if (cekRole(user, "ADMIN_SISTEM")) return false;
  // Role lain diatur oleh fungsi masing-masing (canViewDataSendiri,
  // canViewRekapUnitKerja, dst) - fungsi ini KHUSUS buat negative guard
  // ADMIN_SISTEM, bukan pengganti pengecekan scoping role lain.
  return user.aktif;
}

// ---------------------------------------------------------------------------
// ITJEN - auditor, read-only ke SELURUH data terkait audit
// ---------------------------------------------------------------------------

export function canViewAuditTrail(user: AuthUser): boolean {
  return cekRole(user, "ITJEN");
}

export function canViewApprovalLogSemua(user: AuthUser): boolean {
  return cekRole(user, "ITJEN");
}

export function canViewHistoriSanggahanSemua(user: AuthUser): boolean {
  return cekRole(user, "ITJEN");
}

export function canExportLaporan(user: AuthUser): boolean {
  return cekRole(user, "ITJEN");
}

// ITJEN read-only - TIDAK ada canApprove/canEdit/canHapus apapun buat role
// ini secara SENGAJA (tidak ditulis, bukan lupa). Role matrix: "TIDAK BOLEH
// approve/edit/hapus apapun".

// ---------------------------------------------------------------------------
// PIMPINAN - executive dashboard, ringkasan tingkat kementerian
// ---------------------------------------------------------------------------

export function canViewDashboardRingkasanKementerian(user: AuthUser): boolean {
  return cekRole(user, "PIMPINAN");
}

// ---------------------------------------------------------------------------
// LINTAS ROLE
// ---------------------------------------------------------------------------

/**
 * Lihat data (identitas + payroll) satu pegawai tertentu. Gabungan aturan
 * dari semua role - lihat komentar per baris.
 */
export function canViewPegawai(user: AuthUser, target: TargetPegawai): boolean {
  if (!user.aktif) return false;

  switch (user.role) {
    case "PEGAWAI":
      return user.nip === target.nip; // data sendiri saja
    case "KASUBAG_TU":
      return user.satuanKerja === target.satuanKerja; // unit kerjanya saja
    case "PPABP":
      return cekPpabp(user, target.satuanKerja); // lintas satker (pilot: pusat)
    case "BIRO_OSDMA":
      return true; // data steward, perlu visibilitas luas buat review data master
    case "ITJEN":
      return true; // auditor read-only, perlu visibilitas luas
    case "PIMPINAN":
      return true; // dashboard ringkasan tingkat kementerian
    case "ADMIN_SISTEM":
      return false; // SENGAJA - lihat canViewDataPayroll
    default:
      return false;
  }
}

/**
 * TIDAK ADA role yang boleh edit data presensi/kinerja secara LANGSUNG -
 * satu-satunya jalur koreksi adalah lewat Sanggahan (ajukan -> diverifikasi
 * berjenjang). Fungsi ini SENGAJA selalu false, didokumentasikan eksplisit
 * di sini supaya tidak ada yang "lupa" nambahin fitur edit langsung nanti.
 */
export function canEditPresensiKinerjaLangsung(_user: AuthUser): boolean {
  return false;
}
