import { describe, expect, it } from "vitest";
import { canBukaHalamanPerintahLembur, type AuthUser } from "../permissions";

const user = (o: Partial<AuthUser> = {}): AuthUser => ({
  nip: "199001010000000011", // sensitive-ok
  role: "KEPALA_TIM",
  satuanKerja: "Biro Uji Coba",
  aktif: true,
  ...o,
});

describe("canBukaHalamanPerintahLembur", () => {
  it("Kepala Tim aktif boleh", () => {
    expect(canBukaHalamanPerintahLembur(user())).toBe(true);
  });

  it("Pimpinan aktif boleh (pengecualian lembur 2026-11-20)", () => {
    expect(canBukaHalamanPerintahLembur(user({ role: "PIMPINAN" }))).toBe(true);
  });

  it.each(["PEGAWAI", "KASUBAG_TU", "OSDMA", "PPABP", "ADMIN"] as const)(
    "role %s ditolak (tanpa bypass ADMIN)",
    (role) => {
      expect(canBukaHalamanPerintahLembur(user({ role }))).toBe(false);
    },
  );

  it("akun nonaktif ditolak", () => {
    expect(canBukaHalamanPerintahLembur(user({ aktif: false }))).toBe(false);
  });
});
