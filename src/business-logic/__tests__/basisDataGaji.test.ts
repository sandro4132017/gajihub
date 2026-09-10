import { describe, expect, it } from "vitest";
import {
  gabungHasilBasisDataGaji,
  nipGanda,
  parseSheetBasisDataGaji,
  ringkasMasalahBasisDataGaji,
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

  it("kode bank yang bukan kode SPAN DIPULIHKAN dari nama banknya", () => {
    const janggal = [...barisNormal];
    janggal[11] = "52009000990"; // 11 digit - bukan kode SPAN
    const h = parseSheetBasisDataGaji([...HEADER, janggal], "data_PNS");
    expect(h.baris).toHaveLength(1);
    // Nama banknya "BANK RAKYAT INDONESIA" dan itu dikenali, jadi kodenya
    // DITURUNKAN dari situ - pemulihan, bukan tebakan. Pada berkas nyata ini
    // menyelamatkan 4 baris BPVP Sorong yang kolom kodenya berisi nomor
    // rekening.
    expect(h.baris[0]?.tukin?.kodeBankSpan).toBe("520002000990");
    expect(h.masalah.map((m) => m.jenis)).toContain("KODE_DIPULIHKAN_DARI_NAMA");
  });

  it("kode DAN nama bank sama-sama tidak dikenal - dibiarkan apa adanya", () => {
    const janggal = [...barisNormal];
    janggal[11] = "52009000990";
    janggal[14] = "BANK ENTAH BERANTAH";
    const h = parseSheetBasisDataGaji([...HEADER, janggal], "data_PNS");
    // Tidak ada yang bisa diturunkan dari mana pun, jadi tidak disentuh -
    // baris tetap disimpan supaya orangnya tidak hilang dari sistem.
    expect(h.baris[0]?.tukin?.kodeBankSpan).toBe("52009000990");
    expect(h.masalah.map((m) => m.jenis)).toContain("KODE_TIDAK_DIKENAL");
  });

  it("kode bank dibetulkan mengikuti nomor rekening - kasus 341 pegawai satker 451026", () => {
    // Kode BRI, nama BNI, nomor 10 digit. Panjang 10 itu punya BNI, bukan BRI
    // (15) - jadi dua kolom (nama + nomor) sepakat melawan kodenya, dan
    // kodenya yang dibetulkan. Aturan dari user 2026-09-06.
    const beda = [...barisNormal];
    beda[12] = "1921483416"; // 10 digit - panjang baku BNI
    beda[14] = "BANK NEGARA INDONESIA"; // kode di [11] BRI
    const h = parseSheetBasisDataGaji([...HEADER, beda], "data_PNS");
    expect(h.baris[0]?.tukin?.kodeBankSpan).toBe("520009000990");
    expect(h.baris[0]?.tukin?.namaBank).toBe("BANK NEGARA INDONESIA");
    expect(h.baris[0]?.tukin?.nomorRekening).toBe("1921483416");
    expect(h.masalah.map((m) => m.jenis)).toContain("KODE_IKUT_NOMOR");
    // SATU cacat, SATU tanda - bukan sekaligus "panjang janggal".
    expect(h.masalah.map((m) => m.jenis)).not.toContain("PANJANG_JANGGAL");
  });

  it("kalau nomornya memihak KODE, justru namanya yang dibetulkan", () => {
    const beda = [...barisNormal];
    beda[14] = "BANK NEGARA INDONESIA"; // kode BRI, nomor [12] tetap 15 digit
    const h = parseSheetBasisDataGaji([...HEADER, beda], "data_PNS");
    expect(h.baris[0]?.tukin?.kodeBankSpan).toBe("520002000990");
    expect(h.baris[0]?.tukin?.namaBank).toBe("BANK RAKYAT INDONESIA");
    expect(h.masalah.map((m) => m.jenis)).toContain("NAMA_IKUT_NOMOR");
  });

  it("kode dan nama SEPAKAT - panjang nomor tidak boleh membatalkannya", () => {
    // Bank Syariah Indonesia: 791 baris di berkas nyata, semuanya 10 digit -
    // sama persis dengan BNI. Kalau panjang nomor dibiarkan memutuskan
    // sendirian, ratusan rekening BSI pindah ke BNI tanpa ada satu pun kolom
    // di berkasnya yang menyebut BNI.
    const bsi = [...barisNormal];
    bsi[11] = "525451000990";
    bsi[12] = "7123456789"; // 10 digit
    bsi[14] = "BANK SYARIAH INDONESIA";
    const h = parseSheetBasisDataGaji([...HEADER, bsi], "data_PNS");
    expect(h.baris[0]?.tukin?.kodeBankSpan).toBe("525451000990");
    expect(h.masalah.map((m) => m.jenis)).not.toContain("KODE_IKUT_NOMOR");
  });

  it("nomor rekening yang panjangnya janggal DITANDAI, tidak ditambal", () => {
    // Sempat ditambal otomatis (9 digit BNI jadi "0447729376") dan itu dicabut
    // 2026-09-08: panjang baku yang disebutkan user adalah keterangan tentang
    // data, bukan izin mengubahnya. Penambalan itu merusak 20 rekening Mandiri
    // satker Rokeu yang deretnya (7000134...) memang 12 digit.
    const janggal = [...barisNormal];
    janggal[8] = "447729376"; // BNI, 9 digit
    const h = parseSheetBasisDataGaji([...HEADER, janggal], "data_PNS");
    expect(h.baris[0]?.gaji?.nomorRekening).toBe("447729376");
    expect(h.masalah.map((m) => m.jenis)).toContain("PANJANG_JANGGAL");
  });

  it("nomor Mandiri 12 digit deret 7000134 dibiarkan apa adanya", () => {
    // Kasus nyata berkas ADK Rokeu Juli 2026: seluruh 48 rekeningnya 12 digit
    // berawalan 7000134, dan itulah nomor yang benar-benar dipakai membayar.
    const mandiri = [...barisNormal];
    mandiri[11] = "520008000990";
    mandiri[12] = "700013408492";
    mandiri[14] = "BANK MANDIRI";
    const h = parseSheetBasisDataGaji([...HEADER, mandiri], "data_PNS");
    expect(h.baris[0]?.tukin?.nomorRekening).toBe("700013408492");
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

  it("ringkasan memisahkan yang sudah beres dari yang butuh manusia", () => {
    // Bertengkar DAN tak terputuskan: kode BRI (15), nama BNI (10), nomor 12
    // digit - tidak memihak siapa pun.
    const buntu = [...barisNormal];
    buntu[12] = "223301007311"; // 12 digit
    buntu[14] = "BANK NEGARA INDONESIA";
    // Kode bank bukan kode SPAN, tapi nama banknya dikenali - ini benar-benar
    // bisa dipulihkan dari baris yang sama, jadi masuk daftar "sudah beres".
    const kodeJanggal = [...barisNormal];
    kodeJanggal[3] = "3216182108660002";
    kodeJanggal[4] = "196608211987031002";
    kodeJanggal[11] = "52009000990";
    const h = parseSheetBasisDataGaji([...HEADER, buntu, kodeJanggal], "data_PNS");
    const r = ringkasMasalahBasisDataGaji(h.masalah);

    expect(r.dirapikan.join(" ")).toContain("diisi dari nama banknya");
    expect(r.perluDiperiksa.join(" ")).toContain("tidak bisa diputuskan otomatis");
    // Yang sudah beres TIDAK boleh ikut ke daftar yang butuh tindakan.
    expect(r.perluDiperiksa.join(" ")).not.toContain("diisi dari nama banknya");
  });

  it("sisa yang tak terputuskan dikelompokkan per pasangan bank, bukan per baris", () => {
    const a = [...barisNormal];
    a[12] = "223301007311";
    a[14] = "BANK NEGARA INDONESIA";
    const b = [...a];
    b[3] = "3216182108660003";
    b[4] = "196608211987031003";
    const h = parseSheetBasisDataGaji([...HEADER, a, b], "data_PNS");
    const r = ringkasMasalahBasisDataGaji(h.masalah);
    // Dua baris, SATU kalimat - yang ditanyakan ke pemilik data memang satu
    // pertanyaan, bukan dua.
    expect(r.perluDiperiksa).toHaveLength(1);
    expect(r.perluDiperiksa[0]).toContain("2 rekening");
  });

  it("kode yang diikutkan ke nomor dilaporkan per bank tujuan", () => {
    const pindah = [...barisNormal];
    pindah[12] = "1921483416"; // 10 digit, nama BNI, kode BRI
    pindah[14] = "BANK NEGARA INDONESIA";
    const h = parseSheetBasisDataGaji([...HEADER, pindah], "data_PNS");
    const r = ringkasMasalahBasisDataGaji(h.masalah);
    expect(r.dirapikan.join(" ")).toContain("kode diikutkan ke nomor rekening");
    expect(r.dirapikan.join(" ")).toContain("BANK NEGARA INDONESIA");
    // Sudah selesai - tidak boleh muncul lagi sebagai tugas.
    expect(r.perluDiperiksa.join(" ")).not.toContain("BANK NEGARA INDONESIA");
  });

  it("gabungHasilBasisDataGaji menyatukan beberapa sheet", () => {
    const a = parseSheetBasisDataGaji([...HEADER, barisNormal], "data_PNS");
    const b = parseSheetBasisDataGaji([...HEADER, barisNormal], "data_P3K");
    const g = gabungHasilBasisDataGaji([a, b]);
    expect(g.baris).toHaveLength(2);
    expect(g.baris.map((x) => x.sheet)).toEqual(["data_PNS", "data_P3K"]);
  });
});
