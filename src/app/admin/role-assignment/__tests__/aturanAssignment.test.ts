import { describe, expect, it } from "vitest";
import { idSah, periksaBuatAkun, periksaUbahAssignment } from "../aturanAssignment";

const AKTOR = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";

const dasar = {
  aktorId: AKTOR,
  aktorNip: "199000000000000001", // sensitive-ok
  targetUserId: TARGET,
  targetNip: "199000000000000002", // sensitive-ok
  roleSebelum: { role: "PEGAWAI" as const, rolesTambahan: [] },
  roleBaru: "PPABP" as const,
  rolesTambahanBaru: [] as never[],
  konfirmasiAdmin: "",
};

describe("idSah", () => {
  it("menerima UUID, menolak yang lain", () => {
    expect(idSah(TARGET)).toBe(true);
    expect(idSah("")).toBe(false);
    expect(idSah("abc")).toBe(false);
    expect(idSah(`${TARGET}x`)).toBe(false);
  });
});

describe("periksaUbahAssignment", () => {
  it("perubahan biasa lolos", () => {
    expect(periksaUbahAssignment(dasar)).toEqual({ ok: true });
  });
  it("menolak id bukan UUID", () => {
    expect(periksaUbahAssignment({ ...dasar, targetUserId: "bukan-uuid" }).ok).toBe(false);
  });
  it("menolak mengubah akun sendiri (id sama)", () => {
    expect(periksaUbahAssignment({ ...dasar, targetUserId: AKTOR }).ok).toBe(false);
  });
  it("menolak mengubah akun sendiri (NIP sama)", () => {
    expect(periksaUbahAssignment({ ...dasar, targetNip: dasar.aktorNip }).ok).toBe(false);
  });
  it("ADMIN baru tanpa konfirmasi ditolak", () => {
    expect(periksaUbahAssignment({ ...dasar, roleBaru: "ADMIN" }).ok).toBe(false);
    expect(periksaUbahAssignment({ ...dasar, rolesTambahanBaru: ["ADMIN"] }).ok).toBe(false);
  });
  it("ADMIN baru dengan konfirmasi 'ya' lolos", () => {
    expect(periksaUbahAssignment({ ...dasar, roleBaru: "ADMIN", konfirmasiAdmin: "ya" }).ok).toBe(true);
  });
  it("konfirmasi selain 'ya' ditolak", () => {
    expect(periksaUbahAssignment({ ...dasar, roleBaru: "ADMIN", konfirmasiAdmin: "on" }).ok).toBe(false);
  });
  it("akun yang sudah ADMIN tidak diminta konfirmasi lagi", () => {
    const r = periksaUbahAssignment({
      ...dasar,
      roleSebelum: { role: "ADMIN", rolesTambahan: [] },
      roleBaru: "ADMIN",
    });
    expect(r.ok).toBe(true);
  });
});

describe("periksaBuatAkun", () => {
  const id = "33333333-3333-4333-8333-333333333333";
  it("role biasa lolos", () => {
    expect(periksaBuatAkun({ pegawaiId: id, role: "KASUBAG_TU", konfirmasiAdmin: "" }).ok).toBe(true);
  });
  it("menolak id bukan UUID", () => {
    expect(periksaBuatAkun({ pegawaiId: "x", role: "PEGAWAI", konfirmasiAdmin: "" }).ok).toBe(false);
  });
  it("ADMIN wajib konfirmasi", () => {
    expect(periksaBuatAkun({ pegawaiId: id, role: "ADMIN", konfirmasiAdmin: "" }).ok).toBe(false);
    expect(periksaBuatAkun({ pegawaiId: id, role: "ADMIN", konfirmasiAdmin: "ya" }).ok).toBe(true);
  });
});
