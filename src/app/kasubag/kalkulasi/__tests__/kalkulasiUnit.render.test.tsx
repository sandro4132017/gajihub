import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// SMOKE TEST RENDER /kasubag/kalkulasi - mengunci INVENTARIS FUNGSI halaman,
// bukan susunan visualnya. Bagian "inventaris" harus lulus di halaman lama
// maupun yang dirombak: tombol Hitung, kontrol verifikasi, tiga SPTJM, status
// BSrE, form kirim, tautan rincian, chip & alasan DIKEMBALIKAN, keadaan
// terkunci, daftar dikecualikan, peringatan angka basi, tanpa rupiah lembur,
// dan Unduh Excel mengikuti izin.
// ============================================================================

const { palsu, izin, hari } = vi.hoisted(() => ({
  palsu: {
    pegawai: { findMany: vi.fn(), findUnique: vi.fn() },
    pengirimanUnit: { findUnique: vi.fn() },
    verifikasiTabelUnit: { findMany: vi.fn() },
    pengecualianPegawai: { findMany: vi.fn() },
    presensiHarian: { groupBy: vi.fn(), findMany: vi.fn() },
    koreksiPresensiHarian: { findMany: vi.fn(), groupBy: vi.fn() },
    perubahanDataPegawai: { findMany: vi.fn() },
    dokumenTte: { findFirst: vi.fn(), findMany: vi.fn() },
    predikatKinerja: { findMany: vi.fn() },
  },
  izin: { export: true },
  hari: { map: new Map<string, string>() },
}));

vi.mock("../../../../lib/prisma", () => ({ prisma: palsu }));
vi.mock("../../../../lib/tapTidakWajarDb", () => ({ hitungTapTidakWajarUnit: vi.fn(async () => new Map()) }));
vi.mock("../../../../lib/hariLibur", () => ({ muatHariLiburPeriode: vi.fn(async () => hari.map) }));
vi.mock("../actions", () => ({
  koreksiJamLemburHarianAction: vi.fn(),
  hapusKoreksiJamLemburHarianAction: vi.fn(),
  koreksiUangLemburAction: vi.fn(),
}));
vi.mock("../actionsPengecualian", () => ({
  tandaiPengecualianAction: vi.fn(),
  batalkanPengecualianAction: vi.fn(),
}));
vi.mock("../../../sumberData", () => ({
  ambilSumberData: vi.fn(async () => [
    {
      nama: "Kehadiran",
      cakupan: "Agustus 2026",
      sistemSumber: "e-Presensi",
      caraMasuk: "Ditarik dari database e-Presensi (baca saja)",
      diambilPada: new Date("2026-08-18T03:00:00Z"),
      jumlah: 3,
      dari: 4,
      href: "/tukin/presensi",
      labelAksi: "Kelola presensi",
    },
    {
      nama: "Kinerja",
      cakupan: "Agustus 2026",
      sistemSumber: "e-Kinerja BKN",
      caraMasuk: "Diunggah dari berkas Rekap Penilaian",
      diambilPada: new Date("2026-08-18T03:00:00Z"),
      jumlah: 3,
      dari: 4,
      href: "/tukin/predikat-kinerja",
      labelAksi: "Kelola predikat kinerja",
    },
  ]),
  keSumberAcuan: () => [],
}));

const SATKER = "Biro Keuangan dan BMN";
vi.mock("../../access", () => ({
  ambilAksesUnit: vi.fn(async () => ({
    authUser: { nip: "000000000000000001", role: "KASUBAG_TU", satuanKerja: "Biro Keuangan dan BMN", aktif: true }, // sensitive-ok
    satkerEfektif: "Biro Keuangan dan BMN",
    nama: "Kasubag Uji",
  })),
}));

vi.mock("../../../../auth/permissions", async (importAsli) => {
  const asli = await importAsli<typeof import("../../../../auth/permissions")>();
  return { ...asli, canExportRekapUnit: () => izin.export };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/kasubag/kalkulasi",
}));

import KalkulasiUnitPage from "../page";
import { TABEL_WAJIB_DIVERIFIKASI } from "../../../../business-logic/pengirimanUnit";

const T_HITUNG = new Date("2026-08-20T00:00:00Z");
const T_LAMA = new Date("2026-08-10T00:00:00Z");
const T_BARU = new Date("2026-08-25T00:00:00Z");

// NIP palsu 18 digit, dibangun dari nomor urut supaya bukan data asli.
const nipPalsu = (i: number) => String(i).padStart(18, "0");

