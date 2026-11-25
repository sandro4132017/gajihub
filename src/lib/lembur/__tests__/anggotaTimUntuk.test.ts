import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { anggotaTimUntuk } from "../anggotaTim";

function fakePrisma(daftar: Record<string, unknown>[]) {
  const findMany = vi.fn().mockResolvedValue(daftar);
  const prisma = {
    pegawai: {
      findUnique: vi.fn().mockResolvedValue({ id: "kepala", satuanKerja: "Biro Uji Coba" }),
      findMany,
    },
  } as unknown as PrismaClient;
  return { prisma, findMany };
}

describe("anggotaTimUntuk", () => {
  it("menyaring aktif dan bukan pegawai uji di database, dan satker dari pegawai kepala tim", async () => {
    const { prisma, findMany } = fakePrisma([]);
    await anggotaTimUntuk(prisma, { nip: "199001010000000011" }); // sensitive-ok
    expect(findMany.mock.calls[0][0].where).toEqual({
      satuanKerja: "Biro Uji Coba",
      statusPegawai: "AKTIF",
      sourceSystem: { not: "DUMMY_UJI" },
    });
  });

  it("tetap mengeluarkan diri sendiri dan non-AKTIF dari hasil (lapis kedua)", async () => {
    const { prisma } = fakePrisma([
      { id: "kepala", nip: "1", nama: "K", gelarDepan: null, gelarBelakang: null, statusPegawai: "AKTIF" }, // sensitive-ok
      { id: "a", nip: "2", nama: "A", gelarDepan: null, gelarBelakang: null, statusPegawai: "AKTIF" }, // sensitive-ok
      { id: "b", nip: "3", nama: "B", gelarDepan: null, gelarBelakang: null, statusPegawai: "CUTI" }, // sensitive-ok
    ]);
    const hasil = await anggotaTimUntuk(prisma, { nip: "x" });
    expect(hasil.map((p) => p.id)).toEqual(["a"]);
  });
});
