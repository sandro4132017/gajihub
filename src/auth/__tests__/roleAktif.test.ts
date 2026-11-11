import { describe, it, expect } from "vitest";
import type { Role } from "@prisma/client";
import {
  daftarRoleTersedia,
  punyaMultiRole,
  resolveRoleAktif,
  LANDING_ROLE,
  URUTAN_ROLE_BAWAAN,
  pilihRoleBawaan,
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

  it("JATUH BALIK ke role bawaan login kalau kandidat tidak dimiliki (mis. role tambahan dicabut Admin di tengah sesi)", () => {
    // PEGAWAI + [KASUBAG_TU]: bawaan = KASUBAG_TU (lebih diutamakan dari PEGAWAI).
    expect(resolveRoleAktif(user, "ADMIN")).toBe("KASUBAG_TU");
    expect(resolveRoleAktif({ role: "PEGAWAI", rolesTambahan: [] }, "ADMIN")).toBe("PEGAWAI");
  });

  it("kandidat kosong/null jatuh balik ke role bawaan login", () => {
    expect(resolveRoleAktif(user, null)).toBe("KASUBAG_TU");
    expect(resolveRoleAktif(user, undefined)).toBe("KASUBAG_TU");
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

describe("pilihRoleBawaan - role saat login", () => {
  it("ADMIN + [PPABP, KASUBAG_TU] -> KASUBAG_TU", () => {
    expect(pilihRoleBawaan({ role: "ADMIN", rolesTambahan: ["PPABP", "KASUBAG_TU"] })).toBe("KASUBAG_TU");
  });
  it("tabel user: PPABP + OSDMA -> PPABP; Pimpinan + Kasubag TU + PPABP -> PIMPINAN", () => {
    expect(pilihRoleBawaan({ role: "PPABP", rolesTambahan: ["OSDMA", "PEGAWAI"] })).toBe("PPABP");
    expect(pilihRoleBawaan({ role: "KASUBAG_TU", rolesTambahan: ["PIMPINAN", "PPABP", "PEGAWAI"] })).toBe("PIMPINAN");
  });
  it("ADMIN + [KASUBAG_TU] -> KASUBAG_TU", () => {
    expect(pilihRoleBawaan({ role: "ADMIN", rolesTambahan: ["KASUBAG_TU"] })).toBe("KASUBAG_TU");
  });
  it("ADMIN saja -> ADMIN", () => {
    expect(pilihRoleBawaan({ role: "ADMIN", rolesTambahan: [] })).toBe("ADMIN");
  });
  it("ADMIN + [PEGAWAI] -> PEGAWAI (ADMIN hanya bila satu-satunya)", () => {
    expect(pilihRoleBawaan({ role: "ADMIN", rolesTambahan: ["PEGAWAI"] })).toBe("PEGAWAI");
  });
  it("urutan: PIMPINAN > KASUBAG_TU > PPABP > OSDMA > PEGAWAI > ADMIN", () => {
    expect([...URUTAN_ROLE_BAWAAN]).toEqual(["PIMPINAN", "KASUBAG_TU", "PPABP", "OSDMA", "PEGAWAI", "ADMIN"]);
  });
  it("urutan masukan tidak berpengaruh; role utama bukan prioritas", () => {
    const a = pilihRoleBawaan({ role: "PEGAWAI", rolesTambahan: ["OSDMA", "KASUBAG_TU"] });
    const b = pilihRoleBawaan({ role: "KASUBAG_TU", rolesTambahan: ["OSDMA", "PEGAWAI"] });
    const c = pilihRoleBawaan({ role: "OSDMA", rolesTambahan: ["PEGAWAI", "KASUBAG_TU"] });
    expect([a, b, c]).toEqual(["KASUBAG_TU", "KASUBAG_TU", "KASUBAG_TU"]);
  });
  it("landing mengikuti role bawaan", () => {
    expect(LANDING_ROLE[pilihRoleBawaan({ role: "ADMIN", rolesTambahan: ["PPABP"] })]).toBe("/ppabp");
  });
});
