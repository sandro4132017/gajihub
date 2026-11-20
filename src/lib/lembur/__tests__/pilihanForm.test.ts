import { describe, expect, it } from "vitest";
import { buatPilihanAnggota, keadaanTanggal, labelAnggota } from "../pilihanForm";

describe("buatPilihanAnggota", () => {
  it("hanya id, nama, jabatan, penanda: tanpa NIP", () => {
    const hasil = buatPilihanAnggota([{ id: "a", nama: "Budi Uji", jabatan: "Analis" }]);
    expect(Object.keys(hasil[0]).sort()).toEqual(["id", "jabatan", "nama", "penanda"]);
    expect(labelAnggota(hasil[0])).toBe("Budi Uji - Analis");
  });

  it("nama kembar dengan jabatan beda dibedakan jabatan, tanpa penanda", () => {
    const h = buatPilihanAnggota([
      { id: "a", nama: "Budi Uji", jabatan: "Analis" },
      { id: "b", nama: "Budi Uji", jabatan: "Pranata" },
    ]);
    expect(h.map(labelAnggota)).toEqual(["Budi Uji - Analis", "Budi Uji - Pranata"]);
  });

  it("nama+jabatan kembar diberi penanda urutan", () => {
    const h = buatPilihanAnggota([
      { id: "a", nama: "Budi Uji", jabatan: "Analis" },
      { id: "b", nama: "Budi Uji", jabatan: "Analis" },
      { id: "c", nama: "Sari Uji", jabatan: null },
    ]);
    expect(h.map(labelAnggota)).toEqual(["Budi Uji - Analis (1)", "Budi Uji - Analis (2)", "Sari Uji"]);
  });
});

describe("keadaanTanggal", () => {
  const dasar = {
    hariIni: "2026-11-19",
    berlakuMulai: "2026-11-01",
    sekarang: new Date("2026-11-19T01:00:00Z"),
    berlakuMulaiTeks: "1 November 2026",
  };

  it("tanggal kosong: pesan Pilih tanggal lembur, terkunci", () => {
    const k = keadaanTanggal({ ...dasar, tanggal: "" });
    expect(k).toEqual({ kosong: true, terkunci: true, alasan: "Pilih tanggal lembur." });
  });

  it("tanggal lewat tetap berpesan sudah lewat", () => {
    const k = keadaanTanggal({ ...dasar, tanggal: "2026-11-10" });
    expect(k.terkunci).toBe(true);
    expect(k.alasan).toContain("sudah lewat");
  });

  it("tanggal sah: tidak terkunci", () => {
    expect(keadaanTanggal({ ...dasar, tanggal: "2026-11-20" }).terkunci).toBe(false);
  });
});
