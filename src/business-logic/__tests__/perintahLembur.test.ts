import { describe, expect, it } from "vitest";
import {
  BATAS_JAM_PER_PERINTAH,
  batasKirimPerintah,
  cariBentrok,
  validasiPerintah,
} from "../perintahLembur";

// 2026-11-20 15:00 WIB = 08:00 UTC
const utc = (iso: string) => new Date(iso);

describe("batasKirimPerintah", () => {
  it("14:59:59 WIB diterima", () => {
    expect(batasKirimPerintah("2026-11-20", utc("2026-11-20T07:59:59.000Z")).boleh).toBe(true);
  });
  it("tepat 15:00:00.000 WIB diterima (inklusif)", () => {
    expect(batasKirimPerintah("2026-11-20", utc("2026-11-20T08:00:00.000Z")).boleh).toBe(true);
  });
  it("15:00:00.001 WIB ditolak dengan alasan", () => {
    const r = batasKirimPerintah("2026-11-20", utc("2026-11-20T08:00:00.001Z"));
    expect(r.boleh).toBe(false);
    expect(r.alasan).toContain("15.00 WIB");
  });
  it("H-1 dan tanggal jauh ke depan diterima", () => {
    expect(batasKirimPerintah("2026-11-20", utc("2026-11-19T20:00:00.000Z")).boleh).toBe(true);
    expect(batasKirimPerintah("2027-01-05", utc("2026-11-20T00:00:00.000Z")).boleh).toBe(true);
  });
  it("tanggal lampau ditolak", () => {
    expect(batasKirimPerintah("2026-11-18", utc("2026-11-20T00:00:00.000Z")).boleh).toBe(false);
  });
  it("tanggal tidak sah ditolak", () => {
    expect(batasKirimPerintah("2026-02-30", new Date()).boleh).toBe(false);
    expect(batasKirimPerintah("bukan", new Date()).boleh).toBe(false);
  });
  it("hasil sama di berbagai TZ proses", () => {
    const awal = process.env.TZ;
    const hasil: boolean[] = [];
    for (const tz of ["UTC", "Asia/Jakarta", "America/Los_Angeles"]) {
      process.env.TZ = tz;
      hasil.push(batasKirimPerintah("2026-11-20", utc("2026-11-20T08:00:00.000Z")).boleh);
      hasil.push(batasKirimPerintah("2026-11-20", utc("2026-11-20T08:00:01.000Z")).boleh);
    }
    if (awal === undefined) delete process.env.TZ;
    else process.env.TZ = awal;
    expect(hasil).toEqual([true, false, true, false, true, false]);
  });
});

describe("validasiPerintah", () => {
  const ok = { anggota: [{ pegawaiId: "a", jam: 2 }], uraianTugas: "Menyusun laporan" };
  it("sah tanpa galat", () => {
    expect(validasiPerintah(ok)).toEqual([]);
  });
  it("tanpa anggota", () => {
    expect(validasiPerintah({ ...ok, anggota: [] })).toHaveLength(1);
  });
  it("jam 0, 1.5, di atas batas ditolak; 1 dan batas diterima", () => {
    for (const jam of [0, 1.5, BATAS_JAM_PER_PERINTAH + 1, -1, NaN]) {
      expect(validasiPerintah({ ...ok, anggota: [{ pegawaiId: "a", jam }] })).toHaveLength(1);
    }
    for (const jam of [1, BATAS_JAM_PER_PERINTAH]) {
      expect(validasiPerintah({ ...ok, anggota: [{ pegawaiId: "a", jam }] })).toEqual([]);
    }
  });
  it("duplikat ditolak", () => {
    const r = validasiPerintah({
      ...ok,
      anggota: [
        { pegawaiId: "a", jam: 1 },
        { pegawaiId: "a", jam: 2 },
      ],
    });
    expect(r).toHaveLength(1);
  });
  it("uraian kosong atau spasi ditolak", () => {
    expect(validasiPerintah({ ...ok, uraianTugas: "   " })).toHaveLength(1);
  });
  it("galat dikumpulkan semua", () => {
    expect(validasiPerintah({ anggota: [], uraianTugas: "" })).toHaveLength(2);
  });
});

describe("cariBentrok", () => {
  it("mengembalikan pegawai yang sudah terkirim", () => {
    expect(cariBentrok(["a", "b", "c"], [{ pegawaiId: "b" }, { pegawaiId: "x" }])).toEqual(["b"]);
  });
  it("tanpa bentrok menghasilkan kosong", () => {
    expect(cariBentrok(["a"], [])).toEqual([]);
  });
});
