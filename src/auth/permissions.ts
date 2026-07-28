// ============================================================================
// AUTHORIZATION LAYER - pure function per kombinasi role x aksi.
// Lihat CLAUDE.md bagian "Simulasi role matrix lengkap" untuk definisi
// lengkap 6 role dan cakupan aksesnya - file ini implementasi dari tabel
// itu (role & aksi detail: dashboard unit/lintas unit, SK KGB, SK Hukuman
// Disiplin, Anggaran Realisasi, Bukti Potong Pajak, usulan perubahan role).
//
// PENTING: file ini BELUM disambungkan ke dashboard/endpoint manapun untuk
// fitur-fitur BARU di atas (itu langkah 4, UI bertahap per role - belum
// dikerjakan). Guard yang SUDAH tersambung ke UI cuma yang dari fitur user
// & role versi awal (approval Tukin/Uang Makan/Uang Lembur, dashboard
// approver, self-service /saya, Banding jenjang 1/pengajuan). Semua fungsi
// di sini pure - tidak ada I/O, cuma logika keputusan izin/tolak
// berdasarkan data yang dikasih si pemanggil.
//
// KONVENSI: setiap fungsi return boolean murni (true = boleh). Nama fungsi
// pakai prefix "can". Kalau kombinasi role x aksi TIDAK disebut eksplisit
// di role matrix, defaultnya DITOLAK (bukan diizinkan).
//
// TODO(confirm) BESAR - ADMIN "privilege semua role": role matrix simulasi
// ini eksplisit minta ADMIN bisa melakukan APAPUN yang bisa dilakukan role
// lain (lihat enum Role di schema.prisma untuk alasan & catatan "BUKAN
// desain final production"). Supaya gampang di-grep & dicabut kalau role
// ini dipecah lagi nanti, bypass ADMIN SELALU eksplisit lewat helper
// `cekRoleAtauAdmin`/`cekScopeSatkerAtauAdmin`/`cekPpabpAtauAdmin` di bawah
// - JANGAN taruh `user.role === "ADMIN"` tersebar ad-hoc di fungsi lain.
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

export interface TargetBanding {
  pengajuNip: string;
  satuanKerjaPegawai: string;
}

function cekRole(user: AuthUser, role: Role): boolean {
  return user.aktif && user.role === role;
}

/** ADMIN "privilege semua role" - lihat TODO(confirm) besar di atas. */
function cekRoleAtauAdmin(user: AuthUser, role: Role): boolean {
  return user.aktif && (user.role === role || user.role === "ADMIN");
}

/** Sama seperti cekRoleAtauAdmin, tapi untuk aksi yang di-scope ke satuan kerja tertentu. */
function cekScopeSatkerAtauAdmin(user: AuthUser, role: Role, targetSatuanKerja: string): boolean {
  if (!user.aktif) return false;
  if (user.role === "ADMIN") return true;
  return user.role === role && user.satuanKerja === targetSatuanKerja;
}

/**
 * PPABP di-scope ke satuanKerja SETELAH di-scale per-satker (TODO(confirm)
 * di schema.prisma model User) - untuk sekarang (pilot: tim PPABP pusat)
 * satuanKerja = NULL berarti berwenang lintas SEMUA satker.
 */
function cekPpabp(user: AuthUser, targetSatuanKerja?: string): boolean {
  if (!cekRole(user, "PPABP")) return false;
  if (user.satuanKerja === null) return true; // PPABP pusat, lintas satker
  return user.satuanKerja === targetSatuanKerja;
}

function cekPpabpAtauAdmin(user: AuthUser, targetSatuanKerja?: string): boolean {
  if (!user.aktif) return false;
  if (user.role === "ADMIN") return true;
  return cekPpabp(user, targetSatuanKerja);
}

// ---------------------------------------------------------------------------
// PEGAWAI - self-service, data sendiri saja. SEMUA role (KASUBAG_TU, OSDMA,
// PPABP, PIMPINAN, ADMIN) OTOMATIS punya privilege ini juga untuk data
// MEREKA SENDIRI (role matrix: "PEGAWAI - semua role di bawah otomatis
// punya privilege ini juga") - makanya fungsi-fungsi di bawah SENGAJA
// TIDAK mengecek role tertentu, cuma mengecek kecocokan NIP + akun aktif.
// ---------------------------------------------------------------------------

