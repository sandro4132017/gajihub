import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// SMOKE TEST RENDER DASHBOARD KASUBAG TU (/kasubag).
//
// Halamannya merakit stepper lima langkah, kartu sambutan, dan panel "perlu
// perhatian" dari belasan query. Yang dijaga: tidak melempar (termasuk
// database kosong & query string ngawur), urutan/jumlah langkah, bahwa tidak
// ada rupiah lembur, tidak ada tenggat, dan tidak ada sparkline lama.
// ============================================================================

const { palsu, izin, akses } = vi.hoisted(() => ({
  palsu: {
    pegawai: { count: vi.fn(), findMany: vi.fn() },
    tukinCalculation: { findMany: vi.fn(), groupBy: vi.fn() },
    uangMakan: { groupBy: vi.fn() },
    uangLembur: { groupBy: vi.fn() },
    perubahanDataPegawai: { findMany: vi.fn() },
    verifikasiTabelUnit: { findMany: vi.fn() },
    pengecualianPegawai: { count: vi.fn() },
    banding: { count: vi.fn() },
    skKgb: { count: vi.fn() },
    skHukumanDisiplin: { count: vi.fn() },
    pengirimanUnit: { findUnique: vi.fn(), findMany: vi.fn() },
    rekapPresensiPeriode: { findMany: vi.fn() },
  },
  izin: { export: true },
  akses: { satker: "Biro Keuangan dan BMN" as string | undefined },
}));

vi.mock("../../../lib/prisma", () => ({ prisma: palsu }));

vi.mock("../access", () => ({
  ambilAksesUnit: vi.fn(async () => ({
    authUser: {
      nip: "198100000000000000", // sensitive-ok
      role: "KASUBAG_TU",
      satuanKerja: "Biro Keuangan dan BMN",
      aktif: true,
    },
    satkerEfektif: akses.satker,
    nama: "Alpha Sandro",
  })),
}));

vi.mock("../../../auth/permissions", async (importAsli) => {
  const asli = await importAsli<typeof import("../../../auth/permissions")>();
  return { ...asli, canExportRekapUnit: () => izin.export };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/kasubag",
}));

import KasubagDashboardPage from "../page";

const SATKER = "Biro Keuangan dan BMN";
const PERIODE = { periodeBulan: 8, periodeTahun: 2026 };
const SESUDAH = new Date("2026-08-20T00:00:00Z");
const SEBELUM = new Date("2026-08-10T00:00:00Z");

interface Opsi {
  kosong?: boolean;
  /** Banyaknya pegawai ikut yang sudah punya rekap presensi. */
  presensi?: number;
  predikat?: number;
  tukin?: number;
  uangMakan?: number;
  kirim?: null | { status: string; alasanKembali?: string | null; dikembalikanPada?: Date | null };
  tabel?: string[];
  banding?: number;
}

function pegawai(n: number, o: Required<Pick<Opsi, "presensi" | "predikat" | "tukin" | "uangMakan">>) {
  return Array.from({ length: 2 }, (_, i) => ({
    nip: `19900000000000000${n + i}`, // sensitive-ok
    tukinCalc: i < o.tukin ? [{ calculatedAt: SESUDAH }] : [],
    uangMakan: i < o.uangMakan ? [{ id: `um-${i}` }] : [],
    uangLembur: [{ id: `lb-${i}` }],
    rekapPresensi: i < o.presensi ? [{ diunggahPada: SEBELUM }] : [],
    predikatKinerja: i < o.predikat ? [{ sourceSyncedAt: SEBELUM }] : [],
  }));
}

function siapkan(opsi: Opsi = {}) {
  const { kosong = false, presensi = 2, predikat = 1, tukin = 0, uangMakan = 0, kirim = null, tabel = [], banding = 0 } =
    opsi;
  akses.satker = SATKER;
  palsu.pegawai.count.mockResolvedValue(kosong ? 0 : 2);
  palsu.pegawai.findMany.mockImplementation((arg: { distinct?: string[]; orderBy?: unknown }) => {
    if (arg?.distinct) return Promise.resolve([{ satuanKerja: SATKER }, { satuanKerja: "Pusdatik" }]);
    return Promise.resolve(kosong ? [] : pegawai(1, { presensi, predikat, tukin, uangMakan }));
  });
  palsu.tukinCalculation.findMany.mockResolvedValue(
    tukin === 0 || kosong
      ? []
      : [
          {
            id: "t1",
            status: "DRAFT",
            tukinBersih: 10_000_000,
            ...PERIODE,
            pegawai: { id: "p1", nama: "Pegawai Palsu", nip: "199000000000000001", jabatan: null, kelasJabatan: 8, golongan: "III/a" }, // sensitive-ok
          },
        ]
  );
  palsu.tukinCalculation.groupBy.mockImplementation((arg: { by: string[] }) =>
    Promise.resolve(
      arg.by.length === 1
        ? kosong
          ? []
          : [{ periodeBulan: 8, _sum: { tukinBersih: 10_000_000 }, _count: { id: 2 } }]
        : kosong
          ? []
          : [{ ...PERIODE, _count: { _all: tukin } }]
    )
  );
  palsu.uangMakan.groupBy.mockResolvedValue(
    kosong ? [] : [{ periodeBulan: 8, _sum: { totalUangMakan: 2_000_000 } }]
  );
  palsu.uangLembur.groupBy.mockResolvedValue(
    kosong ? [] : [{ periodeBulan: 8, _sum: { totalUangLembur: 777_777 } }]
  );
  palsu.perubahanDataPegawai.findMany.mockResolvedValue([]);
  palsu.verifikasiTabelUnit.findMany.mockResolvedValue(tabel.map((jenisTabel) => ({ jenisTabel })));
  palsu.pengecualianPegawai.count.mockResolvedValue(0);
  palsu.banding.count.mockResolvedValue(banding);
  palsu.skKgb.count.mockResolvedValue(3);
  palsu.skHukumanDisiplin.count.mockResolvedValue(1);
  palsu.pengirimanUnit.findUnique.mockResolvedValue(
    kirim
      ? {
          status: kirim.status,
          dikirimPada: SESUDAH,
          alasanKembali: kirim.alasanKembali ?? null,
          dikembalikanPada: kirim.dikembalikanPada ?? null,
        }
      : null
  );
  palsu.pengirimanUnit.findMany.mockResolvedValue([]);
  palsu.rekapPresensiPeriode.findMany.mockResolvedValue(kosong ? [] : [PERIODE]);
}

