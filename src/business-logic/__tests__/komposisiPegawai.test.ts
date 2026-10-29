import { describe, expect, it } from "vitest";
import {
  hitungKomposisiPegawai,
  kelompokInstansi,
  pecahanKomposisi,
  potonganGolonganPie,
  persenKomposisi,
  type BarisKomposisi,
} from "../komposisiPegawai";

/** Baris minimal - tiap test cuma menyebut kolom yang diujinya. */
const baris = (p: Partial<BarisKomposisi> = {}): BarisKomposisi => ({
  kelompok: "PNS",
  golongan: "III/a",
  jenisKelamin: "L",
  kelasJabatan: 8,
  statusKawin: "K",
  satuanKerja: "Biro Keuangan dan Barang Milik Negara",
  ...p,
});

describe("hitungKomposisiPegawai - partisi", () => {
  it("daftar kosong menghasilkan nol semua, tanpa melempar", () => {
    const k = hitungKomposisiPegawai([]);
    expect(k.total).toBe(0);
    expect(k.pns).toBe(0);
    expect(k.ruangPns).toEqual([]);
    expect(k.jenjangPppk).toEqual([]);
  });

  it("jenis kepegawaian SALING LEPAS dan berjumlah total", () => {
    // Batang bertumpuk hanya sah kalau potongannya saling lepas - kalau
    // jumlahnya melebihi total, batangnya melewati 100% dan terbaca rusak.
    const k = hitungKomposisiPegawai([
      baris({ kelompok: "PNS" }),
      baris({ kelompok: "PNS" }),
      baris({ kelompok: "P3K" }),
      baris({ kelompok: null }),
    ]);
    expect([k.pns, k.p3k, k.jenisTidakDiketahui]).toEqual([2, 1, 1]);
    expect(k.pns + k.p3k + k.jenisTidakDiketahui).toBe(k.total);
  });

  it("jenis kelamin SALING LEPAS dan berjumlah total", () => {
    const k = hitungKomposisiPegawai([
      baris({ jenisKelamin: "L" }),
      baris({ jenisKelamin: "P" }),
      baris({ jenisKelamin: null }),
      baris({ jenisKelamin: "X" }),
      baris({ jenisKelamin: "" }),
    ]);
    expect([k.lelaki, k.perempuan, k.jenisKelaminTidakTercatat]).toEqual([1, 1, 3]);
    expect(k.lelaki + k.perempuan + k.jenisKelaminTidakTercatat).toBe(k.total);
  });

  it("nilai SIAP berpadding & berhuruf kecil tetap terbaca", () => {
    const k = hitungKomposisiPegawai([baris({ jenisKelamin: " l " }), baris({ jenisKelamin: "p" })]);
    expect([k.lelaki, k.perempuan, k.jenisKelaminTidakTercatat]).toEqual([1, 1, 0]);
  });
});