/**
 * Lihat presensi/predikat kinerja/pendapatan (periode berjalan & sebelumnya)/
 * histori pembayaran SENDIRI - berlaku semua role. Role matrix: "TIDAK
 * BOLEH lihat data pegawai lain" (itu diatur canViewPegawai, bukan di sini).
 */
export function canViewDataSendiri(user: AuthUser, targetNip: string): boolean {
  return user.aktif && user.nip === targetNip;
}

/**
 * Ajukan banding atas data sendiri. Schema Banding mencatat: "pengaju
 * HARUS pegawai yang sama dengan targetnya - banding diri sendiri, bukan
 * diwakilkan" (lihat komentar model Banding).
 */
export function canAjukanBanding(user: AuthUser, targetPegawaiNip: string): boolean {
  return user.aktif && user.nip === targetPegawaiNip;
}

/** Upload bukti dukung HANYA buat banding yang diajukan sendiri. */
export function canUploadBuktiDukung(user: AuthUser, banding: TargetBanding): boolean {
  return user.aktif && user.nip === banding.pengajuNip;
}

/** Lihat status banding sendiri (diajukan -> verifikasi Kasubag TU -> approval final OSDMA). */
export function canLihatStatusBandingSendiri(user: AuthUser, banding: TargetBanding): boolean {
  return user.aktif && user.nip === banding.pengajuNip;
}

/** Cetak/download slip gaji sendiri - format PLACEHOLDER, lihat TODO(confirm) di CLAUDE.md. */
export function canCetakSlipGajiSendiri(user: AuthUser, targetNip: string): boolean {
  return user.aktif && user.nip === targetNip;
}

/**
 * Download (BUKAN upload - lihat canUploadBuktiPotongPajak di bawah) bukti
 * potong pajak sendiri. Role matrix PEGAWAI: "pegawai cuma bisa lihat/
 * download, bukan upload sendiri".
 */
export function canDownloadBuktiPotongPajakSendiri(user: AuthUser, targetNip: string): boolean {
  return user.aktif && user.nip === targetNip;
}

// ---------------------------------------------------------------------------
// KASUBAG_TU - verifikator tingkat satker, scoping lewat User.satuanKerja
// ---------------------------------------------------------------------------

/** Lihat rekap SELURUH pegawai di satuan kerjanya sendiri saja. */
export function canViewRekapUnitKerja(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}

/** Verifikasi (jenjang 1) banding yang masuk dari pegawai di unitnya sendiri. */
export function canVerifikasiBandingJenjang1(user: AuthUser, banding: TargetBanding): boolean {
  if (!user.aktif) return false;
  if (user.role === "ADMIN") return true;
  return user.role === "KASUBAG_TU" && user.satuanKerja === banding.satuanKerjaPegawai;
}

/**
 * Approval jenjang 1 kalkulasi Tukin/Uang Makan/Uang Lembur - HANYA buat
 * unit kerjanya sendiri. Role matrix: "TIDAK BOLEH approval final atau
 * lihat unit lain".
 */
export function canApproveJenjang1(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}

/** Monitor status rekonsiliasi (ReconciliationStatus) unitnya sendiri. */
export function canMonitorRekonsiliasiUnit(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}

/**
 * Tarik data presensi dari database, ATAU upload manual sebagai fallback
 * kalau adapter API e-Presensi belum konek (role matrix: "atau upload
 * manual kalau adapter API belum konek") - satu izin yang sama buat kedua
 * cara, bedanya cuma di service layer/UI nanti.
 */
export function canTarikAtauUploadPresensiUnit(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}

/**
 * Tombol "tarik ulang data" presensi - dipisah dari canTarikAtauUploadPresensiUnit
 * biar eksplisit sesuai daftar fitur, TAPI izinnya sama (satu unit yang
 * sama). Role matrix: koreksi sebenarnya terjadi di e-Presensi (eksternal),
 * tombol ini CUMA nge-refresh, BUKAN auto-sync - lihat CLAUDE.md.
 */
export function canTarikUlangPresensiUnit(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}

/** Upload predikat kinerja (bobot 70% Tukin) + koreksi langsung di Gajihub kalau ada yang salah. */
export function canUploadKoreksiPredikatKinerjaUnit(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}

/** Tombol "ajukan semua pegawai unit" - kalkulasi Tukin 30/70 massal + preview nominal sebelum diajukan. */
export function canAjukanKalkulasiTukinMassalUnit(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}

/** Telaah dan ajukan Uang Makan pegawai unitnya. */
export function canTelaahAjukanUangMakanUnit(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}