async function render(
  searchParams: Record<string, string | undefined> = { bulan: "8", tahun: "2026" }
): Promise<string> {
  const el = await KasubagDashboardPage({ searchParams: Promise.resolve(searchParams) });
  return renderToStaticMarkup(el as React.ReactElement);
}

import { TABEL_WAJIB_DIVERIFIKASI } from "../../../business-logic/pengirimanUnit";
const SEMUA_TABEL = [...TABEL_WAJIB_DIVERIFIKASI] as string[];

beforeEach(() => {
  vi.clearAllMocks();
  izin.export = true;
  siapkan();
});

describe("dashboard Kasubag TU - render", () => {
  it("membuka halaman tanpa melempar, juga saat kosong dan saat ?bulan=abc", async () => {
    expect(await render()).toContain("Langkah tutup bulan");
    siapkan({ kosong: true });
    expect(await render({})).toContain("Langkah tutup bulan");
    siapkan({ kosong: true });
    expect(await render({ bulan: "abc", tahun: "xx" })).toContain("Langkah tutup bulan");
  });

  it("stepper berisi lima langkah dan TEPAT satu yang aktif", async () => {
    const html = await render();
    const awal = html.indexOf('<ol aria-label="Langkah tutup bulan');
    const akhir = html.indexOf("</ol>", awal);
    expect(awal).toBeGreaterThan(-1);
    const ol = html.slice(awal, akhir);
    expect(ol).toContain('aria-label="Langkah tutup bulan Agustus 2026"');
    expect(ol.match(/class="flex gap-4 lg:flex-col/g)).toHaveLength(5);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    // Presensi lengkap, predikat baru 1 dari 2 -> predikat yang aktif.
    expect(html).toContain("Langkah berikutnya");
    expect(html).toContain("Lengkapi predikat");
  });

  it("kartu sambutan menulis kalimat jujur 'x dari 5 langkah'", async () => {
    const html = await render();
    expect(html).toMatch(/dari <span[^>]*>5<\/span> langkah selesai/);
    // Nama bulan tidak diulang di kalimat ini - sudah ada di baris "Periode ...".
    expect(html).not.toMatch(/langkah Agustus 2026 selesai/);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemax="5"');
  });

  it("tidak ada rupiah lembur di mana pun", async () => {
    const html = await render();
    expect(html).not.toContain("777.777");
    expect(html).not.toContain("777,777");
  });

  it("kartu komponen berjalan: yang selesai hilang, sisanya maju sesuai urutan", async () => {
    // Bawaan fixture: presensi 2/2 (selesai), predikat 1/2, belum dihitung.
    const html = await render();
    const deret = html.slice(html.indexOf('aria-label="Komponen berikutnya yang belum selesai"'));
    const isi = deret.slice(0, deret.indexOf("</ul>"));
    expect(isi).not.toContain(">Presensi<");
    // Empat yang belum selesai, tapi HANYA tiga terdepan yang tampil.
    const urutan = ["Predikat Kinerja", "Tunjangan Kinerja", "Uang Makan"].map((n) => isi.indexOf(n));
    expect(urutan.every((i) => i > -1)).toBe(true);
    expect([...urutan].sort((a, b) => a - b)).toEqual(urutan);
    expect(isi).not.toContain("Uang Lembur");
  });

  it("tanpa gulir mendatar & tanpa ajakan menggeser; tetap putih bercahaya tanpa nomor urut", async () => {
    const html = await render();
    // Hanya kartu sambutan - tabel lain di halaman ini memang boleh bergulir.
    const hero = html.slice(html.indexOf('aria-label="Ringkasan tutup bulan"'), html.indexOf("</section>"));
    expect(hero).not.toContain("snap-x");
    expect(hero).not.toContain("overflow-x-auto");
    expect(hero).not.toContain("Geser untuk melihat");
    expect(html).toContain("var(--cahaya-2-ikon-warna)");
    expect(html).not.toMatch(/>0[1-5]</);
  });

  it("kartu komponen cuma tiga baris: nama, angka x/y pegawai, status singkat", async () => {
    const html = await render();
    expect(html).not.toContain("pegawai terhitung");
    expect(html).not.toContain("berjam lembur");
    expect(html).toContain("Belum dihitung");
  });

  it("TERKIRIM -> semua langkah selesai dan tombol utama hilang", async () => {
    siapkan({ tukin: 2, uangMakan: 2, predikat: 2, kirim: { status: "TERKIRIM" }, tabel: SEMUA_TABEL });
    const html = await render();
    expect(html).toContain("Rekap Agustus 2026 sudah dikirim dan terkunci");
    expect(html).not.toContain("aria-current=");
    expect(html.match(/>Selesai</g)).toHaveLength(5);
    expect(html).toContain('aria-valuenow="5"');
    // Tombol utama = satu-satunya blok putih berkotak di kartu sambutan.
    expect(html).not.toContain("bg-white px-5 py-2.5");
  });

  it("belum terkirim -> tombol utama ke langkah aktif", async () => {
    const html = await render();
    expect(html).toContain("bg-white px-5 py-2.5");
    expect(html).toContain('href="/tukin/predikat-kinerja?bulan=8&amp;tahun=2026&amp;satker=Biro%20Keuangan%20dan%20BMN"');
  });

  it("DIKEMBALIKAN -> alasan PPABP tampil di langkah Kirim (panel perlu perhatian sudah dicabut)", async () => {
    siapkan({
      tukin: 2,
      uangMakan: 2,
      predikat: 2,
      kirim: {
        status: "DIKEMBALIKAN",
        alasanKembali: "Periksa ulang kelas jabatan pegawai",
        dikembalikanPada: new Date("2026-09-03T03:00:00Z"),
      },
    });
    const html = await render();
    // Alasannya satu-satunya keterangan unit tentang apa yang harus
    // diperbaiki - harus tetap terlihat walau panelnya sudah tidak ada.
    const awalStepper = html.indexOf('<ol aria-label="Langkah tutup bulan');
    const stepper = html.slice(awalStepper, html.indexOf("</ol>", awalStepper));
    expect(stepper).toContain("Periksa ulang kelas jabatan pegawai");
    // Tombol menunjuk pekerjaan berikutnya (centang direset saat dikembalikan),
    // bukan "Lihat catatan PPABP" - catatannya sudah tampil di langkah Kirim.
    expect(html).not.toContain("Lihat catatan PPABP");
    const hero = html.slice(html.indexOf('aria-label="Ringkasan tutup bulan"'), html.indexOf("</section>"));
    expect(hero).toContain(">Periksa tabel</a>");
    // Data lengkap TIDAK boleh terbaca "semua beres" - sisa langkah disebut.
    expect(hero).toContain("Data semua komponen sudah lengkap. Tinggal periksa tabel, lalu kirim rekap ke PPABP.");
  });

  it("kartu Nilai Kalkulasi memuat rincian Tukin & Uang Makan, tanpa lembur selama nominalnya ditahan", async () => {
    const html = await render();
    const kartu = html.slice(html.indexOf(">Nilai Kalkulasi<"), html.indexOf("Tren Kalkulasi Belanja Unit"));
    expect(kartu).toContain(">Rincian<");
    expect(kartu).toContain("Tunjangan Kinerja");
    expect(kartu).toContain("Uang Makan");
    expect(kartu).not.toContain("Uang Lembur<");
    expect(kartu).toContain("Uang lembur belum masuk hitungan.");
  });

  it("panel 'Perlu perhatian' tidak ada lagi", async () => {
    const html = await render();
    expect(html).not.toContain('aria-label="Perlu perhatian"');
    expect(html).not.toContain("Tidak ada yang perlu perhatian saat ini.");
  });

  it("langkah berjajar ke samping di layar lebar", async () => {
    const html = await render();
    expect(html).toMatch(/<ol[^>]*lg:grid-cols-5/);
  });

  it("unduhan rekap hilang bila izin export tidak ada", async () => {
    expect(await render()).toContain("Rekap Tukin (Excel)");
    izin.export = false;
    const html = await render();
    expect(html).not.toContain("Rekap Tukin (Excel)");
    expect(html).not.toContain("/kasubag/kalkulasi/export");
  });

  it("tanpa tenggat/hitung mundur dan tanpa sparkline lama", async () => {
    const html = (await render()).toLowerCase();
    expect(html).not.toContain("tenggat");
    expect(html).not.toContain("hitung mundur");
    expect(html).not.toContain("gj-garis");
    expect(html).not.toContain("<path d=\"m0,20 q15");
    expect(html).not.toContain("Progres Tukin".toLowerCase());
    expect(html).not.toContain("Ringkasan Tindakan Unit".toLowerCase());
  });

  it("memasang tema palet 2026 di pembungkus halaman", async () => {
    expect(await render()).toContain('data-tema="palet-2026"');
  });
});
