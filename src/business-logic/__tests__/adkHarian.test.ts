import { describe, expect, it } from "vitest";
import {
  akhirPekan,
  hariDalamBulan,
  rakitTeksAdkHarian,
  susunBarisAdkHarian,
  susunGridAdkHarian,
  type PegawaiAdkHarian,
} from "../adkHarian";

const P = (nip: string, nama: string, hari: { tanggalIso: string; jam?: number }[]): PegawaiAdkHarian => ({
  nip, nama, hari,
});

describe("hariDalamBulan", () => {
  it("mengenali panjang bulan termasuk Februari kabisat", () => {
    expect(hariDalamBulan(6, 2026)).toBe(30);
    expect(hariDalamBulan(7, 2026)).toBe(31);
    expect(hariDalamBulan(2, 2026)).toBe(28);
    expect(hariDalamBulan(2, 2028)).toBe(29);
  });
});

describe("akhirPekan", () => {
  it("Sabtu & Minggu saja", () => {
    expect(akhirPekan("2026-06-13")).toBe(true); // Sabtu
    expect(akhirPekan("2026-06-14")).toBe(true); // Minggu
    expect(akhirPekan("2026-06-15")).toBe(false); // Senin
    // 16 Juni 2026 = Tahun Baru Islam, libur nasional TAPI hari Selasa.
    // Sengaja TIDAK dikenali - tidak ada kalender libur nasional di sistem ini.
    expect(akhirPekan("2026-06-16")).toBe(false);
  });
});

describe("susunBarisAdkHarian - uang makan", () => {
  it("satu baris per hari, tanpa kolom ketiga", () => {
    const hasil = susunBarisAdkHarian(
      [P("197410061999032002", "DIAN", [{ tanggalIso: "2026-06-03" }, { tanggalIso: "2026-06-02" }])],
      { denganJam: false }
    );
    expect(hasil).toEqual([
      { nip: "197410061999032002", tanggalIso: "2026-06-02" },
      { nip: "197410061999032002", tanggalIso: "2026-06-03" },
    ]);
  });

  it("NIP dirapikan dari spasi", () => {
    // File asli dari operator memuat 15 baris ber-NIP berspasi di belakang
    // ("198203292009012003 "). Spasi itu bisa membuat pencocokan di sisi
    // penerima gagal tanpa pesan apa pun.
    const hasil = susunBarisAdkHarian([P(" 198203292009012003 ", "X", [{ tanggalIso: "2026-06-02" }])], {
      denganJam: false,
    });
    expect(hasil[0].nip).toBe("198203292009012003");
  });
});

describe("susunBarisAdkHarian - uang lembur", () => {
  it("membulatkan jam dan membuang hari berjam nol", () => {
    // Mesin Gajihub menghasilkan pecahan (mis. 7,75 jam dari selisih jam
    // presensi), sementara SELURUH 111 baris file asli bilangan bulat.
    const hasil = susunBarisAdkHarian(
      [P("198703232015031002", "ALPHA", [
        { tanggalIso: "2026-06-02", jam: 3 },
        { tanggalIso: "2026-06-03", jam: 2.4 },
        { tanggalIso: "2026-06-04", jam: 0 },
        { tanggalIso: "2026-06-05", jam: 0.4 },
        { tanggalIso: "2026-06-08", jam: 7.75 },
      ])],
      { denganJam: true }
    );
    expect(hasil).toEqual([
      { nip: "198703232015031002", tanggalIso: "2026-06-02", jam: 3 },
      { nip: "198703232015031002", tanggalIso: "2026-06-03", jam: 2 },
      { nip: "198703232015031002", tanggalIso: "2026-06-08", jam: 8 },
    ]);
  });

  it("urutan mengikuti urutan pegawai lalu tanggal (deterministik)", () => {
    const hasil = susunBarisAdkHarian(
      [
        P("B", "Kedua", [{ tanggalIso: "2026-06-09", jam: 1 }]),
        P("A", "Pertama", [{ tanggalIso: "2026-06-22", jam: 1 }, { tanggalIso: "2026-06-03", jam: 1 }]),
      ],
      { denganJam: true }
    );
    expect(hasil.map((b) => `${b.nip}/${b.tanggalIso}`)).toEqual([
      "B/2026-06-09", "A/2026-06-03", "A/2026-06-22",
    ]);
  });
});

