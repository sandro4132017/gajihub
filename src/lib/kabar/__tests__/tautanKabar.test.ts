import { describe, expect, it } from "vitest";
import type { AuthUser } from "../../../auth/permissions";
import { hrefAktivitas } from "../tautanKabar";

const u = (role: AuthUser["role"], satuanKerja: string | null = null): AuthUser => ({
  nip: "000000000000000002", // sensitive-ok
  role,
  satuanKerja,
  aktif: true,
});
const periode = { bulan: 9, tahun: 2026 };

describe("hrefAktivitas", () => {
  it("Kasubag TU: rekap unitnya sendiri ke kalkulasi, unit lain tidak ada tautan", () => {
    const kasubag = u("KASUBAG_TU", "Biro A");
    expect(hrefAktivitas(kasubag, "PengirimanUnit", periode, "Biro A")).toBe(
      "/kasubag/kalkulasi?bulan=9&tahun=2026&satker=Biro%20A"
    );
    expect(hrefAktivitas(kasubag, "PengirimanUnit", periode, "Biro B")).toBeNull();
  });

  it("PPABP: kiriman rekap ke ADK, bukan kalkulasi unit", () => {
    expect(hrefAktivitas(u("PPABP"), "PengirimanUnit", periode, "Biro A")).toBe(
      "/ppabp/adk?bulan=9&tahun=2026&satker=Biro%20A"
    );
    expect(hrefAktivitas(u("PPABP"), "export_adk", periode, null)).toBe("/ppabp/adk?bulan=9&tahun=2026");
  });

  it("SYNC tidak pernah bertautan", () => {
    expect(hrefAktivitas(u("ADMIN"), "tukin_calculation", periode, "Biro A", "SYNC")).toBeNull();
    expect(hrefAktivitas(u("ADMIN"), "sinkronisasi_pegawai", undefined, null, "SYNC")).toBeNull();
  });

  it("halaman admin hanya untuk ADMIN", () => {
    expect(hrefAktivitas(u("ADMIN"), "app_user", undefined, null, "UPDATE")).toBe("/admin/role-assignment");
    expect(hrefAktivitas(u("PPABP"), "app_user", undefined, null, "UPDATE")).toBeNull();
    expect(hrefAktivitas(u("ADMIN"), "mode_jaringan", undefined, null)).toBe("/admin");
  });

  it("halaman PPABP tertutup untuk Kasubag TU", () => {
    const kasubag = u("KASUBAG_TU", "Biro A");
    for (const e of ["gaji_induk", "rekening_pegawai", "identitas_web_gaji", "reconciliation_status", "hari_libur_nasional"]) {
      expect(hrefAktivitas(kasubag, e, undefined, null), e).toBeNull();
    }
    expect(hrefAktivitas(u("PPABP"), "gaji_induk", undefined, null)).toBe("/ppabp/gaji-induk");
    expect(hrefAktivitas(u("PPABP"), "reconciliation_status", undefined, "Biro A")).toBe("/ppabp/banding");
  });

  it("presensi/predikat/kendala/pegawai mengikuti guard halaman masing-masing", () => {
    expect(hrefAktivitas(u("KASUBAG_TU", "Biro A"), "predikat_kinerja", undefined, "Biro A")).toBe("/tukin/predikat-kinerja");
    expect(hrefAktivitas(u("PIMPINAN"), "predikat_kinerja", undefined, null)).toBeNull();
    expect(hrefAktivitas(u("PPABP"), "koreksi_presensi_harian", periode, "Biro A")).toBe("/tukin/presensi");
    expect(hrefAktivitas(u("KASUBAG_TU", "Biro A"), "kendala_epresensi", undefined, "Biro A")).toBe("/tukin/presensi/kendala");
    expect(hrefAktivitas(u("PPABP"), "pegawai", undefined, "Biro A")).toBe("/pegawai");
    expect(hrefAktivitas(u("PIMPINAN"), "pegawai", undefined, "Biro A")).toBeNull();
  });

  it("akun nonaktif dan entitas tak dikenal tidak bertautan", () => {
    expect(hrefAktivitas({ ...u("ADMIN"), aktif: false }, "app_user", undefined, null)).toBeNull();
    expect(hrefAktivitas(u("ADMIN"), "entah_apa", periode, "Biro A")).toBeNull();
  });

  it("tidak pernah memuat deret NIP di href", () => {
    const h = hrefAktivitas(u("KASUBAG_TU", "Biro A"), "pengecualian_pegawai", periode, "Biro A");
    expect(h).not.toMatch(/\d{9,}/);
  });
});
