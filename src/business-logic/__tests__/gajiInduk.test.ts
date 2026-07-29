import { describe, it, expect } from "vitest";
import {
  petakanBarisGpp,
  parseFileGajiInduk,
  hitungTotalGajiInduk,
  hitungTotalPenghasilanSlip,
  KOLOM_WAJIB_GPP,
} from "../gajiInduk";

// Header lengkap file "Gaji_Bank_45093800_1_000964.xlsx" (51 kolom).
const HEADER_GPP = [
  "kdsatker", "kdanak", "kdsubanak", "bulan", "tahun", "nogaji", "kdjns", "nip", "nmpeg", "kdduduk",
  "kdgol", "npwp", "nmrek", "nm_bank", "rekening", "kdbankspan", "nmbankspan", "kdpos", "kdnegara",
  "kdkppn", "tipesup", "gjpokok", "tjistri", "tjanak", "tjupns", "tjstruk", "tjfungs", "tjdaerah",
  "tjpencil", "tjlain", "tjkompen", "pembul", "tjberas", "tjpph", "potpfkbul", "potpfk2", "potpfk10",
  "potpph", "potswrum", "potkelbtj", "potlain", "pottabrum", "bersih", "sandi", "kdkawin", "kdjab",
  "thngj", "kdgapok", "bpjs", "bpjs2",
];

/**
 * Baris ASLI dari file contoh GPP (Ir. M. ARIF HIDAYAT, satker 450938,
 * periode 07/2026) - nilainya disalin apa adanya, BUKAN karangan, supaya
 * kalau pemetaan kolom bergeser test ini yang jatuh duluan.
 */
const BARIS_ARIF: Record<string, unknown> = {
  kdsatker: "450938", bulan: "07", tahun: "2026", nogaji: "000964", kdjns: "1",
  nip: "196706241998031001", gjpokok: 5746800, tjistri: 0, tjanak: 0, tjupns: 0, tjstruk: 3250000,
  tjfungs: 0, tjdaerah: 0, tjpencil: 0, tjlain: 0, tjkompen: 0, pembul: 24, tjberas: 72420,
  tjpph: 158712, potpfkbul: 0, potpfk2: 0, potpfk10: 459744, potpph: 158712, potswrum: 0,
  potkelbtj: 0, potlain: 0, pottabrum: 0, bersih: 8489500, bpjs: 120000, bpjs2: 0,
};

/** Baris ASLI kedua - punya tunjangan istri & anak (CRIS KUNTADI). */
const BARIS_CRIS: Record<string, unknown> = {
  kdsatker: "450938", bulan: "07", tahun: "2026", nogaji: "000964", kdjns: "1",
  nip: "196906241990031004", gjpokok: 6373200, tjistri: 637320, tjanak: 127464, tjupns: 0,
  tjstruk: 5500000, tjfungs: 0, tjdaerah: 0, tjpencil: 0, tjlain: 0, tjkompen: 0, pembul: 94,
  tjberas: 217260, tjpph: 385660, potpfkbul: 0, potpfk2: 0, potpfk10: 571038, potpph: 385660,
  potswrum: 0, potkelbtj: 0, potlain: 0, pottabrum: 0, bersih: 12164300, bpjs: 120000, bpjs2: 0,
};

describe("petakanBarisGpp - baris asli file GPP", () => {
  it("memetakan kolom GPP ke istilah slip gaji", () => {
    const hasil = petakanBarisGpp(BARIS_ARIF);
    expect(hasil.ok).toBe(true);
    if (!hasil.ok) return;

    expect(hasil.data.nip).toBe("196706241998031001");
    expect(hasil.data.periodeBulan).toBe(7);
    expect(hasil.data.periodeTahun).toBe(2026);
    expect(hasil.data.kodeSatker).toBe("450938");
    expect(hasil.data.nomorGaji).toBe("000964");
    expect(hasil.data.gajiPokok).toBe(5746800);
    expect(hasil.data.tunjanganStruktural).toBe(3250000);
    expect(hasil.data.tunjanganBeras).toBe(72420);
    expect(hasil.data.potonganIuranPegawai).toBe(459744);
    expect(hasil.data.potonganBpjs).toBe(120000);
  });

  it("total penghasilan - total potongan == kolom bersih dari GPP (tanpa selisih)", () => {
    for (const baris of [BARIS_ARIF, BARIS_CRIS]) {
      const hasil = petakanBarisGpp(baris);
      expect(hasil.ok).toBe(true);
      if (!hasil.ok) return;
      expect(hasil.data.totalPenghasilan - hasil.data.totalPotongan).toBe(hasil.data.gajiBersih);
      expect(hasil.data.selisihAritmatika).toBe(0);
    }
  });

  it("iuran gaji pegawai di file = 8% dari gapok + tunjangan istri + anak", () => {
    // Bukan dihitung ulang oleh Gajihub (angka GPP diterima apa adanya) -
    // ini cuma memastikan pemetaan kolom `potpfk10` memang komponen itu.
    const hasil = petakanBarisGpp(BARIS_CRIS);
    if (!hasil.ok) throw new Error("baris seharusnya valid");
    const dasar = hasil.data.gajiPokok + hasil.data.tunjanganIstri + hasil.data.tunjanganAnak;
    expect(Math.floor(dasar * 0.08)).toBe(hasil.data.potonganIuranPegawai);
  });

  it("menjumlahkan tunjangan & potongan lain yang jarang terisi jadi satu kolom", () => {
    const hasil = petakanBarisGpp({
      ...BARIS_ARIF,
      tjdaerah: 100, tjpencil: 200, tjlain: 300, tjkompen: 400,
      potswrum: 10, potkelbtj: 20, potlain: 30, pottabrum: 40, potpfkbul: 50, potpfk2: 60,
    });
    if (!hasil.ok) throw new Error("baris seharusnya valid");
    expect(hasil.data.tunjanganLain).toBe(1000);
    expect(hasil.data.potonganLain).toBe(210);
  });

  it("menandai selisih aritmatika kalau kolom bersih tidak cocok dengan komponennya", () => {
    const hasil = petakanBarisGpp({ ...BARIS_ARIF, bersih: 8000000 });
    if (!hasil.ok) throw new Error("baris seharusnya valid");
    expect(hasil.data.selisihAritmatika).toBe(489500);
  });
});

