import { describe, expect, it } from "vitest";
import { canBukaHalamanKepalaTim, type AuthUser } from "../permissions";

const user = (o: Partial<AuthUser> = {}): AuthUser => ({
  nip: "199001010000000011", // sensitive-ok
  role: "KEPALA_TIM",
  satuanKerja: "Biro Uji Coba",
  aktif: true,
  ...o,
});

describe("canBukaHalamanKepalaTim", () => {
  it("Kepala Tim aktif boleh", () => {
    expect(canBukaHalamanKepalaTim(user())).toBe(true);
  });

  it.each(["PEGAWAI", "KASUBAG_TU", "OSDMA", "PPABP", "PIMPINAN", "ADMIN"] as const)(
    "role %s ditolak (tanpa bypass ADMIN)",
    (role) => {
      expect(canBukaHalamanKepalaTim(user({ role }))).toBe(false);
    },
  );

  it("akun nonaktif ditolak", () => {
    expect(canBukaHalamanKepalaTim(user({ aktif: false }))).toBe(false);
  });
});