/** Telaah, periksa kebenaran, koreksi, dan ajukan Uang Lembur pegawai unitnya. */
export function canTelaahKoreksiAjukanUangLemburUnit(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}

/** Dashboard unit sendiri: total pegawai, total nominal, status siklus, jumlah tertolak/belum diajukan. */
export function canViewDashboardUnit(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}

/** Ajukan SK KGB pegawai unitnya (approval final OSDMA - lihat canApproveSkKgb). */
export function canAjukanSkKgb(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}

/**
 * Input SK Hukuman Disiplin pegawai unitnya (approval OSDMA - lihat
 * canApproveSkHukumanDisiplin). TODO(confirm) BESAR: alur approval OSDMA
 * untuk SK ini ASUMSI dari spesifikasi simulasi, BELUM konfirmasi resmi -
 * lihat komentar panjang di model SkHukumanDisiplin (schema.prisma).
 */
export function canInputSkHukumanDisiplin(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}

// ---------------------------------------------------------------------------
// OSDMA - data steward, approval final Banding & SK KGB/Hukuman Disiplin,
// update SK pegawai
// ---------------------------------------------------------------------------

/** Review & approve perubahan data master pegawai (SK, mutasi, kenaikan pangkat) yang disengketakan. */
export function canReviewPerubahanDataMaster(user: AuthUser): boolean {
  return cekRoleAtauAdmin(user, "OSDMA");
}

/** Update SK pegawai yang baru dilantik struktural/fungsional, atau naik pangkat. */
export function canUpdateSkPegawaiStrukturalFungsional(user: AuthUser): boolean {
  return cekRoleAtauAdmin(user, "OSDMA");
}

/** Approval final (jenjang 2) Banding - lihat alur 2 jenjang di model Banding. */
export function canApproveBandingFinal(user: AuthUser): boolean {
  return cekRoleAtauAdmin(user, "OSDMA");
}

/** Approval SK KGB (jenjang tunggal). */
export function canApproveSkKgb(user: AuthUser): boolean {
  return cekRoleAtauAdmin(user, "OSDMA");
}

/**
 * Approval SK Hukuman Disiplin (jenjang tunggal) - lihat TODO(confirm)
 * besar di canInputSkHukumanDisiplin/model SkHukumanDisiplin soal alur ini.
 */
export function canApproveSkHukumanDisiplin(user: AuthUser): boolean {
  return cekRoleAtauAdmin(user, "OSDMA");
}

/** Monitor kepatuhan penggunaan data & lihat log akses (pola pemakaian, BUKAN data personal satu-satu). */
export function canMonitorKepatuhanData(user: AuthUser): boolean {
  return cekRoleAtauAdmin(user, "OSDMA");
}

// ---------------------------------------------------------------------------
// PPABP (Tim PPABP Rokeu) - validasi lintas unit, export ADK, anggaran
// realisasi, usulan role, dashboard lintas unit
// ---------------------------------------------------------------------------

/** Tarik/upload manual data presensi - fallback kalau Kasubag TU/unit tidak bisa (lintas unit). */
export function canTarikAtauUploadPresensiFallback(user: AuthUser): boolean {
  return cekRoleAtauAdmin(user, "PPABP");
}

/** Telaah dan validasi pengajuan Tukin/Uang Makan/Uang Lembur dari SEMUA unit kerja. */
export function canTelaahValidasiPengajuanLintasUnit(user: AuthUser, targetSatuanKerja?: string): boolean {
  return cekPpabpAtauAdmin(user, targetSatuanKerja);
}

/**
 * Approval jenjang FINAL (jenjang terakhir sebelum status APPROVED, siap
 * kirim ke Web Gaji/SAKTI). targetSatuanKerja opsional - kalau PPABP-nya
 * scoped per-satker (belum terjadi di pilot), WAJIB diisi dan dicocokkan.
 */
export function canApproveJenjangFinal(user: AuthUser, targetSatuanKerja?: string): boolean {
  return cekPpabpAtauAdmin(user, targetSatuanKerja);
}

/** Handle kasus SELISIH (hasil rekonsiliasi data sumber tidak cocok). */
export function canHandleSelisih(user: AuthUser, targetSatuanKerja?: string): boolean {
  return cekPpabpAtauAdmin(user, targetSatuanKerja);
}

/** Export ADK (Tunjangan Kinerja, Uang Makan, Uang Lembur - 3 jenis terpisah) untuk diunggah ke Web Gaji. */
export function canGenerateAdk(user: AuthUser): boolean {
  return cekRoleAtauAdmin(user, "PPABP");
}

