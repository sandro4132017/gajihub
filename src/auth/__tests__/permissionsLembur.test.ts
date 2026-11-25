import { describe, expect, it } from "vitest";
import {
  canLihatDokumenLembur,
  canLihatDokumenSptjm,
  canLihatPerintahLemburUnit,
  canLihatSpklHarianSebagaiPemberi,
  canTandatanganiSpklHarian,
  canTandatanganiSptjmUnit,
  type AuthUser,
} from "../permissions";

const UNIT = "Biro Uji Coba";
const NIP_KT = "199001010000000011"; // sensitive-ok
const NIP_LAIN = "199001010000000022"; // sensitive-ok

const user = (o: Partial<AuthUser> = {}): AuthUser => ({
  nip: NIP_LAIN,
  role: "PEGAWAI",
  satuanKerja: UNIT,
  aktif: true,
  ...o,
});

describe("canTandatanganiSpklHarian", () => {
  it("Kasubag TU unit itu saja (TODO(confirm) pejabat final)", () => {
    expect(canTandatanganiSpklHarian(user({ role: "KASUBAG_TU" }), UNIT)).toBe(true);
  });

  it.each([
    ["Kasubag TU unit lain", user({ role: "KASUBAG_TU", satuanKerja: "Biro Lain" })],
    ["Kepala Tim", user({ role: "KEPALA_TIM" })],
    ["PPABP", user({ role: "PPABP", satuanKerja: null })],
    ["ADMIN (tanpa bypass)", user({ role: "ADMIN", satuanKerja: null })],
    ["Kasubag TU nonaktif", user({ role: "KASUBAG_TU", aktif: false })],
  ])("%s ditolak", (_n, u) => {
    expect(canTandatanganiSpklHarian(u, UNIT)).toBe(false);
  });

  it("satuan kerja kosong ditolak", () => {
    expect(canTandatanganiSpklHarian(user({ role: "KASUBAG_TU", satuanKerja: null }), "")).toBe(false);
  });

  it("selalu sama dengan canTandatanganiSptjmUnit", () => {
    for (const role of ["PEGAWAI", "KEPALA_TIM", "KASUBAG_TU", "PPABP", "ADMIN", "PIMPINAN", "OSDMA"] as const) {
      const u = user({ role });
      expect(canTandatanganiSpklHarian(u, UNIT)).toBe(canTandatanganiSptjmUnit(u, UNIT));
    }
  });
});

describe("canLihatDokumenLembur", () => {
  const dok = (o: Record<string, unknown> = {}) => ({
    jenis: "SURAT_TUGAS_LEMBUR",
    satuanKerja: UNIT,
    penandatanganNip: NIP_KT,
    ...o,
  });

  it("penandatangan sendiri boleh, walau role-nya tidak punya akses rekap unit", () => {
    expect(canLihatDokumenLembur(user({ nip: NIP_KT, role: "KEPALA_TIM" }), dok())).toBe(true);
  });

  it("kepala tim lain di unit yang sama ditolak", () => {
    expect(canLihatDokumenLembur(user({ nip: NIP_LAIN, role: "KEPALA_TIM" }), dok())).toBe(false);
  });

  it("penandatangan yang nonaktif ditolak", () => {
    expect(canLihatDokumenLembur(user({ nip: NIP_KT, role: "KEPALA_TIM", aktif: false }), dok())).toBe(false);
  });

  it("Kasubag TU unit itu, PPABP, dan ADMIN boleh; Kasubag TU unit lain tidak", () => {
    expect(canLihatDokumenLembur(user({ role: "KASUBAG_TU" }), dok())).toBe(true);
    expect(canLihatDokumenLembur(user({ role: "PPABP", satuanKerja: null }), dok())).toBe(true);
    expect(canLihatDokumenLembur(user({ role: "ADMIN", satuanKerja: null }), dok())).toBe(true);
    expect(canLihatDokumenLembur(user({ role: "KASUBAG_TU", satuanKerja: "Biro Lain" }), dok())).toBe(false);
  });

  it("PEGAWAI dan PIMPINAN bukan penandatangan ditolak", () => {
    expect(canLihatDokumenLembur(user({ role: "PEGAWAI" }), dok())).toBe(false);
    expect(canLihatDokumenLembur(user({ role: "PIMPINAN", satuanKerja: null }), dok())).toBe(false);
  });

  it("penandatangan tidak tercatat -> hanya jalur unit; satker kosong ditolak", () => {
    expect(canLihatDokumenLembur(user({ nip: NIP_KT, role: "KEPALA_TIM" }), dok({ penandatanganNip: null }))).toBe(false);
    expect(canLihatDokumenLembur(user({ role: "KASUBAG_TU" }), dok({ satuanKerja: "" }))).toBe(false);
  });

  it("jenis selain lembur ditolak, bahkan untuk penandatangan sendiri", () => {
    expect(canLihatDokumenLembur(user({ nip: NIP_KT, role: "KEPALA_TIM" }), dok({ jenis: "SPTJM_TUKIN" }))).toBe(false);
  });

  it("canLihatDokumenSptjm tidak berubah: penandatangan non-Kasubag tetap ditolak", () => {
    expect(canLihatDokumenSptjm(user({ nip: NIP_KT, role: "KEPALA_TIM" }), UNIT)).toBe(false);
  });
});