describe("rakitTeksAdkHarian", () => {
  it("tab-separated, CRLF, TANPA header dan TANPA baris total", () => {
    // Ketiganya dibuktikan dari file asli: baris pertama langsung data, tidak
    // ada baris penjumlahan di akhir, dan byte akhir barisnya \r\n.
    const teks = rakitTeksAdkHarian([
      { nip: "197804012009122001", tanggalIso: "2026-06-09", jam: 1 },
      { nip: "197804012009122001", tanggalIso: "2026-06-22", jam: 1 },
    ]);
    expect(teks).toBe("197804012009122001\t2026-06-09\t1\r\n197804012009122001\t2026-06-22\t1\r\n");
  });

  it("uang makan cuma dua kolom", () => {
    const teks = rakitTeksAdkHarian([{ nip: "197410061999032002", tanggalIso: "2026-06-02" }]);
    expect(teks).toBe("197410061999032002\t2026-06-02\r\n");
    expect(teks.split("\r\n")[0].split("\t")).toHaveLength(2);
  });

  it("tanpa data menghasilkan file kosong, bukan baris kosong", () => {
    // Baris berisi tab kosong (yang ada di file asli sebagai sisa "save as
    // text") bukan bagian format - penerima yang membaca baris per baris bisa
    // tersandung NIP kosong.
    expect(rakitTeksAdkHarian([])).toBe("");
  });
});

describe("susunGridAdkHarian", () => {
  it("kepala mengikuti template operator", () => {
    const grid = susunGridAdkHarian([], 6, 2026, { denganJam: true });
    expect(grid[0].slice(0, 2)).toEqual(["Jenis", "Lembur"]);
    expect(grid[1]).toEqual(["Tahun", 2026, "Uang_Lembur_Juni_2026"]);
    expect(grid[2]).toEqual(["Bulan", 6]);
    expect(grid[3]).toEqual(["Batas", 30]);
    expect(grid[4].slice(0, 3)).toEqual(["No", "NIP", "Nama"]);
  });

  it("kolom tanggal sepanjang bulannya, bukan dipatok 30", () => {
    const juni = susunGridAdkHarian([], 6, 2026, { denganJam: false });
    const juli = susunGridAdkHarian([], 7, 2026, { denganJam: false });
    // No + NIP + Nama + hari + 1 kolom ringkasan
    expect(juni[4]).toHaveLength(3 + 30 + 1);
    expect(juli[4]).toHaveLength(3 + 31 + 1);
  });

  it("lembur: dua kolom ringkasan = jam hari kerja & jam hari libur", () => {
    // 13 Juni 2026 = Sabtu.
    const grid = susunGridAdkHarian(
      [P("X", "Uji", [
        { tanggalIso: "2026-06-03", jam: 2 },
        { tanggalIso: "2026-06-13", jam: 5 },
        { tanggalIso: "2026-06-22", jam: 1 },
      ])],
      6, 2026, { denganJam: true }
    );
    const baris = grid[5];
    expect(baris.slice(-2)).toEqual([3, 5]);
    expect(baris[3 + 3 - 1]).toBe(2);  // tanggal 3
    expect(baris[3 + 13 - 1]).toBe(5); // tanggal 13
    expect(baris[3 + 4 - 1]).toBe("");  // tanggal 4 kosong
  });

  it("uang makan: satu kolom ringkasan = jumlah hari, sel selalu 1", () => {
    const grid = susunGridAdkHarian(
      [P("X", "Uji", [{ tanggalIso: "2026-06-02" }, { tanggalIso: "2026-06-03" }])],
      6, 2026, { denganJam: false }
    );
    const baris = grid[5];
    expect(baris.slice(-1)).toEqual([2]);
    expect(baris[3 + 2 - 1]).toBe(1);
    expect(baris[3 + 3 - 1]).toBe(1);
  });

  it("grid dan daftar panjang menghasilkan jumlah hari yang sama", () => {
    // Penjaga paling penting di berkas ini: sheet grid dan file .txt disusun
    // dua fungsi berbeda dari sumber yang sama. Kalau keduanya bisa berbeda,
    // orang akan memeriksa grid lalu mengirim .txt yang isinya lain.
    const pegawai = [
      P("A", "Satu", [{ tanggalIso: "2026-06-02", jam: 3 }, { tanggalIso: "2026-06-13", jam: 5 }]),
      P("B", "Dua", [{ tanggalIso: "2026-06-04", jam: 0.2 }, { tanggalIso: "2026-06-22", jam: 6 }]),
    ];
    const baris = susunBarisAdkHarian(pegawai, { denganJam: true });
    const grid = susunGridAdkHarian(pegawai, 6, 2026, { denganJam: true });
    const totalDaftar = baris.reduce((a, b) => a + (b.jam ?? 0), 0);
    const totalGrid = grid.slice(5).reduce((a, r) => a + Number(r[r.length - 2]) + Number(r[r.length - 1]), 0);
    expect(totalGrid).toBe(totalDaftar);
    // B tanggal 4 (0,2 jam) dibulatkan jadi 0 dan hilang di KEDUA keluaran.
    expect(baris).toHaveLength(3);
  });
});