interface OpsiPegawai {
  predikat?: boolean;
  tukin?: boolean;
  hadir?: number;
  /** tukin bersih tersimpan; bawaan 3 juta. */
  bersih?: number;
  /** rekap diunggah SESUDAH kalkulasi -> angka basi. */
  basi?: boolean;
}

function pegawaiRow(i: number, nama: string, o: OpsiPegawai = {}) {
  const { predikat = true, tukin = true, hadir = 19, basi = false, bersih = 3_000_000 } = o;
  return {
    id: `p${i}`,
    nip: nipPalsu(i),
    nama,
    golongan: "III/a",
    kelasJabatan: 8,
    satuanKerja: SATKER,
    tukinCalc: tukin
      ? [
          {
            id: `t${i}`,
            calculatedAt: T_HITUNG,
            komponenKehadiran: 1_000_000,
            komponenKinerja: 2_000_000,
            tukinPokok: 3_000_000,
            potonganPph: 0,
            tukinBersih: bersih,
            status: "DRAFT",
          },
        ]
      : [],
    uangMakan: [
      {
        jumlahHariKerja: 20,
        jumlahHariHadir: hadir,
        jumlahHariDibayar: hadir,
        tarifHarian: 37_000,
        totalUangMakan: hadir * 37_000,
      },
    ],
    uangLembur: [
      {
        totalJamLembur: 3,
        tarifPerJam: 25_000,
        jamLemburHariKerja: 3,
        jamLemburHariLibur: 0,
        totalUangLembur: 777_777,
      },
    ],
    rekapPresensi: [
      {
        jumlahHariKerja: 20,
        jumlahHariHadir: hadir,
        jumlahHariCuti: 0,
        jumlahHariDinasLuar: 0,
        jumlahHariDiklat: 0,
        jumlahHariTugasBelajar: 0,
        jumlahHariWfo: hadir,
        jumlahHariWfhWfa: 0,
        totalMenitTerlambat: 0,
        totalMenitPulangCepat: 0,
        totalMenitMeninggalkanKantor: 0,
        jumlahTidakPresensi: 0,
        jumlahHariAlpha: 0,
        jumlahTidakIkutUpacara: 0,
        jenisCutiAktif: null,
        bulanCutiKeberapa: null,
        diunggahPada: basi ? T_BARU : T_LAMA,
      },
    ],
    predikatKinerja: predikat ? [{ predikat: "BAIK", sourceSyncedAt: T_LAMA }] : [],
  };
}

interface Opsi {
  pegawai?: ReturnType<typeof pegawaiRow>[];
  kirim?: null | { status: string; alasanKembali?: string | null; dikembalikanPada?: Date | null };
  tabel?: string[];
  /** jenisDokumen -> status & waktu tanda tangan. */
  tte?: Record<string, { status: string; signedAt: Date | null }>;
  dikecualikan?: { pegawaiId: string; nama: string }[];
}

const LENGKAP = () => [pegawaiRow(1, "Pegawai Uji Satu"), pegawaiRow(2, "Pegawai Uji Dua")];

