import { describe, it, expect } from "vitest";
import {
  canViewDataSendiri,
  canAjukanSanggahan,
  canUploadBuktiPendukung,
  canLihatStatusSanggahanSendiri,
  canViewRekapUnitKerja,
  canVerifikasiSanggahanTahap1,
  canApproveJenjang1,
  canMonitorRekonsiliasiUnit,
  canApproveJenjangFinal,
  canHandleSelisih,
  canGenerateAdk,
  canViewRekonsiliasiLintasSatker,
  canReviewPerubahanDataMaster,
  canVerifikasiSanggahanTahapOsdma,
  canMonitorKepatuhanData,
  canKelolaAssignmentRole,
  canMonitorKesehatanSistem,
  canKonfigurasiAdapter,
  canViewDataPayroll,
  canViewAuditTrail,
  canViewApprovalLogSemua,
  canViewHistoriSanggahanSemua,
  canExportLaporan,
  canViewDashboardRingkasanKementerian,
  canViewPegawai,
  canEditPresensiKinerjaLangsung,
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

const SETJEN = "Sekretariat Jenderal";
const BIRO_UMUM = "Biro Umum";

describe("PEGAWAI - self-service", () => {
  it("canViewDataSendiri: diizinkan kalau nip cocok", () => {
    const user = buatUser({ role: "PEGAWAI", nip: "111" });
    expect(canViewDataSendiri(user, "111")).toBe(true);
  });

  it("canViewDataSendiri: DITOLAK kalau lihat NIP pegawai lain", () => {
    const user = buatUser({ role: "PEGAWAI", nip: "111" });
    expect(canViewDataSendiri(user, "222")).toBe(false);
  });

  it("canViewDataSendiri: DITOLAK buat role lain walau nip cocok", () => {
    const user = buatUser({ role: "KASUBAG_TU", nip: "111", satuanKerja: SETJEN });
    expect(canViewDataSendiri(user, "111")).toBe(false);
  });

  it("canViewDataSendiri: DITOLAK kalau akun tidak aktif", () => {
    const user = buatUser({ role: "PEGAWAI", nip: "111", aktif: false });
    expect(canViewDataSendiri(user, "111")).toBe(false);
  });

  it("canAjukanSanggahan: diizinkan buat data sendiri, ditolak buat orang lain", () => {
    const user = buatUser({ role: "PEGAWAI", nip: "111" });
    expect(canAjukanSanggahan(user, "111")).toBe(true);
    expect(canAjukanSanggahan(user, "222")).toBe(false);
  });

  it("canUploadBuktiPendukung: diizinkan cuma buat sanggahan sendiri", () => {
    const user = buatUser({ role: "PEGAWAI", nip: "111" });
    expect(canUploadBuktiPendukung(user, { pengajuNip: "111", satuanKerjaPegawai: SETJEN })).toBe(true);
    expect(canUploadBuktiPendukung(user, { pengajuNip: "222", satuanKerjaPegawai: SETJEN })).toBe(false);
  });

  it("canUploadBuktiPendukung: DITOLAK buat KASUBAG_TU walau sama unit (bukan pengaju)", () => {
    const kasubag = buatUser({ role: "KASUBAG_TU", nip: "999", satuanKerja: SETJEN });
    expect(canUploadBuktiPendukung(kasubag, { pengajuNip: "111", satuanKerjaPegawai: SETJEN })).toBe(false);
  });

  it("canLihatStatusSanggahanSendiri: cocok nip = diizinkan, tidak cocok = ditolak", () => {
    const user = buatUser({ role: "PEGAWAI", nip: "111" });
    expect(canLihatStatusSanggahanSendiri(user, { pengajuNip: "111", satuanKerjaPegawai: SETJEN })).toBe(true);
    expect(canLihatStatusSanggahanSendiri(user, { pengajuNip: "222", satuanKerjaPegawai: SETJEN })).toBe(false);
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

  it("canVerifikasiSanggahanTahap1: diizinkan cuma buat sanggahan dari unitnya", () => {
    const user = buatUser({ role: "KASUBAG_TU", satuanKerja: SETJEN });
    expect(canVerifikasiSanggahanTahap1(user, { pengajuNip: "111", satuanKerjaPegawai: SETJEN })).toBe(true);
    expect(canVerifikasiSanggahanTahap1(user, { pengajuNip: "111", satuanKerjaPegawai: BIRO_UMUM })).toBe(false);
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
});

describe("PPABP - approval jenjang final, lintas satker", () => {
  it("canApproveJenjangFinal: PPABP pusat (satuanKerja NULL) diizinkan lintas semua satker", () => {
    const ppabpPusat = buatUser({ role: "PPABP", satuanKerja: null });
    expect(canApproveJenjangFinal(ppabpPusat, SETJEN)).toBe(true);
    expect(canApproveJenjangFinal(ppabpPusat, BIRO_UMUM)).toBe(true);
  });

  it("canApproveJenjangFinal: PPABP per-satker (kalau nanti di-scale) cuma diizinkan buat satkernya", () => {
    const ppabpSatker = buatUser({ role: "PPABP", satuanKerja: SETJEN });
    expect(canApproveJenjangFinal(ppabpSatker, SETJEN)).toBe(true);
    expect(canApproveJenjangFinal(ppabpSatker, BIRO_UMUM)).toBe(false);
  });

  it("canApproveJenjangFinal: DITOLAK buat KASUBAG_TU (bukan jenjang final)", () => {
    const kasubag = buatUser({ role: "KASUBAG_TU", satuanKerja: SETJEN });
    expect(canApproveJenjangFinal(kasubag, SETJEN)).toBe(false);
  });

  it("canHandleSelisih & canViewRekonsiliasiLintasSatker: ikut pola scoping PPABP yang sama", () => {
    const ppabpPusat = buatUser({ role: "PPABP", satuanKerja: null });
    expect(canHandleSelisih(ppabpPusat, SETJEN)).toBe(true);
    expect(canViewRekonsiliasiLintasSatker(ppabpPusat, SETJEN)).toBe(true);

    const bukanPpabp = buatUser({ role: "BIRO_OSDMA", satuanKerja: null });
    expect(canHandleSelisih(bukanPpabp, SETJEN)).toBe(false);
    expect(canViewRekonsiliasiLintasSatker(bukanPpabp, SETJEN)).toBe(false);
  });

  it("canGenerateAdk: cuma PPABP", () => {
    expect(canGenerateAdk(buatUser({ role: "PPABP", satuanKerja: null }))).toBe(true);
    expect(canGenerateAdk(buatUser({ role: "ADMIN_SISTEM" }))).toBe(false);
  });
});

describe("BIRO_OSDMA - data steward", () => {
  it("canReviewPerubahanDataMaster: diizinkan buat BIRO_OSDMA, ditolak buat role lain", () => {
    expect(canReviewPerubahanDataMaster(buatUser({ role: "BIRO_OSDMA" }))).toBe(true);
    expect(canReviewPerubahanDataMaster(buatUser({ role: "KASUBAG_TU", satuanKerja: SETJEN }))).toBe(false);
  });

  it("canVerifikasiSanggahanTahapOsdma & canMonitorKepatuhanData: sama, cuma BIRO_OSDMA", () => {
    const osdma = buatUser({ role: "BIRO_OSDMA" });
    expect(canVerifikasiSanggahanTahapOsdma(osdma)).toBe(true);
    expect(canMonitorKepatuhanData(osdma)).toBe(true);

    const pimpinan = buatUser({ role: "PIMPINAN" });
    expect(canVerifikasiSanggahanTahapOsdma(pimpinan)).toBe(false);
    expect(canMonitorKepatuhanData(pimpinan)).toBe(false);
  });

  it("canReviewPerubahanDataMaster: DITOLAK kalau BIRO_OSDMA tidak aktif", () => {
    expect(canReviewPerubahanDataMaster(buatUser({ role: "BIRO_OSDMA", aktif: false }))).toBe(false);
  });
});

describe("ADMIN_SISTEM - teknis saja, SENGAJA tidak boleh data payroll", () => {
  it("canKelolaAssignmentRole, canMonitorKesehatanSistem, canKonfigurasiAdapter: diizinkan buat ADMIN_SISTEM", () => {
    const admin = buatUser({ role: "ADMIN_SISTEM" });
    expect(canKelolaAssignmentRole(admin)).toBe(true);
    expect(canMonitorKesehatanSistem(admin)).toBe(true);
    expect(canKonfigurasiAdapter(admin)).toBe(true);
  });

  it("fungsi teknis: DITOLAK buat role lain (misal PIMPINAN)", () => {
    const pimpinan = buatUser({ role: "PIMPINAN" });
    expect(canKelolaAssignmentRole(pimpinan)).toBe(false);
    expect(canMonitorKesehatanSistem(pimpinan)).toBe(false);
    expect(canKonfigurasiAdapter(pimpinan)).toBe(false);
  });

  it("canViewDataPayroll: DITOLAK buat ADMIN_SISTEM meskipun aktif - INI ATURAN PALING PENTING, jangan sampai regresi", () => {
    const admin = buatUser({ role: "ADMIN_SISTEM", aktif: true });
    expect(canViewDataPayroll(admin)).toBe(false);
  });

  it("canViewDataPayroll: diizinkan (secara umum) buat role lain yang aktif", () => {
    expect(canViewDataPayroll(buatUser({ role: "PEGAWAI" }))).toBe(true);
    expect(canViewDataPayroll(buatUser({ role: "KASUBAG_TU", satuanKerja: SETJEN }))).toBe(true);
  });

  it("canViewPegawai: DITOLAK buat ADMIN_SISTEM walaupun aktif (guard eksplisit)", () => {
    const admin = buatUser({ role: "ADMIN_SISTEM" });
    expect(canViewPegawai(admin, { nip: "111", satuanKerja: SETJEN })).toBe(false);
  });
});

describe("ITJEN - auditor read-only", () => {
  it("canViewAuditTrail, canViewApprovalLogSemua, canViewHistoriSanggahanSemua, canExportLaporan: diizinkan buat ITJEN", () => {
    const itjen = buatUser({ role: "ITJEN" });
    expect(canViewAuditTrail(itjen)).toBe(true);
    expect(canViewApprovalLogSemua(itjen)).toBe(true);
    expect(canViewHistoriSanggahanSemua(itjen)).toBe(true);
    expect(canExportLaporan(itjen)).toBe(true);
  });

  it("fungsi ITJEN: DITOLAK buat role lain (misal PPABP, biar nggak asal lintas kewenangan)", () => {
    const ppabp = buatUser({ role: "PPABP", satuanKerja: null });
    expect(canViewAuditTrail(ppabp)).toBe(false);
    expect(canViewApprovalLogSemua(ppabp)).toBe(false);
    expect(canViewHistoriSanggahanSemua(ppabp)).toBe(false);
    expect(canExportLaporan(ppabp)).toBe(false);
  });

  it("canViewPegawai: ITJEN boleh lihat pegawai manapun (read-only audit)", () => {
    const itjen = buatUser({ role: "ITJEN" });
    expect(canViewPegawai(itjen, { nip: "111", satuanKerja: SETJEN })).toBe(true);
    expect(canViewPegawai(itjen, { nip: "222", satuanKerja: BIRO_UMUM })).toBe(true);
  });
});

describe("PIMPINAN - executive dashboard", () => {
  it("canViewDashboardRingkasanKementerian: diizinkan buat PIMPINAN, ditolak buat role lain", () => {
    expect(canViewDashboardRingkasanKementerian(buatUser({ role: "PIMPINAN" }))).toBe(true);
    expect(canViewDashboardRingkasanKementerian(buatUser({ role: "PEGAWAI" }))).toBe(false);
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

  it("BIRO_OSDMA & PIMPINAN: boleh lihat pegawai manapun", () => {
    expect(canViewPegawai(buatUser({ role: "BIRO_OSDMA" }), target)).toBe(true);
    expect(canViewPegawai(buatUser({ role: "PIMPINAN" }), target)).toBe(true);
  });

  it("ADMIN_SISTEM: SELALU ditolak, walaupun target-nya siapapun", () => {
    expect(canViewPegawai(buatUser({ role: "ADMIN_SISTEM" }), target)).toBe(false);
  });

  it("akun nonaktif: DITOLAK apapun role-nya", () => {
    expect(canViewPegawai(buatUser({ role: "PIMPINAN", aktif: false }), target)).toBe(false);
  });
});

describe("canEditPresensiKinerjaLangsung - selalu false buat semua role", () => {
  it("tidak ada satupun role yang boleh edit langsung", () => {
    const semuaRole: AuthUser["role"][] = [
      "PEGAWAI",
      "KASUBAG_TU",
      "PPABP",
      "BIRO_OSDMA",
      "ADMIN_SISTEM",
      "ITJEN",
      "PIMPINAN",
    ];
    for (const role of semuaRole) {
      expect(canEditPresensiKinerjaLangsung(buatUser({ role, satuanKerja: SETJEN }))).toBe(false);
    }
  });
});
