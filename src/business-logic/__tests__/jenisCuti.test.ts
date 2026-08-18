import { describe, it, expect } from "vitest";
import { parseJenisCuti, bulanCutiDariLabel, uraiJenisCuti, LABEL_JENIS_CUTI, SEMUA_JENIS_CUTI } from "../jenisCuti";
import { hitungPersenDibayarCuti } from "../tukin";
import { gabungStatusCuti } from "../../adapters/EpresensiAdapter";
import type { JenisCuti } from "../../types/index";

describe("parseJenisCuti", () => {
  it("mengenali label yang dipakai di template", () => {
    for (const jenis of SEMUA_JENIS_CUTI) {
      expect(parseJenisCuti(LABEL_JENIS_CUTI[jenis])).toBe(jenis);
    }
  });

  it("mengenali nilai enum yang ditulis langsung", () => {
    expect(parseJenisCuti("CUTI_SAKIT")).toBe("CUTI_SAKIT");
    expect(parseJenisCuti("cuti_besar")).toBe("CUTI_BESAR");
  });

  it("mengenali penulisan e-Presensi yang bertele-tele", () => {
    expect(parseJenisCuti("Cuti Sakit <1 bulan")).toBe("CUTI_SAKIT");
    expect(parseJenisCuti("  Cuti   Tahunan  ")).toBe("CUTI_TAHUNAN");
    expect(parseJenisCuti("CUTI MELAHIRKAN ANAK KE-2")).toBe("CUTI_MELAHIRKAN_ANAK_1_2_3");
  });

  it("JEBAKAN: gugur kandungan TIDAK boleh jatuh ke cuti sakit biasa", () => {
    // "Cuti Sakit Gugur Kandungan" mengandung kata "sakit". Kalau CUTI_SAKIT
    // dicek lebih dulu, potongannya berubah dari 1%/hari jadi 50% di bulan
    // kedua - selisih yang besar dan langsung kena ke pegawainya.
    expect(parseJenisCuti("Cuti Sakit Gugur Kandungan")).toBe("CUTI_SAKIT_GUGUR_KANDUNGAN");
    expect(parseJenisCuti("Cuti - Cuti Sakit Karena Gugur Kandungan")).toBe("CUTI_SAKIT_GUGUR_KANDUNGAN");

    // Buktikan selisihnya nyata, bukan sekadar beda label.
    const gugur = hitungPersenDibayarCuti({ jenis: "CUTI_SAKIT_GUGUR_KANDUNGAN", bulanKeberapa: 2, jumlahHariCuti: 32 })!;
    const sakit = hitungPersenDibayarCuti({ jenis: "CUTI_SAKIT", bulanKeberapa: 2 })!;
    expect(gugur.persenDibayar).toBeCloseTo(0.98);
    expect(sakit.persenDibayar).toBeCloseTo(0.5);
  });

  it("JEBAKAN: cuti besar < 1 bulan TIDAK boleh jatuh ke cuti besar biasa", () => {
    // Yang di bawah 1 bulan TIDAK dipotong sama sekali; cuti besar bulan
    // pertama dipotong 50%.
    expect(parseJenisCuti("Cuti Besar < 1 Bulan")).toBe("CUTI_BESAR_KURANG_1_BULAN");
    expect(parseJenisCuti("cuti besar kurang 1 bulan")).toBe("CUTI_BESAR_KURANG_1_BULAN");
    expect(parseJenisCuti("Cuti Besar")).toBe("CUTI_BESAR");

    expect(hitungPersenDibayarCuti({ jenis: "CUTI_BESAR_KURANG_1_BULAN" })!.persenDibayar).toBe(1.0);
    expect(hitungPersenDibayarCuti({ jenis: "CUTI_BESAR", bulanKeberapa: 1 })!.persenDibayar).toBeCloseTo(0.5);
  });

  it("mengenali Cuti di Luar Tanggungan Negara", () => {
    // Test ini dulu berbunyi sebaliknya (CLTN sengaja TIDAK dikenali, karena
    // Pasal 14 memang tidak menyebutnya). Diubah pada 2026-08-07 setelah
    // terbukti e-Presensi memakainya secara aktif - 4 pegawai, 61 hari, di
    // periode Juli 2026 saja. Selama tidak dikenali, mereka terbaca "cuti
    // tanpa jenis" dan dibayar PENUH.
    expect(parseJenisCuti("Cuti Di Luar Tanggungan Negara")).toBe("CUTI_DI_LUAR_TANGGUNGAN_NEGARA");
    expect(parseJenisCuti("CLTN")).toBe("CUTI_DI_LUAR_TANGGUNGAN_NEGARA");

    // Dibayar 0%, DAN selalu ditandai anomali - dasarnya PP 11/2017, bukan
    // Pasal 14, jadi tidak boleh lolos ke pembayaran tanpa dilihat manusia.
    const hasil = hitungPersenDibayarCuti({ jenis: "CUTI_DI_LUAR_TANGGUNGAN_NEGARA" })!;
    expect(hasil.persenDibayar).toBe(0);
    expect(hasil.anomali.length).toBeGreaterThan(0);
  });

  it("TIDAK menebak teks yang tidak dikenali", () => {
    expect(parseJenisCuti("libur panjang")).toBeNull();
    expect(parseJenisCuti("Libur Hari Raya")).toBeNull();
    expect(parseJenisCuti("")).toBeNull();
    expect(parseJenisCuti("-")).toBeNull();
    expect(parseJenisCuti(null)).toBeNull();
    expect(parseJenisCuti(undefined)).toBeNull();
  });

  it("setiap jenis cuti punya label yang berbeda", () => {
    const label = Object.values(LABEL_JENIS_CUTI);
    expect(new Set(label).size).toBe(label.length);
  });
});

