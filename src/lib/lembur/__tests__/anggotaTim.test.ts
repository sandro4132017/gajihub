import { describe, expect, it } from "vitest";
import { saringAnggotaTim } from "../saringAnggotaTim";

describe("saringAnggotaTim", () => {
  const kandidat = [
    { id: "kepala", statusPegawai: "AKTIF" },
    { id: "p1", statusPegawai: "AKTIF" },
    { id: "p2", statusPegawai: "CUTI" },
    { id: "p3", statusPegawai: "PENSIUN" },
    { id: "p4", statusPegawai: "AKTIF" },
  ];
  it("mengeluarkan diri sendiri dan pegawai non-AKTIF", () => {
    expect(saringAnggotaTim(kandidat, "kepala").map((p) => p.id)).toEqual(["p1", "p4"]);
  });
  it("daftar kosong menghasilkan kosong", () => {
    expect(saringAnggotaTim([], "kepala")).toEqual([]);
  });
});
