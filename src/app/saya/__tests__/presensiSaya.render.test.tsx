import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// RENDER PRESENSI HARIAN PEGAWAI. Dijaga: kartu per hari untuk HP, tabel
// hanya di layar lebar, chip memakai kelas globals.css, jam hasil koreksi
// tampil, tautan slip/banding hanya bila rekap ada. Fixture: data palsu.
// ============================================================================

const { palsu, sesi } = vi.hoisted(() => ({
  palsu: { pegawai: { findUnique: vi.fn() } },
  sesi: { akun: vi.fn() },
}));

vi.mock("../../../lib/prisma", () => ({ prisma: palsu }));
vi.mock("../../../auth/getSessionAccount", () => ({ getSessionAccount: sesi.akun, ambilUserSesi: vi.fn() }));

import PresensiSayaPage from "../presensi/[bulan]/[tahun]/page";

const NIP_UJI = "NIP-UJI-001"; // sensitive-ok

const hari = (tgl: number, ubah: Record<string, unknown> = {}) => ({
  id: `h-${tgl}`,
  tanggal: new Date(Date.UTC(2026, 7, tgl)),
  statusKehadiran: "WFO",
  jamMasuk: new Date(Date.UTC(2026, 7, tgl, 7, 30)),
  jamKeluar: new Date(Date.UTC(2026, 7, tgl, 16, 0)),
  menitTerlambat: 0,
  menitPulangCepat: 0,
  menitMeninggalkanKantor: 0,
  tidakIkutUpacara: false,
  jamLembur: 0,
  ...ubah,
});

function pegawaiUji(opsi: { rekap?: boolean; koreksi?: boolean } = {}) {
  return {
    nip: NIP_UJI,
    nama: "Pegawai Uji Satu",
    presensi: [
      hari(3, { menitTerlambat: 15, jamMasuk: new Date(Date.UTC(2026, 7, 3, 8, 15)) }),
      hari(4, { menitMeninggalkanKantor: 40 }),
    ],
    rekapPresensi: opsi.rekap === false ? [] : [{ id: "r1" }],
    koreksiPresensi: opsi.koreksi
      ? [{ tanggal: new Date(Date.UTC(2026, 7, 3)), jamMasuk: new Date(Date.UTC(2026, 7, 3, 7, 45)), jamKeluar: null }]
      : [],
  };
}

async function render(bulan: string, tahun: string) {
  const el = await PresensiSayaPage({ params: Promise.resolve({ bulan, tahun }) });
  return renderToStaticMarkup(el as React.ReactElement);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-15T03:00:00Z"));
  sesi.akun.mockResolvedValue({ nip: NIP_UJI, role: "PEGAWAI", satuanKerja: "Satker Uji A" });
  palsu.pegawai.findUnique.mockReset();
  palsu.pegawai.findUnique.mockResolvedValue(pegawaiUji());
});
afterEach(() => vi.useRealTimers());

describe("presensi saya", () => {
  it("kartu HP berisi chip Terlambat; tabel hanya di layar lebar", async () => {
    const html = await render("8", "2026");
    expect(html).toContain("mt-5 space-y-2 sm:hidden");
    expect(html).toContain("chip chip-danger");
    expect(html).toContain("Terlambat 15 mnt");
    expect(html).toContain("hidden overflow-x-auto sm:block");
  });

  it("tanpa badge text-[10px]", async () => {
    expect(await render("8", "2026")).not.toContain("text-[10px]");
  });

  it("kotak total tinggalkan kantor memuat angkanya", async () => {
    const html = await render("8", "2026");
    expect(html).toContain("Total tinggalkan kantor");
    expect(html).toContain("40 mnt");
  });

  it("tautan slip dan banding ada bila rekap ada, hilang bila kosong", async () => {
    const ada = await render("8", "2026");
    expect(ada).toContain("/saya/slip-gaji/8/2026");
    expect(ada).toContain("/saya?tab=banding");
    palsu.pegawai.findUnique.mockResolvedValue(pegawaiUji({ rekap: false }));
    const kosong = await render("8", "2026");
    expect(kosong).not.toContain("/saya/slip-gaji/8/2026");
    expect(kosong).not.toContain("/saya?tab=banding");
  });

  it("jam hasil koreksi tampil, kalimat penutup baru", async () => {
    palsu.pegawai.findUnique.mockResolvedValue(pegawaiUji({ koreksi: true }));
    const html = await render("8", "2026");
    expect(html).toContain("dikoreksi → 07:45");
    expect(html).toContain("jam hasil koreksi itu yang dipakai");
    expect(html).not.toContain("tidak pernah mengubah data presensi");
  });

  it("tidak ada tautan bulan sesudah bulan berjalan", async () => {
    const html = await render("9", "2026");
    expect(html).toContain("/saya/presensi/8/2026");
    expect(html).not.toContain("/saya/presensi/10/2026");
  });

  it("bulan 13: alamat tidak sah", async () => {
    const html = await render("13", "2026");
    expect(html).toContain("Alamat periode tidak sah");
    expect(html).not.toContain("harus login");
  });
});