// ===========================================================================
// MASTER JENIS CUTI ASLI e-PRESENSI
//
// Ke-16 baris di bawah disalin apa adanya dari tabel `cuti` database
// e-Presensi (`SELECT nama_cuti, nilai_persen FROM cuti`, 2026-08-07),
// LENGKAP dengan penulisan aslinya yang tidak konsisten - perhatikan "<1
// bulan" (tanpa spasi, huruf kecil) vs "< 1 Bulan" (pakai spasi, huruf
// besar) di baris yang berbeda. Jangan "dirapikan": justru
// ketidakkonsistenan itu yang harus tahan dibaca parser.
//
// `nilaiPersenSumber` adalah kolom `cuti.nilai_persen` milik e-Presensi -
// dipakai sebagai PEMBANDING INDEPENDEN terhadap tabel Pasal 14 di tukin.ts.
// Dua sumber yang tidak saling menyalin; kalau salah satu bergeser, test ini
// yang jatuh duluan.
// ===========================================================================
const MASTER_EPRESENSI: {
  label: string;
  jenis: JenisCuti | null;
  bulan: number | null;
  nilaiPersenSumber: number;
}[] = [
  { label: "Cuti Tahunan", jenis: "CUTI_TAHUNAN", bulan: null, nilaiPersenSumber: 0 },
  { label: "Cuti Alasan Penting", jenis: "CUTI_ALASAN_PENTING", bulan: null, nilaiPersenSumber: 0 },
  { label: "Cuti Melahirkan", jenis: "CUTI_MELAHIRKAN_ANAK_1_2_3", bulan: null, nilaiPersenSumber: 0 },
  { label: "Cuti Besar <1 Bulan", jenis: "CUTI_BESAR_KURANG_1_BULAN", bulan: null, nilaiPersenSumber: 0 },
  { label: "Cuti Besar I", jenis: "CUTI_BESAR", bulan: 1, nilaiPersenSumber: 50 },
  { label: "Cuti Besar II", jenis: "CUTI_BESAR", bulan: 2, nilaiPersenSumber: 75 },
  { label: "Cuti Besar III", jenis: "CUTI_BESAR", bulan: 3, nilaiPersenSumber: 90 },
  { label: "Cuti Sakit <1 bulan", jenis: "CUTI_SAKIT", bulan: null, nilaiPersenSumber: 0 },
  { label: "Cuti Sakit Bulan I", jenis: "CUTI_SAKIT", bulan: 1, nilaiPersenSumber: 0 },
  { label: "Cuti Sakit Bulan II", jenis: "CUTI_SAKIT", bulan: 2, nilaiPersenSumber: 50 },
  { label: "Cuti Sakit Bulan III", jenis: "CUTI_SAKIT", bulan: 3, nilaiPersenSumber: 75 },
  { label: "Cuti Sakit Bulan Lebih Dari 3 Bulan", jenis: "CUTI_SAKIT", bulan: 4, nilaiPersenSumber: 100 },
  { label: "Cuti di Luar Tanggungan Negara", jenis: "CUTI_DI_LUAR_TANGGUNGAN_NEGARA", bulan: null, nilaiPersenSumber: 100 },
  // Dua yang tarifnya PER HARI (Pasal 14 huruf e) - nilai_persen di e-Presensi
  // pun bersatuan per hari, jadi tidak dibandingkan di test persentase bawah.
  { label: "Cuti Gugur Kandungan < 1 Bulan", jenis: "CUTI_SAKIT_GUGUR_KANDUNGAN", bulan: null, nilaiPersenSumber: 0 },
  { label: "Cuti Gugur Kandungan < 1.5 Bulan", jenis: "CUTI_SAKIT_GUGUR_KANDUNGAN", bulan: null, nilaiPersenSumber: 1 },
  // "Libur Hari Raya" ikut ditaruh di tabel cuti oleh e-Presensi. Itu BUKAN
  // cuti pegawai dan tidak boleh dikenali sebagai salah satu jenis Pasal 14.
  { label: "Libur", jenis: null, bulan: null, nilaiPersenSumber: 0 },
];

