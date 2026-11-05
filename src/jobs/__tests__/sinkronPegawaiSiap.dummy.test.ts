import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/siapConfig", () => ({
  labelSumberSiap: () => "SIAP uji",
  konfigurasiSiap: () => ({}),
  bukaPoolSiap: async () => ({
    request: () => ({ input: () => undefined, query: async () => ({ recordset: [] }) }),
    close: async () => undefined,
  }),
}));

import { periksaSinkronPegawai } from "../sinkronPegawaiSiap";

type Baris = { nip: string; nama: string; satuanKerja: string; statusPegawai: string; kelasJabatan: number | null; jabatan: string | null; sourceSystem: string };

describe("periksaSinkronPegawai - rekonsiliasi", () => {
  it("pegawai DUMMY_UJI tidak ditandai TIDAK_DI_SIAP, pegawai biasa tetap", async () => {
    const data: Baris[] = [
      { nip: "999900000000000001", nama: "Uji Coba", satuanKerja: "UNIT UJI", statusPegawai: "AKTIF", kelasJabatan: 7, jabatan: null, sourceSystem: "DUMMY_UJI" }, // sensitive-ok
      { nip: "199001010000000001", nama: "Pegawai Palsu", satuanKerja: "UNIT A", statusPegawai: "AKTIF", kelasJabatan: 7, jabatan: null, sourceSystem: "SIAP" }, // sensitive-ok
    ];
    const findMany = vi.fn(async (arg: { where?: { sourceSystem?: { not?: string } } }) => {
      const tidak = arg.where?.sourceSystem?.not;
      return data.filter((d) => tidak === undefined || d.sourceSystem !== tidak);
    });
    const prisma = { pegawai: { findMany } } as never;

    const rencana = await periksaSinkronPegawai(prisma);

    expect(findMany).toHaveBeenCalledTimes(1);
    const nipGanti = rencana.gantiStatus.map((g) => g.nip);
    expect(nipGanti).toContain("199001010000000001"); // sensitive-ok
    expect(nipGanti).not.toContain("999900000000000001"); // sensitive-ok
  });
});
