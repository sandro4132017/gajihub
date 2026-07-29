import { describe, it, expect } from "vitest";
import {
  canViewDataSendiri,
  canAjukanBanding,
  canUploadBuktiDukung,
  canLihatStatusBandingSendiri,
  canCetakSlipGajiSendiri,
  canDownloadBuktiPotongPajakSendiri,
  canViewRekapUnitKerja,
  canVerifikasiBandingJenjang1,
  canApproveJenjang1,
  canMonitorRekonsiliasiUnit,
  canTarikAtauUploadPresensiUnit,
  canTarikUlangPresensiUnit,
  canUploadKoreksiPredikatKinerjaUnit,
  canAjukanKalkulasiTukinMassalUnit,
  canTelaahAjukanUangMakanUnit,
  canTelaahKoreksiAjukanUangLemburUnit,
  canViewDashboardUnit,
  canAjukanSkKgb,
  canInputSkHukumanDisiplin,
  canReviewPerubahanDataMaster,
  canUpdateSkPegawaiStrukturalFungsional,
  canApproveBandingFinal,
  canApproveSkKgb,
  canApproveSkHukumanDisiplin,
  canMonitorKepatuhanData,
  canTarikAtauUploadPresensiFallback,
  canTelaahValidasiPengajuanLintasUnit,
  canApproveJenjangFinal,
  canHandleSelisih,
  canGenerateAdk,
  canUploadAnggaranRealisasi,
  canKelolaGajiInduk,
  canUploadRekapPredikatKinerja,
  canBukaHalamanPredikatKinerja,
  canMonitorUbahStatusLintasUnit,
  canViewRekonsiliasiLintasSatker,
  canUsulkanPerubahanRole,
  canViewDashboardLintasUnit,
  canKelolaAssignmentRole,
  canEksekusiPerubahanRole,
  canMonitorKesehatanSistem,
  canKonfigurasiAdapter,
  canViewDataPayroll,
  canViewApproverDashboard,
  canViewPegawai,
  canEditPresensiKinerjaLangsung,
  canKelolaDataPegawai,
  canEditDataPegawai,
  canPindahSatuanKerjaPegawai,
  type AuthUser,
} from "../permissions";

function buatUser(overrides: Partial<AuthUser>): AuthUser {
  return {
    nip: "000000000000000001",
    role: "PEGAWAI",
    satuanKerja: null,
    aktif: true,
    ...overrides,
  };
}

const SEMUA_ROLE: AuthUser["role"][] = ["PEGAWAI", "KASUBAG_TU", "PPABP", "OSDMA", "PIMPINAN", "ADMIN"];
const SETJEN = "Sekretariat Jenderal";
const BIRO_UMUM = "Biro Umum";

describe("PEGAWAI - self-service, SEMUA role otomatis punya privilege ini buat data sendiri", () => {
  it("canViewDataSendiri: diizinkan kalau nip cocok, apapun role-nya", () => {
    for (const role of SEMUA_ROLE) {
      const user = buatUser({ role, nip: "111", satuanKerja: role === "KASUBAG_TU" ? SETJEN : null });
      expect(canViewDataSendiri(user, "111")).toBe(true);
    }
  });

  it("canViewDataSendiri: DITOLAK kalau lihat NIP pegawai lain, apapun role-nya", () => {
    for (const role of SEMUA_ROLE) {
      const user = buatUser({ role, nip: "111" });
      expect(canViewDataSendiri(user, "222")).toBe(false);
    }
  });

  it("canViewDataSendiri: DITOLAK kalau akun tidak aktif", () => {
    const user = buatUser({ role: "PEGAWAI", nip: "111", aktif: false });
    expect(canViewDataSendiri(user, "111")).toBe(false);
  });

  it("canAjukanBanding, canCetakSlipGajiSendiri, canDownloadBuktiPotongPajakSendiri: sama pola dengan canViewDataSendiri", () => {
    const user = buatUser({ role: "KASUBAG_TU", nip: "111", satuanKerja: SETJEN });
    expect(canAjukanBanding(user, "111")).toBe(true);
    expect(canAjukanBanding(user, "222")).toBe(false);
    expect(canCetakSlipGajiSendiri(user, "111")).toBe(true);
    expect(canCetakSlipGajiSendiri(user, "222")).toBe(false);
    expect(canDownloadBuktiPotongPajakSendiri(user, "111")).toBe(true);
    expect(canDownloadBuktiPotongPajakSendiri(user, "222")).toBe(false);
  });

  it("canUploadBuktiDukung: diizinkan cuma buat banding sendiri", () => {
    const user = buatUser({ role: "PEGAWAI", nip: "111" });
    expect(canUploadBuktiDukung(user, { pengajuNip: "111", satuanKerjaPegawai: SETJEN })).toBe(true);
    expect(canUploadBuktiDukung(user, { pengajuNip: "222", satuanKerjaPegawai: SETJEN })).toBe(false);
  });

  it("canUploadBuktiDukung: DITOLAK buat KASUBAG_TU walau sama unit (bukan pengaju)", () => {
    const kasubag = buatUser({ role: "KASUBAG_TU", nip: "999", satuanKerja: SETJEN });
    expect(canUploadBuktiDukung(kasubag, { pengajuNip: "111", satuanKerjaPegawai: SETJEN })).toBe(false);
  });

  it("canLihatStatusBandingSendiri: cocok nip = diizinkan, tidak cocok = ditolak", () => {
    const user = buatUser({ role: "PEGAWAI", nip: "111" });
    expect(canLihatStatusBandingSendiri(user, { pengajuNip: "111", satuanKerjaPegawai: SETJEN })).toBe(true);
    expect(canLihatStatusBandingSendiri(user, { pengajuNip: "222", satuanKerjaPegawai: SETJEN })).toBe(false);
  });
});

