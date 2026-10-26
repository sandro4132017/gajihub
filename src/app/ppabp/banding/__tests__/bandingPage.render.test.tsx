import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// SMOKE TEST RENDER MONITORING BANDING PPABP (sudah menggabung keputusan
// pembayaran - dulu halaman Rekonsiliasi).
//
// YANG DIJAGA: banding DIAJUKAN tidak terbaca sebagai sudah divalidasi,
// keputusan pembayaran tampil SEKALI per pegawai-periode walau bandingnya
// dua, filter satker ikut menyaring baris rekonsiliasi (yang tidak punya
// relasi Prisma), dan tidak ada lagi tautan ke menu Rekonsiliasi lama.
// Fixture: data palsu, tanpa NIP/nama asli.
// ============================================================================

const { palsu, sesi } = vi.hoisted(() => ({
  palsu: {
    pegawai: { findMany: vi.fn() },
    banding: { findMany: vi.fn() },
    approvalLog: { findMany: vi.fn() },
    reconciliationStatus: { findMany: vi.fn() },
    tukinCalculation: { findMany: vi.fn() },
    uangMakan: { findMany: vi.fn() },
    uangLembur: { findMany: vi.fn() },
  },
  sesi: { akun: vi.fn() },
}));

vi.mock("../../../../lib/prisma", () => ({ prisma: palsu }));
vi.mock("../../../../auth/getSessionAccount", () => ({
  getSessionAccount: sesi.akun,
  ambilUserSesi: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/ppabp/banding",
}));

import TembusanBandingPpabpPage from "../page";

const pegawaiInfo = (id: string, nama: string) => ({
  id,
  nip: `NIP-UJI-${id}`,
  nama,
  unitKerja: "Unit Uji",
  satuanKerja: "Satker Uji A",
  jabatan: "Analis Uji",
  golongan: "III/a",
  kelasJabatan: 8,
});

const tanggal = new Date("2026-08-10T03:00:00Z");

const bandingPenuh = (id: string, referensiTipe: string, status: string, pegawaiId = "peg-1") => ({
  id,
  pegawaiId,
  periodeBulan: 8,
  periodeTahun: 2026,
  referensiTipe,
  referensiId: `ref-${id}`,
  bagianData: null,
  usulanPerbaikan: null,
  alasan: `Alasan uji untuk ${id}`,
  status,
  batasWaktuVerifikasi: null,
  createdAt: tanggal,
  updatedAt: tanggal,
  pegawai: pegawaiInfo(pegawaiId, "Pegawai Uji Satu"),
  buktiDukung: [],
});

const reconMenunggu = {
  id: "recon-1",
  pegawaiId: "peg-1",
  periodeBulan: 8,
  periodeTahun: 2026,
  status: "SANGGAH",
  keputusanAkhir: null,
  detailSelisih: null,
  updatedAt: tanggal,
};
const reconRiwayat = {
  id: "recon-2",
  pegawaiId: "peg-2",
  periodeBulan: 7,
  periodeTahun: 2026,
  status: "DIPUTUSKAN",
  keputusanAkhir: "HOLD_PEMBAYARAN",
  detailSelisih: null,
  updatedAt: tanggal,
};

