import { describe, expect, it } from "vitest";
import { NIP_PENGUJI, SATKER_DUMMY, SUMBER_DUMMY, isNipDummy } from "../dataUji";
import {
  DAFTAR_PEGAWAI_UJI,
  hariKerjaPeriode,
  periodeBawaanUji,
  susunGajiUji,
  susunPresensiUji,
} from "../../jobs/dataSeedUji";
import { TUKIN_POKOK_PER_KELAS_JABATAN } from "../../business-logic/tarifTukinPokok";

describe("isNipDummy", () => {
  it("NIP berawalan 9999 = data uji", () => {
    expect(isNipDummy(NIP_PENGUJI)).toBe(true);
    expect(isNipDummy("199001010000000001")).toBe(false); // sensitive-ok
    expect(isNipDummy(null)).toBe(false);
    expect(isNipDummy("")).toBe(false);
  });

  it("nama pegawai uji tidak diawali dummy (agar lolos penyaring SIAP lama)", () => {
    expect(SUMBER_DUMMY).toBe("DUMMY_UJI");
    expect(SATKER_DUMMY).toBe("UNIT UJI COBA PUSDATIK");
    for (const d of DAFTAR_PEGAWAI_UJI) {
      expect(/^dummy/i.test(d.nama.trim()), d.nama).toBe(false);
      expect(isNipDummy(d.nip)).toBe(true);
      expect(TUKIN_POKOK_PER_KELAS_JABATAN[d.kelasJabatan]).toBeGreaterThan(0);
      expect(d.golongan).toMatch(/^(IV|III|II|I)\/[a-e]$/);
    }
    expect(new Set(DAFTAR_PEGAWAI_UJI.map((d) => d.nip)).size).toBe(DAFTAR_PEGAWAI_UJI.length);
  });
});

describe("data seed uji", () => {
  it("periode bawaan = bulan sebelumnya, Januari mundur ke Desember", () => {
    expect(periodeBawaanUji(new Date(2026, 10, 5))).toEqual({ bulan: 10, tahun: 2026 });
    expect(periodeBawaanUji(new Date(2026, 0, 5))).toEqual({ bulan: 12, tahun: 2025 });
  });

  it("hari kerja Oktober 2026 = 22 hari Senin-Jumat", () => {
    expect(hariKerjaPeriode(10, 2026)).toHaveLength(22);
  });

  it("rekap diturunkan dari baris harian", () => {
    const t = susunPresensiUji("TERLAMBAT", 10, 2026);
    expect(t.rekap.totalMenitTerlambat).toBe(60);
    const c = susunPresensiUji("CUTI", 10, 2026);
    expect(c.rekap.jumlahHariCuti).toBe(5);
    expect(c.rekap.jumlahHariHadir).toBe(c.rekap.jumlahHariKerja - 5);
    expect(c.rekap.jenisCutiAktif).toBe("CUTI_TAHUNAN");
    const l = susunPresensiUji("LEMBUR", 10, 2026);
    expect(l.rekap.totalJamLembur).toBe(8);
    expect(l.rekap.jumlahHariLemburHariKerja).toBe(4);
    const n = susunPresensiUji("NORMAL", 10, 2026);
    expect(n.rekap.totalMenitTerlambat).toBe(0);
    expect(n.rekap.jumlahHariHadir).toBe(22);
  });

  it("gaji palsu bulat dan konsisten", () => {
    const g = susunGajiUji(4_000_000);
    expect(g.gajiBersih).toBe(g.totalPenghasilan - g.totalPotongan);
    expect(Number.isInteger(g.potonganIuranPegawai)).toBe(true);
  });
});

import { pegawaiBukanUji } from "../dataUji";
import { periksaTargetUji } from "../../jobs/dataSeedUji";

describe("pegawaiBukanUji", () => {
  it("menyaring pegawai uji, kecuali yang diminta memang unit uji", () => {
    expect(pegawaiBukanUji()).toEqual({ sourceSystem: { not: "DUMMY_UJI" } });
    expect(pegawaiBukanUji("UNIT A")).toEqual({ sourceSystem: { not: "DUMMY_UJI" } });
    expect(pegawaiBukanUji(SATKER_DUMMY)).toEqual({});
  });
});

describe("periksaTargetUji - pagar seed/hapus", () => {
  const sah = DAFTAR_PEGAWAI_UJI.map((d) => ({ nip: d.nip, sourceSystem: "DUMMY_UJI" }));

  it("hanya data uji bertanda DUMMY_UJI yang lolos", () => {
    expect(periksaTargetUji(sah).aman).toBe(true);
    expect(periksaTargetUji([]).aman).toBe(true);
  });

  it("NIP uji yang ternyata bukan DUMMY_UJI membatalkan semuanya", () => {
    const hasil = periksaTargetUji([...sah, { nip: DAFTAR_PEGAWAI_UJI[0].nip, sourceSystem: "SIAP" }]);
    expect(hasil.aman).toBe(false);
  });

  it("NIP di luar daftar uji, termasuk NIP sungguhan, membatalkan", () => {
    expect(periksaTargetUji([{ nip: "199001010000000001", sourceSystem: "SIAP" }]).aman).toBe(false); // sensitive-ok
    expect(periksaTargetUji([{ nip: "999900000000000099", sourceSystem: "DUMMY_UJI" }]).aman).toBe(false); // sensitive-ok
  });
});
