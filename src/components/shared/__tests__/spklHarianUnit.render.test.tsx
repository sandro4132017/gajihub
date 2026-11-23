import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SpklHarianUnit, type SpklHarianUnitProps } from "../SpklHarianUnit";

// Semua data di bawah palsu.
const SEBELUM_BATAS = new Date("2026-12-10T05:00:00Z"); // 12.00 WIB
const SESUDAH_SIAP = new Date("2026-12-10T08:30:00Z"); // 15.30 WIB

const daftar = [
  {
    tanggalIso: "2026-12-10",
    jumlahPerintah: 2,
    jumlahPegawai: 3,
    totalJam: 9,
    perPemberi: [
      { nama: "Kepala Satu", jumlahPegawai: 2, totalJam: 5 },
      { nama: "Kepala Dua", jumlahPegawai: 1, totalJam: 4 },
    ],
  },
  { tanggalIso: "2026-12-11", jumlahPerintah: 1, jumlahPegawai: 1, totalJam: 2, perPemberi: [{ nama: "Kepala Satu", jumlahPegawai: 1, totalJam: 2 }] },
];

function render(o: Partial<SpklHarianUnitProps> = {}) {
  return renderToStaticMarkup(
    <SpklHarianUnit
      basePath="/kasubag/spkl"
      satuanKerja="Biro Uji Coba"
      labelPeriode="Desember 2026"
      daftar={daftar}
      tanggalDipilih={null}
      rekap={null}
      sekarang={SEBELUM_BATAS}
      paramDasar={new URLSearchParams({ bulan: "12", tahun: "2026" })}
      {...o}
    />,
  );
}

describe("SpklHarianUnit", () => {
  it("tabel tanggal: status, pegawai, total jam, rincian per pemberi perintah", () => {
    const html = render();
    expect(html).toContain("Terbuka");
    expect(html).toContain("Kepala Satu");
    expect(html).toContain("2 pegawai, 5 jam");
    expect(html).toContain("Kepala Dua");
    expect(html).toContain("1 pegawai, 4 jam");
  });

  it("tombol buka SELALU ada: sementara sebelum siap, biasa sesudahnya; target tab baru", () => {
    const sebelum = render();
    expect(sebelum.match(/Buka \(sementara\)/g)).toHaveLength(2);
    expect(sebelum).toContain('target="_blank"');
    expect(sebelum).toContain("/berkas/spkl-harian?tanggal=2026-12-10");

    const sesudah = render({ sekarang: SESUDAH_SIAP });
    expect(sesudah).toContain("Terkunci");
    expect(sesudah).toContain(">Buka<");
    // 2026-12-11 belum lewat: tetap sementara.
    expect(sesudah.match(/Buka \(sementara\)/g)).toHaveLength(1);
  });

  it("banner sementara dan daftar kosong", () => {
    expect(render()).toContain("SEMENTARA");
    expect(render({ daftar: [] })).toContain("Belum ada perintah lembur terkirim");
  });

  it("lampiran di layar tanpa kolom Jam dan tanpa nama pemberi perintah", () => {
    const html = render({
      tanggalDipilih: "2026-12-10",
      rekap: {
        tanggalIso: "2026-12-10",
        baris: [
          { nip: "199001010000000021", nama: "Pegawai Uji", golongan: "III/c", jam: 3, uraian: ["Laporan", "Rapat"] }, // sensitive-ok
        ],
        ringkasan: { jumlahPerintah: 1, jumlahPegawai: 1, totalJam: 3 },
        perPemberi: [],
      },
    });
    expect(html).toContain("Lampiran");
    expect(html).toContain("Pegawai Uji");
    expect(html).toContain("-Laporan");
    expect(html).toContain("-Rapat");
    expect(html).not.toMatch(/<th[^>]*>Jam<\/th>/);
    expect(html).not.toContain("Kepala Tim");
  });
});