function siapkan() {
  sesi.akun.mockResolvedValue({ nip: "NIP-PPABP-UJI", role: "PPABP", satuanKerja: null });
  palsu.pegawai.findMany.mockImplementation((arg: { distinct?: string[]; where?: { id?: unknown; satuanKerja?: string } }) => {
    if (arg?.distinct) return Promise.resolve([{ satuanKerja: "Satker Uji A" }, { satuanKerja: "Satker Uji B" }]);
    if (arg?.where?.satuanKerja) return Promise.resolve([{ id: "peg-1" }]);
    return Promise.resolve([
      { id: "peg-1", nip: "NIP-UJI-peg-1", nama: "Pegawai Uji Satu", satuanKerja: "Satker Uji A" },
      { id: "peg-2", nip: "NIP-UJI-peg-2", nama: "Pegawai Uji Dua", satuanKerja: "Satker Uji A" },
    ]);
  });
  palsu.banding.findMany.mockImplementation((arg: { where: { status?: unknown } }) => {
    const st = arg.where.status;
    if (st === "DIAJUKAN") {
      return Promise.resolve([bandingPenuh("b-1", "TUKIN", "DIAJUKAN"), bandingPenuh("b-2", "PRESENSI", "DIAJUKAN")]);
    }
    return Promise.resolve([]);
  });
  palsu.approvalLog.findMany.mockResolvedValue([]);
  palsu.reconciliationStatus.findMany.mockImplementation((arg: { where: { status?: unknown } }) =>
    Promise.resolve(arg.where.status === "DIPUTUSKAN" ? [reconRiwayat] : [reconMenunggu])
  );
  palsu.tukinCalculation.findMany.mockResolvedValue([
    { pegawaiId: "peg-1", periodeBulan: 8, periodeTahun: 2026, status: "APPROVED" },
  ]);
  palsu.uangMakan.findMany.mockResolvedValue([]);
  palsu.uangLembur.findMany.mockResolvedValue([]);
}

async function render(searchParams: { satker?: string; status?: string; buka?: string } = {}) {
  const el = await TembusanBandingPpabpPage({ searchParams: Promise.resolve(searchParams) });
  return renderToStaticMarkup(el as React.ReactElement);
}

beforeEach(() => {
  vi.clearAllMocks();
  siapkan();
});