describe("petakanBarisGpp - baris yang dilewati", () => {
  it("melewati baris tanpa NIP", () => {
    const hasil = petakanBarisGpp({ ...BARIS_ARIF, nip: "   " });
    expect(hasil).toMatchObject({ ok: false, nip: null, alasan: "kolom nip kosong" });
  });

  it("melewati jenis gaji selain induk (kdjns != 1)", () => {
    const hasil = petakanBarisGpp({ ...BARIS_ARIF, kdjns: "2" });
    expect(hasil.ok).toBe(false);
    if (hasil.ok) return;
    expect(hasil.alasan).toContain("belum didukung");
  });

  it("melewati baris dengan bulan/tahun tidak masuk akal", () => {
    expect(petakanBarisGpp({ ...BARIS_ARIF, bulan: "13" }).ok).toBe(false);
    expect(petakanBarisGpp({ ...BARIS_ARIF, tahun: "" }).ok).toBe(false);
  });

  it("membaca angka yang tersimpan sebagai teks di file", () => {
    const hasil = petakanBarisGpp({ ...BARIS_ARIF, gjpokok: "5746800", bersih: "8489500" });
    if (!hasil.ok) throw new Error("baris seharusnya valid");
    expect(hasil.data.gajiPokok).toBe(5746800);
    expect(hasil.data.gajiBersih).toBe(8489500);
  });
});

describe("parseFileGajiInduk", () => {
  it("memisahkan baris valid dan baris yang dilewati beserta nomor barisnya", () => {
    const hasil = parseFileGajiInduk(
      [BARIS_ARIF, { ...BARIS_CRIS, nip: null }, BARIS_CRIS],
      HEADER_GPP
    );
    expect(hasil.baris).toHaveLength(2);
    expect(hasil.kolomHilang).toEqual([]);
    expect(hasil.dilewati).toEqual([{ nomorBaris: 2, nip: null, alasan: "kolom nip kosong" }]);
  });

  it("menolak file yang kolom wajibnya tidak lengkap - tanpa memproses satu baris pun", () => {
    const hasil = parseFileGajiInduk([BARIS_ARIF], ["nip", "nama", "gaji"]);
    expect(hasil.baris).toEqual([]);
    expect(hasil.kolomHilang).toEqual(["bulan", "tahun", "gjpokok", "bersih"]);
  });

  it("KOLOM_WAJIB_GPP memang ada di header file GPP asli", () => {
    for (const kolom of KOLOM_WAJIB_GPP) expect(HEADER_GPP).toContain(kolom);
  });
});

// ---------------------------------------------------------------------------
// Verifikasi terhadap slip gaji ASLI cetakan PPABP Setjen
// ("PERINCIAN PEMBAYARAN GAJI" a.n. MUH. I'MAL AROFAT, ST - Februari 2025).
// Angka di bawah disalin dari slip itu, jadi test ini yang menjaga supaya
// tampilan slip Gajihub tetap menghasilkan angka yang sama dengan yang selama
// ini dicetak manual.
// ---------------------------------------------------------------------------
describe("kecocokan dengan slip gaji asli (I'mal Arofat, Februari 2025)", () => {
  const KOMPONEN_SLIP = {
    gajiPokok: 3799400,
    tunjanganIstri: 379940,
    tunjanganAnak: 151976,
    tunjanganUmum: 0,
    tunjanganStruktural: 0,
    tunjanganFungsional: 800000,
    tunjanganBeras: 289680,
    tunjanganPph: 0,
    pembulatan: 36,
    tunjanganLain: 0,
    potonganIuranPegawai: 346505,
    potonganPph: 0,
    potonganBpjs: 61763,
    potonganLain: 0,
  };

  it("Jumlah Penghasilan & Jumlah Potongan sama dengan slip", () => {
    const { totalPenghasilan, totalPotongan } = hitungTotalGajiInduk(KOMPONEN_SLIP);
    expect(totalPenghasilan).toBe(5421032);
    expect(totalPotongan).toBe(408268);
    expect(totalPenghasilan - totalPotongan).toBe(5012764); // Jumlah Gaji Bersih di slip
  });

  it("Total Penghasilan = gaji bersih + tukin + uang makan + uang lembur + honorarium", () => {
    const total = hitungTotalPenghasilanSlip({
      gajiBersih: 5012764,
      tunjanganKinerja: 5079200,
      uangMakan: 703000,
      uangLembur: 1854000,
      honorarium: 11400000,
    });
    expect(total).toBe(24048964);
  });

  it("honorarium 0 (belum diisi PPABP) tidak mengubah komponen lain", () => {
    const total = hitungTotalPenghasilanSlip({
      gajiBersih: 5012764,
      tunjanganKinerja: 5079200,
      uangMakan: 703000,
      uangLembur: 1854000,
      honorarium: 0,
    });
    expect(total).toBe(12648964);
  });
});