function siapkan(o: Opsi = {}) {
  const { pegawai = LENGKAP(), kirim = null, tabel = [], tte = {}, dikecualikan = [] } = o;
  palsu.pegawai.findMany.mockImplementation((arg: { distinct?: string[] }) =>
    Promise.resolve(arg?.distinct ? [{ satuanKerja: SATKER }, { satuanKerja: "Pusdatik" }] : pegawai),
  );
  palsu.pegawai.findUnique.mockResolvedValue({ nama: "Kasubag Uji" });
  palsu.pengirimanUnit.findUnique.mockResolvedValue(
    kirim
      ? {
          status: kirim.status,
          dikirimPada: T_HITUNG,
          alasanKembali: kirim.alasanKembali ?? null,
          dikembalikanPada: kirim.dikembalikanPada ?? null,
        }
      : null,
  );
  palsu.verifikasiTabelUnit.findMany.mockResolvedValue(
    tabel.map((jenisTabel) => ({
      jenisTabel,
      diverifikasiPada: T_HITUNG,
      diverifikasiOleh: { nama: "Kasubag Uji" },
    })),
  );
  palsu.pengecualianPegawai.findMany.mockResolvedValue(
    dikecualikan.map((d, i) => ({
      id: `x${i}`,
      pegawaiId: d.pegawaiId,
      alasanKode: "MUTASI_KELUAR",
      penjelasan: null,
      pegawai: { id: d.pegawaiId, nama: d.nama, nip: nipPalsu(900 + i) },
    })),
  );
  palsu.presensiHarian.groupBy.mockResolvedValue([]);
  palsu.presensiHarian.findMany.mockResolvedValue([]);
  palsu.koreksiPresensiHarian.findMany.mockResolvedValue([]);
  palsu.koreksiPresensiHarian.groupBy.mockResolvedValue([]);
  palsu.perubahanDataPegawai.findMany.mockResolvedValue([]);
  palsu.predikatKinerja.findMany.mockResolvedValue([{ periodeBulan: 8, periodeTahun: 2026 }]);

  const baris = (jenisDokumen: string) => {
    const t = tte[jenisDokumen];
    return t
      ? {
          id: `dok-${jenisDokumen}`,
          jenisDokumen,
          status: t.status,
          nomorDokumen: "001/SPTJM/2026",
          fileSignedPath: t.status === "TERTANDATANGANI" ? "storage/uji.pdf" : null,
          signedAt: t.signedAt,
          penandatanganNama: "Kasubag Uji",
          createdAt: T_HITUNG,
        }
      : null;
  };
  // Dua bentuk akses didukung supaya test ini lulus di halaman lama
  // (findFirst per jenis) maupun yang baru (satu findMany).
  palsu.dokumenTte.findFirst.mockImplementation((arg: { where: { jenisDokumen: string } }) =>
    Promise.resolve(baris(arg.where.jenisDokumen)),
  );
  palsu.dokumenTte.findMany.mockImplementation(() =>
    Promise.resolve(
      ["SPTJM_TUKIN", "SPTJM_UANG_MAKAN", "SPTJM_LEMBUR"].flatMap((j) => {
        const b = baris(j);
        return b ? [b] : [];
      }),
    ),
  );
}

async function render(
  searchParams: Record<string, string | undefined> = { bulan: "8", tahun: "2026" },
): Promise<string> {
  const el = await KalkulasiUnitPage({
    searchParams: Promise.resolve({ bulan: "8", tahun: "2026", ...searchParams }),
  });
  return renderToStaticMarkup(el as React.ReactElement);
}

/** Kotak pernyataan di Tahap 4 sedang nonaktif? */
const pernyataanNonaktif = (html: string): boolean => {
  const tag = html.match(/<input[^>]*name="pernyataan"[^>]*>/)?.[0];
  if (!tag) throw new Error("kotak pernyataan tidak dirender");
  return tag.includes("disabled=\"\"");
};

const SEMUA_WAJIB = [...TABEL_WAJIB_DIVERIFIKASI] as string[];
const TTE_SAH = {
  SPTJM_TUKIN: { status: "TERTANDATANGANI", signedAt: T_HITUNG },
  SPTJM_UANG_MAKAN: { status: "TERTANDATANGANI", signedAt: T_HITUNG },
};

beforeEach(() => {
  vi.clearAllMocks();
  izin.export = true;
  hari.map = new Map();
  siapkan();
});