describe("master jenis cuti e-Presensi", () => {
  it("ke-16 label terbaca jadi jenis + bulan yang benar", () => {
    for (const m of MASTER_EPRESENSI) {
      expect(parseJenisCuti(m.label), `jenis untuk "${m.label}"`).toBe(m.jenis);
      expect(bulanCutiDariLabel(m.label), `bulan untuk "${m.label}"`).toBe(m.bulan);
    }
  });

  it("terbaca juga lewat statusTeks gabungan seperti yang dikirim adapter", () => {
    // Adapter merangkai "Cuti" + jenisnya jadi satu teks, lalu
    // kategoriDariStatus() memecahnya lagi di sisi business logic. Rantai itu
    // diuji di sini supaya format gabungannya tidak bisa berubah sepihak.
    for (const m of MASTER_EPRESENSI) {
      const gabung = gabungStatusCuti("Cuti", m.label);
      expect(gabung).toBe(`Cuti - ${m.label}`);
      const jenisSaja = gabung.slice(gabung.indexOf("-") + 1).trim();
      expect(uraiJenisCuti(jenisSaja), `urai "${gabung}"`).toEqual(
        m.jenis === null ? null : { jenis: m.jenis, bulanKeberapa: m.bulan }
      );
    }
  });

  it("potongan Pasal 14 di tukin.ts cocok dengan nilai_persen e-Presensi", () => {
    // Yang tarifnya per HARI dikecualikan - satuannya beda, bukan
    // persentase bulanan (lihat catatan di tabel di atas).
    const bertingkat = MASTER_EPRESENSI.filter(
      (m) => m.jenis !== null && m.jenis !== "CUTI_SAKIT_GUGUR_KANDUNGAN"
    );
    expect(bertingkat.length).toBe(13);

    for (const m of bertingkat) {
      const hasil = hitungPersenDibayarCuti({
        jenis: m.jenis!,
        bulanKeberapa: m.bulan ?? undefined,
      })!;
      const potonganPersen = Math.round((1 - hasil.persenDibayar) * 100);
      expect(potonganPersen, `potongan untuk "${m.label}"`).toBe(m.nilaiPersenSumber);
    }
  });
});

describe("bulanCutiDariLabel", () => {
  it('"< 1 bulan" adalah LAMA cuti, bukan nomor bulan', () => {
    // Kalau angka di "<1 bulan" / "< 1.5 Bulan" dibaca sebagai nomor bulan,
    // hasilnya kebetulan benar untuk cuti sakit (bulan 1 = potongan 0%) dan
    // menutupi kekeliruan yang sama di tempat lain.
    expect(bulanCutiDariLabel("Cuti Sakit <1 bulan")).toBeNull();
    expect(bulanCutiDariLabel("Cuti Gugur Kandungan < 1.5 Bulan")).toBeNull();
    expect(bulanCutiDariLabel("Cuti Besar <1 Bulan")).toBeNull();
  });

  it("angka Romawi hanya dibaca kalau berdiri sendiri di ujung teks", () => {
    expect(bulanCutiDariLabel("Cuti Besar III")).toBe(3);
    expect(bulanCutiDariLabel("cuti sakit bulan ii")).toBe(2);
    // Huruf "i" di dalam kata tidak boleh tertangkap.
    expect(bulanCutiDariLabel("Cuti Alasan Penting")).toBeNull();
    expect(bulanCutiDariLabel("Cuti Melahirkan")).toBeNull();
    expect(bulanCutiDariLabel("CUTI_TAHUNAN")).toBeNull();
  });

  it('"Lebih Dari N Bulan" jatuh di luar tabel 1-3', () => {
    // Pasal 14 huruf d angka 4: lebih dari 3 bulan dipotong 100%. Angkanya
    // harus melewati ujung tabel, bukan berhenti di bulan ke-3 (75%).
    expect(bulanCutiDariLabel("Cuti Sakit Bulan Lebih Dari 3 Bulan")).toBe(4);
    const hasil = hitungPersenDibayarCuti({ jenis: "CUTI_SAKIT", bulanKeberapa: 4 })!;
    expect(hasil.persenDibayar).toBe(0);
  });
});

describe("gabungStatusCuti", () => {
  it("jenis cuti TIDAK ditempelkan ke hari yang bukan cuti", () => {
    // Kalau ditempelkan, kategori hari itu ikut berubah jadi CUTI (kategori
    // ditentukan dari awalan teks) - hari kerja biasa berubah jadi hari cuti.
    expect(gabungStatusCuti("WFO", "Cuti Tahunan")).toBe("WFO");
    expect(gabungStatusCuti("Tidak Hadir", "Cuti Besar I")).toBe("Tidak Hadir");
  });

  it("status tanpa jenis cuti dikembalikan apa adanya", () => {
    expect(gabungStatusCuti("Cuti", null)).toBe("Cuti");
    expect(gabungStatusCuti("Cuti", "   ")).toBe("Cuti");
    expect(gabungStatusCuti(null, "Cuti Tahunan")).toBe("");
  });
});
