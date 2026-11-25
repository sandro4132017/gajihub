import { describe, expect, it, vi } from "vitest";
import { jabatanKepalaBiro, muatKepalaBiro, pilihKepalaBiro } from "../penandatanganSpkl";

const orang = (jabatan: string | null, nama = "PEJABAT UJI") => ({
  nip: "198001010000000003", // sensitive-ok
  nama,
  jabatan,
});

describe("jabatanKepalaBiro", () => {
  it("diawali 'Kepala Biro' tanpa memandang huruf besar/kecil", () => {
    expect(jabatanKepalaBiro("Kepala Biro Keuangan dan BMN")).toBe(true);
    expect(jabatanKepalaBiro("  kepala biro umum")).toBe(true);
    expect(jabatanKepalaBiro("KEPALA BIRO")).toBe(true);
  });
  it("Plt/Plh, bagian, dan kosong tidak lolos", () => {
    expect(jabatanKepalaBiro("Plt. Kepala Biro Umum")).toBe(false);
    expect(jabatanKepalaBiro("Kepala Bagian Umum")).toBe(false);
    expect(jabatanKepalaBiro("Kepala Birokrasi")).toBe(false);
    expect(jabatanKepalaBiro(null)).toBe(false);
  });
});

describe("pilihKepalaBiro", () => {
  it("tepat satu -> nama (huruf kapital semua dirapikan) dan NIP", () => {
    const hasil = pilihKepalaBiro([orang("Kepala Biro Uji"), orang("Staf Uji", "STAF UJI")]);
    expect(hasil).toEqual({ nama: "Pejabat Uji", nip: "198001010000000003" }); // sensitive-ok
  });
  it("nol -> null", () => {
    expect(pilihKepalaBiro([])).toBeNull();
    expect(pilihKepalaBiro([orang("Staf Uji")])).toBeNull();
  });
  it("lebih dari satu -> null (tidak menebak)", () => {
    expect(pilihKepalaBiro([orang("Kepala Biro Uji"), orang("kepala biro lain")])).toBeNull();
  });
});

describe("muatKepalaBiro", () => {
  it("satu query: aktif, satker persis, bukan data uji, jabatan diawali Kepala Biro", async () => {
    const findMany = vi.fn().mockResolvedValue([orang("Kepala Biro Uji")]);
    const hasil = await muatKepalaBiro({ pegawai: { findMany } } as never, "Biro Uji");
    expect(hasil?.nama).toBe("Pejabat Uji");
    const { where } = findMany.mock.calls[0][0];
    expect(where.statusPegawai).toBe("AKTIF");
    expect(where.satuanKerja).toBe("Biro Uji");
    expect(where.sourceSystem).toEqual({ not: "DUMMY_UJI" });
    expect(where.jabatan).toEqual({ startsWith: "Kepala Biro", mode: "insensitive" });
  });
});
