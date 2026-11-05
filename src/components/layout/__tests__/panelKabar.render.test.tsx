import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// ============================================================================
// Render panel Kabar dengan data tetap. Efek/fetch tidak jalan di render
// statis, jadi yang diuji: DaftarKabar (isi panel) dan keadaan awal tombol.
// Semua data di bawah palsu.
// ============================================================================

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/kasubag",
}));

import { DaftarKabar, PanelKabar } from "../PanelKabar";
import type { IsiTerkirim } from "../PanelKabar";

function isi(sebagian: Partial<IsiTerkirim> = {}): IsiTerkirim {
  return {
    boleh: true,
    satkerScope: null,
    satkerPilih: null,
    daftarSatker: [],
    notifikasi: [],
    aktivitas: [],
    kursorBerikut: null,
    ...sebagian,
  };
}

const aktivitas = (id: string, o: Partial<IsiTerkirim["aktivitas"][number]> = {}): IsiTerkirim["aktivitas"][number] => ({
  id,
  teks: "Mengirim rekap September 2026 ke PPABP",
  jenis: "kirim",
  jumlah: 1,
  waktu: "2026-11-05T07:05:00.000Z", // 14.05 WIB
  aktor: "Aktor Palsu",
  satuanKerja: "Biro Contoh",
  href: null,
  ...o,
});

const render = (i: IsiTerkirim, memuatLagi = false) =>
  renderToStaticMarkup(<DaftarKabar isi={i} memuatLagi={memuatLagi} onMuatLagi={() => {}} onNavigasi={() => {}} />);

describe("tombol PanelKabar", () => {
  it("tidak dirender sama sekali bila tidak ditampilkan (PEGAWAI)", () => {
    expect(renderToStaticMarkup(<PanelKabar tampilkan={false} />)).toBe("");
  });

  it("dirender tertutup tanpa lencana sebelum jumlahnya diketahui", () => {
    const html = renderToStaticMarkup(<PanelKabar tampilkan />);
    expect(html).toContain('aria-label="Notifikasi &amp; aktivitas"');
    expect(html).toContain("translate-x-full");
    expect(html).not.toContain("9+");
  });

  it("panel tertutup inert, tak terlihat, berlabel, dan tombol tutup cukup besar", () => {
    const html = renderToStaticMarkup(<PanelKabar tampilkan />);
    expect(html).toMatch(/<aside[^>]*aria-label="Kabar"/);
    expect(html).toMatch(/<aside[^>]*inert=""/);
    expect(html).toContain("invisible");
    expect(html).toContain("size-11");
  });
});

describe("DaftarKabar", () => {
  it("keadaan kosong menyebut penyebabnya", () => {
    const html = render(isi());
    expect(html).toContain("Tidak ada yang perlu ditangani.");
    expect(html).toContain("Belum ada aktivitas tercatat.");
    expect(html).not.toContain("Muat lebih banyak");
    expect(render(isi({ satkerPilih: "Biro Contoh" }))).toContain("Belum ada aktivitas tercatat untuk Biro Contoh.");
  });

  it("aktivitas dikelompokkan per hari, jam WIB, dan angka berfont mono", () => {
    const html = render(isi({ aktivitas: [aktivitas("a1")] }));
    expect(html).toContain("14.05");
    expect(html).toContain("Aktor Palsu");
    expect(html).toContain("Biro Contoh");
    expect(html).toContain('<span class="font-mono">2026</span>');
    expect(html).toContain("text-[13px]");
    expect(html).not.toMatch(/text-\[(11|12\.5)px\]/);
  });

  it("unit tidak diulang tiap baris bila daftar sudah ber-scope atau disaring", () => {
    expect(render(isi({ satkerScope: "Biro Contoh", aktivitas: [aktivitas("a1")] }))).not.toContain("14.05 · Biro Contoh");
    expect(render(isi({ satkerPilih: "Biro Contoh", aktivitas: [aktivitas("a1")] }))).not.toContain("14.05 · Biro Contoh");
    expect(render(isi({ aktivitas: [aktivitas("a1")] }))).toContain("14.05 · Biro Contoh");
  });

  it("baris dengan href menjadi tautan, tanpa href menjadi div", () => {
    const html = render(
      isi({ aktivitas: [aktivitas("a1", { href: "/kasubag/kalkulasi?bulan=9&tahun=2026" }), aktivitas("a2")] })
    );
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('href="/kasubag/kalkulasi?bulan=9&amp;tahun=2026"');
    expect(html).toContain("min-h-11");
  });

  it("notifikasi ber-href menjadi tautan, href null menjadi div", () => {
    const html = render(
      isi({
        notifikasi: [
          { id: "n1", teks: "2 unit menunggu diproses - September 2026", keterangan: "Rekap sudah dikirim.", href: "/ppabp/adk?bulan=9&tahun=2026", nada: "wait" },
          { id: "n2", teks: "Tanpa tujuan", keterangan: "Info saja.", href: null, nada: "danger" },
        ],
      })
    );
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain("Tanpa tujuan");
    expect(html).toContain("bg-red-tint");
  });

  it("tombol muat lebih banyak hanya bila ada kursor, dan menonaktifkan diri saat memuat", () => {
    const dengan = isi({ aktivitas: [aktivitas("a1")], kursorBerikut: "2026-11-05T00:00:00.000Z_abc" });
    expect(render(dengan)).toContain("Muat lebih banyak");
    const memuat = render(dengan, true);
    expect(memuat).toContain("Memuat...");
    expect(memuat).toContain("disabled");
    expect(render(isi({ aktivitas: [aktivitas("a1")] }))).not.toContain("Muat lebih banyak");
  });

  it("kegagalan memuat halaman berikutnya diberi umpan balik dan tombol coba lagi", () => {
    const dengan = isi({ aktivitas: [aktivitas("a1")], kursorBerikut: "2026-11-05T00:00:00.000Z_abc" });
    const html = renderToStaticMarkup(
      <DaftarKabar isi={dengan} memuatLagi={false} galatLagi onMuatLagi={() => {}} onNavigasi={() => {}} />
    );
    expect(html).toContain("tidak dapat dimuat");
    expect(html).toContain("Coba lagi");
  });

  it("tidak membocorkan NIP atau kursor mentah ke markup selain tombol", () => {
    const html = render(isi({ aktivitas: [aktivitas("a1")] }));
    expect(html).not.toMatch(/\d{9,}/);
  });
});
