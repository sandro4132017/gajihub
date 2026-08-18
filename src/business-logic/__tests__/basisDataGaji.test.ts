import { describe, expect, it } from "vitest";
import {
  gabungHasilBasisDataGaji,
  kodeBankBernamaGanda,
  nipGanda,
  parseSheetBasisDataGaji,
} from "../basisDataGaji";

/** Dua baris kepala persis seperti file asli: judul grup, lalu header. */
const HEADER = [
  ["", "", "", "", "", "", "", "GAJI", "", "", "", "TUKIN", "", "", ""],
  [
    "No",
    "KODE SATKER",
    "NAMA SATUAN KERJA",
    "NIK",
    "NIP",
    "NAMA PEGAWAI",
    "JENIS PEGAWAI",
    "Kode BANK SPAN GAJI",
    "REKENING GAJI",
    "NAMA_REKENING",
    "NAMA_BANK GAJI",
    "KODE BANK SPAN TUNKIN",
    "REKENING TUNKIN",
    "NAMA_REKENING TUNKIN",
    "NAMA_BANK TUNKIN",
  ],
];

const barisNormal = [
  "1",
  "259031",
  "Inspektorat Jenderal Kemnaker",
  "3175030111930004",
  "199311012020121014",
  "Abdul Rahman Wahid, A.Md.A.B",
  "PNS",
  "520009000990",
  "0447729376",
  "Abdul Rahman Wahid",
  "BANK NEGARA INDONESIA",
  "520002000990",
  "223301007311506",
  "ABDUL RAHMAN WAHID",
  "BANK RAKYAT INDONESIA",
];

describe("parseSheetBasisDataGaji", () => {
  it("membaca baris normal termasuk dua rekening yang berbeda bank", () => {
    const h = parseSheetBasisDataGaji([...HEADER, barisNormal], "data_PNS");
    expect(h.error).toBeUndefined();
    expect(h.baris).toHaveLength(1);
    const b = h.baris[0]!;
    expect(b.nip).toBe("199311012020121014");
    expect(b.nama).toBe("Abdul Rahman Wahid, A.Md.A.B");
    expect(b.jenisPegawai).toBe("PNS");
    expect(b.kodeSatker).toBe("259031");
    expect(b.gaji).toEqual({
      kodeBankSpan: "520009000990",
      namaBank: "BANK NEGARA INDONESIA",
      nomorRekening: "0447729376",
      namaRekening: "Abdul Rahman Wahid",
    });
    expect(b.tukin?.kodeBankSpan).toBe("520002000990");
    expect(b.tukin?.nomorRekening).toBe("223301007311506");
  });

  it("NIK TIDAK ikut terbaca - data pribadi yang tidak dibutuhkan skema", () => {
    const h = parseSheetBasisDataGaji([...HEADER, barisNormal], "data_PNS");
    expect(JSON.stringify(h.baris[0])).not.toContain("3175030111930004");
  });

  it("MENOLAK NIP yang tersimpan sebagai angka - 3 digit terakhirnya sudah hilang", () => {
    const rusak = [...barisNormal];
    rusak[4] = 196906202003121000 as unknown as string; // number, bukan string
    const h = parseSheetBasisDataGaji([...HEADER, rusak], "data_PNS");
    expect(h.baris).toHaveLength(0);
    expect(h.dilewati[0]?.alasan).toContain("tersimpan sebagai angka");
  });

  it("memperbaiki kolom NIK & NIP yang tertukar", () => {
    const tertukar = [...barisNormal];
    tertukar[3] = "196608211987031001"; // NIP 18 digit nyasar ke kolom NIK
    tertukar[4] = "3216182108660001"; // NIK 16 digit nyasar ke kolom NIP
    const h = parseSheetBasisDataGaji([...HEADER, tertukar], "data_PNS");
    expect(h.baris[0]?.nip).toBe("196608211987031001");
    expect(h.jumlahNikNipTertukar).toBe(1);
    expect(h.peringatan.join(" ")).toContain("tertukar");
  });

  it("TIDAK menukar kalau cuma NIP-nya yang pendek - itu data rusak, bukan tertukar", () => {
    const pendek = [...barisNormal];
    pendek[3] = "3175030111930004"; // NIK tetap 16 digit
    pendek[4] = "1993110120201210"; // 16 digit juga
    const h = parseSheetBasisDataGaji([...HEADER, pendek], "data_PNS");
    expect(h.baris).toHaveLength(0);
    expect(h.jumlahNikNipTertukar).toBe(0);
    expect(h.dilewati[0]?.alasan).toContain("bukan 18 digit");
  });

  it("membuang apostrof sisa format teks Excel pada kode bank", () => {
    const apostrof = [...barisNormal];
    apostrof[11] = "'520002000990";
    const h = parseSheetBasisDataGaji([...HEADER, apostrof], "data_PNS");
    expect(h.baris[0]?.tukin?.kodeBankSpan).toBe("520002000990");
  });

  it("kode bank yang panjangnya janggal TETAP disimpan tapi diperingatkan", () => {
    const janggal = [...barisNormal];
    janggal[11] = "52009000990"; // 11 digit
    const h = parseSheetBasisDataGaji([...HEADER, janggal], "data_PNS");
    expect(h.baris).toHaveLength(1);
    expect(h.peringatan.join(" ")).toContain("bukan 12 digit");
  });

  it("baris tanpa rekening tetap dipakai untuk namanya", () => {
    const tanpaRek = [...barisNormal];
    tanpaRek[7] = tanpaRek[8] = tanpaRek[11] = tanpaRek[12] = "";
    const h = parseSheetBasisDataGaji([...HEADER, tanpaRek], "data_PNS");
    expect(h.baris).toHaveLength(1);
    expect(h.baris[0]?.gaji).toBeNull();
    expect(h.baris[0]?.tukin).toBeNull();
    expect(h.baris[0]?.nama).toBe("Abdul Rahman Wahid, A.Md.A.B");
  });

  it("baris kosong di ekor file diabaikan, bukan dilaporkan sebagai gagal", () => {
    const h = parseSheetBasisDataGaji([...HEADER, barisNormal, ["", "", ""], []], "data_PNS");
    expect(h.baris).toHaveLength(1);
    expect(h.dilewati).toHaveLength(0);
  });

  it("mengenali penamaan kolom sheet P3K yang sedikit berbeda", () => {
    const headerP3k = [
      HEADER[0]!,
      [
        "No", "KODE SATKER", "NAMA SATKER", "NIK", "NIP", "NAMA PEGAWAI", "JENIS_PEGAWAI",
        "KODE BANK SPAN GAJI", "REKENING GAJI", "NAMA_REKENING GAJI", "NAMA_BANK GAJI",
        "KODE BANK SPAN_TUNKIN", "REKENING TUNKIN", "NAMA_REKENING TUNKIN", "NAMA_BANK TUNKIN",
      ],
    ];
    const h = parseSheetBasisDataGaji([...headerP3k, barisNormal], "data_P3K");
    expect(h.error).toBeUndefined();
    expect(h.baris[0]?.namaSatuanKerja).toBe("Inspektorat Jenderal Kemnaker");
    expect(h.baris[0]?.gaji?.namaRekening).toBe("Abdul Rahman Wahid");
    expect(h.baris[0]?.tukin?.namaRekening).toBe("ABDUL RAHMAN WAHID");
  });

  it("melapor jelas kalau headernya tidak ketemu", () => {
    expect(parseSheetBasisDataGaji([["a", "b"]], "X").error).toContain("header");
  });
});

