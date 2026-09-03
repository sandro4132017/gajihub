import { describe, it, expect } from "vitest";
import {
  KOLOM_ADK_TUKIN,
  KOLOM_TOTAL_ADK_TUKIN,
  susunBarisAdkTukin,
  susunBarisTotalAdk,
  selKeTeks,
  rakitTeksAdk,
  periodeKerjaAdkTukin,
  type SumberBarisAdkTukin,
  nilaiUangAdkTukin,
} from "../adk";

/**
 * Angka & bentuk baris disalin dari file contoh ASLI dari user
 * ("export txt adk_tunkin-PNS_ROMUM_JUni__2026.xlsx" + .txt-nya) - bukan
 * karangan, supaya kalau formatnya bergeser test ini yang jatuh duluan.
 */
const SUMBER: SumberBarisAdkTukin[] = [
  {
    nip: "197509082006042003",
    nama: "TUTI HARYANTI, ST.",
    kelasJabatan: 15,
    tarifPenuhKelasJabatan: 19_280_000,
    tukinBersih: 16_388_000,
    kodeSatker: "450938",
    kodeBankSpan: "520002000990",
    namaBank: "Bank Rakyat Indonesia",
    nomorRekening: "076301015957537",
    namaRekening: "TUTI HARYANTI",
    nomorSk: "1234/SJ/KP.03.00/VII/2026",
  },
  {
    nip: "197904302011011012",
    nama: "LUTHFI FIRDAUS, S.E.",
    kelasJabatan: 12,
    tarifPenuhKelasJabatan: 9_896_000,
    tukinBersih: 9_866_312,
    kodeSatker: "450938",
    kodeBankSpan: "520002000990",
    namaBank: "Bank Rakyat Indonesia",
    nomorRekening: "223301002832507",
    namaRekening: "LUTHFI FIRDAUS",
    nomorSk: null,
  },
];

describe("KOLOM_ADK_TUKIN - header persis file contoh", () => {
  it("21 kolom - tanpa kolom penomoran NO", () => {
    // Kolom "NO" dihapus atas permintaan user 2026-09-02. Nomor urut tidak
    // dibaca Web Gaji, dan begitu file antar unit digabung penomorannya
    // justru berulang.
    expect(KOLOM_ADK_TUKIN).toHaveLength(21);
    expect(KOLOM_ADK_TUKIN).not.toContain("NO");
    expect(KOLOM_ADK_TUKIN[0]).toBe("Kode Satker");
    expect(KOLOM_ADK_TUKIN[7]).toBe("Nilai Bruto");
    expect(KOLOM_ADK_TUKIN[8]).toBe("Nilai Potongan");
    expect(KOLOM_ADK_TUKIN[9]).toBe("Nilai Bersih");
    expect(KOLOM_ADK_TUKIN[20]).toBe("Nomor Tukin Baru");
  });

  it("kolom yang dijumlahkan menunjuk ke tiga kolom nilai uang", () => {
    expect(KOLOM_TOTAL_ADK_TUKIN.map((i) => KOLOM_ADK_TUKIN[i])).toEqual([
      "Nilai Bruto",
      "Nilai Potongan",
      "Nilai Bersih",
    ]);
  });
});

