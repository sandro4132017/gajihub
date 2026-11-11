import { describe, expect, it } from "vitest";
import { kekuranganRolePegawai, lengkapiRolePegawai } from "../rolePegawaiWajib";

describe("lengkapiRolePegawai", () => {
  it("menambah PEGAWAI bila punya data pegawai dan role utama bukan PEGAWAI", () => {
    expect(lengkapiRolePegawai({ role: "PPABP", rolesTambahan: [] }, true)).toEqual(["PEGAWAI"]);
  });
  it("tidak menggandakan PEGAWAI yang sudah ada", () => {
    expect(lengkapiRolePegawai({ role: "PPABP", rolesTambahan: ["PEGAWAI"] }, true)).toEqual(["PEGAWAI"]);
  });
  it("urutan tambahan lain dipertahankan, PEGAWAI di akhir", () => {
    expect(lengkapiRolePegawai({ role: "ADMIN", rolesTambahan: ["OSDMA", "PPABP"] }, true)).toEqual([
      "OSDMA",
      "PPABP",
      "PEGAWAI",
    ]);
  });
  it("role utama PEGAWAI: PEGAWAI tidak ditaruh (dan dibuang) di tambahan", () => {
    expect(lengkapiRolePegawai({ role: "PEGAWAI", rolesTambahan: [] }, true)).toEqual([]);
    expect(lengkapiRolePegawai({ role: "PEGAWAI", rolesTambahan: ["PEGAWAI", "OSDMA"] }, true)).toEqual(["OSDMA"]);
  });
  it("tanpa data pegawai: tidak menambah apa pun", () => {
    expect(lengkapiRolePegawai({ role: "ADMIN", rolesTambahan: ["OSDMA"] }, false)).toEqual(["OSDMA"]);
    expect(lengkapiRolePegawai({ role: "ADMIN", rolesTambahan: [] }, false)).toEqual([]);
  });
  it("duplikat dan role yang sama dengan role utama dibuang", () => {
    expect(lengkapiRolePegawai({ role: "OSDMA", rolesTambahan: ["OSDMA", "PPABP", "PPABP"] }, true)).toEqual([
      "PPABP",
      "PEGAWAI",
    ]);
  });
  it("idempoten dan tidak mengubah masukan", () => {
    const masuk = { role: "KASUBAG_TU" as const, rolesTambahan: ["OSDMA" as const] };
    const sekali = lengkapiRolePegawai(masuk, true);
    expect(masuk.rolesTambahan).toEqual(["OSDMA"]);
    expect(lengkapiRolePegawai({ role: masuk.role, rolesTambahan: sekali }, true)).toEqual(sekali);
  });
});

describe("kekuranganRolePegawai", () => {
  it("true hanya bila punya data pegawai, bukan PEGAWAI utama, dan belum ada di tambahan", () => {
    expect(kekuranganRolePegawai({ role: "PPABP", rolesTambahan: [] }, true)).toBe(true);
    expect(kekuranganRolePegawai({ role: "PPABP", rolesTambahan: ["PEGAWAI"] }, true)).toBe(false);
    expect(kekuranganRolePegawai({ role: "PEGAWAI", rolesTambahan: [] }, true)).toBe(false);
    expect(kekuranganRolePegawai({ role: "PPABP", rolesTambahan: [] }, false)).toBe(false);
  });
});
