import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// RENDER SLIP GAJI PEGAWAI. Dijaga: peringatan "masih bisa berubah" mengikuti
// keadaan rekap UNIT (statusUnit), bukan status per-baris; susunan dokumen
// tidak berubah; bulan tak sah tidak terbaca "harus login"; navigasi bulan
// tidak melewati bulan berjalan. Fixture: data palsu.
// ============================================================================

const { palsu, sesi } = vi.hoisted(() => ({
  palsu: {
    pegawai: { findUnique: vi.fn() },
    pengirimanUnit: { findUnique: vi.fn() },
  },
  sesi: { akun: vi.fn() },
}));

vi.mock("../../../lib/prisma", () => ({ prisma: palsu }));
vi.mock("../../../auth/getSessionAccount", () => ({ getSessionAccount: sesi.akun, ambilUserSesi: vi.fn() }));

import SlipGajiPage from "../slip-gaji/[bulan]/[tahun]/page";

const NIP_UJI = "NIP-UJI-001"; // sensitive-ok

const gajiUji = {
  gajiPokok: 1000000,
  tunjanganIstri: 0,
  tunjanganAnak: 0,
  tunjanganUmum: 100000,
  tunjanganStruktural: 0,
  tunjanganFungsional: 0,
  tunjanganBeras: 0,
  tunjanganPph: 0,
  pembulatan: 0,
  tunjanganLain: 0,
  potonganIuranPegawai: 10000,
  potonganPph: 0,
  potonganBpjs: 0,
  potonganLain: 0,
  totalPenghasilan: 1100000,
  totalPotongan: 10000,
  gajiBersih: 1090000,
  honorarium: 0,
  diunggahOleh: { nama: "Petugas Uji", nip: "NIP-UJI-PETUGAS" }, // sensitive-ok
};

function pegawaiUji(opsi: { gaji?: boolean; tukin?: boolean } = {}) {
  return {
    nip: NIP_UJI,
    nama: "Pegawai Uji Satu",
    golongan: "III/a",
    jabatan: "Analis Uji",
    satuanKerja: "Satker Uji A",
    tukinCalc: opsi.tukin ? [{ tukinBersih: 500000, status: "DRAFT" }] : [],
    uangMakan: [],
    uangLembur: [],
    gajiInduk: opsi.gaji ? [gajiUji] : [],
  };
}

async function render(bulan: string, tahun: string) {
  const el = await SlipGajiPage({ params: Promise.resolve({ bulan, tahun }) });
  return renderToStaticMarkup(el as React.ReactElement);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-15T03:00:00Z"));
  sesi.akun.mockResolvedValue({ nip: NIP_UJI, role: "PEGAWAI", satuanKerja: "Satker Uji A" });
  palsu.pegawai.findUnique.mockReset();
  palsu.pengirimanUnit.findUnique.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("slip gaji - finalitas", () => {
  it("rekap unit TERKIRIM: tanpa peringatan masih bisa berubah", async () => {
    palsu.pegawai.findUnique.mockResolvedValue(pegawaiUji({ gaji: true, tukin: true }));
    palsu.pengirimanUnit.findUnique.mockResolvedValue({ status: "TERKIRIM", dikirimPada: new Date(), alasanKembali: null });
    const html = await render("8", "2026");
    expect(html).not.toContain("masih bisa berubah");
  });

  it("belum ada baris pengiriman: peringatan belum dikirim", async () => {
    palsu.pegawai.findUnique.mockResolvedValue(pegawaiUji({ gaji: true, tukin: true }));
    palsu.pengirimanUnit.findUnique.mockResolvedValue(null);
    const html = await render("8", "2026");
    expect(html).toContain("belum dikirim ke PPABP");
  });

  it("DIKEMBALIKAN: peringatan dikembalikan, alasan tidak tampil", async () => {
    palsu.pegawai.findUnique.mockResolvedValue(pegawaiUji({ gaji: true, tukin: true }));
    palsu.pengirimanUnit.findUnique.mockResolvedValue({
      status: "DIKEMBALIKAN",
      dikirimPada: new Date(),
      alasanKembali: "ALASAN-INTERNAL-UJI",
    });
    const html = await render("8", "2026");
    expect(html).toContain("dikembalikan");
    expect(html).not.toContain("ALASAN-INTERNAL-UJI");
  });

  it("hanya gaji induk: tanpa peringatan dan tanpa query pengiriman", async () => {
    palsu.pegawai.findUnique.mockResolvedValue(pegawaiUji({ gaji: true }));
    const html = await render("8", "2026");
    expect(html).not.toContain("masih bisa berubah");
    expect(palsu.pengirimanUnit.findUnique).not.toHaveBeenCalled();
  });

  it("findUnique dipanggil sekali dengan kunci komposit satker-periode", async () => {
    palsu.pegawai.findUnique.mockResolvedValue(pegawaiUji({ gaji: true, tukin: true }));
    palsu.pengirimanUnit.findUnique.mockResolvedValue(null);
    await render("8", "2026");
    expect(palsu.pengirimanUnit.findUnique).toHaveBeenCalledTimes(1);
    expect(palsu.pengirimanUnit.findUnique.mock.calls[0][0].where).toEqual({
      satuanKerja_periodeBulan_periodeTahun: { satuanKerja: "Satker Uji A", periodeBulan: 8, periodeTahun: 2026 },
    });
  });
});

describe("slip gaji - susunan dan HP", () => {
  it("urutan dokumen tetap", async () => {
    palsu.pegawai.findUnique.mockResolvedValue(pegawaiUji({ gaji: true, tukin: true }));
    palsu.pengirimanUnit.findUnique.mockResolvedValue(null);
    const html = await render("8", "2026");
    const urut = ["Gaji Pokok", "Jumlah Penghasilan", "Potongan", "Total Penghasilan", "Petugas Pengelola"].map((t) =>
      html.indexOf(t),
    );
    expect(urut.every((i) => i >= 0)).toBe(true);
    expect([...urut].sort((a, b) => a - b)).toEqual(urut);
  });

  it("identitas menumpuk di HP tapi tetap tabel saat cetak", async () => {
    palsu.pegawai.findUnique.mockResolvedValue(pegawaiUji({ gaji: true }));
    const html = await render("8", "2026");
    expect(html).toContain("print:table-cell");
    expect(html).toContain("sm:w-56");
  });

  it("bulan berjalan tanpa tautan sesudah; bulan sebelumnya ada", async () => {
    palsu.pegawai.findUnique.mockResolvedValue(pegawaiUji({ gaji: true }));
    const html = await render("9", "2026");
    expect(html).toContain("/saya/slip-gaji/8/2026");
    expect(html).not.toContain("/saya/slip-gaji/10/2026");
  });

  it("periode tanpa data: keadaan kosong dalam halaman dengan navigasi bulan", async () => {
    palsu.pegawai.findUnique.mockResolvedValue(pegawaiUji());
    const html = await render("3", "2026");
    expect(html).toContain("Belum ada data pembayaran untuk Maret 2026");
    expect(html).toContain("Pindah periode");
    expect(html).not.toContain("Akses ditolak");
  });

  it("bulan 13 saat login: alamat tidak sah, bukan harus login", async () => {
    const html = await render("13", "2026");
    expect(html).toContain("Alamat periode tidak sah");
    expect(html).not.toContain("harus login");
  });

  it("belum login: pesan login", async () => {
    sesi.akun.mockResolvedValue(null);
    expect(await render("8", "2026")).toContain("harus login");
  });
});