/** Upload data Anggaran dan Realisasi Belanja Pegawai. */
export function canUploadAnggaranRealisasi(user: AuthUser): boolean {
  return cekRoleAtauAdmin(user, "PPABP");
}

/** Monitoring status belanja pegawai lintas unit, DAN ubah status pengajuan/approval/validasi. */
export function canMonitorUbahStatusLintasUnit(user: AuthUser, targetSatuanKerja?: string): boolean {
  return cekPpabpAtauAdmin(user, targetSatuanKerja);
}

/** Lihat status rekonsiliasi LINTAS satker (dalam kewenangannya). */
export function canViewRekonsiliasiLintasSatker(user: AuthUser, targetSatuanKerja?: string): boolean {
  return cekPpabpAtauAdmin(user, targetSatuanKerja);
}

/**
 * MELIHAT dan MENGUSULKAN perubahan role user - eksekusi final ada di
 * ADMIN (lihat canEksekusiPerubahanRole), supaya tidak ada dua pihak yang
 * sama-sama bisa eksekusi langsung.
 */
export function canUsulkanPerubahanRole(user: AuthUser): boolean {
  return cekRoleAtauAdmin(user, "PPABP");
}

/**
 * Dashboard lintas unit: total pegawai, total nominal belanja pegawai
 * periode berjalan (filter periode), status siklus pembayaran, jumlah
 * tertolak/belum diajukan, total Anggaran vs Realisasi. PPABP & ADMIN bisa
 * approve/ubah data dari dashboard ini (lihat fungsi lain di atas);
 * PIMPINAN dapat dashboard yang SAMA tapi read-only (role matrix) - itu
 * dibedakan di level UI (PIMPINAN tidak dikasih tombol aksi), BUKAN di
 * fungsi ini, karena fungsi ini cuma soal "boleh LIHAT dashboardnya".
 */
export function canViewDashboardLintasUnit(user: AuthUser): boolean {
  return user.aktif && (user.role === "PPABP" || user.role === "PIMPINAN" || user.role === "ADMIN");
}

// ---------------------------------------------------------------------------
// PIMPINAN - dashboard lintas unit SAMA seperti PPABP, read-only. Lihat
// canViewDashboardLintasUnit di atas (izin lihat dashboard-nya sama-sama
// dipakai PPABP/PIMPINAN/ADMIN) - TIDAK ADA fungsi canApprove/canUbah...
// yang mengizinkan PIMPINAN secara SENGAJA (role matrix: "read-only, tanpa
// kemampuan approval/ubah data").
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ADMIN - kewenangan teknis (config, monitoring, eksekusi role) + privilege
// SEMUA role lain (lihat TODO(confirm) besar di kepala file & enum Role).
// ---------------------------------------------------------------------------

export function canKelolaAssignmentRole(user: AuthUser): boolean {
  return cekRole(user, "ADMIN");
}

/**
 * Eksekusi FINAL perubahan role (dari usulan PPABP - lihat
 * canUsulkanPerubahanRole) - SENGAJA cuma ADMIN, TANPA bypass PPABP,
 * supaya cuma satu pihak yang bisa eksekusi langsung (role matrix poin 4 & 6).
 */
export function canEksekusiPerubahanRole(user: AuthUser): boolean {
  return cekRole(user, "ADMIN");
}

export function canMonitorKesehatanSistem(user: AuthUser): boolean {
  return cekRole(user, "ADMIN");
}

export function canKonfigurasiAdapter(user: AuthUser): boolean {
  return cekRole(user, "ADMIN");
}

/**
 * TODO(confirm): guard ADMIN_SISTEM lama (blokir data payroll) SENGAJA
 * dinonaktifkan buat role ADMIN yang baru, karena role matrix simulasi ini
 * eksplisit minta ADMIN "privilege SEMUA role". Ini BUKAN keputusan final -
 * lihat TODO(confirm) besar di enum Role (schema.prisma) soal kewajiban
 * memecah role ini lagi sebelum production.
 */
export function canViewDataPayroll(user: AuthUser): boolean {
  return user.aktif;
}

/**
 * Guard gabungan buat 3 dashboard approver (Tukin/Uang Makan/Uang Lembur):
 * PEGAWAI diarahkan ke dashboard self-service sendiri (/saya) - dashboard
 * approver nampilin SEMUA pegawai per satker, yang melanggar "TIDAK BOLEH
 * lihat pegawai lain" di role matrix kalau PEGAWAI dibiarkan masuk.
 */
