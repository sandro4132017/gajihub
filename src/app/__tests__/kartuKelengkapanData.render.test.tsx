import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { hitungKomposisiPegawai, type KomposisiPegawai } from "../../business-logic/komposisiPegawai";
import { KartuKelengkapanData, lebarBatangPersen, urutkanKekurangan } from "../KartuDataPegawai";

// Kartu "Data yang Menghalangi Pembayaran": bar horizontal, satu baris per
// kategori, diurutkan menurun, kategori nol disembunyikan, tanpa total.
// Komposisi dibangun dari daftar kosong lalu field angkanya ditimpa - tanpa
// data pegawai apa pun.

const komposisi = (timpa: Partial<KomposisiPegawai> = {}): KomposisiPegawai => ({
  ...hitungKomposisiPegawai([]),
  ...timpa,
});

function render(
  { k = {}, tanpaRekening = 0, readOnly = false }: { k?: Partial<KomposisiPegawai>; tanpaRekening?: number; readOnly?: boolean } = {}
) {
  return renderToStaticMarkup(
    <KartuKelengkapanData komposisi={komposisi(k)} tanpaRekening={tanpaRekening} readOnly={readOnly} tundaMs={0} />
  );
}

const LIMA_BERBEDA = {
  k: { tanpaIdentitasWebGaji: 119, tanpaKelasJabatan: 4, golonganTidakTerbaca: 1, ptkpTidakBisaDitentukan: 2 },
  tanpaRekening: 120,
};

describe("urutkanKekurangan", () => {
  it("membuang yang nol dan mengurutkan menurun", () => {
    const hasil = urutkanKekurangan([
      { kode: "a", jumlah: 0 },
      { kode: "b", jumlah: 3 },
      { kode: "c", jumlah: 9 },
    ]);
    expect(hasil.map((x) => x.kode)).toEqual(["c", "b"]);
  });

  it("seri tetap mengikuti urutan deklarasi", () => {
    const hasil = urutkanKekurangan([
      { kode: "identitas", jumlah: 10 },
      { kode: "rekening", jumlah: 10 },
      { kode: "kelas", jumlah: 20 },
    ]);
    expect(hasil.map((x) => x.kode)).toEqual(["kelas", "identitas", "rekening"]);
  });
});

describe("lebarBatangPersen", () => {
  it("butir terbanyak = 100, maks 0 = 0", () => {
    expect(lebarBatangPersen(120, 120)).toBe(100);
    expect(lebarBatangPersen(0, 0)).toBe(0);
    expect(lebarBatangPersen(5, 0)).toBe(0);
  });

  it("nilai kecil diberi lantai supaya tetap terlihat", () => {
    const lebar = lebarBatangPersen(1, 120);
    expect(lebar).toBeGreaterThan(0.83); // 1/120 tanpa lantai
    expect(lebar).toBe(2);
  });

  it("nilai sedang proporsional terhadap maks", () => {
    expect(lebarBatangPersen(60, 120)).toBe(50);
  });
});

describe("KartuKelengkapanData - render", () => {
  it("urut menurun menurut jumlah", () => {
    const html = render(LIMA_BERBEDA);
    const urutan = [
      "Tanpa rekening",
      "Tanpa identitas Web Gaji",
      "Tanpa kelas jabatan",
      "Status kawin tidak sah",
      "Golongan tidak terbaca",
    ].map((j) => html.indexOf(j));
    expect(urutan.every((i) => i >= 0)).toBe(true);
    expect([...urutan].sort((a, b) => a - b)).toEqual(urutan);
  });

  it("seri stabil: identitas di atas rekening", () => {
    const html = render({ k: { tanpaIdentitasWebGaji: 10 }, tanpaRekening: 10 });
    expect(html.indexOf("Tanpa identitas Web Gaji")).toBeLessThan(html.indexOf("Tanpa rekening"));
  });

  it("angka tercetak dan TIDAK ada total", () => {
    const html = render(LIMA_BERBEDA);
    for (const n of ["120", "119", "4", "2", "1"]) expect(html).toContain(`>${n}</p>`);
    // 120+119+4+1+2 = 246
    expect(html).not.toContain("246");
    expect(html).toContain("satu pegawai bisa masuk lebih dari satu butir");
  });

  it("batang terbesar selebar 100% dan batang kecil punya lantai", () => {
    const html = render(LIMA_BERBEDA);
    expect(html).toContain("width:100%");
    expect(html).toContain("width:2%");
  });

  it("nilai 0 tidak dirender", () => {
    const html = render({ tanpaRekening: 5 });
    expect(html).toContain("Tanpa rekening");
    expect(html).not.toContain("Tanpa identitas Web Gaji");
    expect(html).not.toContain("Tanpa kelas jabatan");
    expect(html.match(/<li/g)).toHaveLength(1);
  });

  it("semua nol: pesan lengkap muncul, tidak ada daftar", () => {
    const html = render();
    expect(html).toContain("Data pokok seluruh pegawai aktif di cakupan ini lengkap.");
    expect(html).not.toContain("<li");
    expect(html).not.toContain("<ul");
  });

  it("readOnly=false memuat tautan; readOnly=true tidak memuat <a", () => {
    const rw = render({ ...LIMA_BERBEDA, readOnly: false });
    expect(rw).toContain('href="/ppabp/basis-data-gaji"');
    expect(rw).toContain('href="/ppabp/rekening"');
    expect(rw).toContain('href="/pegawai"');
    const ro = render({ ...LIMA_BERBEDA, readOnly: true });
    expect(ro).not.toContain("<a");
    // Isi tetap tampil.
    expect(ro).toContain("Tanpa rekening");
  });

  it("batang aria-hidden dan daftar punya aria-label", () => {
    const html = render(LIMA_BERBEDA);
    expect(html.match(/aria-hidden="true"[^>]*class="[^"]*bg-line-2/g) ?? html.match(/<div aria-hidden="true"/g)).toBeTruthy();
    expect(html).toMatch(/<ul aria-label="[^"]+terbanyak"/);
  });
});