describe("hitungKomposisiPegawai - golongan", () => {
  it("ruang PNS dikelompokkan dari sufiks hurufnya, urut skala I-IV", () => {
    const k = hitungKomposisiPegawai([
      baris({ golongan: "IV/b" }),
      baris({ golongan: "III/a" }),
      baris({ golongan: "III/d" }),
      baris({ golongan: "II/c" }),
    ]);
    expect(k.ruangPns.map((p) => p.kode)).toEqual(["II", "III", "IV"]);
    expect(k.ruangPns.map((p) => p.jumlah)).toEqual([1, 2, 1]);
  });

  it("ruang yang nol DIBUANG dari daftar, bukan tampil sebagai 0", () => {
    const k = hitungKomposisiPegawai([baris({ golongan: "III/a" })]);
    expect(k.ruangPns.map((p) => p.kode)).toEqual(["III"]);
  });

  it("angka romawi TELANJANG adalah jenjang PPPK, BUKAN ruang PNS", () => {
    // Inilah jebakan yang pernah membuat 5 pegawai PPPK dibayar dengan tarif
    // S1: "III" milik PPPK itu kurung tarif SBM I, sementara "III/a" milik
    // PNS kurung III. Lihat golonganRomawi() di tarifSbm.ts.
    const k = hitungKomposisiPegawai([baris({ golongan: "III" }), baris({ golongan: "IX" })]);
    expect(k.ruangPns).toEqual([]);
    expect(k.jenjangPppk.map((p) => p.kode)).toEqual(["III", "IX"]);
    expect(k.golonganTidakTerbaca).toBe(0);
  });

  it("jenjang PPPK urut SKALA, bukan urut jumlah", () => {
    // Urut jumlah membuat daftar yang berubah urutannya tiap bulan - skala
    // yang melompat-lompat tidak bisa disapu mata dari atas ke bawah.
    const k = hitungKomposisiPegawai([
      baris({ golongan: "IX" }),
      baris({ golongan: "IX" }),
      baris({ golongan: "IX" }),
      baris({ golongan: "V" }),
      baris({ golongan: "I" }),
    ]);
    expect(k.jenjangPppk.map((p) => p.kode)).toEqual(["I", "V", "IX"]);
  });

  it("golongan kosong & di luar kedua skala masuk 'tidak terbaca'", () => {
    const k = hitungKomposisiPegawai([
      baris({ golongan: null }),
      baris({ golongan: "" }),
      baris({ golongan: "ZZ" }),
      baris({ golongan: "XVIII" }),
      baris({ golongan: "III/z" }),
    ]);
    expect(k.golonganTidakTerbaca).toBe(5);
    expect(k.ruangPns).toEqual([]);
    expect(k.jenjangPppk).toEqual([]);
  });

  it("setiap baris masuk TEPAT SATU wadah golongan", () => {
    const semua: BarisKomposisi[] = [
      baris({ golongan: "III/a" }),
      baris({ golongan: "IX" }),
      baris({ golongan: null }),
    ];
    const k = hitungKomposisiPegawai(semua);
    const terhitung =
      k.ruangPns.reduce((a, p) => a + p.jumlah, 0) +
      k.jenjangPppk.reduce((a, p) => a + p.jumlah, 0) +
      k.golonganTidakTerbaca;
    expect(terhitung).toBe(k.total);
  });
});

describe("hitungKomposisiPegawai - identitas Web Gaji vs golongan", () => {
  it("PPPK bergolongan berformat PNS ikut tercatat sebagai ketidaksepakatan", () => {
    // 13 orang pada data 2026-10-22. Angkanya tampil di layar supaya orang
    // yang menjumlahkan sebaran golongan lalu membandingkannya dengan jumlah
    // PNS tidak menyimpulkan panelnya rusak.
    const k = hitungKomposisiPegawai([baris({ kelompok: "P3K", golongan: "III/d" })]);
    expect(k.bedaIdentitasDenganGolongan).toBe(1);
    expect(k.p3k).toBe(1);
    expect(k.ruangPns.map((p) => p.kode)).toEqual(["III"]);
  });

  it("PNS bergolongan jenjang PPPK juga terhitung", () => {
    const k = hitungKomposisiPegawai([baris({ kelompok: "PNS", golongan: "IX" })]);
    expect(k.bedaIdentitasDenganGolongan).toBe(1);
  });

  it("yang sepakat tidak terhitung", () => {
    const k = hitungKomposisiPegawai([
      baris({ kelompok: "PNS", golongan: "III/a" }),
      baris({ kelompok: "P3K", golongan: "IX" }),
    ]);
    expect(k.bedaIdentitasDenganGolongan).toBe(0);
  });

  it("golongan tidak terbaca TIDAK dihitung dua kali", () => {
    // Satu kekurangan data tidak boleh terlihat seperti dua masalah berbeda
    // di dua baris strip kelengkapan.
    const k = hitungKomposisiPegawai([baris({ kelompok: "P3K", golongan: null })]);
    expect(k.golonganTidakTerbaca).toBe(1);
    expect(k.bedaIdentitasDenganGolongan).toBe(0);
  });

  it("tanpa identitas Web Gaji tidak pernah dianggap tidak sepakat", () => {
    // Tidak ada yang bisa tidak sepakat kalau salah satu pihaknya diam.
    const k = hitungKomposisiPegawai([baris({ kelompok: null, golongan: "III/a" })]);
    expect(k.bedaIdentitasDenganGolongan).toBe(0);
    expect(k.jenisTidakDiketahui).toBe(1);
  });
});