describe("KASUBAG_TU - verifikator satker", () => {
  it("canViewRekapUnitKerja: diizinkan cuma buat satuan kerjanya sendiri", () => {
    const user = buatUser({ role: "KASUBAG_TU", satuanKerja: SETJEN });
    expect(canViewRekapUnitKerja(user, SETJEN)).toBe(true);
  });

  it("canViewRekapUnitKerja: DITOLAK buat unit kerja lain", () => {
    const user = buatUser({ role: "KASUBAG_TU", satuanKerja: SETJEN });
    expect(canViewRekapUnitKerja(user, BIRO_UMUM)).toBe(false);
  });

  it("canViewRekapUnitKerja: DITOLAK buat role PEGAWAI walau satuanKerja diisi sama", () => {
    const user = buatUser({ role: "PEGAWAI", satuanKerja: SETJEN });
    expect(canViewRekapUnitKerja(user, SETJEN)).toBe(false);
  });

  it("canVerifikasiBandingJenjang1: diizinkan cuma buat banding dari unitnya", () => {
    const user = buatUser({ role: "KASUBAG_TU", satuanKerja: SETJEN });
    expect(canVerifikasiBandingJenjang1(user, { pengajuNip: "111", satuanKerjaPegawai: SETJEN })).toBe(true);
    expect(canVerifikasiBandingJenjang1(user, { pengajuNip: "111", satuanKerjaPegawai: BIRO_UMUM })).toBe(false);
  });

  it("canApproveJenjang1: diizinkan buat unitnya, DITOLAK buat unit lain", () => {
    const user = buatUser({ role: "KASUBAG_TU", satuanKerja: SETJEN });
    expect(canApproveJenjang1(user, SETJEN)).toBe(true);
    expect(canApproveJenjang1(user, BIRO_UMUM)).toBe(false);
  });

  it("canApproveJenjang1: DITOLAK buat PPABP (bukan wewenangnya, itu jenjang final)", () => {
    const ppabp = buatUser({ role: "PPABP", satuanKerja: null });
    expect(canApproveJenjang1(ppabp, SETJEN)).toBe(false);
  });

  it("canMonitorRekonsiliasiUnit: sama pola scoping dengan canViewRekapUnitKerja", () => {
    const user = buatUser({ role: "KASUBAG_TU", satuanKerja: SETJEN });
    expect(canMonitorRekonsiliasiUnit(user, SETJEN)).toBe(true);
    expect(canMonitorRekonsiliasiUnit(user, BIRO_UMUM)).toBe(false);
  });

  it("fungsi presensi/kinerja/kalkulasi massal/telaah UM & lembur/dashboard unit/SK KGB/SK hukdis: sama pola scoping unit", () => {
    const user = buatUser({ role: "KASUBAG_TU", satuanKerja: SETJEN });
    const lain = buatUser({ role: "KASUBAG_TU", satuanKerja: BIRO_UMUM });
    const fungsi = [
      canTarikAtauUploadPresensiUnit,
      canTarikUlangPresensiUnit,
      canUploadKoreksiPredikatKinerjaUnit,
      canAjukanKalkulasiTukinMassalUnit,
      canTelaahAjukanUangMakanUnit,
      canTelaahKoreksiAjukanUangLemburUnit,
      canViewDashboardUnit,
      canAjukanSkKgb,
      canInputSkHukumanDisiplin,
    ];
    for (const fn of fungsi) {
      expect(fn(user, SETJEN)).toBe(true);
      expect(fn(user, BIRO_UMUM)).toBe(false);
      expect(fn(lain, SETJEN)).toBe(false);
    }
  });
});