export function canViewApproverDashboard(user: AuthUser): boolean {
  return canViewDataPayroll(user) && user.role !== "PEGAWAI";
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
    case "OSDMA":
      return true; // data steward, perlu visibilitas luas buat review data master
    case "PIMPINAN":
      return true; // dashboard ringkasan tingkat kementerian
    case "ADMIN":
      return true; // TODO(confirm): privilege penuh - lihat catatan di canViewDataPayroll
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// DATA POKOK PEGAWAI (halaman /pegawai) - ADMIN, PPABP, KASUBAG_TU
//
// Diminta eksplisit oleh user: ketiga role ini butuh bisa memperbaiki data
// pokok pegawai (termasuk MENGISI/MENGUBAH satuan kerja), karena satuan kerja
// adalah kunci scoping di hampir semua fitur - pegawai dengan satuan kerja
// salah/kosong otomatis "hilang" dari dashboard unit manapun.
//
// BEDA dengan canUpdateSkPegawaiStrukturalFungsional (OSDMA, /osdma/update-sk):
// yang itu KHUSUS perubahan karena SK (jabatan/golongan/kelas jabatan/TMT) dan
// lintas satker tanpa batas. Yang ini perbaikan data pokok termasuk satuan
// kerja, dengan KASUBAG_TU di-scope ke unitnya sendiri. Keduanya sama-sama
// menulis AuditTrail, jadi jejaknya tetap ada dari jalur manapun.
//
// TIDAK termasuk presensi/predikat kinerja - itu tetap dilarang lewat semua
// jalur, lihat canEditPresensiKinerjaLangsung di bawah.
// ---------------------------------------------------------------------------

/**
 * Buka halaman daftar/pencarian data pegawai buat diedit. Cek "boleh edit
 * pegawai yang MANA" dilakukan terpisah per baris lewat canEditDataPegawai.
 */
export function canKelolaDataPegawai(user: AuthUser): boolean {
  if (!user.aktif) return false;
  return user.role === "ADMIN" || user.role === "PPABP" || user.role === "KASUBAG_TU";
}

/**
 * Edit data pokok SATU pegawai. KASUBAG_TU cuma unitnya sendiri (konsisten
 * dengan canViewRekapUnitKerja dkk), PPABP lintas satker (pilot: tim pusat),
 * ADMIN bypass.
 */
export function canEditDataPegawai(user: AuthUser, targetSatuanKerja: string): boolean {
  if (!user.aktif) return false;
  if (user.role === "ADMIN") return true;
  if (user.role === "PPABP") return cekPpabp(user, targetSatuanKerja);
  return user.role === "KASUBAG_TU" && user.satuanKerja === targetSatuanKerja;
}

/**
 * Memindahkan pegawai ke satuan kerja LAIN (mutasi). Sengaja dipisah dari
 * canEditDataPegawai: buat KASUBAG_TU ini operasi satu arah yang tidak bisa
 * dibatalkan sendiri - begitu pegawainya dipindah keluar unit, dia langsung
 * di luar jangkauan Kasubag TU itu (tidak bisa dikembalikan tanpa bantuan
 * PPABP/Admin). Makanya mutasi keluar unit SENGAJA cuma PPABP & ADMIN.
 */
export function canPindahSatuanKerjaPegawai(user: AuthUser, satuanKerjaAsal: string): boolean {
  if (!user.aktif) return false;
  if (user.role === "ADMIN") return true;
  return user.role === "PPABP" && cekPpabp(user, satuanKerjaAsal);
}

/**
 * TIDAK ADA role yang boleh edit data presensi/kinerja secara LANGSUNG -
 * jalur koreksi yang SAH cuma: (1) Banding (ajukan -> diverifikasi
 * berjenjang), atau (2) KASUBAG_TU pakai
 * canTarikAtauUploadPresensiUnit/canUploadKoreksiPredikatKinerjaUnit (masih
 * di-scope unitnya, bukan "edit bebas"). Fungsi ini SENGAJA selalu false
 * dan TIDAK ikut kena bypass ADMIN - didokumentasikan eksplisit di sini
 * supaya tidak ada yang "lupa" nambahin fitur edit langsung tanpa jejak.
 */
export function canEditPresensiKinerjaLangsung(_user: AuthUser): boolean {
  return false;
}
