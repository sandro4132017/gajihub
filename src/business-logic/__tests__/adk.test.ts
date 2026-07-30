import { describe, it, expect } from "vitest";
import {
  KOLOM_ADK_TUKIN,
  KOLOM_TOTAL_ADK_TUKIN,
  susunBarisAdkTukin,
  susunBarisTotalAdk,
  selKeTeks,
  rakitTeksAdk,
  type SumberBarisAdkTukin,
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
    tukinPokok: 19_280_000,
    potonganPph: 2_892_000,
    tukinBersih: 16_388_000,
    kodeSatker: "450938",
  },
  {
    nip: "197904302011011012",
    nama: "LUTHFI FIRDAUS, S.E.",
    kelasJabatan: 12,
    tukinPokok: 9_896_000,
    potonganPph: 29_688,
    tukinBersih: 9_866_312,
    kodeSatker: "450938",
  },
];

describe("KOLOM_ADK_TUKIN - header persis file contoh", () => {
  it("22 kolom dengan urutan & penamaan yang sama", () => {
    expect(KOLOM_ADK_TUKIN).toHaveLength(22);
    expect(KOLOM_ADK_TUKIN[0]).toBe("NO");
    expect(KOLOM_ADK_TUKIN[8]).toBe("Nilai Bruto");
    expect(KOLOM_ADK_TUKIN[9]).toBe("Nilai Potongan");
    expect(KOLOM_ADK_TUKIN[10]).toBe("Nilai Bersih");
    expect(KOLOM_ADK_TUKIN[21]).toBe("Nomor Tukin Baru");
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
    expect(baris[0]).toEqual([
      1, "450938", "06", "2026", "197509082006042003", "TUTI HARYANTI, ST.",
      "", "15", 19_280_000, 2_892_000, 16_388_000,
      "", "", "", "", "", "", "", "", 1, "", "",
    ]);
  });

  it("jumlah kolom tiap baris sama dengan jumlah header", () => {
    for (const b of baris) expect(b).toHaveLength(KOLOM_ADK_TUKIN.length);
  });

  it("bulan & kode grade di-pad dua digit seperti file contoh", () => {
    const b = susunBarisAdkTukin([{ ...SUMBER[0], kelasJabatan: 7 }], 6, 2026)[0];
    expect(b[2]).toBe("06");
    expect(b[7]).toBe("07"); // bukan "7"
  });

  it("aritmatika bruto - potongan = bersih (sama dengan file contoh)", () => {
    for (const b of baris) {
      expect((b[8] as number) - (b[9] as number)).toBe(b[10]);
    }
  });

  it("kode satker dikosongkan kalau gaji induk periode itu belum diupload", () => {
    const b = susunBarisAdkTukin([{ ...SUMBER[0], kodeSatker: null }], 6, 2026)[0];
    expect(b[1]).toBe("");
  });

  it("kolom rekening & nomor SK TETAP kosong - PII finansial / data tidak ada", () => {
    const b = baris[0];
    for (const idx of [6, 11, 12, 13, 14, 15, 16, 17, 18, 20, 21]) {
      expect(b[idx]).toBe("");
    }
  });

  it("Tukin Kali selalu 1", () => {
    for (const b of baris) expect(b[19]).toBe(1);
  });
});

describe("susunBarisTotalAdk", () => {
  it("menjumlahkan hanya kolom nilai uang, sisanya kosong", () => {
    const baris = susunBarisAdkTukin(SUMBER, 6, 2026);
    const total = susunBarisTotalAdk(baris, KOLOM_TOTAL_ADK_TUKIN, KOLOM_ADK_TUKIN.length);
    expect(total[8]).toBe(19_280_000 + 9_896_000);
    expect(total[9]).toBe(2_892_000 + 29_688);
    expect(total[10]).toBe(16_388_000 + 9_866_312);
    expect(total[0]).toBe("");
    expect(total[5]).toBe("");
    expect(total).toHaveLength(KOLOM_ADK_TUKIN.length);
  });

  it("total tetap konsisten: total bruto - total potongan = total bersih", () => {
    const baris = susunBarisAdkTukin(SUMBER, 6, 2026);
    const t = susunBarisTotalAdk(baris, KOLOM_TOTAL_ADK_TUKIN, KOLOM_ADK_TUKIN.length);
    expect((t[8] as number) - (t[9] as number)).toBe(t[10]);
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

  it("rakitTeksAdk menghasilkan header + data + baris total, dipisah tab", () => {
    const baris = susunBarisAdkTukin(SUMBER, 6, 2026);
    const total = susunBarisTotalAdk(baris, KOLOM_TOTAL_ADK_TUKIN, KOLOM_ADK_TUKIN.length);
    const teks = rakitTeksAdk(KOLOM_ADK_TUKIN, baris, total);
    // JANGAN trimEnd() - baris total berakhir dengan banyak tab (kolom
    // kosong), dan trim akan menghapusnya sehingga jumlah kolomnya salah.
    const garis = teks.split("\r\n").slice(0, -1);

    expect(garis).toHaveLength(1 + SUMBER.length + 1);
    expect(garis[0].split("\t")).toEqual([...KOLOM_ADK_TUKIN]);
    expect(garis[1].split("\t")[5]).toBe("TUTI HARYANTI, ST.");
    // Tiap baris punya jumlah kolom yang sama - kalau tidak, file ditolak
    // aplikasi tujuan.
    for (const g of garis) expect(g.split("\t")).toHaveLength(KOLOM_ADK_TUKIN.length);
    expect(garis[garis.length - 1].split("\t")[8]).toBe(" 29.176.000 ");
  });
});

describe("pembulatan nilai uang", () => {
  it("nilai pecahan dibulatkan ke rupiah bulat - file ADK contoh isinya bilangan bulat semua", () => {
    const b = susunBarisAdkTukin(
      [{ ...SUMBER[0], tukinPokok: 5_824_937.4, potonganPph: 0.3, tukinBersih: 5_824_937.1 }],
      6,
      2026
    )[0];
    expect(b[8]).toBe(5_824_937);
    expect(b[9]).toBe(0);
    expect(b[10]).toBe(5_824_937);
    expect(Number.isInteger(b[8] as number)).toBe(true);
  });

  it("baris total = jumlah baris yang SUDAH dibulatkan, jadi cocok kalau dijumlah manual", () => {
    const baris = susunBarisAdkTukin(
      [
        { ...SUMBER[0], tukinPokok: 100.5, potonganPph: 0, tukinBersih: 100.5 },
        { ...SUMBER[1], tukinPokok: 200.5, potonganPph: 0, tukinBersih: 200.5 },
      ],
      6,
      2026
    );
    const total = susunBarisTotalAdk(baris, KOLOM_TOTAL_ADK_TUKIN, KOLOM_ADK_TUKIN.length);
    // 101 + 201 = 302 (bukan Math.round(301) = 301 dari penjumlahan pecahan)
    expect(total[8]).toBe((baris[0][8] as number) + (baris[1][8] as number));
    expect(Number.isInteger(total[8] as number)).toBe(true);
  });
});
