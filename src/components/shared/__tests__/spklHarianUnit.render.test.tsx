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
      jumlahPegawaiUnik={2}
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
    expect(html).toContain("Sementara");
    expect(html).toContain("15.00 WIB");
    expect(html).toContain("Pemberi Perintah");
    expect(html).toContain("Kepala Satu");
    expect(html).toContain("Kepala Dua");
    // Kolom Pemberi Perintah hanya nama (keputusan user 2026-11-23), tanpa rincian pegawai/jam.
    expect(html).not.toContain("2 pegawai, 5 jam");
    expect(html).not.toContain("1 pegawai, 4 jam");
  });

  it("tombol Lihat SPKL SELALU ada, sebelum maupun sesudah siap; target tab baru", () => {
    const sebelum = render();
    expect(sebelum.match(/Lihat SPKL/g)).toHaveLength(2);
    expect(sebelum.match(/Lihat Lampiran/g)).toHaveLength(2);
    expect(sebelum).toContain('target="_blank"');
    expect(sebelum).toContain("/berkas/spkl-harian?tanggal=2026-12-10");

    const sesudah = render({ sekarang: SESUDAH_SIAP });
    expect(sesudah).toContain("Selesai");
    expect(sesudah.match(/Lihat SPKL/g)).toHaveLength(2);
    // 2026-12-11 belum lewat: tetap sementara, 2026-12-10 selesai.
    expect(sesudah.match(/>Sementara</g)).toHaveLength(1);
    expect(sesudah.match(/Selesai/g)).toHaveLength(1);
  });

  it("kartu metrik dan daftar kosong", () => {
    const html = render();
    expect(html).toContain("Belum Final");
    expect(html).toContain("Jumlah Pegawai");
    expect(html).toContain("Total Jam Perintah");
    expect(html).not.toContain("Total Jam Lembur");
    expect(html).toContain("Tanggal Perintah (2)");
    expect(html).toContain("Periode Desember 2026. Perintah lembur masih dapat diterbitkan hingga pukul 15.00 WIB.");
    expect(render({ daftar: [] })).toContain("Belum ada perintah lembur yang diterbitkan");
  });

  it("kartu Jumlah Pegawai memakai pegawai unik, bukan jumlah orang-hari", () => {
    // Orang-hari pada fixture = 4; unik dikirim pemanggil = 2.
    const html = render({ jumlahPegawaiUnik: 2 });
    expect(html).toMatch(/Jumlah Pegawai<\/span><p[^>]*>2<\/p>/);
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
    expect(html).toContain("Lampiran Perintah Lembur – ");
    expect(html).toContain("Golongan");
    expect(html).toContain("Pegawai Uji");
    expect(html).toContain("-Laporan");
    expect(html).toContain("-Rapat");
    expect(html).not.toMatch(/<th[^>]*>Jam<\/th>/);
    expect(html).not.toContain("Kepala Tim");
  });
});
