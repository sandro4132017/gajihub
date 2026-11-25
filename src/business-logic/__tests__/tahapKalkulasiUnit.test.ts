import { describe, expect, it } from "vitest";
import {
  bacaTab,
  hitungTabelWajibSudah,
  kalimatAnomali,
  kandidatAnomali,
  labelSumberData,
  labelTombolKirim,
  persenTerisi,
  potonganTukin,
  ringkasKesiapanPegawai,
  saringPegawai,
  semuaSyaratLolos,
  subSptjmLembur,
  subSptjmUang,
  susunChecklist,
  susunStepper,
  totalTukinBersih,
  validasiNominalNol,
} from "../tahapKalkulasiUnit";
import { periksaKesiapanKalkulasi, type FaktaPegawai } from "../kesiapanKalkulasi";
import { ringkasSyaratTte } from "../sptjmUnit";
import { TABEL_WAJIB_DIVERIFIKASI } from "../pengirimanUnit";

const nip = (i: number) => String(i).padStart(18, "0");
const rekapOk = {
  jumlahHariKerja: 20,
  jumlahHariHadir: 19,
  jumlahHariCuti: 0,
  jumlahHariDinasLuar: 0,
  jumlahHariDiklat: 0,
  jumlahHariTugasBelajar: 0,
  jenisCutiAktif: null,
  bulanCutiKeberapa: null,
};
const fakta = (i: number, o: Partial<FaktaPegawai> = {}): FaktaPegawai => ({
  nip: nip(i),
  nama: `Pegawai Uji ${i}`,
  kelasJabatan: 8,
  rekap: rekapOk,
  adaPredikat: true,
  jumlahKoreksi: 0,
  ...o,
});

describe("ringkasKesiapanPegawai", () => {
  it("siap, perlu tinjau, dan persen dibulatkan", () => {
    const r = periksaKesiapanKalkulasi([fakta(1), fakta(2), fakta(3, { adaPredikat: false })]);
    expect(ringkasKesiapanPegawai(r)).toEqual({ total: 3, siap: 2, perluTinjau: 1, persenSiap: 67 });
  });
  it("unit kosong = 0%, bukan NaN", () => {
    expect(ringkasKesiapanPegawai(periksaKesiapanKalkulasi([])).persenSiap).toBe(0);
  });
});

describe("kandidatAnomali", () => {
  it("gabungan tanpa predikat (staf & JPT) dan kehadiran 0 hari; kelas jabatan kosong saja bukan kandidat", () => {
    const r = periksaKesiapanKalkulasi([
      fakta(1),
      fakta(2, { adaPredikat: false }),
      fakta(3, { rekap: { ...rekapOk, jumlahHariHadir: 0 } }),
      fakta(4, { adaPredikat: false, kelasJabatan: 16 }),
      fakta(5, { kelasJabatan: null }),
      // dua sebab sekaligus tetap dihitung SEKALI
      fakta(6, { adaPredikat: false, rekap: { ...rekapOk, jumlahHariHadir: 0 } }),
    ]);
    const k = kandidatAnomali(r.perPegawai);
    expect(k.map((p) => p.nip)).toEqual([nip(2), nip(3), nip(4), nip(6)]);
  });
  it("kalimat memuat jumlahnya", () => {
    expect(kalimatAnomali(3)).toBe(
      "Terdapat 3 pegawai tanpa predikat / kehadiran 0 hari yang perlu ditinjau: tagih predikatnya, atau kecualikan bila memang sudah keluar.",
    );
  });
});

describe("labelSumberData & persenTerisi", () => {
  it("label dari sumber, tidak dikarang", () => {
    expect(labelSumberData("e-Presensi")).toBe("e-Presensi");
    expect(labelSumberData("-")).toBe("Belum ada data");
    expect(labelSumberData(undefined)).toBe("Belum ada data");
  });
  it("persen aman untuk pembagi nol", () => {
    expect(persenTerisi(3, 4)).toBe(75);
    expect(persenTerisi(0, 0)).toBe(0);
  });
});