describe("Monitoring Banding PPABP - render", () => {
  it("kartu banding DIAJUKAN berlabel belum diverifikasi Kasubag TU", async () => {
    const html = await render();
    expect(html).toContain("Belum diverifikasi Kasubag TU");
    // Tidak jatuh ke label default lama.
    expect(html).not.toContain("Menunggu OSDMA</span></span>");
  });

  it("dua banding satu pasangan menghasilkan tepat SATU form keputusan", async () => {
    const html = await render();
    expect(html.match(/name="id" value="recon-1"/g)).toHaveLength(1);
    // Kedua banding tetap terdaftar di keputusan itu ("Lihat bukti" per banding).
    expect(html.match(/Lihat bukti/g)).toHaveLength(2);
    expect(html).toContain('id="keputusan-peg-1|8|2026"');
  });

  it("tombol keputusan berlabel baru dan catatan ADK terlihat", async () => {
    const html = await render();
    expect(html).toContain("Catat: tahan pembayaran");
    expect(html).toContain("Catat: koreksi siklus berikutnya");
    expect(html).toContain("Export ADK belum otomatis menahan baris ini");
  });

  it("riwayat keputusan ada di <details> yang tertutup", async () => {
    const html = await render();
    const i = html.indexOf("<details");
    expect(i).toBeGreaterThan(-1);
    expect(html.slice(i, i + 40)).not.toContain(" open");
    expect(html.slice(i)).toContain("Riwayat keputusan pembayaran (1)");
    expect(html.slice(i)).toContain("Pegawai Uji Dua");
  });

  it("tile baru ada, 'Perlu Rekonsiliasi' dan 'Selesai Diputuskan' tidak", async () => {
    const html = await render();
    for (const t of ["Menunggu Kasubag TU", "Menunggu OSDMA", "Keputusan pembayaran menunggu", "Banding selesai", "Total Tembusan"]) {
      expect(html, t).toContain(t);
    }
    expect(html).not.toContain("Perlu Rekonsiliasi");
    expect(html).not.toContain("Selesai Diputuskan");
  });

  it("tidak ada tautan ke /ppabp/rekonsiliasi", async () => {
    for (const q of [{}, { status: "PERLU_KEPUTUSAN" }, { buka: "b-1" }]) {
      const html = await render(q);
      expect(html).not.toContain("/ppabp/rekonsiliasi");
      expect(html).not.toContain("Menu Rekonsiliasi");
    }
  });

  it("alias lama ?status=PERLU_REKONSILIASI tetap menampilkan keputusan menunggu", async () => {
    const html = await render({ status: "PERLU_REKONSILIASI" });
    expect(html).toContain("Keputusan pembayaran menunggu (1)");
    expect(html).not.toContain("Riwayat keputusan pembayaran");
  });

  it("urutan seksi: keputusan menunggu, daftar tembusan, riwayat keputusan", async () => {
    const html = await render();
    const a = html.indexOf("Keputusan pembayaran menunggu (1)");
    const b = html.indexOf("Daftar Tembusan Banding");
    const c = html.indexOf("Riwayat keputusan pembayaran");
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it("?buka=<id> membuka kartu banding itu otomatis", async () => {
    const tertutup = await render();
    expect(tertutup).not.toContain("Alur Pemeriksaan Berjenjang");
    const terbuka = await render({ buka: "b-2" });
    expect(terbuka).toContain("Alur Pemeriksaan Berjenjang");
  });

  it("'Lihat bukti' mempertahankan query lain dan menambah ?buka=", async () => {
    const html = await render({ satker: "Satker Uji A" });
    expect(html).toContain("satker=Satker+Uji+A&amp;buka=b-1#banding-b-1");
  });

  it("filter satker menyaring baris rekonsiliasi lewat pegawaiId in", async () => {
    await render({ satker: "Satker Uji A" });
    expect(palsu.pegawai.findMany).toHaveBeenCalledWith({
      where: { satuanKerja: "Satker Uji A" },
      select: { id: true },
    });
    const panggilan = palsu.reconciliationStatus.findMany.mock.calls.map((c) => c[0].where);
    expect(panggilan.length).toBe(2);
    for (const where of panggilan) {
      expect(where.pegawaiId).toEqual({ in: ["peg-1"] });
    }
  });

  it("tanpa filter satker, recon tidak dibatasi pegawaiId", async () => {
    await render();
    for (const c of palsu.reconciliationStatus.findMany.mock.calls) {
      expect(c[0].where.pegawaiId).toBeUndefined();
    }
  });

  it("keadaan kosong menyebut sebabnya", async () => {
    palsu.banding.findMany.mockResolvedValue([]);
    palsu.reconciliationStatus.findMany.mockResolvedValue([]);
    const html = await render();
    expect(html).toContain("begitu pegawai mengajukan banding (status SANGGAH)");
    expect(html).toContain("Belum ada banding yang diajukan pegawai");
  });

  it("banding tidak ditemukan untuk pasangan recon: keputusan tetap bisa dicatat", async () => {
    palsu.banding.findMany.mockResolvedValue([]);
    const html = await render();
    expect(html).toContain("Banding terkait tidak ditemukan");
    expect(html).toContain('name="id" value="recon-1"');
  });

  it("pasangan dengan pembayaran APPROVED menampilkan strip peringatan", async () => {
    const html = await render();
    expect(html).toContain("sudah disetujui (APPROVED) atau ikut ADK (DIKIRIM)");
  });

  it("role non-PPABP/ADMIN ditolak dan tidak menyentuh database", async () => {
    sesi.akun.mockResolvedValue({ nip: "NIP-PEG-UJI", role: "PEGAWAI", satuanKerja: "Satker Uji A" });
    const html = await render();
    expect(html).toContain("Role kamu tidak berwenang melihat tembusan banding.");
    expect(palsu.banding.findMany).not.toHaveBeenCalled();
    expect(palsu.reconciliationStatus.findMany).not.toHaveBeenCalled();
  });

  it("tanpa sesi ditolak", async () => {
    sesi.akun.mockResolvedValue(null);
    const html = await render();
    expect(html).toContain("Role kamu tidak berwenang");
  });

  it("ADMIN boleh membuka halaman", async () => {
    sesi.akun.mockResolvedValue({ nip: "NIP-ADM-UJI", role: "ADMIN", satuanKerja: null });
    const html = await render();
    expect(html).toContain("Monitoring Banding");
  });
});
