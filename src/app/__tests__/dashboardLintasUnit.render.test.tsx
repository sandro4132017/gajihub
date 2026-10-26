import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// SMOKE TEST RENDER DASHBOARD LINTAS UNIT.
//
// KENAPA ADA. Halaman ini 600+ baris, dipakai DUA role (PPABP & Pimpinan),
// dan merakit sendiri seluruh angkanya dari enam query. Sebelum berkas ini,
// nol di antaranya pernah dirender di test - satu-satunya cara tahu halamannya
// masih bisa dibuka adalah membukanya sendiri di browser, dan yang paling
// sering tidak dibuka justru keadaan kosong dan keadaan dengan query string
// ngawur.
//
// YANG DIJAGA: halamannya tidak melempar, angkanya muncul apa adanya, dan
// nominal uang lembur TIDAK bocor ke ringkasan selama saklarnya mati.
// ============================================================================

const { palsu } = vi.hoisted(() => ({
  palsu: {
    pegawai: { count: vi.fn(), findMany: vi.fn() },
    tukinCalculation: { findFirst: vi.fn(), findMany: vi.fn() },
    uangMakan: { findMany: vi.fn() },
    uangLembur: { findMany: vi.fn() },
    pengirimanUnit: { findMany: vi.fn() },
    reconciliationStatus: { count: vi.fn() },
  },
}));

vi.mock("../../lib/prisma", () => ({ prisma: palsu }));

// PencarianDebounce komponen klien yang memanggil useRouter; di luar Next
// tidak ada router yang terpasang. Yang diuji di sini halaman servernya,
// bukan perilaku debounce-nya - itu sudah punya testnya sendiri.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/ppabp",
}));

import { DashboardLintasUnit } from "../DashboardLintasUnit";

const authUser = { nip: "198100000000000000", role: "PPABP" as const, satuanKerja: null, aktif: true };

const pegawai = (satuanKerja: string) => ({
  golongan: "III/a",
  jenisKelamin: "L",
  kelasJabatan: 8,
  statusKawin: "K",
  identitasWebGaji: { jenisPegawai: "PNS" },
  satuanKerja,
});

function siapkan({ kosong = false }: { kosong?: boolean } = {}) {
  // Sama dengan banyaknya baris findMany di bawah - kartu "Total Pegawai"
  // dan kartu komposisi membaca dua query berbeda, dan fixture yang tidak
  // konsisten akan menguji keadaan yang tidak mungkin terjadi.
  palsu.pegawai.count.mockResolvedValue(kosong ? 0 : 2);
  palsu.pegawai.findMany.mockImplementation((arg: { distinct?: string[] }) =>
    Promise.resolve(
      arg?.distinct
        ? [{ satuanKerja: "Biro Keuangan dan BMN" }, { satuanKerja: "Pusdatik" }]
        : kosong
          ? []
          : [pegawai("Biro Keuangan dan BMN"), pegawai("Pusdatik")]
    )
  );
  palsu.tukinCalculation.findFirst.mockResolvedValue(
    kosong ? null : { periodeBulan: 8, periodeTahun: 2026 }
  );
  palsu.tukinCalculation.findMany.mockResolvedValue(
    kosong
      ? []
      : [
          {
            periodeBulan: 8,
            periodeTahun: 2026,
            tukinBersih: 10_000_000,
            pegawai: { satuanKerja: "Biro Keuangan dan BMN" },
          },
        ]
  );
  palsu.uangMakan.findMany.mockResolvedValue(
    kosong
      ? []
      : [
          {
            periodeBulan: 8,
            periodeTahun: 2026,
            totalUangMakan: 2_000_000,
            pegawai: { satuanKerja: "Biro Keuangan dan BMN" },
          },
        ]
  );
  palsu.uangLembur.findMany.mockResolvedValue(
    kosong
      ? []
      : [
          {
            periodeBulan: 8,
            periodeTahun: 2026,
            totalUangLembur: 777_777,
            pegawai: { satuanKerja: "Pusdatik" },
          },
        ]
  );
  palsu.pengirimanUnit.findMany.mockResolvedValue(
    kosong ? [] : [{ satuanKerja: "Pusdatik", status: "DIKEMBALIKAN", periodeBulan: 8, periodeTahun: 2026 }]
  );
  palsu.reconciliationStatus.count.mockResolvedValue(kosong ? 0 : 3);
}

async function render(searchParams: Record<string, string | undefined> = {}, readOnly = false) {
  const el = await DashboardLintasUnit({
    searchParams,
    authUser,
    readOnly,
    nama: "Alpha Sandro",
    basePath: readOnly ? "/pimpinan" : "/ppabp",
  });
  return renderToStaticMarkup(el as React.ReactElement);
}