describe("PPABP - approval jenjang final, lintas satker", () => {
  it("canApproveJenjangFinal: PPABP pusat (satuanKerja NULL) diizinkan lintas semua satker", () => {
    const ppabpPusat = buatUser({ role: "PPABP", satuanKerja: null });
    expect(canApproveJenjangFinal(ppabpPusat, SETJEN)).toBe(true);
    expect(canApproveJenjangFinal(ppabpPusat, BIRO_UMUM)).toBe(true);
  });

  it("canApproveJenjangFinal: PPABP tetap lintas satker WALAU User.satuanKerja terisi", () => {
    // MENGGANTIKAN test lama yang mengunci "PPABP per-satker cuma diizinkan
    // buat satkernya". Perilaku itu sengaja dicabut: `User.satuanKerja` itu
    // kolom milik KASUBAG_TU dan WAJIB diisi kalau akun punya role Kasubag
    // TU, jadi memakainya juga buat men-scope PPABP bikin akun multi-role
    // kehilangan jangkauan lintas unit tanpa alasan. Lihat komentar cekPpabp
    // di permissions.ts - scoping PPABP per satker butuh kolomnya sendiri.
    const ppabpSatker = buatUser({ role: "PPABP", satuanKerja: SETJEN });
    expect(canApproveJenjangFinal(ppabpSatker, SETJEN)).toBe(true);
    expect(canApproveJenjangFinal(ppabpSatker, BIRO_UMUM)).toBe(true);
  });

  it("canApproveJenjangFinal: DITOLAK buat KASUBAG_TU (bukan jenjang final)", () => {
    const kasubag = buatUser({ role: "KASUBAG_TU", satuanKerja: SETJEN });
    expect(canApproveJenjangFinal(kasubag, SETJEN)).toBe(false);
  });

  it("canHandleSelisih, canViewRekonsiliasiLintasSatker, canTelaahValidasiPengajuanLintasUnit, canMonitorUbahStatusLintasUnit: ikut pola scoping PPABP yang sama", () => {
    const ppabpPusat = buatUser({ role: "PPABP", satuanKerja: null });
    expect(canHandleSelisih(ppabpPusat, SETJEN)).toBe(true);
    expect(canViewRekonsiliasiLintasSatker(ppabpPusat, SETJEN)).toBe(true);
    expect(canTelaahValidasiPengajuanLintasUnit(ppabpPusat, SETJEN)).toBe(true);
    expect(canMonitorUbahStatusLintasUnit(ppabpPusat, SETJEN)).toBe(true);

    const bukanPpabp = buatUser({ role: "OSDMA", satuanKerja: null });
    expect(canHandleSelisih(bukanPpabp, SETJEN)).toBe(false);
    expect(canViewRekonsiliasiLintasSatker(bukanPpabp, SETJEN)).toBe(false);
    expect(canTelaahValidasiPengajuanLintasUnit(bukanPpabp, SETJEN)).toBe(false);
    expect(canMonitorUbahStatusLintasUnit(bukanPpabp, SETJEN)).toBe(false);
  });

  it("canGenerateAdk, canUploadAnggaranRealisasi, canUsulkanPerubahanRole, canTarikAtauUploadPresensiFallback: PPABP (dan ADMIN lewat bypass privilege penuh), DITOLAK buat OSDMA/PIMPINAN", () => {
    const ppabp = buatUser({ role: "PPABP", satuanKerja: null });
    expect(canGenerateAdk(ppabp)).toBe(true);
    expect(canUploadAnggaranRealisasi(ppabp)).toBe(true);
    expect(canUsulkanPerubahanRole(ppabp)).toBe(true);
    expect(canTarikAtauUploadPresensiFallback(ppabp)).toBe(true);

    const admin = buatUser({ role: "ADMIN" });
    expect(canGenerateAdk(admin)).toBe(true);
    expect(canUploadAnggaranRealisasi(admin)).toBe(true);
    expect(canUsulkanPerubahanRole(admin)).toBe(true);
    expect(canTarikAtauUploadPresensiFallback(admin)).toBe(true);

    const pimpinan = buatUser({ role: "PIMPINAN" });
    expect(canGenerateAdk(pimpinan)).toBe(false);
    expect(canUploadAnggaranRealisasi(pimpinan)).toBe(false);
    expect(canUsulkanPerubahanRole(pimpinan)).toBe(false);
    expect(canTarikAtauUploadPresensiFallback(pimpinan)).toBe(false);
  });

  it("canKelolaGajiInduk: PPABP (+ ADMIN), DITOLAK buat KASUBAG_TU - beda dari upload bukti potong pajak", () => {
    expect(canKelolaGajiInduk(buatUser({ role: "PPABP", satuanKerja: null }))).toBe(true);
    expect(canKelolaGajiInduk(buatUser({ role: "ADMIN" }))).toBe(true);

    // Kasubag TU sengaja TIDAK diberi izin - file ADK gaji dari Kemenkeu dan
    // tanda tangan slip "Perincian Pembayaran Gaji" ada di PPABP.
    expect(canKelolaGajiInduk(buatUser({ role: "KASUBAG_TU", satuanKerja: SETJEN }))).toBe(false);
    expect(canKelolaGajiInduk(buatUser({ role: "OSDMA" }))).toBe(false);
    expect(canKelolaGajiInduk(buatUser({ role: "PIMPINAN" }))).toBe(false);
    expect(canKelolaGajiInduk(buatUser({ role: "PEGAWAI" }))).toBe(false);
  });

  it("canKelolaGajiInduk: DITOLAK buat akun nonaktif walau rolenya PPABP", () => {
    expect(canKelolaGajiInduk(buatUser({ role: "PPABP", aktif: false }))).toBe(false);
  });

  it("canViewDashboardLintasUnit: diizinkan buat PPABP & PIMPINAN, ditolak buat KASUBAG_TU/OSDMA/PEGAWAI", () => {
    expect(canViewDashboardLintasUnit(buatUser({ role: "PPABP" }))).toBe(true);
    expect(canViewDashboardLintasUnit(buatUser({ role: "PIMPINAN" }))).toBe(true);
    expect(canViewDashboardLintasUnit(buatUser({ role: "KASUBAG_TU", satuanKerja: SETJEN }))).toBe(false);
    expect(canViewDashboardLintasUnit(buatUser({ role: "OSDMA" }))).toBe(false);
    expect(canViewDashboardLintasUnit(buatUser({ role: "PEGAWAI" }))).toBe(false);
  });
});

