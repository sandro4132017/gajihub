import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// /tukin untuk PPABP: tombol "Lihat rincian lengkap" membuka tabel 38 kolom
// yang sama dengan Kalkulasi Unit Kasubag TU, dan tabel itu tetap hanya
// memuat unit yang SUDAH mengirim rekap.
// ============================================================================

const { palsu } = vi.hoisted(() => ({
  palsu: {
    pegawai: { findMany: vi.fn(), count: vi.fn() },
    tukinCalculation: { findMany: vi.fn() },
    pengirimanUnit: { findMany: vi.fn() },
    predikatKinerja: { findMany: vi.fn(), count: vi.fn() },
    skHukumanDisiplin: { findMany: vi.fn() },
    rekapPresensiPeriode: { findMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock("../../../lib/prisma", () => ({ prisma: palsu }));
vi.mock("../../../auth/getSessionAccount", () => ({
  getSessionAccount: vi.fn(async () => ({
    nip: "198100000000000009", // sensitive-ok
    role: "PPABP",
    satuanKerja: null,
    nama: "PPABP Uji",
  })),
}));
vi.mock("../../periodeDefault", async (asli) => ({
  ...(await asli<typeof import("../../periodeDefault")>()),
  periodePunyaTukin: vi.fn(async () => [{ bulan: 7, tahun: 2026 }]),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/tukin",
}));

import TukinPage from "../page";

const SATKER = "Unit Uji";
const PER = { periodeBulan: 7, periodeTahun: 2026 };

function kalk(id: string, nama: string, satuanKerja: string) {
  return {
    id,
    pegawaiId: `p-${id}`,
    ...PER,
    tukinPokok: 5_000_000,
    komponenKehadiran: 1_500_000,
    komponenKinerja: 3_500_000,
    potonganPph: 0,
    tukinBersih: 5_000_000,
    catatanAnomali: null,
    status: "DRAFT",
    pegawai: { id: `p-${id}`, nip: `19900101202012100${id}`, nama, satuanKerja, kelasJabatan: 8, golongan: "III/a" }, // sensitive-ok
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  palsu.pegawai.findMany.mockResolvedValue([{ satuanKerja: SATKER }]);
  palsu.pegawai.count.mockResolvedValue(2);
  palsu.tukinCalculation.findMany.mockResolvedValue([kalk("1", "Pegawai Terkirim", SATKER)]);
  palsu.pengirimanUnit.findMany.mockResolvedValue([
    { satuanKerja: SATKER, ...PER, status: "TERKIRIM", dikirimPada: new Date(), dikirimOleh: { nama: "K" } },
  ]);
  palsu.predikatKinerja.findMany.mockResolvedValue([
    { pegawaiId: "p-1", ...PER, predikat: "BAIK", hasilKerja: "Sesuai Ekspektasi", perilakuKerja: "Sesuai Ekspektasi" },
  ]);
  palsu.predikatKinerja.count.mockResolvedValue(1);
  palsu.skHukumanDisiplin.findMany.mockResolvedValue([]);
  palsu.rekapPresensiPeriode.findMany.mockResolvedValue([]);
  palsu.rekapPresensiPeriode.count.mockResolvedValue(1);
});

async function render(q: Record<string, string>) {
  const el = await TukinPage({ searchParams: Promise.resolve(q) });
  return renderToStaticMarkup(el as React.ReactElement);
}

describe("/tukin PPABP - rincian lengkap", () => {
  it("bawaan tabel ringkas dengan tombol Lihat rincian lengkap", async () => {
    const html = await render({ bulan: "7", tahun: "2026", satker: SATKER });
    expect(html).toContain("Lihat rincian lengkap");
    expect(html).toContain("rincian=1");
    expect(html).not.toContain("Persentase Kehadiran (30%)");
    expect(palsu.rekapPresensiPeriode.findMany).not.toHaveBeenCalled();
  });

  it("?rincian=1 menampilkan tabel 38 kolom dan tombol Tampilkan ringkas", async () => {
    const html = await render({ bulan: "7", tahun: "2026", satker: SATKER, rincian: "1" });
    expect(html).toContain("Persentase Kehadiran (30%)");
    expect(html).toContain("Tampilkan ringkas");
    expect(html).toContain("Pegawai Terkirim");
    // Nama pegawai membawa dari=tukin supaya tombol Kembali kembali ke tabel ini.
    expect(html).toContain("dari=tukin");
  });

  it("unit yang belum mengirim tidak muncul di tabel lengkap", async () => {
    palsu.pengirimanUnit.findMany.mockResolvedValue([]);
    const html = await render({ bulan: "7", tahun: "2026", satker: SATKER, rincian: "1" });
    expect(html).not.toContain("Pegawai Terkirim");
    expect(html).not.toContain("Persentase Kehadiran (30%)");
  });
});