describe("tab & pencarian", () => {
  it("bacaTab menjepit nilai asing ke tukin", () => {
    expect(bacaTab("makan")).toBe("makan");
    expect(bacaTab("lembur")).toBe("lembur");
    expect(bacaTab("ngawur")).toBe("tukin");
    expect(bacaTab(undefined)).toBe("tukin");
  });
  it("saringPegawai: nama atau NIP, tanpa membedakan huruf; kosong = semua", () => {
    const baris = [
      { nama: "Budi Uji", nip: nip(101) },
      { nama: "Sari Uji", nip: nip(202) },
    ];
    expect(saringPegawai(baris, "budi")).toHaveLength(1);
    expect(saringPegawai(baris, "  SARI ")).toHaveLength(1);
    expect(saringPegawai(baris, "202")).toHaveLength(1);
    expect(saringPegawai(baris, "")).toHaveLength(2);
    expect(saringPegawai(baris, undefined)).toHaveLength(2);
    expect(saringPegawai(baris, "tidak ada")).toHaveLength(0);
  });
});

describe("total & potongan", () => {
  it("totalTukinBersih menjumlah, melewati null/NaN", () => {
    expect(totalTukinBersih([1_000_000, 2_500_000, null, undefined, Number.NaN])).toBe(3_500_000);
    expect(totalTukinBersih([])).toBe(0);
  });
  it("potonganTukin = (penuh - bersih) / penuh", () => {
    expect(potonganTukin(10_000_000, 9_000_000)).toEqual({ nominal: 1_000_000, persen: 10 });
    expect(potonganTukin(10_000_000, 10_000_000)).toEqual({ nominal: 0, persen: 0 });
  });
  it("tidak ditebak bila tarif/tukin tidak diketahui, dan tidak negatif", () => {
    expect(potonganTukin(null, 5)).toBeNull();
    expect(potonganTukin(10, null)).toBeNull();
    expect(potonganTukin(0, 0)).toBeNull();
    expect(potonganTukin(10_000_000, 12_000_000)?.nominal).toBe(0);
  });
  it("validasiNominalNol: valid, nol, dan yang belum dihitung tidak dihitung", () => {
    const h = validasiNominalNol([
      { nip: nip(1), nama: "A", tukinBersih: 100 },
      { nip: nip(2), nama: "B", tukinBersih: 0 },
      { nip: nip(3), nama: "C", tukinBersih: null },
    ]);
    expect(h.valid).toBe(1);
    expect(h.nol).toEqual([{ nip: nip(2), nama: "B" }]);
  });
});

describe("sub SPTJM", () => {
  it("uang memakai Rp, lembur memakai jam tanpa Rp", () => {
    expect(subSptjmUang(46, 1_234_000)).toMatch(/^46 Pegawai • Rp\s1\.234\.000$/);
    expect(subSptjmLembur(3, 12.9)).toBe("3 Pegawai • 12 Jam Lembur");
    expect(subSptjmLembur(0, 0)).not.toMatch(/Rp/);
  });
});

describe("checklist pengiriman", () => {
  const tte = (sah: boolean) =>
    ringkasSyaratTte({
      dokumen: sah
        ? {
            SPTJM_TUKIN: { status: "TERTANDATANGANI", signedAt: new Date("2026-09-01T00:00:00Z") },
            SPTJM_UANG_MAKAN: { status: "TERTANDATANGANI", signedAt: new Date("2026-09-01T00:00:00Z") },
          }
        : {},
      dikembalikanPada: null,
      lemburWajib: false,
    });
  const dasar = {
    nominalNol: { valid: 5, nol: [] },
    totalPegawai: 5,
    jumlahKalkulasi: 5,
    jumlahBasi: 0,
    tabelDiverifikasi: [...TABEL_WAJIB_DIVERIFIKASI],
  };

  it("semua lolos -> boleh; nilai butir mengikuti mockup", () => {
    const b = susunChecklist({ ...dasar, tte: tte(true) });
    expect(b[0].nilai).toBe("2 / 2 Selesai");
    expect(b[1].nilai).toBe("5 Pegawai Valid");
    expect(semuaSyaratLolos(b)).toBe(true);
  });

  it("nominal nol hanya informasi: tidak menahan", () => {
    const b = susunChecklist({ ...dasar, tte: tte(true), nominalNol: { valid: 3, nol: [{ nip: nip(1), nama: "A" }] } });
    expect(b.find((x) => x.kunci === "NOMINAL_NOL")).toMatchObject({ lolos: false, menahan: false });
    expect(semuaSyaratLolos(b)).toBe(true);
  });

  it("TTE belum, angka basi, atau kalkulasi kurang menahan; centang tabel tidak", () => {
    expect(semuaSyaratLolos(susunChecklist({ ...dasar, tte: tte(false) }))).toBe(false);
    expect(semuaSyaratLolos(susunChecklist({ ...dasar, tte: tte(true), jumlahBasi: 1 }))).toBe(false);
    expect(semuaSyaratLolos(susunChecklist({ ...dasar, tte: tte(true), jumlahKalkulasi: 4 }))).toBe(false);
    const tanpaCentang = susunChecklist({ ...dasar, tte: tte(true), tabelDiverifikasi: [] });
    expect(semuaSyaratLolos(tanpaCentang)).toBe(true);
    expect(tanpaCentang.map((b) => b.kunci)).toEqual(["TTE", "NOMINAL_NOL", "KALKULASI", "BASI"]);
  });

  it("hitungTabelWajibSudah: tanpa tabel wajib selalu 0", () => {
    expect(hitungTabelWajibSudah(["UANG_MAKAN"])).toBe(0);
    expect(hitungTabelWajibSudah(["TUKIN", "UANG_MAKAN"])).toBe(0);
  });

  it("label tombol dinamis", () => {
    expect(labelTombolKirim({ syaratLengkap: false, pernyataanDicentang: true })).toBe(
      "Lengkapi TTE, Checklist & Pernyataan",
    );
    expect(labelTombolKirim({ syaratLengkap: true, pernyataanDicentang: false })).toBe(
      "Lengkapi TTE, Checklist & Pernyataan",
    );
    expect(labelTombolKirim({ syaratLengkap: true, pernyataanDicentang: true })).toBe("Kirim & Kunci ke PPABP");
  });
});