describe("OSDMA - data steward, approval final Banding & SK", () => {
  it("canReviewPerubahanDataMaster, canUpdateSkPegawaiStrukturalFungsional: diizinkan buat OSDMA, ditolak buat role lain", () => {
    expect(canReviewPerubahanDataMaster(buatUser({ role: "OSDMA" }))).toBe(true);
    expect(canUpdateSkPegawaiStrukturalFungsional(buatUser({ role: "OSDMA" }))).toBe(true);
    expect(canReviewPerubahanDataMaster(buatUser({ role: "KASUBAG_TU", satuanKerja: SETJEN }))).toBe(false);
  });

  it("canApproveBandingFinal, canApproveSkKgb, canApproveSkHukumanDisiplin, canMonitorKepatuhanData: sama, cuma OSDMA", () => {
    const osdma = buatUser({ role: "OSDMA" });
    expect(canApproveBandingFinal(osdma)).toBe(true);
    expect(canApproveSkKgb(osdma)).toBe(true);
    expect(canApproveSkHukumanDisiplin(osdma)).toBe(true);
    expect(canMonitorKepatuhanData(osdma)).toBe(true);

    const pimpinan = buatUser({ role: "PIMPINAN" });
    expect(canApproveBandingFinal(pimpinan)).toBe(false);
    expect(canApproveSkKgb(pimpinan)).toBe(false);
    expect(canApproveSkHukumanDisiplin(pimpinan)).toBe(false);
    expect(canMonitorKepatuhanData(pimpinan)).toBe(false);
  });

  it("canReviewPerubahanDataMaster: DITOLAK kalau OSDMA tidak aktif", () => {
    expect(canReviewPerubahanDataMaster(buatUser({ role: "OSDMA", aktif: false }))).toBe(false);
  });
});

