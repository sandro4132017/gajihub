import { describe, expect, it } from "vitest";
import {
  alasanTteBelumLengkap,
  pilihDokumenTerbaru,
  ringkasSyaratTte,
  sptjmWajib,
  statusSptjm,
  type DokumenSptjmRingkas,
} from "../sptjmUnit";
import { cekBolehKirim, TABEL_WAJIB_DIVERIFIKASI, statusUnit } from "../pengirimanUnit";
import { daftarLangkahTutupBulan } from "../langkahTutupBulan";

const T1 = new Date("2026-09-10T03:00:00Z");
const T2 = new Date("2026-09-20T03:00:00Z");
const sah = (signedAt: Date = T1): DokumenSptjmRingkas => ({ status: "TERTANDATANGANI", signedAt });
const draft: DokumenSptjmRingkas = { status: "DRAFT", signedAt: null };

describe("sptjmWajib", () => {
  it("Tukin & Uang Makan selalu wajib; Lembur hanya bila nominal lembur berlaku", () => {
    expect(sptjmWajib(false)).toEqual(["SPTJM_TUKIN", "SPTJM_UANG_MAKAN"]);
    expect(sptjmWajib(true)).toEqual(["SPTJM_TUKIN", "SPTJM_UANG_MAKAN", "SPTJM_LEMBUR"]);
  });
});

describe("statusSptjm", () => {
  it("tanpa dokumen atau masih draft = BELUM", () => {
    expect(statusSptjm(null, null)).toBe("BELUM");
    expect(statusSptjm(draft, null)).toBe("BELUM");
  });
  it("tertandatangani tanpa pengembalian = SAH", () => {
    expect(statusSptjm(sah(), null)).toBe("SAH");
  });
  it("ditandatangani SEBELUM pengembalian = PERLU_TTE_ULANG; sesudahnya = SAH", () => {
    expect(statusSptjm(sah(T1), T2)).toBe("PERLU_TTE_ULANG");
    expect(statusSptjm(sah(T2), T1)).toBe("SAH");
  });
});

describe("pilihDokumenTerbaru", () => {
  it("mengambil createdAt terbesar per jenis dan mengabaikan jenis asing", () => {
    const hasil = pilihDokumenTerbaru([
      { jenisDokumen: "SPTJM_TUKIN", createdAt: T1, status: "TERTANDATANGANI" },
      { jenisDokumen: "SPTJM_TUKIN", createdAt: T2, status: "DRAFT" },
      { jenisDokumen: "LAIN", createdAt: T2, status: "DRAFT" },
    ]);
    expect(hasil.SPTJM_TUKIN?.status).toBe("DRAFT");
    expect(hasil.SPTJM_UANG_MAKAN).toBeNull();
    expect(hasil.SPTJM_LEMBUR).toBeNull();
  });
});

describe("ringkasSyaratTte & alasan", () => {
  it("kosong: dua belum, kalimat menyebut keduanya", () => {
    const r = ringkasSyaratTte({ dokumen: {}, dikembalikanPada: null, lemburWajib: false });
    expect(r.jumlahSah).toBe(0);
    expect(r.lengkap).toBe(false);
    expect(alasanTteBelumLengkap(r)).toMatch(/SPTJM Tukin dan Uang Makan belum ditandatangani/);
  });

  it("lembur tidak ikut dihitung selama tidak wajib, walau belum ditandatangani", () => {
    const r = ringkasSyaratTte({
      dokumen: { SPTJM_TUKIN: sah(), SPTJM_UANG_MAKAN: sah() },
      dikembalikanPada: null,
      lemburWajib: false,
    });
    expect(r.lengkap).toBe(true);
    expect(r.wajib).toHaveLength(2);
    expect(alasanTteBelumLengkap(r)).toBeNull();
  });

  it("lembur wajib menambah satu syarat", () => {
    const r = ringkasSyaratTte({
      dokumen: { SPTJM_TUKIN: sah(), SPTJM_UANG_MAKAN: sah() },
      dikembalikanPada: null,
      lemburWajib: true,
    });
    expect(r.lengkap).toBe(false);
    expect(r.belum).toEqual(["SPTJM_LEMBUR"]);
  });

  it("tanda tangan basi disebut sebagai perlu ulang, bukan 'belum'", () => {
    const r = ringkasSyaratTte({
      dokumen: { SPTJM_TUKIN: sah(T1), SPTJM_UANG_MAKAN: sah(T2) },
      dikembalikanPada: new Date("2026-09-15T00:00:00Z"),
      lemburWajib: false,
    });
    expect(r.perluUlang).toEqual(["SPTJM_TUKIN"]);
    expect(r.jumlahSah).toBe(1);
    expect(alasanTteBelumLengkap(r)).toMatch(/SPTJM Tukin perlu ditandatangani ulang/);
  });
});