describe("canLihatSpklHarianSebagaiPemberi (keputusan user 2026-11-23)", () => {
  const kt = user({ role: "KEPALA_TIM" });

  it("KEPALA_TIM aktif, satker Pegawai cocok, punya perintah di tanggal itu -> boleh", () => {
    expect(canLihatSpklHarianSebagaiPemberi(kt, UNIT, UNIT, true)).toBe(true);
  });

  it("tanpa perintah di tanggal itu -> ditolak", () => {
    expect(canLihatSpklHarianSebagaiPemberi(kt, UNIT, UNIT, false)).toBe(false);
  });

  it("satker Pegawai kosong atau beda unit -> ditolak (User.satuanKerja tidak dipakai)", () => {
    expect(canLihatSpklHarianSebagaiPemberi(kt, UNIT, null, true)).toBe(false);
    expect(canLihatSpklHarianSebagaiPemberi(kt, UNIT, "Biro Lain", true)).toBe(false);
  });

  it("KEPALA_TIM nonaktif ditolak", () => {
    expect(canLihatSpklHarianSebagaiPemberi(user({ role: "KEPALA_TIM", aktif: false }), UNIT, UNIT, true)).toBe(false);
  });

  it.each(["PEGAWAI", "KASUBAG_TU", "PIMPINAN", "PPABP", "ADMIN"] as const)(
    "role %s tidak lewat jalur ini",
    (role) => {
      expect(canLihatSpklHarianSebagaiPemberi(user({ role }), UNIT, UNIT, true)).toBe(false);
    },
  );

  it("canLihatPerintahLemburUnit tetap menolak KEPALA_TIM", () => {
    expect(canLihatPerintahLemburUnit(kt, UNIT, UNIT)).toBe(false);
  });
});

describe("canLihatPerintahLemburUnit (lihat-saja)", () => {
  it.each([
    ["Kasubag TU unit itu", user({ role: "KASUBAG_TU" })],
    ["PPABP", user({ role: "PPABP", satuanKerja: null })],
    ["ADMIN", user({ role: "ADMIN", satuanKerja: null })],
  ])("%s boleh", (_n, u) => {
    expect(canLihatPerintahLemburUnit(u, UNIT)).toBe(true);
  });

  it.each([
    ["Kasubag TU unit lain", user({ role: "KASUBAG_TU", satuanKerja: "Biro Lain" })],
    ["Kepala Tim", user({ role: "KEPALA_TIM" })],
    ["PEGAWAI", user({ role: "PEGAWAI" })],
    ["PIMPINAN tanpa satker Pegawai", user({ role: "PIMPINAN" })],
    ["Kasubag TU nonaktif", user({ role: "KASUBAG_TU", aktif: false })],
  ])("%s ditolak", (_n, u) => {
    expect(canLihatPerintahLemburUnit(u, UNIT)).toBe(false);
  });

  it("PIMPINAN hanya unit milik Pegawai-nya (bukan User.satuanKerja)", () => {
    const pimpinan = user({ role: "PIMPINAN", satuanKerja: "Biro Lain" });
    expect(canLihatPerintahLemburUnit(pimpinan, UNIT, UNIT)).toBe(true);
    expect(canLihatPerintahLemburUnit(pimpinan, UNIT, "Biro Lain")).toBe(false);
    expect(canLihatPerintahLemburUnit(pimpinan, UNIT, null)).toBe(false);
    expect(canLihatPerintahLemburUnit(user({ role: "PIMPINAN", aktif: false }), UNIT, UNIT)).toBe(false);
    expect(canTandatanganiSpklHarian(pimpinan, UNIT)).toBe(false);
  });

  it("satuan kerja kosong ditolak walau ADMIN", () => {
    expect(canLihatPerintahLemburUnit(user({ role: "ADMIN", satuanKerja: null }), "")).toBe(false);
  });

  it("lihat tidak berarti boleh menandatangani", () => {
    const ppabp = user({ role: "PPABP", satuanKerja: null });
    expect(canLihatPerintahLemburUnit(ppabp, UNIT)).toBe(true);
    expect(canTandatanganiSpklHarian(ppabp, UNIT)).toBe(false);
  });
});
