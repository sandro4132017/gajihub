import { describe, it, expect } from "vitest";
import type { Role } from "@prisma/client";
import {
  daftarRoleTersedia,
  punyaMultiRole,
  resolveRoleAktif,
  LANDING_ROLE,
} from "../roleAktif";

const SEMUA_ROLE: Role[] = ["PEGAWAI", "KASUBAG_TU", "OSDMA", "PPABP", "PIMPINAN", "ADMIN"];

describe("daftarRoleTersedia", () => {
  it("akun single-role cuma punya role utamanya", () => {
    expect(daftarRoleTersedia({ role: "PEGAWAI", rolesTambahan: [] })).toEqual(["PEGAWAI"]);
  });

  it("role utama selalu paling depan, diikuti role tambahan sesuai urutannya", () => {
    expect(
      daftarRoleTersedia({ role: "KASUBAG_TU", rolesTambahan: ["OSDMA", "PPABP"] })
    ).toEqual(["KASUBAG_TU", "OSDMA", "PPABP"]);
  });

  it("duplikat dibuang (role utama ikut ke-centang lagi sebagai tambahan)", () => {
    expect(
      daftarRoleTersedia({ role: "OSDMA", rolesTambahan: ["OSDMA", "PEGAWAI", "PEGAWAI"] })
    ).toEqual(["OSDMA", "PEGAWAI"]);
  });
});

describe("punyaMultiRole", () => {
  it("false kalau cuma role utama", () => {
    expect(punyaMultiRole({ role: "ADMIN", rolesTambahan: [] })).toBe(false);
  });

  it("false kalau role tambahan cuma mengulang role utama", () => {
    expect(punyaMultiRole({ role: "ADMIN", rolesTambahan: ["ADMIN"] })).toBe(false);
  });

  it("true kalau ada role tambahan yang beda", () => {
    expect(punyaMultiRole({ role: "ADMIN", rolesTambahan: ["PEGAWAI"] })).toBe(true);
  });
});

describe("resolveRoleAktif", () => {
  const user = { role: "PEGAWAI" as Role, rolesTambahan: ["KASUBAG_TU"] as Role[] };

  it("kandidat dipakai kalau memang dimiliki akun", () => {
    expect(resolveRoleAktif(user, "KASUBAG_TU")).toBe("KASUBAG_TU");
  });

  it("kandidat = role utama tetap valid", () => {
    expect(resolveRoleAktif(user, "PEGAWAI")).toBe("PEGAWAI");
  });

  it("JATUH BALIK ke role utama kalau kandidat tidak dimiliki (mis. role tambahan dicabut Admin di tengah sesi)", () => {
    expect(resolveRoleAktif(user, "ADMIN")).toBe("PEGAWAI");
  });

  it("kandidat kosong/null jatuh balik ke role utama", () => {
    expect(resolveRoleAktif(user, null)).toBe("PEGAWAI");
    expect(resolveRoleAktif(user, undefined)).toBe("PEGAWAI");
  });

  // Kasus paling penting buat keamanan: akun tanpa role tambahan sama sekali
  // TIDAK BOLEH bisa "naik" ke role apapun lewat cookie sesi yang basi.
  it("akun tanpa role tambahan tidak bisa naik ke role manapun", () => {
    const pegawaiBiasa = { role: "PEGAWAI" as Role, rolesTambahan: [] as Role[] };
    for (const r of SEMUA_ROLE) {
      expect(resolveRoleAktif(pegawaiBiasa, r)).toBe(r === "PEGAWAI" ? "PEGAWAI" : "PEGAWAI");
    }
  });
});

describe("LANDING_ROLE", () => {
  it("semua role punya halaman tujuan sendiri", () => {
    for (const r of SEMUA_ROLE) {
      expect(LANDING_ROLE[r]).toMatch(/^\//);
    }
  });
});