describe("cekBolehKirim - syarat TTE", () => {
  const status = statusUnit(null);
  const lengkap = {
    totalPegawai: 2,
    jumlahKalkulasi: 2,
    jumlahBasi: 0,
    tabelDiverifikasi: [...TABEL_WAJIB_DIVERIFIKASI],
  };

  it("tanpa field sptjm, TTE tidak ditagih (pemanggil lama tidak berubah)", () => {
    expect(cekBolehKirim(lengkap, status).boleh).toBe(true);
  });

  it("ditolak bila SPTJM belum ber-TTE, dan syarat data didahulukan", () => {
    const sptjm = { dokumen: {}, dikembalikanPada: null, lemburWajib: false };
    const r = cekBolehKirim({ ...lengkap, sptjm }, status);
    expect(r.boleh).toBe(false);
    expect(r.alasan).toMatch(/SPTJM Tukin dan Uang Makan belum ditandatangani/);
    expect(cekBolehKirim({ ...lengkap, jumlahKalkulasi: 1, sptjm }, status).alasan).toMatch(
      /belum punya hasil kalkulasi/,
    );
  });

  it("lolos bila semua yang wajib ber-TTE", () => {
    const sptjm = {
      dokumen: { SPTJM_TUKIN: sah(), SPTJM_UANG_MAKAN: sah() },
      dikembalikanPada: null,
      lemburWajib: false,
    };
    expect(cekBolehKirim({ ...lengkap, sptjm }, status)).toEqual({ boleh: true, alasan: null });
  });
});

describe("daftarLangkahTutupBulan - langkah KIRIM dashboard menagih TTE", () => {
  const dasar = {
    totalPegawai: 2,
    jumlahPresensi: 2,
    jumlahPredikat: 2,
    jumlahTukin: 2,
    jumlahBasi: 0,
    jumlahUangMakan: 2,
    tabelDiverifikasi: [...TABEL_WAJIB_DIVERIFIKASI],
    status: statusUnit(null),
  };
  const kirim = (k: Parameters<typeof daftarLangkahTutupBulan>[0]) =>
    daftarLangkahTutupBulan(k).find((l) => l.kode === "KIRIM")!;

  it("tanpa TTE: alasan sama dengan gerbang server; dengan TTE: tanpa alasan", () => {
    const tanpa = kirim({ ...dasar, sptjm: { dokumen: {}, dikembalikanPada: null, lemburWajib: false } });
    expect(tanpa.alasan).toMatch(/SPTJM Tukin dan Uang Makan belum ditandatangani/);
    const dengan = kirim({
      ...dasar,
      sptjm: {
        dokumen: { SPTJM_TUKIN: sah(), SPTJM_UANG_MAKAN: sah() },
        dikembalikanPada: null,
        lemburWajib: false,
      },
    });
    expect(dengan.alasan).toBeUndefined();
  });
});

describe("statusSptjm - fail-closed", () => {
  it("tertandatangani tanpa signedAt setelah pengembalian -> PERLU_TTE_ULANG", () => {
    expect(
      statusSptjm({ status: "TERTANDATANGANI", signedAt: null } as Parameters<typeof statusSptjm>[0], new Date("2026-11-01"))
    ).toBe("PERLU_TTE_ULANG");
  });
});

describe("statusSptjm - hitung ulang sesudah TTE", () => {
  const sah = { status: "TERTANDATANGANI", signedAt: new Date("2026-11-10T08:00:00Z") };
  it("dihitung ulang sesudah ditandatangani -> PERLU_TTE_ULANG", () => {
    expect(statusSptjm(sah, null, new Date("2026-11-10T09:00:00Z"))).toBe("PERLU_TTE_ULANG");
  });
  it("dihitung sebelum ditandatangani -> SAH", () => {
    expect(statusSptjm(sah, null, new Date("2026-11-10T07:00:00Z"))).toBe("SAH");
  });
  it("ringkasSyaratTte memakai waktu hitung per jenis", () => {
    const r = ringkasSyaratTte({
      dokumen: { SPTJM_TUKIN: sah, SPTJM_UANG_MAKAN: sah },
      dikembalikanPada: null,
      lemburWajib: false,
      dihitungTerakhir: { SPTJM_TUKIN: new Date("2026-11-10T09:00:00Z"), SPTJM_UANG_MAKAN: null },
    });
    expect(r.perluUlang).toEqual(["SPTJM_TUKIN"]);
    expect(r.lengkap).toBe(false);
    expect(alasanTteBelumLengkap(r)).toContain("dihitung ulang");
  });
});