describe("susunBarisAdkTukin", () => {
  const baris = susunBarisAdkTukin(SUMBER, 6, 2026);

  it("baris pertama cocok dengan baris pertama file contoh", () => {
    // KEEMPAT KOLOM PERIODE KERJA (indeks 14-17) SENGAJA BERBEDA DARI FILE
    // CONTOH. Di berkas contoh PPABP keempatnya KOSONG; user menetapkan
    // (2026-09-03) bahwa keduanya harus diisi periode kerja yang dibayar -
    // satu bulan sebelum periode berkasnya. Berkas contoh ini periode Juni,
    // jadi periode kerjanya Mei 2026.
    expect(baris[0]).toEqual([
      "450938", "06", "2026", "197509082006042003", "TUTI HARYANTI, ST.",
      "1234/SJ/KP.03.00/VII/2026", "15", 19_280_000, 2_892_000, 16_388_000,
      "520002000990", "Bank Rakyat Indonesia", "076301015957537", "TUTI HARYANTI",
      "05", "2026", "05", "2026", 1, "", "",
    ]);
  });

  it("jumlah kolom tiap baris sama dengan jumlah header", () => {
    for (const b of baris) expect(b).toHaveLength(KOLOM_ADK_TUKIN.length);
  });

  it("bulan & kode grade di-pad dua digit seperti file contoh", () => {
    const b = susunBarisAdkTukin([{ ...SUMBER[0], kelasJabatan: 7 }], 6, 2026)[0];
    expect(b[1]).toBe("06");
    expect(b[6]).toBe("07"); // bukan "7"
  });

  it("aritmatika bruto - potongan = bersih (sama dengan file contoh)", () => {
    for (const b of baris) {
      expect((b[7] as number) - (b[8] as number)).toBe(b[9]);
    }
  });

  it("kode satker dikosongkan kalau gaji induk periode itu belum diupload", () => {
    const b = susunBarisAdkTukin([{ ...SUMBER[0], kodeSatker: null }], 6, 2026)[0];
    expect(b[0]).toBe("");
  });

  it("kolom rekening TERISI - Web Gaji butuh nomor rekening buat memproses", () => {
    const b = baris[0];
    expect(b[10]).toBe("520002000990"); // Kode Bank SPAN
    expect(b[11]).toBe("Bank Rakyat Indonesia");
    expect(b[12]).toBe("076301015957537");
    expect(b[13]).toBe("TUTI HARYANTI");
  });

  it("rekening pegawai yang belum terdaftar TETAP kosong - jangan ditebak", () => {
    const b = susunBarisAdkTukin(
      [{ ...SUMBER[0], kodeBankSpan: null, namaBank: null, nomorRekening: null, namaRekening: null }],
      6,
      2026
    )[0];
    expect(b[10]).toBe("");
    expect(b[11]).toBe("");
    expect(b[12]).toBe("");
    // Nama Rekening jatuh ke nama pegawai - itu yang paling mungkin benar.
    expect(b[13]).toBe("TUTI HARYANTI, ST.");
  });

  it("nomor SK diambil dari data pegawai, bukan dikosongkan", () => {
    // Kolom ini WAJIB terisi di ADK. Dulu selalu dikirim kosong karena tidak
    // ada tempat menyimpannya; sekarang sumbernya Pegawai.nomorSk yang diisi
    // petugas lewat halaman Data Pegawai.
    expect(baris[0][5]).toBe("1234/SJ/KP.03.00/VII/2026");
  });

  it("pegawai yang nomor SK-nya belum diisi TETAP kosong - jangan ditebak", () => {
    expect(baris[1][5]).toBe("");
  });

  it("nomor tukin lama & baru TETAP kosong - datanya memang tidak ada", () => {
    // Dulu keempat kolom periode (14-17) ikut diuji kosong di sini. Sejak
    // user menetapkan pengisiannya (2026-09-03) yang tersisa cuma dua kolom
    // nomor tukin, yang memang belum punya sumber di sistem ini - dan
    // dikosongkan, bukan ditebak.
    const b = baris[0];
    for (const idx of [19, 20]) {
      expect(b[idx]).toBe("");
    }
  });

  it("Tukin Kali selalu 1", () => {
    for (const b of baris) expect(b[18]).toBe(1);
  });
});

describe("susunBarisTotalAdk", () => {
  it("menjumlahkan hanya kolom nilai uang, sisanya kosong", () => {
    const baris = susunBarisAdkTukin(SUMBER, 6, 2026);
    const total = susunBarisTotalAdk(baris, KOLOM_TOTAL_ADK_TUKIN, KOLOM_ADK_TUKIN.length);
    expect(total[7]).toBe(19_280_000 + 9_896_000);
    expect(total[8]).toBe(2_892_000 + 29_688);
    expect(total[9]).toBe(16_388_000 + 9_866_312);
    expect(total[0]).toBe("");
    expect(total[4]).toBe("");
    expect(total).toHaveLength(KOLOM_ADK_TUKIN.length);
  });

  it("total tetap konsisten: total bruto - total potongan = total bersih", () => {
    const baris = susunBarisAdkTukin(SUMBER, 6, 2026);
    const t = susunBarisTotalAdk(baris, KOLOM_TOTAL_ADK_TUKIN, KOLOM_ADK_TUKIN.length);
    expect((t[7] as number) - (t[8] as number)).toBe(t[9]);
  });
});