describe("pemeriksaan yang butuh mata manusia", () => {
  it("nipGanda memunculkan NIP yang muncul lebih dari sekali", () => {
    const h = parseSheetBasisDataGaji([...HEADER, barisNormal, barisNormal], "data_PNS");
    const ganda = nipGanda(h.baris);
    expect(ganda).toHaveLength(1);
    expect(ganda[0]?.jumlah).toBe(2);
  });

  it("kodeBankBernamaGanda menangkap satu kode bank dengan dua nama berbeda", () => {
    const lain = [...barisNormal];
    lain[4] = "198202212009011011";
    lain[11] = "520002000990"; // kode BRI...
    lain[14] = "BANK NEGARA INDONESIA"; // ...tapi ditulis BNI
    const h = parseSheetBasisDataGaji([...HEADER, barisNormal, lain], "data_PNS");
    const bentrok = kodeBankBernamaGanda(h.baris).find((x) => x.kodeBankSpan === "520002000990");
    expect(bentrok?.nama.map((n) => n.nama).sort()).toEqual([
      "BANK NEGARA INDONESIA",
      "BANK RAKYAT INDONESIA",
    ]);
  });

  it("beda kapitalisasi saja TIDAK dianggap bentrok", () => {
    const lain = [...barisNormal];
    lain[4] = "198202212009011011";
    lain[14] = "Bank Rakyat Indonesia";
    const h = parseSheetBasisDataGaji([...HEADER, barisNormal, lain], "data_PNS");
    expect(kodeBankBernamaGanda(h.baris).find((x) => x.kodeBankSpan === "520002000990")).toBeUndefined();
  });

  it("gabungHasilBasisDataGaji menyatukan beberapa sheet", () => {
    const a = parseSheetBasisDataGaji([...HEADER, barisNormal], "data_PNS");
    const b = parseSheetBasisDataGaji([...HEADER, barisNormal], "data_P3K");
    const g = gabungHasilBasisDataGaji([a, b]);
    expect(g.baris).toHaveLength(2);
    expect(g.baris.map((x) => x.sheet)).toEqual(["data_PNS", "data_P3K"]);
  });
});