describe("Kalkulasi Unit - inventaris fungsi", () => {
  it("memuat judul, satuan kerja & periode, dan tidak melempar saat unit kosong", async () => {
    const html = await render();
    expect(html).toContain("Kalkulasi Unit");
    expect(html).toContain(`${SATKER} · Agustus 2026`);
    siapkan({ pegawai: [] });
    expect(await render()).toContain("Kalkulasi Unit");
  });

  it("tombol Hitung (KalkulasiMassalForm) selalu ada", async () => {
    const html = await render();
    expect(html).toContain("Hitung sekarang");
    expect(html).toContain('name="periodeBulan"');
  });

  it("tidak ada lagi kontrol 'Tandai sudah diperiksa' - TTE SPTJM sudah berarti diperiksa", async () => {
    expect(await render()).not.toContain("Tandai sudah diperiksa");
    expect(await render({ tab: "lembur" })).not.toContain("Tandai sudah diperiksa");
  });

  it("ketiga SPTJM tampil dengan tombol Tanda Tangani, plus status koneksi BSrE", async () => {
    const html = await render();
    expect(html).toContain("SPTJM PPK – Tunjangan Kinerja (Tukin)");
    expect(html).toContain("SPTJM PPK – Uang Makan");
    expect(html).toContain("SPTJM PPK – Uang Lembur");
    expect(html.match(/Tanda Tangani SPTJM/g)!.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain("BSrE");
  });

  it("SPTJM yang sudah bertanda tangan menampilkan badge sah, penanda tangan, dan PDF", async () => {
    siapkan({ tte: TTE_SAH });
    const html = await render();
    expect(html).toContain("TTE Sah");
    expect(html).toContain("Lihat PDF");
    expect(html).toContain("/berkas/tte/dok-SPTJM_TUKIN");
    expect(html).toContain("001/SPTJM/2026");
  });

  it("tautan rincian lengkap menuju ?rincian=1", async () => {
    expect(await render()).toContain("rincian=1");
  });

  it("form kirim: pernyataan & catatan muncul saat semua syarat lengkap", async () => {
    siapkan({ tabel: SEMUA_WAJIB, tte: TTE_SAH });
    const html = await render();
    expect(html).toContain('name="pernyataan"');
    expect(html).toContain('name="catatan"');
  });

  it("DIKEMBALIKAN: chip di kepala dan spanduk catatan PPABP di atas stepper", async () => {
    siapkan({
      kirim: {
        status: "DIKEMBALIKAN",
        alasanKembali: "Periksa ulang kelas jabatan pegawai",
        dikembalikanPada: new Date("2026-09-03T03:00:00Z"),
      },
    });
    const html = await render();
    expect(html).toContain("Dikembalikan dari PPABP");
    const spanduk = html.indexOf("Catatan pengembalian dari PPABP:");
    expect(spanduk).toBeGreaterThan(-1);
    expect(spanduk).toBeLessThan(html.indexOf('href="#tahap-1"')); // sebelum stepper
    expect(html).toContain("Periksa ulang kelas jabatan pegawai");
    expect(html).toContain('aria-label="Tutup catatan pengembalian"');
  });

  it("TERKIRIM: tampilan terkunci", async () => {
    siapkan({ kirim: { status: "TERKIRIM" }, tabel: SEMUA_WAJIB, tte: TTE_SAH });
    const html = await render();
    expect(html).toContain("Sudah dikirim &amp; terkunci"); // chip di kepala halaman
    expect(html).toContain("Periode Ini Terkunci"); // Tahap 4
    expect(html).not.toContain('name="pernyataan"');
    // Tahap 3 hanya-baca: chip sah, tinggal Lihat PDF, tanpa TTE Ulang/BSrE
    expect(html).toContain("Sudah TTE &amp; Diperiksa");
    expect(html).not.toContain("TTE Ulang");
    expect(html).not.toContain("Tanda Tangani SPTJM");
    // Tahap 1: tanpa kotak anomali
    expect(html).not.toContain("Anomali Data");
  });

  it("TERKIRIM dengan pegawai dikecualikan: kotak ketiga & stepper menyebut Dikecualikan, tanpa Batalkan", async () => {
    siapkan({
      kirim: { status: "TERKIRIM" },
      tabel: SEMUA_WAJIB,
      tte: TTE_SAH,
      pegawai: [...LENGKAP(), pegawaiRow(4, "Pegawai Keluar Uji")],
      dikecualikan: [{ pegawaiId: "p4", nama: "Pegawai Keluar Uji" }],
    });
    const html = await render();
    expect(html).toMatch(/>\s*Dikecualikan\s*</);
    expect(html).toContain("Siap • 1 Dikecualikan");
    expect(html).not.toContain(">Batalkan</button>");
  });

  it("yang dikecualikan tidak lagi didaftar di halaman; dibuka lewat laci (dengan Batalkan)", async () => {
    siapkan({
      pegawai: [...LENGKAP(), pegawaiRow(4, "Pegawai Keluar Uji")],
      dikecualikan: [{ pegawaiId: "p4", nama: "Pegawai Keluar Uji" }],
    });
    const html = await render();
    expect(html).not.toContain("pegawai dikecualikan dari periode ini");
    expect(html).toContain("Lihat yang dikecualikan (1)");
    // di laci: kartu dicoret, chip alasan, tombol Batalkan Pengecualian
    const laci = await render({ tinjau: "1" });
    expect(laci).toContain("Dikecualikan (Mutasi keluar)");
    expect(laci).toContain("line-through");
    expect(laci).toContain("Batalkan Pengecualian");
  });

  it("peringatan angka basi muncul bila presensi berubah setelah dihitung", async () => {
    siapkan({ pegawai: [pegawaiRow(1, "Pegawai Uji Satu", { basi: true }), pegawaiRow(2, "Pegawai Uji Dua")] });
    const html = await render();
    expect(html).toContain("1 pegawai perlu dihitung ulang");
  });

  it("tidak ada rupiah lembur di mana pun (lembur ditunda)", async () => {
    siapkan({ tabel: SEMUA_WAJIB, tte: TTE_SAH });
    for (const params of [{}, { tab: "lembur" }, { tab: "makan" }, { rincian: "1" }]) {
      const html = await render(params);
      expect(html).not.toContain("777.777");
      expect(html).not.toContain("777,777");
    }
  });

  it("Unduh Excel mengikuti izin export", async () => {
    expect(await render()).toContain("Unduh Excel");
    izin.export = false;
    const html = await render();
    expect(html).not.toContain("Unduh Excel");
    expect(html).not.toContain("/kasubag/kalkulasi/export");
  });

  it("modus rincian: tabel Tukin lengkap di tab Tukin, form koreksi jam lembur di tab Lembur", async () => {
    const tukin = await render({ rincian: "1" });
    expect(tukin).toContain("Tampilkan ringkas");
    expect(tukin).toContain("rincian lengkap");
    const lembur = await render({ rincian: "1", tab: "lembur" });
    expect(lembur).toContain("Koreksi jam lembur");
  });
});

// ============================================================================
// SUSUNAN BARU: stepper empat langkah, empat kartu tahap, tab & pencarian.
// ============================================================================

describe("Kalkulasi Unit - stepper & Tahap 1", () => {
  it("stepper: empat kartu bertaut ke #tahap-n dengan sub-judul dan status sr-only", async () => {
    const html = await render();
    for (const n of [1, 2, 3, 4]) expect(html).toContain(`href="#tahap-${n}"`);
    for (const judul of [
      "Pemeriksaan Data",
      "Kalkulasi Pembayaran",
      "TTE SPTJM",
      "Pengiriman ke PPABP",
    ]) {
      expect(html).toContain(judul);
    }
    expect(html).toContain("2 Siap • 0 Perlu Ditinjau");
    expect(html).toContain("Tukin, Makan &amp; Lembur");
    expect(html).toContain("0/2 SPTJM");
    expect(html).toContain("Menunggu Finalisasi");
    expect(html).toContain("Status: Belum selesai");
  });

  it("stepper mengikuti keadaan: dikembalikan / terkirim", async () => {
    siapkan({
      kirim: { status: "DIKEMBALIKAN", alasanKembali: "Periksa ulang", dikembalikanPada: new Date("2026-09-03T03:00:00Z") },
    });
    const dikembalikan = await render();
    expect(dikembalikan).toContain("Dikembalikan PPABP");
    expect(dikembalikan).toContain(">Dikembalikan</span>");
    siapkan({ kirim: { status: "TERKIRIM" }, tabel: SEMUA_WAJIB, tte: TTE_SAH });
    const terkirim = await render();
    expect(terkirim).toContain("Terkirim &amp; terkunci");
    expect(terkirim).toContain("Periode Ini Terkunci");
    expect(terkirim).toContain("2/2 SPTJM");
  });

  it("kartu kesiapan: total, siap, perlu tinjau, persen", async () => {
    siapkan({ pegawai: [pegawaiRow(1, "Pegawai Uji Satu"), pegawaiRow(2, "Pegawai Uji Dua", { predikat: false })] });
    const html = await render();
    expect(html).toContain("Ringkasan Kesiapan Data Pegawai &amp; Komponen");
    expect(html).toContain("50% Siap");
    expect(html).toContain("1 Siap • 1 Perlu Ditinjau");
    expect(html).toContain('role="progressbar"');
  });

  it("kelengkapan sumber: label sumber dari ambilSumberData, bukan dikarang", async () => {
    const html = await render();
    expect(html).toContain("Presensi");
    expect(html).toContain("(30%)");
    expect(html).toContain("(70%)");
    expect(html).toContain("e-Presensi");
    expect(html).not.toContain("Tersinkron");
    expect(html).toMatch(/belum punya predikat|>Lengkap</);
  });

  it("anomali: kandidat = tanpa predikat UNION kehadiran 0 hari; tombol membuka panel pengecualian", async () => {
    siapkan({
      pegawai: [
        pegawaiRow(1, "Pegawai Uji Satu"),
        pegawaiRow(2, "Pegawai Uji Dua", { predikat: false }),
        pegawaiRow(3, "Pegawai Uji Tiga", { hadir: 0 }),
      ],
    });
    const html = await render();
    expect(html).toContain(
      "Terdapat 2 pegawai tanpa predikat / kehadiran 0 hari yang perlu ditinjau: tagih predikatnya, atau kecualikan bila memang sudah keluar.",
    );
    expect(html).toContain("Tinjau &amp; Kecualikan (2)");
    expect(html).toMatch(/href="[^"]*tinjau=1#kecualikan"/);
    // tanpa ?tinjau=1 laci tertutup; dengan ?tinjau=1 terbuka berisi kartu kandidat
    expect(html).not.toContain('id="kecualikan"');
    const laci = await render({ tinjau: "1" });
    expect(laci).toMatch(/id="kecualikan" role="dialog"/);
    expect(laci).toContain("Kecualikan Pegawai dari Perhitungan Unit");
    expect(laci).toContain("Belum Dikecualikan");
    expect(laci).toContain("Predikat kinerja belum ada");
    expect(laci).toContain("Sebulan penuh tanpa kehadiran tercatat");
    expect(laci).toContain(">Kecualikan Pegawai</button>");
  });

  it("tanpa anomali: kotak hijau 'Tidak ada anomali', tanpa tombol tinjau", async () => {
    const html = await render();
    expect(html).toContain("Tidak ada anomali");
    expect(html).not.toContain("Tinjau &amp; Kecualikan");
    expect(html).not.toContain('id="kecualikan"');
  });

  it("rincian kesiapan & daftar perubahan data pegawai tidak tampil lagi", async () => {
    const html = await render();
    expect(html).not.toContain("rincian kesiapan data");
    expect(html).not.toContain("Daftar Perubahan Data Pegawai");
  });
});

describe("Kalkulasi Unit - Tahap 2 (tab, cari, tabel)", () => {
  it("tiga tab dengan jumlah; lembur berlabel 'Jam Lembur' selama nominal ditahan", async () => {
    const html = await render();
    const nav = html.slice(html.indexOf('aria-label="Komponen kalkulasi"'));
    const tab = nav.slice(0, nav.indexOf("</nav>"));
    expect(tab).toContain("Tunjangan Kinerja (Tukin)");
    expect(tab).toContain("Uang Makan");
    expect(tab).toContain("Jam Lembur");
    expect(tab).not.toContain("Uang Lembur");
    expect(tab).toContain('aria-current="page"');
    expect(tab).toContain("tab=makan");
    expect(tab).toContain("tab=lembur");
  });

  it("tab Tukin: kolom, total bersih seluruh pegawai, dan tautan rincian lengkap", async () => {
    const html = await render();
    for (const k of ["No.", "Nama Pegawai / NIP", "Predikat", "Tunjangan Penuh", "Potongan (%)", "Nominal Potongan", "Tunjangan Bersih"]) {
      expect(html).toContain(k);
    }
    expect(html).toContain("Rincian Tukin (2 pegawai)");
    expect(html).toMatch(/Total Bersih:[^R]*Rp\s6\.000\.000/);
    expect(html).toContain("Lihat rincian lengkap");
    expect(html).toMatch(/href="[^"]*rincian=1[^"]*"/);
    expect(html).toContain("Baik");
  });

  it("tabel ringkas patuh aturan tabel global: tanpa text-left/right/align-*, kolom nama pakai col-nama", async () => {
    const html = await render();
    const awal = html.indexOf("Nama Pegawai / NIP");
    const tabel = html.slice(html.lastIndexOf("<table", awal), html.indexOf("</table>", awal));
    expect(tabel).toContain("col-nama");
    expect(tabel).not.toMatch(/class="[^"]*\b(text-left|text-right|align-top|align-bottom)\b/);
    expect((tabel.match(/<th/g) ?? []).length).toBeLessThanOrEqual(8);
  });

  it("potongan: persen & nominal dari (penuh - bersih), dan angka basi ditandai", async () => {
    siapkan({ pegawai: [pegawaiRow(1, "Pegawai Uji Satu", { basi: true }), pegawaiRow(2, "Pegawai Uji Dua")] });
    const html = await render();
    expect(html).toMatch(/font-semibold text-gold-deep">\d+(,\d+)?%</);
    expect(html).toMatch(/font-bold text-red">Rp\s/);
    expect(html).toContain("angka basi - presensi berubah");
    expect(html).not.toContain("berubah berubah");
  });

  it("pegawai dikecualikan tetap di tabel dengan chip, tapi tidak masuk total", async () => {
    siapkan({
      pegawai: [...LENGKAP(), pegawaiRow(4, "Pegawai Keluar Uji")],
      dikecualikan: [{ pegawaiId: "p4", nama: "Pegawai Keluar Uji" }],
    });
    const html = await render();
    expect(html).toContain("Pegawai Keluar Uji");
    expect(html).toContain(">dikecualikan<");
    expect(html).toContain("Rincian Tukin (2 pegawai)");
    expect(html).toMatch(/Total Bersih:[^R]*Rp\s6\.000\.000/);
  });

  it("kotak cari: hanya menyaring baris, tidak mengubah total/kesiapan/syarat", async () => {
    const semua = await render();
    const html = await render({ q: "satu" });
    expect(html).toContain('placeholder="Cari nama atau NIP pegawai..."');
    expect(html).toContain("Pegawai Uji Satu");
    expect(html).not.toContain("Pegawai Uji Dua");
    expect(semua).toContain("Pegawai Uji Dua");
    // angka yang sama persis
    for (const angka of ["Rincian Tukin (2 pegawai)", "2 Siap • 0 Perlu Ditinjau", "0 / 2 Selesai", "2 Pegawai Valid"]) {
      expect(html).toContain(angka);
    }
    expect(html).toMatch(/Total Bersih:[^R]*Rp\s6\.000\.000/);
    expect(await render({ q: "tidak-ada-orang-ini" })).toContain("Tidak ada pegawai yang cocok dengan pencarian");
  });

  it("paginasi tersedia (Tampilkan 10/20/50/100)", async () => {
    const html = await render();
    for (const n of [10, 20, 50, 100]) expect(html).toContain(`>${n}</a>`);
  });

  it("tab Uang Makan: kolom dan total", async () => {
    const html = await render({ tab: "makan" });
    for (const k of ["Hari Kerja", "Hari Dibayar", "Tarif Harian", "Total"]) expect(html).toContain(k);
    expect(html).toContain("Rincian Uang Makan (2 pegawai)");
    expect(html).toMatch(/Total:[^R]*Rp\s1\.406\.000/);
  });

  it("tab Lembur: tabel pemeriksaan jam lembur; cari hanya menyaring baris", async () => {
    const html = await render({ tab: "lembur" });
    expect(html).toContain("Rincian Jam Lembur");
    expect(html).toContain("2 pegawai berlembur");
    const bagianLembur = html.slice(html.indexOf("Rincian Jam Lembur"), html.indexOf('id="tahap-3"'));
    expect(bagianLembur).not.toMatch(/Rp\s/);
  });

  it("tombol Hitung tetap di kepala Tahap 2, termasuk persetujuan lanjut tanpa predikat lengkap", async () => {
    siapkan({ pegawai: [pegawaiRow(1, "Pegawai Uji Satu"), pegawaiRow(2, "Pegawai Uji Dua", { predikat: false, tukin: false })] });
    const html = await render();
    const tahap2 = html.slice(html.indexOf('id="tahap-2"'));
    expect(tahap2.indexOf("Hitung sekarang")).toBeGreaterThan(-1);
    expect(tahap2).toContain('name="lanjutkanTanpaLengkap"');
    expect(tahap2).toContain("1 pegawai belum punya predikat kinerja.");
    expect(tahap2).toContain("Tinjau &amp; Kecualikan");
  });
});

describe("Kalkulasi Unit - Tahap 3 & 4", () => {
  it("tiga baris SPTJM dengan sub-judul; lembur dalam jam, tanpa Rp", async () => {
    const html = await render();
    expect(html).toMatch(/2 Pegawai • Rp\s6\.000\.000/); // Tukin
    expect(html).toMatch(/2 Pegawai • Rp\s1\.406\.000/); // Uang Makan
    expect(html).toContain("2 Pegawai • 6 Jam Lembur");
    expect(html).toContain("Tanda Tangani SPTJM");
    expect(html).toContain("Tanda Tangan Elektronik (TTE) SPTJM");
    // SPTJM Lembur belum menahan pengiriman
    expect(html).toContain("belum diwajibkan");
  });

  it("Hapus Draft hanya muncul bila ada draft", async () => {
    expect(await render()).not.toContain("Hapus Draft");
    siapkan({ tte: { SPTJM_TUKIN: { status: "DRAFT", signedAt: null } } });
    const html = await render();
    expect(html).toContain("Hapus Draft");
    expect(html.match(/Hapus Draft/g)).toHaveLength(1);
  });

  it("SPTJM yang ditandatangani sebelum pengembalian: banner & badge Perlu TTE Ulang", async () => {
    siapkan({
      kirim: {
        status: "DIKEMBALIKAN",
        alasanKembali: "Periksa ulang kelas jabatan pegawai",
        dikembalikanPada: new Date("2026-09-20T00:00:00Z"),
      },
      tte: TTE_SAH,
      tabel: SEMUA_WAJIB,
    });
    const html = await render();
    // keterangan TTE ulang sekarang di ikon (i) kepala Tahap 3
    expect(html).toContain("Angkanya dihitung ulang, atau rekap dikembalikan PPABP");
    expect(html).toContain("Perlu TTE Ulang");
    expect(html).toContain("SPTJM Tukin dan Uang Makan perlu ditandatangani ulang");
  });

  it("Tahap 4 belum lengkap: checklist, alasan server yang sama, pernyataan nonaktif, label dinamis", async () => {
    const html = await render();
    const t4 = html.slice(html.indexOf('id="tahap-4"'));
    expect(t4).toContain("Pengiriman &amp; Penguncian Periode");
    expect(t4).toContain(">Terbuka</span>");
    expect(t4).toContain("1. Dokumen SPTJM PPK (TTE)");
    expect(t4).toContain("0 / 2 Selesai");
    expect(t4).toContain("2. Validasi Nominal Nol");
    expect(t4).toContain("2 Pegawai Valid");
    expect(t4).not.toContain("Tabel wajib diperiksa");
    expect(t4).toContain("Catatan Pengiriman ke PPABP");
    expect(t4).toContain("(Opsional)");
    // Teks pernyataan utuh, dengan frasa akibatnya ditebalkan.
    expect(t4.replace(/<\/?strong[^>]*>/g, "")).toContain(
      "Saya menyatakan data telah diperiksa dengan benar dan memahami bahwa periode yang dikirim akan terkunci otomatis serta hanya dapat dibuka kembali melalui pengembalian oleh PPABP.",
    );
    expect(t4).toContain(">periode yang dikirim akan terkunci otomatis</strong>");
    expect(pernyataanNonaktif(t4)).toBe(true);
    expect(t4).toContain("Lengkapi TTE, Checklist &amp; Pernyataan");
    // kalimat "Belum siap dikirim" tidak tampil lagi; kotak syarat yang menjelaskan
    expect(t4).not.toContain("Belum siap dikirim");
  });

  it("belum ada TTE (data beres): kotak SPTJM menunjukkan 0 / 2 dan pernyataan nonaktif", async () => {
    siapkan({ tabel: SEMUA_WAJIB });
    const html = await render();
    expect(html.slice(html.indexOf('id="tahap-4"'))).toContain("0 / 2 Selesai");
    expect(pernyataanNonaktif(html)).toBe(true);
  });

  it("semua syarat lengkap: pernyataan aktif, tombol menunggu pernyataan, tanpa alasan tertahan", async () => {
    siapkan({ tabel: SEMUA_WAJIB, tte: TTE_SAH });
    const html = await render();
    const t4 = html.slice(html.indexOf('id="tahap-4"'));
    expect(t4).toContain("2 / 2 Selesai");
    expect(pernyataanNonaktif(t4)).toBe(false);
    expect(t4).not.toContain("Belum siap dikirim");
    expect(t4).toContain("Lengkapi TTE, Checklist &amp; Pernyataan"); // pernyataan belum dicentang
  });

  it("validasi nominal nol hanya info: daftar ditampilkan, pengiriman tidak tertahan", async () => {
    siapkan({
      pegawai: [pegawaiRow(1, "Pegawai Uji Satu"), pegawaiRow(2, "Pegawai Uji Nol", { bersih: 0 })],
      tabel: SEMUA_WAJIB,
      tte: TTE_SAH,
    });
    const html = await render();
    expect(html).toContain("1 Pegawai Valid");
    expect(html).toContain("1 pegawai bertukin bersih Rp 0");
    expect(html).toContain("Pegawai Uji Nol");
    expect(html).not.toContain("Belum siap dikirim");
    expect(pernyataanNonaktif(html)).toBe(false);
  });

  it("saat DIKEMBALIKAN, Tahap 4 tidak mengulang catatan PPABP (sudah di spanduk atas)", async () => {
    siapkan({
      kirim: {
        status: "DIKEMBALIKAN",
        alasanKembali: "Periksa ulang kelas jabatan pegawai",
        dikembalikanPada: new Date("2026-09-03T03:00:00Z"),
      },
    });
    const html = await render();
    const t4 = html.slice(html.indexOf('id="tahap-4"'));
    expect(t4).toContain(">Dikembalikan</span>");
    expect(t4).not.toContain("Catatan pengembalian dari PPABP");
    expect(t4).not.toContain("Periksa ulang kelas jabatan pegawai");
  });

  it("anchor lama #kirim tetap ada, dan Tahap 3 & 4 berdampingan di layar lebar", async () => {
    const html = await render();
    expect(html).toContain('id="kirim"');
    expect(html).toMatch(/lg:grid-cols-\[minmax\(0,5fr\)_minmax\(0,3fr\)\]/);
  });

  it("tidak menampilkan angka status yang dikarang: 'Tersinkron' tidak ada di halaman", async () => {
    expect(await render()).not.toContain("Tersinkron");
  });
});
