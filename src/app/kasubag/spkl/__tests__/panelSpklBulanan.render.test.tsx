import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { PanelSpklBulanan, type SpklTertandatangani } from "../PanelSpklBulanan";

const SUDAH: SpklTertandatangani = {
  id: "dok-uji-1",
  nomorDokumen: "1/1771/KU.02/XII/2026",
  ditandatanganiPada: "31 Desember 2026, 15.04 WIB",
  penandatanganNama: "Kasubag Uji",
};

function render(o: Partial<React.ComponentProps<typeof PanelSpklBulanan>> = {}) {
  return renderToStaticMarkup(
    <PanelSpklBulanan
      periodeBulan={12}
      periodeTahun={2026}
      labelPeriode="Desember 2026"
      satuanKerja="Biro Uji Coba"
      namaPenandatangan="Kasubag Uji"
      boleh
      kosong={false}
      ringkasan="2 pegawai, 3 perintah, 9 jam"
      sudah={null}
      perintahSesudahTtd={0}
      {...o}
    />,
  );
}

describe("PanelSpklBulanan", () => {
  it("belum ditandatangani: pratinjau dan tandatangani aktif", () => {
    const h = render();
    expect(h).toContain("Pratinjau PDF");
    expect(h).toContain("Tandatangani SPKL");
    expect(h).not.toMatch(/<button[^>]*disabled[^>]*>.{0,200}Tandatangani SPKL/);
  });

  it("bulan tanpa perintah: tombol tanda tangan dan pratinjau nonaktif", () => {
    const h = render({ kosong: true });
    expect(h).toMatch(/disabled=""[^>]*>(?:(?!<\/button>).)*Tandatangani SPKL/s);
    expect(h).toMatch(/disabled=""[^>]*>(?:(?!<\/button>).)*Pratinjau PDF/s);
  });

  it("sudah ditandatangani: unduh + status, tanpa tombol tanda tangan ulang", () => {
    const h = render({ sudah: SUDAH });
    expect(h).toContain("/berkas/tte/dok-uji-1?unduh=1");
    expect(h).toContain("Sudah ditandatangani");
    expect(h).toContain("31 Desember 2026, 15.04 WIB");
    expect(h).not.toContain("Tandatangani SPKL");
    expect(h).not.toContain("Pratinjau PDF");
  });

  it("perintah terkirim sesudah tanda tangan: peringatan jelas", () => {
    const h = render({ sudah: SUDAH, perintahSesudahTtd: 2 });
    expect(h).toContain("terkirim sesudah SPKL ini ditandatangani");
    expect(h).toContain("tidak termuat di dalamnya");
  });

  it("tanpa perintah susulan: tidak ada peringatan", () => {
    expect(render({ sudah: SUDAH })).not.toContain("tidak termuat");
  });

  it("lihat-saja (PPABP/ADMIN): tanpa tombol tanda tangan maupun pratinjau", () => {
    const h = render({ boleh: false });
    expect(h).toContain("melihat rekap ini saja");
    expect(h).not.toContain("Tandatangani SPKL");
    expect(h).not.toContain("Pratinjau PDF");
  });

  it("lihat-saja tetap bisa mengunduh SPKL yang sudah ditandatangani", () => {
    const h = render({ boleh: false, sudah: SUDAH });
    expect(h).toContain("/berkas/tte/dok-uji-1");
  });

  it("modal tidak terbuka dan tidak membawa NIK demo", () => {
    expect(render()).not.toContain("0803202100007062"); // sensitive-ok
  });
});