describe("ADMIN - privilege teknis + SEMUA role lain (simulasi/demo, lihat TODO(confirm) di schema)", () => {
  it("canKelolaAssignmentRole, canEksekusiPerubahanRole, canMonitorKesehatanSistem, canKonfigurasiAdapter: diizinkan buat ADMIN", () => {
    const admin = buatUser({ role: "ADMIN" });
    expect(canKelolaAssignmentRole(admin)).toBe(true);
    expect(canEksekusiPerubahanRole(admin)).toBe(true);
    expect(canMonitorKesehatanSistem(admin)).toBe(true);
    expect(canKonfigurasiAdapter(admin)).toBe(true);
  });

  it("fungsi teknis: DITOLAK buat role lain (misal PIMPINAN) - TIDAK ADA bypass admin buat fungsi admin-only ini sendiri", () => {
    const pimpinan = buatUser({ role: "PIMPINAN" });
    expect(canKelolaAssignmentRole(pimpinan)).toBe(false);
    expect(canEksekusiPerubahanRole(pimpinan)).toBe(false);
    expect(canMonitorKesehatanSistem(pimpinan)).toBe(false);
    expect(canKonfigurasiAdapter(pimpinan)).toBe(false);
  });

  it("canEksekusiPerubahanRole: DITOLAK buat PPABP (cuma bisa usulkan, bukan eksekusi - lihat canUsulkanPerubahanRole)", () => {
    expect(canEksekusiPerubahanRole(buatUser({ role: "PPABP", satuanKerja: null }))).toBe(false);
  });

  it("canViewDataPayroll: diizinkan buat ADMIN (privilege penuh, BUKAN desain final - lihat TODO(confirm))", () => {
    const admin = buatUser({ role: "ADMIN", aktif: true });
    expect(canViewDataPayroll(admin)).toBe(true);
  });

  it("canViewDataPayroll: DITOLAK kalau akun tidak aktif, apapun role-nya", () => {
    expect(canViewDataPayroll(buatUser({ role: "ADMIN", aktif: false }))).toBe(false);
  });

  it("canViewDataPayroll: diizinkan (secara umum) buat role lain yang aktif", () => {
    expect(canViewDataPayroll(buatUser({ role: "PEGAWAI" }))).toBe(true);
    expect(canViewDataPayroll(buatUser({ role: "KASUBAG_TU", satuanKerja: SETJEN }))).toBe(true);
  });

  it("canViewPegawai: diizinkan buat ADMIN (privilege penuh)", () => {
    const admin = buatUser({ role: "ADMIN" });
    expect(canViewPegawai(admin, { nip: "111", satuanKerja: SETJEN })).toBe(true);
  });

  it("canViewApproverDashboard: diizinkan buat ADMIN, DITOLAK buat PEGAWAI (diarahkan ke /saya)", () => {
    expect(canViewApproverDashboard(buatUser({ role: "ADMIN" }))).toBe(true);
    expect(canViewApproverDashboard(buatUser({ role: "PEGAWAI" }))).toBe(false);
  });

  it("ADMIN privilege semua role lain - fungsi role-scoped (KASUBAG_TU/OSDMA/PPABP) diizinkan buat ADMIN apapun target-nya", () => {
    const admin = buatUser({ role: "ADMIN" });
    expect(canViewRekapUnitKerja(admin, SETJEN)).toBe(true);
    expect(canApproveJenjang1(admin, BIRO_UMUM)).toBe(true);
    expect(canAjukanKalkulasiTukinMassalUnit(admin, SETJEN)).toBe(true);
    expect(canReviewPerubahanDataMaster(admin)).toBe(true);
    expect(canApproveBandingFinal(admin)).toBe(true);
    expect(canApproveJenjangFinal(admin, SETJEN)).toBe(true);
    expect(canGenerateAdk(admin)).toBe(true);
    expect(canViewDashboardLintasUnit(admin)).toBe(true);
  });

  it("canEditPresensiKinerjaLangsung: SELALU false, TIDAK ikut bypass ADMIN (invariant, bukan role permission)", () => {
    for (const role of SEMUA_ROLE) {
      expect(canEditPresensiKinerjaLangsung(buatUser({ role, satuanKerja: SETJEN }))).toBe(false);
    }
  });
});