beforeEach(() => {
  vi.clearAllMocks();
  siapkan();
});

describe("DashboardLintasUnit - render", () => {
  it("membuka halaman penuh tanpa melempar, dengan seluruh judul kartunya", async () => {
    const html = await render();
    for (const judul of [
      "Progres Pengiriman Unit",
      "Ringkasan Kalkulasi",
      "Monitoring Pengiriman &amp; Rekonsiliasi Satuan Kerja",
      "Data yang Menghalangi Pembayaran",
    ]) {
      expect(html).toContain(judul);
    }
  });

  it("baris operasional berisi DUA kartu - kartu Status Dokumen & Anggaran sudah dicabut", async () => {
    // Permintaan user 2026-10-22, berlaku di dashboard PPABP DAN Pimpinan
    // karena keduanya memakai komponen ini. Kalau kartunya kembali, angka
    // anggaran muncul lagi di dashboard Pimpinan tanpa keputusan baru, dan
    // grid tiga kolom membuat dua kartu lain terhimpit.
    for (const readOnly of [false, true]) {
      const html = await render({}, readOnly);
      expect(html).not.toContain("Status Dokumen");
      expect(html).not.toContain("Anggaran vs Realisasi");
      expect(html).not.toContain('href="/ppabp/anggaran"');
      // Grid dicek pada pembungkus baris ini saja, lewat penanda
      // "gap-6 lg:grid-cols-". Kartu lain tidak boleh memakai penanda yang
      // sama (kartu kelengkapan data memakai daftar baris, bukan grid ubin).
      const awalGrid = html.indexOf("gap-6 lg:grid-cols-");
      expect(awalGrid).toBeGreaterThan(-1);
      expect(html.slice(awalGrid, awalGrid + 30)).toContain("lg:grid-cols-2");
      expect(html).toContain("gap-6 lg:grid-cols-2");
      expect(html).not.toContain("gap-6 lg:grid-cols-3");
      const progres = html.indexOf("Progres Pengiriman Unit");
      const ringkasan = html.indexOf("Ringkasan Kalkulasi");
      expect(progres).toBeGreaterThan(-1);
      expect(ringkasan).toBeGreaterThan(progres);
    }
  });

  it("empat pie komposisi tampil BERURUTAN dengan angka yang sebenarnya", async () => {
    // Urutan ditetapkan user 2026-10-22: Pegawai Aktif, Instansi, Golongan,
    // Jenis Kelamin. Kartu angka "Total Pegawai Aktif" dicabut.
    const html = await render();
    const urutan = ["Pegawai Aktif", "Instansi", "Golongan", "Jenis Kelamin"].map((j) =>
      html.indexOf(`>${j}</h2>`)
    );
    expect(urutan.every((i) => i >= 0)).toBe(true);
    expect([...urutan].sort((a, b) => a - b)).toEqual(urutan);
    expect(html).not.toContain("Total Pegawai Aktif");

    // Dua pegawai contoh: PNS laki-laki golongan III/a di Biro Keuangan &
    // Pusdatik - jadi keempat pie punya satu potongan penuh berisi 2 (100%).
    expect(html).toContain("<title>PNS: 2 (100%)</title>");
    expect(html).toContain("<title>Kantor Pusat: 2 (100%)</title>");
    expect(html).toContain("<title>Gol III PNS: 2 (100%)</title>");
    expect(html).toContain("<title>Laki-laki: 2 (100%)</title>");
  });

  it("keempat kartu pie memakai chrome bercahaya yang sama, tanpa subjudul", async () => {
    // Permintaan user 2026-10-22: keempat kartu di baris itu terlihat sama,
    // dan subjudul ketiga pie dihapus.
    const html = await render();
    expect(html).not.toContain("Jenis kepegawaian");
    expect(html).not.toContain("Gol I–IV PNS &amp; jenjang PPPK");
    expect(html).not.toContain("Laki-laki &amp; perempuan");
    // Empat lapisan cahaya pastel, satu per kartu pie.
    expect(html.match(/radial-gradient\(150px 120px/g)).toHaveLength(4);
  });

  it("total pegawai aktif cuma tertulis SEKALI - tiga pie lain menampilkan kesimpulannya sendiri", async () => {
    // Keluhan user 2026-10-22: empat cincin bertuliskan "5.062 pegawai aktif"
    // adalah angka yang sama ditulis empat kali.
    const html = await render();
    const labelTotal = html.match(/text-muted">pegawai aktif<\/span>/g) ?? [];
    expect(labelTotal).toHaveLength(1);
    // Fixture: tiap pie cuma satu potongan, jadi ringkasannya 100%.
    expect(html).toContain(">Kantor Pusat</span>");
    expect(html).toContain(">Gol III PNS</span>");
    expect(html).toContain(">Laki-laki</span>");
  });

  it("filter & tombol aksi berada di SATU baris yang tidak patah di layar lebar", async () => {
    // Permintaan user 2026-10-22: Semua bulan, Semua tahun, Semua satuan
    // kerja, Terapkan, Rekonsiliasi, Export ADK "jadi 1 jajar". Keenamnya
    // harus tinggal di satu wadah ber-`xl:flex-nowrap` - kalau salah satu
    // pindah ke wadah lain, ia kembali terlempar ke baris kedua.
    const html = await render();
    const awal = html.indexOf('class="flex flex-wrap items-center gap-2.5 xl:flex-nowrap"');
    const akhir = html.indexOf("grid grid-cols-1 gap-3.5"); // baris pie sesudahnya
    expect(awal).toBeGreaterThan(-1);
    const baris = html.slice(awal, akhir);
    for (const kontrol of ['name="bulan"', 'name="tahun"', 'name="satker"', ">Terapkan<", "Rekonsiliasi", "Export ADK"]) {
      expect(baris, kontrol).toContain(kontrol);
    }
    // Sapaan TIDAK ikut di baris itu - dialah yang dulu memakan ruangnya.
    expect(baris).not.toContain("Halo,");
  });

  it("pie komposisi TANPA legenda permanen - keterangan baru muncul saat disorot", async () => {
    // Keputusan user 2026-10-22: keterangan tidak boleh makan tempat kartu.
    // Waktu halaman pertama dirender belum ada yang disorot, jadi kotak
    // keterangannya belum ada sama sekali.
    const html = await render();
    expect(html).not.toContain('role="tooltip"');
  });

  it("tiap potongan pie bisa difokus - keterangan juga terbuka lewat ketuk & Tab, bukan cuma mouse", async () => {
    // Hover tidak ada di HP. Potongan yang tidak bisa difokus berarti angkanya
    // tidak terbaca sama sekali oleh pemakai layar sentuh dan keyboard.
    const html = await render();
    const potonganPie = html.match(/<circle[^>]*tabindex="0"[^>]*aria-label="[^"]+"/g) ?? [];
    // Fixture: empat pie, masing-masing satu potongan (PNS / Pusat / Gol III / L).
    expect(potonganPie).toHaveLength(4);
    expect(html).toContain('aria-label="PNS: 2 (100%)"');
  });

  it("potongan bernilai nol tidak digambar dan tidak bisa difokus", async () => {
    const html = await render();
    expect(html).not.toContain('aria-label="PPPK: 0');
    expect(html).not.toContain('aria-label="Perempuan: 0');
  });

  it("NOMINAL UANG LEMBUR TIDAK BOCOR ke ringkasan selama saklarnya mati", async () => {
    // Ini penjagaan terpenting di berkas ini. Bentuk lama menjumlahkan lembur
    // ke dalam "Nilai Kalkulasi" tanpa syarat - angka belum final yang ikut
    // tersalin ke notulen. 777.777 dipilih supaya gampang dicari.
    const html = await render();
    expect(html).not.toContain("777.777");
    expect(html).toContain("Uang lembur belum masuk hitungan");
  });

  it("tabel monitoring memuat tiap satuan kerja beserta status pengirimannya", async () => {
    const html = await render();
    expect(html).toContain("Biro Keuangan dan BMN");
    expect(html).toContain("Pusdatik");
    expect(html).toContain("Dikembalikan");
    expect(html).toContain("Belum Dikirim");
  });

  it("pencarian menyaring tabel tanpa menyentuh angka di kartu atas", async () => {
    const html = await render({ q: "pusdatik" });
    expect(html).toContain("Pusdatik");
    // Nama unit lain hilang dari TABEL, tapi dropdown filter satuan kerja di
    // kepala halaman tetap memuatnya - jadi yang diperiksa barisnya.
    expect(html).not.toContain("Buka ADK&quot;") // jaga-jaga bentuk lain
    expect(html.split("Biro Keuangan dan BMN").length - 1).toBeLessThan(
      (await render()).split("Biro Keuangan dan BMN").length - 1
    );
  });

  it("query string ngawur tidak membuat halaman gagal", async () => {
    // Query string datang dari luar dan bisa diketik siapa saja.
    const html = await render({ status: "ENTAH", hal: "999", per: "abc", bulan: "xx", tahun: "0" });
    expect(html).toContain("Monitoring Pengiriman &amp; Rekonsiliasi Satuan Kerja");
  });

  it("database kosong tetap menghasilkan halaman yang bisa dibaca", async () => {
    siapkan({ kosong: true });
    const html = await render();
    expect(html).toContain(">Pegawai Aktif</h2>");
    expect(html).toContain("Belum ada satuan kerja dalam cakupan periode ini.");
  });

  it("paginasi tabel menunjuk halaman PEMANGGILNYA, bukan /ppabp yang ditulis mati", async () => {
    // Dashboard yang sama dipakai Pimpinan di /pimpinan. Alamat yang ditulis
    // mati membuat tombol "halaman 2" di sana melempar pembacanya ke halaman
    // milik role lain, yang lalu ditolak guard-nya.
    const html = await render({ per: "10" }, true);
    expect(html).toContain('href="/pimpinan?');
    expect(html).not.toContain('href="/ppabp?');
  });

  it("tautan kartu kelengkapan data hanya untuk PPABP, tidak untuk baca-saja", async () => {
    // Fixture tidak punya identitas/rekening, jadi kartunya berisi butir
    // dan tautannya dirender.
    const ppabp = await render({}, false);
    expect(ppabp).toContain('href="/ppabp/rekening"');
    const pimpinan = await render({}, true);
    expect(pimpinan).not.toContain('href="/ppabp/rekening"');
  });

  it("mode baca-saja tidak memunculkan satu pun tombol aksi", async () => {
    // Pimpinan memakai halaman yang sama. Tombol yang tidak boleh ditekan
    // tidak cukup dinonaktifkan - ia tidak boleh dirender sama sekali.
    const html = await render({}, true);
    expect(html).not.toContain("Export ADK");
    expect(html).not.toContain("Buka ADK");
    expect(html).not.toContain("Kelola Anggaran");
  });
});

describe("persenTeks", () => {
  it("bagian yang ada isinya tapi di bawah 0,5% ditulis <1%, bukan 0%", async () => {
    const { persenTeks } = await import("../KitGrafik");
    // 1 dari 5.062 - Gol I PNS pada data 2026-10-22.
    expect(persenTeks(1, 5062)).toBe("<1%");
    expect(persenTeks(0, 5062)).toBe("0%");
    expect(persenTeks(3964, 5062)).toBe("78%");
    expect(persenTeks(0, 0)).toBe("0%");
  });
});

describe("potonganTerbesar", () => {
  const seri = (kode: string, jumlah: number) => ({ kode, label: kode, jumlah, kelasIsi: "", kelasGaris: "" });

  it("memilih potongan dengan jumlah terbesar", async () => {
    const { potonganTerbesar } = await import("../KitGrafik");
    // Data 2026-10-22: Gol III 3.097 dari 5.062.
    expect(potonganTerbesar([seri("I", 1), seri("III", 3097), seri("IV", 709)])?.kode).toBe("III");
  });

  it("kalau seri, yang lebih dulu di daftar yang menang - hasilnya tidak berubah-ubah", async () => {
    const { potonganTerbesar } = await import("../KitGrafik");
    expect(potonganTerbesar([seri("pusat", 10), seri("upt", 10)])?.kode).toBe("pusat");
  });

  it("tanpa potongan berisi, hasilnya null - cincin kembali ke total", async () => {
    const { potonganTerbesar } = await import("../KitGrafik");
    expect(potonganTerbesar([])).toBeNull();
    expect(potonganTerbesar([seri("a", 0), seri("b", 0)])).toBeNull();
  });
});

describe("isi tengah donat tidak menembus cincin", () => {
  it("angka panjang (rupiah) mendapat huruf lebih kecil daripada cacah pegawai", async () => {
    const { kelasAngkaTengah } = await import("../KitGrafik");
    expect(kelasAngkaTengah("5.062")).toBe("text-lg");
    expect(kelasAngkaTengah("Rp 240 jt")).toBe("text-sm");
    expect(kelasAngkaTengah("Rp 1.240 jt")).toBe("text-xs");
  });

  it("kotak teks Ringkasan Kalkulasi dibatasi ke lubang cincin, bukan seluas donat", async () => {
    const html = await render();
    const i = html.indexOf("nilai kalkulasi</span>");
    expect(i).toBeGreaterThan(-1);
    const kotak = html.lastIndexOf('class="absolute inset-[19%]', i);
    expect(kotak).toBeGreaterThan(-1);
    expect(html.slice(kotak, i)).toContain("whitespace-nowrap");
  });
});