describe("susunStepper", () => {
  const tteKosong = ringkasSyaratTte({ dokumen: {}, dikembalikanPada: null, lemburWajib: false });
  const dasar = {
    kesiapan: { total: 49, siap: 46, perluTinjau: 3, persenSiap: 94 },
    kalkulasiLengkap: false,
    tte: tteKosong,
    tabelWajibSudah: 0,
    tabelWajib: 3,
    keadaan: "BELUM_KIRIM" as const,
  };

  it("empat langkah dengan sub-judul sesuai mockup", () => {
    const l = susunStepper(dasar);
    expect(l.map((x) => x.judul)).toEqual([
      "Pemeriksaan Data",
      "Kalkulasi Pembayaran",
      "TTE SPTJM",
      "Pengiriman ke PPABP",
    ]);
    expect(l[0].sub).toBe("46 Siap • 3 Perlu Ditinjau");
    expect(l[0].status).toBe("PERLU_PERHATIAN");
    expect(l[1].sub).toBe("Tukin, Makan & Lembur");
    expect(l[2].sub).toBe("0/2 SPTJM • 0/3 Review");
    expect(susunStepper({ ...dasar, tabelWajib: 0 })[2].sub).toBe("0/2 SPTJM");
    expect(l[3].sub).toBe("Menunggu Finalisasi");
    expect(l.map((x) => x.href)).toEqual(["#tahap-1", "#tahap-2", "#tahap-3", "#tahap-4"]);
  });

  it("status langkah 4 mengikuti keadaan pengiriman", () => {
    expect(susunStepper({ ...dasar, keadaan: "DIKEMBALIKAN" })[3]).toMatchObject({
      sub: "Dikembalikan PPABP",
      status: "PERLU_PERHATIAN",
    });
    expect(susunStepper({ ...dasar, keadaan: "TERKIRIM" })[3]).toMatchObject({
      sub: "Terkirim & terkunci",
      status: "SELESAI",
    });
  });

  it("langkah 1 selesai bila tak ada yang perlu ditinjau; langkah 3 butuh TTE dan review", () => {
    const sah = ringkasSyaratTte({
      dokumen: {
        SPTJM_TUKIN: { status: "TERTANDATANGANI", signedAt: new Date("2026-09-01T00:00:00Z") },
        SPTJM_UANG_MAKAN: { status: "TERTANDATANGANI", signedAt: new Date("2026-09-01T00:00:00Z") },
      },
      dikembalikanPada: null,
      lemburWajib: false,
    });
    const l = susunStepper({
      ...dasar,
      kesiapan: { total: 49, siap: 49, perluTinjau: 0, persenSiap: 100 },
      kalkulasiLengkap: true,
      tte: sah,
      tabelWajibSudah: 2,
    });
    expect(l[0].status).toBe("SELESAI");
    expect(l[1].status).toBe("SELESAI");
    expect(l[2].status).toBe("BELUM"); // review baru 2/3
    expect(susunStepper({ ...dasar, tte: sah, tabelWajibSudah: 3 })[2].status).toBe("SELESAI");
  });
});
