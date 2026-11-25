import { describe, expect, it } from "vitest";
import { susunPesanSpklHarian } from "../pesanPerintahLembur";
import { BATAS_NAMA_PER_PESAN } from "../pengingatAbsen";

const dasar = {
  tanggalTeks: "Kamis, 10 Desember 2026",
  satuanKerja: "Biro Uji",
  bertte: false,
  kelompok: [
    {
      kepalaTimNama: "KEPALA UJI",
      uraian: "Menyelesaikan rekonsiliasi akhir tahun",
      anggota: [
        { nama: "ANGGOTA SATU", jam: 3 },
        { nama: "ANGGOTA DUA", jam: 2 },
      ],
    },
    {
      kepalaTimNama: "KEPALA LAIN",
      uraian: "Menyiapkan laporan",
      anggota: [{ nama: "ANGGOTA TIGA", jam: 4 }],
    },
  ],
};

describe("susunPesanSpklHarian", () => {
  it("tanpa anggota sama sekali -> null", () => {
    expect(susunPesanSpklHarian({ ...dasar, kelompok: [] })).toBeNull();
    expect(
      susunPesanSpklHarian({ ...dasar, kelompok: [{ kepalaTimNama: "K", uraian: "x", anggota: [] }] }),
    ).toBeNull();
  });

  it("satu pesan memuat tanggal, satker, jumlah, dan tiap kelompok kepala tim", () => {
    const p = susunPesanSpklHarian(dasar)!;
    expect(p).toContain("*SPKL HARIAN");
    expect(p).toContain("Kamis, 10 Desember 2026");
    expect(p).toContain("Satuan kerja: Biro Uji");
    expect(p).toContain("Jumlah pegawai: 3");
    expect(p).toContain("*Pemberi perintah: KEPALA UJI*");
    expect(p).toContain("*Pemberi perintah: KEPALA LAIN*");
    expect(p).toContain("Tugas: Menyelesaikan rekonsiliasi akhir tahun");
    expect(p).toContain("• ANGGOTA SATU — *3 jam*");
    expect(p).toContain("• ANGGOTA TIGA — *4 jam*");
    expect(p.indexOf("KEPALA UJI")).toBeLessThan(p.indexOf("ANGGOTA TIGA"));
  });

  it("baris TTE hanya muncul bila bertte", () => {
    expect(susunPesanSpklHarian(dasar)!).not.toContain("ditandatangani secara elektronik");
    expect(susunPesanSpklHarian({ ...dasar, bertte: true })!).toContain("ditandatangani secara elektronik");
  });

  it("tidak pernah memuat deret 18 angka, termasuk dari uraian tugas", () => {
    const p = susunPesanSpklHarian({
      ...dasar,
      kelompok: [{ ...dasar.kelompok[0], uraian: "Bantu 199001010000000021 menyiapkan laporan" }], // sensitive-ok
    })!;
    expect(p).not.toMatch(/\d{18}/);
    expect(p).toContain("[nomor dihapus]");
  });

  it("uraian dijadikan satu baris dan dipotong", () => {
    const p = susunPesanSpklHarian({
      ...dasar,
      kelompok: [{ ...dasar.kelompok[0], uraian: `a\nb\n${"x".repeat(500)}` }],
    })!;
    const baris = p.split("\n").find((b) => b.startsWith("Tugas: "))!;
    expect(baris.startsWith("Tugas: a b x")).toBe(true);
    expect(baris.length).toBeLessThan(330);
    expect(baris.endsWith("...")).toBe(true);
  });

  it("batas nama berlaku atas TOTAL semua kelompok dan menyebut sisanya", () => {
    const grup = (n: number, awal: string) => ({
      kepalaTimNama: `K ${awal}`,
      uraian: "u",
      anggota: Array.from({ length: n }, (_, i) => ({ nama: `${awal} ${i}`, jam: 1 })),
    });
    const p = susunPesanSpklHarian({
      ...dasar,
      kelompok: [grup(BATAS_NAMA_PER_PESAN - 5, "A"), grup(20, "B")],
    })!;
    expect(p.split("\n").filter((b) => b.startsWith("• ")).length).toBe(BATAS_NAMA_PER_PESAN);
    expect(p).toContain("_...dan 15 pegawai lainnya_");
    expect(p).toContain("Jumlah pegawai: " + (BATAS_NAMA_PER_PESAN + 15));
  });

  it("kelompok yang tidak kebagian kuota tidak dicetak judulnya", () => {
    const penuh = {
      kepalaTimNama: "KEPALA PENUH",
      uraian: "u",
      anggota: Array.from({ length: BATAS_NAMA_PER_PESAN }, (_, i) => ({ nama: `P ${i}`, jam: 1 })),
    };
    const p = susunPesanSpklHarian({ ...dasar, kelompok: [penuh, dasar.kelompok[1]] })!;
    expect(p).not.toContain("KEPALA LAIN");
    expect(p).toContain("_...dan 1 pegawai lainnya_");
  });

  it("tepat di batas tidak menambah baris sisa", () => {
    const pas = [
      {
        kepalaTimNama: "K",
        uraian: "u",
        anggota: Array.from({ length: BATAS_NAMA_PER_PESAN }, (_, i) => ({ nama: `P ${i}`, jam: 1 })),
      },
    ];
    expect(susunPesanSpklHarian({ ...dasar, kelompok: pas })!).not.toContain("lainnya");
  });

  it("hanya memakai penanda WhatsApp (*tebal*, _miring_, butir), tanpa markdown lain", () => {
    expect(susunPesanSpklHarian(dasar)!).not.toMatch(/\*\*|#|`|\[.*\]\(.*\)/);
  });

  it("penanda format di data (uraian, nama) dibuang supaya tidak merusak pesan", () => {
    const p = susunPesanSpklHarian({
      ...dasar,
      kelompok: [
        {
          kepalaTimNama: "Kepala*Palsu",
          uraian: "Rekap *penting* _segera_ ~coret~ `kode`",
          anggota: [{ nama: "Nama_Palsu*", jam: 2 }],
        },
      ],
    })!;
    expect(p).toContain("Tugas: Rekap penting segera coret kode");
    expect(p).toContain("*Pemberi perintah: KepalaPalsu*");
    expect(p).toContain("• NamaPalsu — *2 jam*");
  });
});