describe("Data pokok pegawai (/pegawai) - ADMIN, PPABP, KASUBAG_TU", () => {
  it("canKelolaDataPegawai: cuma ADMIN, PPABP, KASUBAG_TU", () => {
    expect(canKelolaDataPegawai(buatUser({ role: "ADMIN" }))).toBe(true);
    expect(canKelolaDataPegawai(buatUser({ role: "PPABP" }))).toBe(true);
    expect(canKelolaDataPegawai(buatUser({ role: "KASUBAG_TU", satuanKerja: SETJEN }))).toBe(true);
    expect(canKelolaDataPegawai(buatUser({ role: "OSDMA" }))).toBe(false);
    expect(canKelolaDataPegawai(buatUser({ role: "PIMPINAN" }))).toBe(false);
    expect(canKelolaDataPegawai(buatUser({ role: "PEGAWAI" }))).toBe(false);
  });

  it("canEditDataPegawai: KASUBAG_TU cuma pegawai unitnya sendiri", () => {
    const kasubag = buatUser({ role: "KASUBAG_TU", satuanKerja: SETJEN });
    expect(canEditDataPegawai(kasubag, SETJEN)).toBe(true);
    expect(canEditDataPegawai(kasubag, BIRO_UMUM)).toBe(false);
  });

  it("canEditDataPegawai: KASUBAG_TU tanpa satuan kerja (akun 'buta unit') DITOLAK di semua unit", () => {
    const butaUnit = buatUser({ role: "KASUBAG_TU", satuanKerja: null });
    expect(canEditDataPegawai(butaUnit, SETJEN)).toBe(false);
    expect(canEditDataPegawai(butaUnit, BIRO_UMUM)).toBe(false);
  });

  it("canEditDataPegawai: PPABP pusat & ADMIN lintas satker", () => {
    expect(canEditDataPegawai(buatUser({ role: "PPABP", satuanKerja: null }), BIRO_UMUM)).toBe(true);
    expect(canEditDataPegawai(buatUser({ role: "ADMIN" }), BIRO_UMUM)).toBe(true);
  });

  it("canEditDataPegawai: OSDMA/PIMPINAN/PEGAWAI DITOLAK", () => {
    for (const role of ["OSDMA", "PIMPINAN", "PEGAWAI"] as const) {
      expect(canEditDataPegawai(buatUser({ role }), SETJEN)).toBe(false);
    }
  });

  it("canPindahSatuanKerjaPegawai: KASUBAG_TU DITOLAK walau di unitnya sendiri (mutasi keluar tidak bisa dibatalkan sendiri)", () => {
    expect(canPindahSatuanKerjaPegawai(buatUser({ role: "KASUBAG_TU", satuanKerja: SETJEN }), SETJEN)).toBe(false);
    expect(canPindahSatuanKerjaPegawai(buatUser({ role: "PPABP", satuanKerja: null }), SETJEN)).toBe(true);
    expect(canPindahSatuanKerjaPegawai(buatUser({ role: "ADMIN" }), SETJEN)).toBe(true);
  });

  it("akun nonaktif: DITOLAK apapun role-nya", () => {
    expect(canKelolaDataPegawai(buatUser({ role: "ADMIN", aktif: false }))).toBe(false);
    expect(canEditDataPegawai(buatUser({ role: "ADMIN", aktif: false }), SETJEN)).toBe(false);
    expect(canPindahSatuanKerjaPegawai(buatUser({ role: "ADMIN", aktif: false }), SETJEN)).toBe(false);
  });
});

