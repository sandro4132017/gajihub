import { describe, expect, it } from "vitest";
import {
  cacahProgres,
  cekBolehKirim,
  rangkumProgres,
  statusUnit,
  type BarisPengiriman,
} from "../pengirimanUnit";

const KIRIM = new Date("2026-08-05T03:00:00.000Z");

const terkirim: BarisPengiriman = { status: "TERKIRIM", dikirimPada: KIRIM, alasanKembali: null };
const dikembalikan: BarisPengiriman = {
  status: "DIKEMBALIKAN",
  dikirimPada: KIRIM,
  alasanKembali: "Predikat 3 orang belum diupload.",
};

describe("statusUnit", () => {
  it("tanpa baris = belum kirim, dan TIDAK terkunci", () => {
    const s = statusUnit(null);
    expect(s.keadaan).toBe("BELUM_KIRIM");
    expect(s.terkunci).toBe(false);
  });

  it("TERKIRIM = terkunci", () => {
    expect(statusUnit(terkirim).terkunci).toBe(true);
  });

  it("DIKEMBALIKAN membuka kunci lagi dan membawa alasannya", () => {
    const s = statusUnit(dikembalikan);
    expect(s.keadaan).toBe("DIKEMBALIKAN");
    expect(s.terkunci).toBe(false);
    expect(s.alasanKembali).toContain("Predikat");
  });

  it("BELUM_KIRIM dan DIKEMBALIKAN sama-sama tidak terkunci tapi TIDAK sama", () => {
    // Bedanya menentukan apa yang ditampilkan ke Kasubag TU: yang satu
    // "silakan kirim", yang satu "ada yang harus diperbaiki dulu".
    expect(statusUnit(null).keadaan).not.toBe(statusUnit(dikembalikan).keadaan);
  });
});

describe("cekBolehKirim", () => {
  const belum = statusUnit(null);

  it("lengkap = boleh", () => {
    expect(cekBolehKirim({ totalPegawai: 47, jumlahKalkulasi: 47 }, belum).boleh).toBe(true);
  });

  it("ada yang belum terhitung = ditolak, dan jumlahnya disebut", () => {
    const h = cekBolehKirim({ totalPegawai: 47, jumlahKalkulasi: 44 }, belum);
    expect(h.boleh).toBe(false);
    expect(h.alasan).toContain("3 dari 47");
  });

  it("yang sudah terkunci tidak bisa dikirim dua kali", () => {
    const h = cekBolehKirim({ totalPegawai: 47, jumlahKalkulasi: 47 }, statusUnit(terkirim));
    expect(h.boleh).toBe(false);
    expect(h.alasan).toContain("dikunci");
  });

  it("setelah dikembalikan, boleh dikirim ulang", () => {
    expect(
      cekBolehKirim({ totalPegawai: 47, jumlahKalkulasi: 47 }, statusUnit(dikembalikan)).boleh
    ).toBe(true);
  });

  it("kalkulasi yang sumbernya sudah basi/dihapus menahan pengiriman", () => {
    // Kejadian nyata 2026-09-02: predikat seorang pegawai dihapus, baris
    // Tukin-nya tetap berdiri, dan dia terhitung "sudah lengkap" - angkanya
    // nyaris ikut terkirim & terkunci.
    const h = cekBolehKirim({ totalPegawai: 48, jumlahKalkulasi: 48, jumlahBasi: 1 }, belum);
    expect(h.boleh).toBe(false);
    expect(h.alasan).toContain("basi");
  });

  it("jumlahBasi tidak diisi berarti tidak ada yang basi", () => {
    // Menjaga pemanggil lama tidak berubah perilakunya diam-diam.
    expect(cekBolehKirim({ totalPegawai: 48, jumlahKalkulasi: 48 }, belum).boleh).toBe(true);
  });

  it("kelengkapan dicek DULU sebelum kebasian - pesannya tidak boleh tertukar", () => {
    // Kalau urutannya terbalik, unit yang belum menghitung siapa pun akan
    // disuruh "hitung ulang yang basi" - saran yang tidak ada gunanya.
    const h = cekBolehKirim({ totalPegawai: 48, jumlahKalkulasi: 40, jumlahBasi: 3 }, belum);
    expect(h.alasan).toContain("8 dari 48");
  });

  it("unit tanpa pegawai aktif ditolak - bukan dianggap 'sudah lengkap'", () => {
    // 0 >= 0 secara aritmatika benar, dan tanpa penjagaan ini unit kosong
    // akan lolos sebagai kiriman sah berisi nol orang.
    const h = cekBolehKirim({ totalPegawai: 0, jumlahKalkulasi: 0 }, belum);
    expect(h.boleh).toBe(false);
    expect(h.alasan).toContain("Tidak ada pegawai aktif");
  });
});

describe("rangkumProgres", () => {
  const UNIT = ["Biro Umum", "Sekretariat Jenderal", "Biro Keuangan"];

  it("unit tanpa baris pengiriman TETAP muncul sebagai belum kirim", () => {
    // Justru merekalah yang perlu dilihat PPABP. Kalau daftarnya disimpulkan
    // dari baris pengiriman, unit yang belum kirim hilang dari papan.
    const p = rangkumProgres(UNIT, new Map());
    expect(p).toHaveLength(3);
    expect(p.every((x) => x.keadaan === "BELUM_KIRIM")).toBe(true);
  });

  it("diurutkan menurut nama unit", () => {
    const p = rangkumProgres(UNIT, new Map());
    expect(p.map((x) => x.satuanKerja)).toEqual([
      "Biro Keuangan",
      "Biro Umum",
      "Sekretariat Jenderal",
    ]);
  });

  it("membawa tanggal kirim dan alasan kembali", () => {
    const p = rangkumProgres(
      UNIT,
      new Map([
        ["Biro Umum", terkirim],
        ["Biro Keuangan", dikembalikan],
      ])
    );
    const umum = p.find((x) => x.satuanKerja === "Biro Umum")!;
    const keu = p.find((x) => x.satuanKerja === "Biro Keuangan")!;
    expect(umum.keadaan).toBe("TERKIRIM");
    expect(umum.dikirimPada).toEqual(KIRIM);
    expect(keu.alasanKembali).toContain("Predikat");
  });

  it("baris pengiriman untuk unit yang tidak ada di daftar diabaikan", () => {
    const p = rangkumProgres(["Biro Umum"], new Map([["Unit Bubar", terkirim]]));
    expect(p).toHaveLength(1);
    expect(p[0].satuanKerja).toBe("Biro Umum");
  });
});

describe("cacahProgres", () => {
  it("menghitung tiap keadaan, termasuk yang nol", () => {
    const p = rangkumProgres(
      ["A", "B", "C"],
      new Map([
        ["A", terkirim],
        ["B", terkirim],
      ])
    );
    expect(cacahProgres(p)).toEqual({ TERKIRIM: 2, BELUM_KIRIM: 1, DIKEMBALIKAN: 0 });
  });
});