describe("hitungKomposisiPegawai - kelengkapan yang menyentuh pembayaran", () => {
  it("kelas jabatan kosong dihitung - tarif tukin tidak bisa ditentukan tanpa itu", () => {
    const k = hitungKomposisiPegawai([
      baris({ kelasJabatan: null }),
      baris({ kelasJabatan: 8 }),
      baris({ kelasJabatan: 0 }),
    ]);
    // Kelas 0 BUKAN kosong - ia nilai yang tercatat, dan kalau salah itu
    // urusan data pegawai, bukan urusan kelengkapan.
    expect(k.tanpaKelasJabatan).toBe(1);
  });

  it("status kawin tidak sah berarti PTKP tidak bisa ditentukan", () => {
    const k = hitungKomposisiPegawai([
      baris({ statusKawin: null }),
      baris({ statusKawin: "" }),
      baris({ statusKawin: "?" }),
      baris({ statusKawin: "K" }),
      baris({ statusKawin: "B" }),
    ]);
    expect(k.ptkpTidakBisaDitentukan).toBe(3);
  });

  it("perempuan kawin TETAP punya PTKP - TK/0, bukan 'tidak bisa ditentukan'", () => {
    // Aturan PMK 168/2023 menetapkan TK/0 sebagai bawaan, dan itu JAWABAN -
    // bukan ketidaktahuan. Kalau test ini jatuh, 1.800+ pegawai akan muncul
    // di strip kelengkapan sebagai masalah yang tidak ada.
    const k = hitungKomposisiPegawai([baris({ jenisKelamin: "P", statusKawin: "K" })]);
    expect(k.ptkpTidakBisaDitentukan).toBe(0);
  });
});

describe("persenKomposisi", () => {
  it("pembagi nol menghasilkan 0, bukan NaN", () => {
    // NaN% tampil di layar sebagai "NaN%" dan lebar batangnya jadi tidak
    // tentu - halaman dashboard tidak boleh bergantung pada data yang ada.
    expect(persenKomposisi(0, 0)).toBe(0);
    expect(persenKomposisi(5, 0)).toBe(0);
  });

  it("dibulatkan ke bilangan bulat terdekat", () => {
    expect(persenKomposisi(1, 3)).toBe(33);
    expect(persenKomposisi(2, 3)).toBe(67);
  });
});

describe("pecahanKomposisi", () => {
  it("TIDAK dibulatkan - ini yang menentukan sudut donat & tinggi batang", () => {
    // persenKomposisi membulatkan supaya enak dibaca; kalau geometrinya ikut
    // memakai angka bulat itu, potongan donat tidak lagi menutup penuh dan
    // batang yang berbeda tipis jadi sama tinggi.
    expect(pecahanKomposisi(1, 3)).toBeCloseTo(0.333333, 6);
    expect(persenKomposisi(1, 3)).toBe(33);
  });

  it("pembagi nol menghasilkan 0, bukan NaN", () => {
    expect(pecahanKomposisi(5, 0)).toBe(0);
  });

  it("seluruh potongan berjumlah tepat 1 - donatnya menutup penuh", () => {
    const total = 5062;
    const jumlah = pecahanKomposisi(3964, total) + pecahanKomposisi(979, total) + pecahanKomposisi(119, total);
    expect(jumlah).toBeCloseTo(1, 10);
  });
});