describe("format teks tab-separated", () => {
  it("baris data: angka ditulis apa adanya, tanpa pemisah ribuan", () => {
    expect(selKeTeks(19_280_000)).toBe("19280000");
  });

  it("baris total: pakai pemisah ribuan + spasi pengapit, seperti file .txt contoh", () => {
    // Di file contoh baris totalnya tertulis " 461.029.358 ".
    expect(selKeTeks(461_029_358, true)).toBe(" 461.029.358 ");
  });

  it("tab & newline di dalam teks dibuang supaya kolom tidak rusak", () => {
    expect(selKeTeks("NAMA\tPALSU\nBARIS")).toBe("NAMA PALSU BARIS");
  });

  it("null jadi string kosong", () => {
    expect(selKeTeks(null)).toBe("");
  });

  it("rakitTeksAdk menghasilkan data + baris total TANPA header, dipisah tab", () => {
    const baris = susunBarisAdkTukin(SUMBER, 6, 2026);
    const total = susunBarisTotalAdk(baris, KOLOM_TOTAL_ADK_TUKIN, KOLOM_ADK_TUKIN.length);
    const teks = rakitTeksAdk(baris, total);
    // JANGAN trimEnd() - baris total berakhir dengan banyak tab (kolom
    // kosong), dan trim akan menghapusnya sehingga jumlah kolomnya salah.
    const garis = teks.split("\r\n").slice(0, -1);

    // Data + total saja - tidak ada lagi "1 +" untuk baris headernya.
    expect(garis).toHaveLength(SUMBER.length + 1);
    // Baris PERTAMA langsung data, bukan nama kolom. Kalau suatu saat
    // header kembali diam-diam, dua harapan di bawah ini yang menangkapnya.
    expect(garis[0].split("\t")[4]).toBe("TUTI HARYANTI, ST.");
    expect(garis[0].split("\t")).not.toEqual([...KOLOM_ADK_TUKIN]);
    // Tiap baris punya jumlah kolom yang sama - kalau tidak, file ditolak
    // aplikasi tujuan.
    for (const g of garis) expect(g.split("\t")).toHaveLength(KOLOM_ADK_TUKIN.length);
    expect(garis[garis.length - 1].split("\t")[7]).toBe(" 29.176.000 ");
  });
});

describe("pembulatan nilai uang", () => {
  it("nilai pecahan dibulatkan ke rupiah bulat - file ADK contoh isinya bilangan bulat semua", () => {
    const b = susunBarisAdkTukin(
      [{ ...SUMBER[0], tarifPenuhKelasJabatan: 5_824_937.4, tukinBersih: 5_824_937.1 }],
      6,
      2026
    )[0];
    expect(b[7]).toBe(5_824_937);
    expect(b[8]).toBe(0);
    expect(b[9]).toBe(5_824_937);
    expect(Number.isInteger(b[7] as number)).toBe(true);
  });

  it("baris total = jumlah baris yang SUDAH dibulatkan, jadi cocok kalau dijumlah manual", () => {
    const baris = susunBarisAdkTukin(
      [
        { ...SUMBER[0], tarifPenuhKelasJabatan: 100.5, tukinBersih: 100.5 },
        { ...SUMBER[1], tarifPenuhKelasJabatan: 200.5, tukinBersih: 200.5 },
      ],
      6,
      2026
    );
    const total = susunBarisTotalAdk(baris, KOLOM_TOTAL_ADK_TUKIN, KOLOM_ADK_TUKIN.length);
    // 101 + 201 = 302 (bukan Math.round(301) = 301 dari penjumlahan pecahan)
    expect(total[7]).toBe((baris[0][7] as number) + (baris[1][7] as number));
    expect(Number.isInteger(total[7] as number)).toBe(true);
  });
});

