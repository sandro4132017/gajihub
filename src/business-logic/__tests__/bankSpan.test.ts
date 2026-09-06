import { describe, expect, it } from "vitest";
import { BANK_SPAN, bankDariKode, bankDariNama, kunciNama, rapikanRekening } from "../bankSpan";

const BRI = "520002000990";
const BNI = "520009000990";
const MANDIRI = "520008000990";
const BSI = "525451000990";

describe("registry bank", () => {
  it("tiap kode SPAN 12 digit dan tidak ada yang kembar", () => {
    const kode = BANK_SPAN.map((b) => b.kodeSpan);
    for (const k of kode) expect(k).toMatch(/^\d{12}$/);
    expect(new Set(kode).size).toBe(kode.length);
  });

  it("satu alias tidak boleh menunjuk dua bank", () => {
    const dipakai = new Map<string, string>();
    for (const b of BANK_SPAN) {
      for (const a of b.alias) {
        const k = kunciNama(a);
        expect(dipakai.get(k) ?? b.kodeSpan).toBe(b.kodeSpan);
        dipakai.set(k, b.kodeSpan);
      }
    }
  });

  it("nama bakunya sendiri selalu dikenali sebagai aliasnya", () => {
    // Kalau ini jatuh, `rapikanRekening` akan menandai baris yang sudah benar
    // sebagai NAMA_BEDA_BANK - salah alarm pada data yang sehat.
    for (const b of BANK_SPAN) expect(bankDariNama(b.nama)?.kodeSpan).toBe(b.kodeSpan);
  });
});

describe("kunciNama", () => {
  it("menyamakan variasi penulisan yang benar-benar ada di berkas kiriman", () => {
    const sama = ["BANK RAKYAT INDONESIA", "Bank Rakyat Indonesia", "BANk RAKYAT INDONESIA"];
    for (const n of sama) expect(kunciNama(n)).toBe("BANKRAKYATINDONESIA");
    expect(bankDariNama("PT.BANK RAKYAT")?.kodeSpan).toBe(BRI);
  });

  it("BSM dan Bank Mandiri Syariah menunjuk BSI - bank yang sama, nama lama", () => {
    expect(bankDariNama("BANK SYARIAH MANDIRI")?.kodeSpan).toBe(BSI);
    expect(bankDariNama("BANK MANDIRI SYARIAH")?.kodeSpan).toBe(BSI);
  });

  it("BANK MANDIRI SYARIAH TIDAK tertukar dengan BANK MANDIRI", () => {
    // Pencocokan harus PERSIS, bukan awalan - "BANKMANDIRI" adalah awalan
    // dari "BANKMANDIRISYARIAH", dan bank keduanya berbeda.
    expect(bankDariNama("BANK MANDIRI")?.kodeSpan).toBe(MANDIRI);
    expect(bankDariNama("BANK MANDIRI SYARIAH")?.kodeSpan).not.toBe(MANDIRI);
  });
});

describe("rapikanRekening - nama bank dibakukan", () => {
  it("variasi penulisan bank yang sama diseragamkan", () => {
    const r = rapikanRekening({ kodeBankSpan: BRI, namaBank: "PT.BANK RAKYAT", nomorRekening: "223301017622507" });
    expect(r.namaBank).toBe("BANK RAKYAT INDONESIA");
    expect(r.masalah).toHaveLength(0);
  });

  it("baris yang sudah benar tidak menghasilkan masalah apa pun", () => {
    const r = rapikanRekening({ kodeBankSpan: BNI, namaBank: "BANK NEGARA INDONESIA", nomorRekening: "1930650385" });
    expect(r).toMatchObject({ kodeBankSpan: BNI, namaBank: "BANK NEGARA INDONESIA", nomorRekening: "1930650385" });
    expect(r.masalah).toHaveLength(0);
  });
});

describe("rapikanRekening - kode dan nama menunjuk bank berbeda", () => {
  it("KODE dibetulkan mengikuti nomor - ini kasus 341 pegawai satker 451026", () => {
    // 1921483416 itu 10 digit: panjang baku BNI, dan BNI juga yang tertulis
    // di kolom nama. Dua kolom sepakat melawan kode BRI-nya, jadi kodenya
    // yang dibetulkan. Nomornya sendiri tidak disentuh sama sekali.
    const r = rapikanRekening({ kodeBankSpan: BRI, namaBank: "BANK NEGARA INDONESIA", nomorRekening: "1921483416" });
    expect(r.kodeBankSpan).toBe(BNI);
    expect(r.namaBank).toBe("BANK NEGARA INDONESIA");
    expect(r.nomorRekening).toBe("1921483416");
    expect(r.masalah).toContainEqual({
      jenis: "KODE_IKUT_NOMOR",
      dari: BRI,
      jadi: BNI,
      bank: "BANK NEGARA INDONESIA",
      panjang: 10,
    });
  });

  it("kalau nomornya memihak KODE, namanya yang dibetulkan", () => {
    const r = rapikanRekening({
      kodeBankSpan: BRI,
      namaBank: "BANK NEGARA INDONESIA",
      nomorRekening: "223301002832507", // 15 digit - panjang baku BRI
    });
    expect(r.kodeBankSpan).toBe(BRI);
    expect(r.namaBank).toBe("BANK RAKYAT INDONESIA");
    expect(r.masalah.map((m) => m.jenis)).toEqual(["NAMA_IKUT_NOMOR"]);
  });

  it("nomor yang tidak memihak siapa pun: tidak diputuskan, ditandai sekali", () => {
    // 12 digit bukan panjang BRI (15) maupun BNI (10). Tidak ada bukti
    // ketiga, jadi tidak ada yang boleh diubah - dan cukup SATU tanda, bukan
    // sekaligus "panjang janggal" yang membuat satu cacat terhitung dua kali.
    const r = rapikanRekening({ kodeBankSpan: BRI, namaBank: "BANK NEGARA INDONESIA", nomorRekening: "223301007311" });
    expect(r.kodeBankSpan).toBe(BRI);
    expect(r.namaBank).toBe("BANK NEGARA INDONESIA");
    expect(r.nomorRekening).toBe("223301007311");
    expect(r.masalah.map((m) => m.jenis)).toEqual(["NAMA_BEDA_BANK"]);
  });

  it("kode & nama SEPAKAT: panjang nomor tidak pernah membatalkannya", () => {
    // Rekening BSI berpanjang 10 - sama dengan BNI. Kalau panjang nomor boleh
    // memutuskan sendirian, 791 rekening BSI di berkas nyata pindah ke BNI
    // tanpa satu pun kolom yang menyebut BNI.
    const r = rapikanRekening({
      kodeBankSpan: "525451000990",
      namaBank: "BANK SYARIAH INDONESIA",
      nomorRekening: "7123456789",
    });
    expect(r.kodeBankSpan).toBe("525451000990");
    expect(r.masalah).toHaveLength(0);
  });
});