describe("potonganGolonganPie", () => {
  const k = hitungKomposisiPegawai([
    ...Array.from({ length: 3 }, () => baris({ golongan: "III/a" })),
    baris({ golongan: "IV/b" }),
    baris({ golongan: "IX" }),
    baris({ golongan: "IX" }),
    baris({ golongan: "V" }),
    baris({ golongan: null }),
  ]);
  const pie = potonganGolonganPie(k);

  it("potongannya berjumlah TEPAT total pegawai - pie tidak boleh bolong atau tumpang tindih", () => {
    expect(pie.reduce((a, p) => a + p.jumlah, 0)).toBe(k.total);
  });

  it("ruang PNS satu per satu, seluruh jenjang PPPK jadi SATU potongan", () => {
    expect(pie.map((p) => p.kode)).toEqual(["pns-III", "pns-IV", "pppk", "tidak-terbaca"]);
    expect(pie.find((p) => p.kode === "pppk")!.jumlah).toBe(3);
  });

  it("rincian jenjang PPPK TIDAK hilang - pindah ke keterangan, urut skala", () => {
    expect(pie.find((p) => p.kode === "pppk")!.keterangan).toBe("V: 1 · IX: 2");
  });

  it("tanpa PPPK & tanpa golongan rusak, potongannya tidak dimunculkan sebagai nol", () => {
    const hanyaPns = potonganGolonganPie(hitungKomposisiPegawai([baris({ golongan: "II/c" })]));
    expect(hanyaPns.map((p) => p.kode)).toEqual(["pns-II"]);
  });

  it("data kosong menghasilkan daftar kosong", () => {
    expect(potonganGolonganPie(hitungKomposisiPegawai([]))).toEqual([]);
  });
});

describe("kelompokInstansi", () => {
  it("satuan kerja berawalan 'Balai' adalah UPT daerah", () => {
    expect(kelompokInstansi("Balai Besar Pelatihan Vokasi dan Produktivitas Bekasi")).toBe("UPT");
    expect(kelompokInstansi("Balai Pelatihan Vokasi dan Produktivitas Ternate")).toBe("UPT");
    expect(kelompokInstansi("Balai Keselamatan dan Kesehatan Kerja Medan")).toBe("UPT");
    expect(kelompokInstansi("Balai Perluasan Kesempatan Kerja Kendari")).toBe("UPT");
  });

  it("yang diukur KEDUDUKAN, bukan letak gedung - Balai K3 Jakarta tetap UPT", () => {
    expect(kelompokInstansi("Balai Besar Keselamatan dan Kesehatan Kerja Jakarta")).toBe("UPT");
  });

  it("biro, direktorat, pusat, inspektorat, sekretariat, staf ahli adalah kantor pusat", () => {
    for (const s of [
      "Biro Keuangan dan Barang Milik Negara",
      "Direktorat Bina Penempatan Tenaga Kerja",
      "Pusat Data dan Teknologi Informasi Ketenagakerjaan",
      "Inspektorat IV",
      "Sekretariat Jenderal",
      "Staf Ahli Bidang Hubungan Internasional",
    ]) {
      expect(kelompokInstansi(s)).toBe("PUSAT");
    }
  });

  it("satuan kerja penampung & kosong TIDAK ditebak", () => {
    expect(kelompokInstansi("Unit Sementara")).toBe("TIDAK_DIKETAHUI");
    expect(kelompokInstansi("")).toBe("TIDAK_DIKETAHUI");
    expect(kelompokInstansi(null)).toBe("TIDAK_DIKETAHUI");
  });

  it("berpadding & berhuruf kecil tetap terbaca", () => {
    expect(kelompokInstansi("  balai pelatihan vokasi dan produktivitas padang ")).toBe("UPT");
  });

  it("kata yang cuma DIAWALI 'balai' tanpa spasi bukan UPT", () => {
    // Awalan harus kata utuh - nama unit masa depan yang kebetulan berawalan
    // huruf yang sama tidak boleh ikut tertarik.
    expect(kelompokInstansi("Balairung Ketenagakerjaan")).toBe("PUSAT");
  });
});

describe("hitungKomposisiPegawai - instansi", () => {
  it("pusat, UPT, dan tidak diketahui SALING LEPAS dan berjumlah total", () => {
    const k = hitungKomposisiPegawai([
      baris({ satuanKerja: "Biro Umum" }),
      baris({ satuanKerja: "Balai Pelatihan Vokasi dan Produktivitas Ambon" }),
      baris({ satuanKerja: "Balai Besar Pelatihan Vokasi dan Produktivitas Medan" }),
      baris({ satuanKerja: "Unit Sementara" }),
    ]);
    expect([k.kantorPusat, k.uptDaerah, k.instansiTidakDiketahui]).toEqual([1, 2, 1]);
    expect(k.kantorPusat + k.uptDaerah + k.instansiTidakDiketahui).toBe(k.total);
  });
});