describe("nilaiUangAdkTukin - Nilai Bruto adalah tarif PENUH, bukan hasil setelah potongan", () => {
  it("bruto = tarif kelas jabatan, potongan = selisih ke bersih", () => {
    // Angka dari sheet "Masuk ADK" rincian manual Rokeu: Arini Sarkowi,
    // kelas 12 (tarif 9.896.000), potongan 44.235,12, bersih 9.851.764,88.
    const u = nilaiUangAdkTukin({ tarifPenuhKelasJabatan: 9_896_000, tukinBersih: 9_851_764.88 });
    expect(u.bruto).toBe(9_896_000);
    expect(u.bersih).toBe(9_851_765);
    expect(u.potongan).toBe(9_896_000 - 9_851_765);
  });

  it("BUG LAMA: bruto tidak boleh sama dengan bersih waktu ada potongan", () => {
    // Sebelum diperbaiki, kolom Bruto diisi `tukinPokok` (yang sudah SETELAH
    // potongan) dan Potongan diisi `potonganPph` (selalu nol) - jadi file ADK
    // keluar dengan bruto == bersih dan potongan 0, menyembunyikan seluruh
    // potongan Pasal 13.
    const u = nilaiUangAdkTukin({ tarifPenuhKelasJabatan: 5_979_200, tukinBersih: 5_943_324.8 });
    expect(u.bruto).not.toBe(u.bersih);
    expect(u.potongan).toBeGreaterThan(0);
  });

  it("aritmatika bruto - potongan = bersih TEPAT pada bilangan bulat", () => {
    // Kolomnya dibulatkan sendiri-sendiri akan meleset satu rupiah. Diuji
    // pada angka pecahan yang pembulatannya berlawanan arah.
    for (const [tarif, bersih] of [
      [9_896_000, 9_851_764.88],
      [5_979_200, 5_943_324.51],
      [4_595_150, 4_564_546.301],
      [19_280_000, 19_280_000],
    ] as const) {
      const u = nilaiUangAdkTukin({ tarifPenuhKelasJabatan: tarif, tukinBersih: bersih });
      expect(u.bruto - u.potongan).toBe(u.bersih);
      expect(Number.isInteger(u.potongan)).toBe(true);
    }
  });

  it("tarif tidak diketahui: bruto disamakan bersih, potongan nol - bukan angka karangan", () => {
    const u = nilaiUangAdkTukin({ tarifPenuhKelasJabatan: null, tukinBersih: 4_564_546.3 });
    expect(u.bruto).toBe(4_564_546);
    expect(u.bersih).toBe(4_564_546);
    expect(u.potongan).toBe(0);
  });

  it("potongan tidak pernah negatif", () => {
    // Menurut konstruksinya tukinBersih <= tarif penuh. Kalau invarian itu
    // dilanggar, file ADK tetap tidak boleh memuat potongan negatif.
    const u = nilaiUangAdkTukin({ tarifPenuhKelasJabatan: 1_000_000, tukinBersih: 1_200_000 });
    expect(u.potongan).toBe(0);
  });
});

describe("periodeKerjaAdkTukin - kolom Bulan/Tahun Awal & Akhir", () => {
  it("satu bulan sebelum periode berkasnya - contoh user: Juli 2026 -> 6", () => {
    expect(periodeKerjaAdkTukin(7, 2026)).toEqual({ bulan: 6, tahun: 2026 });
  });

  it("Februari -> Januari tahun yang sama", () => {
    expect(periodeKerjaAdkTukin(2, 2026)).toEqual({ bulan: 1, tahun: 2026 });
  });

  it("Januari mundur ke Desember TAHUN SEBELUMNYA", () => {
    // Dikonfirmasi user 2026-09-03. Bukan bulan 0 (bukan bulan), dan bukan
    // 12 di tahun yang sama (masa depan): ekspor Januari 2027 membayar kerja
    // Desember 2026.
    expect(periodeKerjaAdkTukin(1, 2027)).toEqual({ bulan: 12, tahun: 2026 });
  });

  it("tidak pernah menghasilkan bulan di luar 1-12", () => {
    for (let b = 1; b <= 12; b++) {
      const k = periodeKerjaAdkTukin(b, 2026);
      expect(k.bulan).toBeGreaterThanOrEqual(1);
      expect(k.bulan).toBeLessThanOrEqual(12);
    }
  });
});

describe("baris ADK Tukin memuat periode kerja", () => {
  it("keempat kolom terisi, Awal sama dengan Akhir", () => {
    // Satu berkas = satu bulan, jadi Awal dan Akhir wajib sama. Kalau suatu
    // saat berbeda, Web Gaji akan membayar rentang yang tidak dimaksudkan.
    const baris = susunBarisAdkTukin(SUMBER, 7, 2026)[0];
    expect(baris[14]).toBe("06"); // Bulan Awal
    expect(baris[15]).toBe("2026"); // Tahun Awal
    expect(baris[16]).toBe("06"); // Bulan Akhir
    expect(baris[17]).toBe("2026"); // Tahun Akhir
    expect(baris[14]).toBe(baris[16]);
    expect(baris[15]).toBe(baris[17]);
  });

  it("kolom Bulan/Tahun berkas TETAP periode ekspornya, bukan periode kerja", () => {
    // Dua pasang kolom yang gampang tertukar: kolom 1-2 periode BERKAS,
    // kolom 14-17 periode KERJA yang dibayar. Bedanya satu bulan.
    const baris = susunBarisAdkTukin(SUMBER, 7, 2026)[0];
    expect(baris[1]).toBe("07");
    expect(baris[2]).toBe("2026");
  });
});