describe("canViewPegawai - gabungan aturan lintas role", () => {
  const target = { nip: "111", satuanKerja: SETJEN };

  it("PEGAWAI: cuma boleh lihat NIP sendiri", () => {
    expect(canViewPegawai(buatUser({ role: "PEGAWAI", nip: "111" }), target)).toBe(true);
    expect(canViewPegawai(buatUser({ role: "PEGAWAI", nip: "222" }), target)).toBe(false);
  });

  it("KASUBAG_TU: cuma boleh lihat pegawai di satuan kerjanya", () => {
    expect(canViewPegawai(buatUser({ role: "KASUBAG_TU", satuanKerja: SETJEN }), target)).toBe(true);
    expect(canViewPegawai(buatUser({ role: "KASUBAG_TU", satuanKerja: BIRO_UMUM }), target)).toBe(false);
  });

  it("PPABP pusat: boleh lihat pegawai satker manapun", () => {
    expect(canViewPegawai(buatUser({ role: "PPABP", satuanKerja: null }), target)).toBe(true);
    expect(canViewPegawai(buatUser({ role: "PPABP", satuanKerja: null }), { nip: "222", satuanKerja: BIRO_UMUM })).toBe(true);
  });

  it("OSDMA & PIMPINAN: boleh lihat pegawai manapun", () => {
    expect(canViewPegawai(buatUser({ role: "OSDMA" }), target)).toBe(true);
    expect(canViewPegawai(buatUser({ role: "PIMPINAN" }), target)).toBe(true);
  });

  it("akun nonaktif: DITOLAK apapun role-nya", () => {
    expect(canViewPegawai(buatUser({ role: "PIMPINAN", aktif: false }), target)).toBe(false);
  });
});

describe("Upload rekap predikat kinerja e-Kinerja BKN (Kasubag TU + PPABP)", () => {
  it("canBukaHalamanPredikatKinerja: KASUBAG_TU/PPABP/ADMIN boleh, sisanya ditolak", () => {
    expect(canBukaHalamanPredikatKinerja(buatUser({ role: "KASUBAG_TU", satuanKerja: SETJEN }))).toBe(true);
    expect(canBukaHalamanPredikatKinerja(buatUser({ role: "PPABP", satuanKerja: null }))).toBe(true);
    expect(canBukaHalamanPredikatKinerja(buatUser({ role: "ADMIN" }))).toBe(true);

    expect(canBukaHalamanPredikatKinerja(buatUser({ role: "OSDMA" }))).toBe(false);
    expect(canBukaHalamanPredikatKinerja(buatUser({ role: "PIMPINAN" }))).toBe(false);
    expect(canBukaHalamanPredikatKinerja(buatUser({ role: "PEGAWAI" }))).toBe(false);
    expect(canBukaHalamanPredikatKinerja(buatUser({ role: "PPABP", aktif: false }))).toBe(false);
  });

  it("canUploadRekapPredikatKinerja: KASUBAG_TU CUMA unitnya sendiri", () => {
    const kasubag = buatUser({ role: "KASUBAG_TU", satuanKerja: SETJEN });
    expect(canUploadRekapPredikatKinerja(kasubag, SETJEN)).toBe(true);
    // Inti pengamanannya: satu file rekap bisa memuat pegawai lintas unit,
    // dan baris di luar unitnya TIDAK boleh ikut tertulis.
    expect(canUploadRekapPredikatKinerja(kasubag, BIRO_UMUM)).toBe(false);
  });

  it("canUploadRekapPredikatKinerja: PPABP & ADMIN lintas unit", () => {
    const ppabp = buatUser({ role: "PPABP", satuanKerja: null });
    expect(canUploadRekapPredikatKinerja(ppabp, SETJEN)).toBe(true);
    expect(canUploadRekapPredikatKinerja(ppabp, BIRO_UMUM)).toBe(true);

    const admin = buatUser({ role: "ADMIN" });
    expect(canUploadRekapPredikatKinerja(admin, SETJEN)).toBe(true);
    expect(canUploadRekapPredikatKinerja(admin, BIRO_UMUM)).toBe(true);
  });

  it("canUploadRekapPredikatKinerja: DITOLAK buat OSDMA/PIMPINAN/PEGAWAI & akun nonaktif", () => {
    expect(canUploadRekapPredikatKinerja(buatUser({ role: "OSDMA" }), SETJEN)).toBe(false);
    expect(canUploadRekapPredikatKinerja(buatUser({ role: "PIMPINAN" }), SETJEN)).toBe(false);
    expect(canUploadRekapPredikatKinerja(buatUser({ role: "PEGAWAI" }), SETJEN)).toBe(false);
    expect(canUploadRekapPredikatKinerja(buatUser({ role: "KASUBAG_TU", satuanKerja: SETJEN, aktif: false }), SETJEN)).toBe(false);
  });

  it("canEditPresensiKinerjaLangsung TETAP false - upload rekap bukan pintu belakang buat edit bebas", () => {
    for (const role of SEMUA_ROLE) {
      expect(canEditPresensiKinerjaLangsung(buatUser({ role, satuanKerja: SETJEN }))).toBe(false);
    }
  });
});

/**
 * Skenario NYATA yang bikin aturan ini ada: akun ADMIN demo (Alpha Sandro)
 * punya SEMUA role sebagai role tambahan, jadi `User.satuanKerja`-nya WAJIB
 * terisi (KASUBAG_TU ada di daftar rolenya). Waktu dia ganti sudut pandang
 * ke PPABP, otorisasi dievaluasi terhadap role AKTIF itu saja - tanpa bypass
 * ADMIN. Dia harus tetap bisa menindaklanjuti unit MANA SAJA, supaya
 * perubahan tidak macet nunggu satu orang PPABP.
 */
describe("Akun multi-role sedang memakai role PPABP (satuanKerja terisi buat Kasubag TU)", () => {
  const PUSDATIK = "Pusat Data dan Teknologi Informasi Ketenagakerjaan";
  // Role AKTIF = PPABP. `satuanKerja` terisi karena akun ini JUGA Kasubag TU.
  const adminSebagaiPpabp = buatUser({ role: "PPABP", satuanKerja: PUSDATIK });

  it("boleh upload rekap predikat kinerja unit MANA SAJA, bukan cuma unit akunnya", () => {
    expect(canUploadRekapPredikatKinerja(adminSebagaiPpabp, PUSDATIK)).toBe(true);
    expect(canUploadRekapPredikatKinerja(adminSebagaiPpabp, BIRO_UMUM)).toBe(true);
    expect(canUploadRekapPredikatKinerja(adminSebagaiPpabp, SETJEN)).toBe(true);
  });

  it("boleh edit data pegawai unit MANA SAJA, termasuk memindahkan satuan kerjanya", () => {
    expect(canEditDataPegawai(adminSebagaiPpabp, BIRO_UMUM)).toBe(true);
    expect(canEditDataPegawai(adminSebagaiPpabp, SETJEN)).toBe(true);
    expect(canPindahSatuanKerjaPegawai(adminSebagaiPpabp, BIRO_UMUM)).toBe(true);
  });

  it("kewenangan PPABP lintas unit lain juga ikut utuh", () => {
    expect(canApproveJenjangFinal(adminSebagaiPpabp, BIRO_UMUM)).toBe(true);
    expect(canHandleSelisih(adminSebagaiPpabp, BIRO_UMUM)).toBe(true);
    expect(canViewRekonsiliasiLintasSatker(adminSebagaiPpabp, BIRO_UMUM)).toBe(true);
    expect(canTelaahValidasiPengajuanLintasUnit(adminSebagaiPpabp, BIRO_UMUM)).toBe(true);
    expect(canMonitorUbahStatusLintasUnit(adminSebagaiPpabp, BIRO_UMUM)).toBe(true);
    expect(canGenerateAdk(adminSebagaiPpabp)).toBe(true);
    expect(canKelolaGajiInduk(adminSebagaiPpabp)).toBe(true);
  });

  it("BUKAN berarti role aktif jadi tidak berarti - sebagai PPABP dia TETAP kehilangan hak khusus ADMIN", () => {
    // Inti fitur multi-role: yang dievaluasi role AKTIF, bukan role yang
    // dipunya. Kalau ini bocor, ganti role jadi tidak ada artinya.
    expect(canKelolaAssignmentRole(adminSebagaiPpabp)).toBe(false);
    expect(canEksekusiPerubahanRole(adminSebagaiPpabp)).toBe(false);
    expect(canMonitorKesehatanSistem(adminSebagaiPpabp)).toBe(false);
    expect(canKonfigurasiAdapter(adminSebagaiPpabp)).toBe(false);
  });

  it("sebagai KASUBAG_TU akun yang sama TETAP terkunci ke unitnya", () => {
    // Kolom satuanKerja tetap berfungsi penuh untuk role yang memang
    // memilikinya - yang dicabut cuma pemakaiannya buat men-scope PPABP.
    const adminSebagaiKasubag = buatUser({ role: "KASUBAG_TU", satuanKerja: PUSDATIK });
    expect(canUploadRekapPredikatKinerja(adminSebagaiKasubag, PUSDATIK)).toBe(true);
    expect(canUploadRekapPredikatKinerja(adminSebagaiKasubag, BIRO_UMUM)).toBe(false);
    expect(canEditDataPegawai(adminSebagaiKasubag, BIRO_UMUM)).toBe(false);
    expect(canPindahSatuanKerjaPegawai(adminSebagaiKasubag, PUSDATIK)).toBe(false);
  });
});
