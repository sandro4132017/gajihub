import { describe, expect, it } from "vitest";
import {
  kunciMonitoring,
  nilaiKalkulasiTampil,
  rangkumMonitoringSatker,
  saringMonitoring,
  type MasukanMonitoring,
} from "../monitoringSatker";

const nilai = (satuanKerja: string, nilai: number, bulan = 8, tahun = 2026) => ({
  satuanKerja,
  periodeBulan: bulan,
  periodeTahun: tahun,
  nilai,
});

const masukan = (p: Partial<MasukanMonitoring> = {}): MasukanMonitoring => ({
  tukin: [],
  uangMakan: [],
  uangLembur: [],
  petaKirim: new Map(),
  unitCakupan: [],
  periodeCakupan: [{ bulan: 8, tahun: 2026 }],
  ...p,
});

describe("rangkumMonitoringSatker", () => {
  it("menjumlahkan nilai dan mencacah pegawai per unit", () => {
    const hasil = rangkumMonitoringSatker(
      masukan({
        tukin: [nilai("Biro Keuangan", 1000), nilai("Biro Keuangan", 2000)],
        uangMakan: [nilai("Biro Keuangan", 300)],
      })
    );
    expect(hasil).toHaveLength(1);
    expect(hasil[0].nilaiTukin).toBe(3000);
    expect(hasil[0].jumlahPegawaiTukin).toBe(2);
    expect(hasil[0].nilaiUangMakan).toBe(300);
    expect(hasil[0].jumlahPegawaiUangMakan).toBe(1);
  });

  it("unit TANPA kalkulasi tetap muncul dengan nilai nol", () => {
    // Unit yang tidak tampil tidak pernah ditagih - dan justru unit inilah
    // yang perlu ditagih.
    const hasil = rangkumMonitoringSatker(masukan({ unitCakupan: ["Biro Umum", "Pusdatik"] }));
    expect(hasil.map((b) => b.satuanKerja).sort()).toEqual(["Biro Umum", "Pusdatik"]);
    expect(hasil.every((b) => b.nilaiTukin === 0 && b.status === "BELUM_KIRIM")).toBe(true);
  });

  it("satu unit di DUA periode jadi DUA baris", () => {
    // Agustus bisa sudah terkirim sementara September belum; satu baris
    // memaksa memilih salah satu statusnya, dan pilihannya pasti salah untuk
    // periode yang lain.
    const hasil = rangkumMonitoringSatker(
      masukan({
        unitCakupan: ["Biro Umum"],
        periodeCakupan: [
          { bulan: 8, tahun: 2026 },
          { bulan: 9, tahun: 2026 },
        ],
        petaKirim: new Map([[kunciMonitoring("Biro Umum", 8, 2026), "TERKIRIM"]]),
      })
    );
    expect(hasil).toHaveLength(2);
    expect(hasil.find((b) => b.periodeBulan === 8)!.status).toBe("TERKIRIM");
    expect(hasil.find((b) => b.periodeBulan === 9)!.status).toBe("BELUM_KIRIM");
  });

  it("kunci yang tidak ada di peta berarti BELUM_KIRIM, bukan data hilang", () => {
    const hasil = rangkumMonitoringSatker(masukan({ tukin: [nilai("Biro Umum", 10)] }));
    expect(hasil[0].status).toBe("BELUM_KIRIM");
  });

  it("status di luar daftar TIDAK pernah terbaca sebagai terkirim", () => {
    // Apa pun yang bukan bukti terkirim harus jatuh ke belum kirim - keliru
    // ke arah ini membuat unit ditagih padahal sudah kirim; keliru ke arah
    // sebaliknya membuat unit tidak pernah ditagih sama sekali.
    const hasil = rangkumMonitoringSatker(
      masukan({
        unitCakupan: ["Biro Umum"],
        petaKirim: new Map([[kunciMonitoring("Biro Umum", 8, 2026), "ENTAH"]]),
      })
    );
    expect(hasil[0].status).toBe("BELUM_KIRIM");
  });

  it("urut: dikembalikan dulu, lalu belum kirim, terkirim paling bawah", () => {
    const hasil = rangkumMonitoringSatker(
      masukan({
        unitCakupan: ["A", "B", "C"],
        petaKirim: new Map([
          [kunciMonitoring("A", 8, 2026), "TERKIRIM"],
          [kunciMonitoring("C", 8, 2026), "DIKEMBALIKAN"],
        ]),
      })
    );
    expect(hasil.map((b) => b.satuanKerja)).toEqual(["C", "B", "A"]);
  });

  it("periode terbaru di atas saat statusnya sama", () => {
    const hasil = rangkumMonitoringSatker(
      masukan({
        unitCakupan: ["A"],
        periodeCakupan: [
          { bulan: 7, tahun: 2026 },
          { bulan: 9, tahun: 2026 },
          { bulan: 12, tahun: 2025 },
        ],
      })
    );
    expect(hasil.map((b) => `${b.periodeTahun}-${b.periodeBulan}`)).toEqual([
      "2026-9",
      "2026-7",
      "2025-12",
    ]);
  });

  it("baris berisi unit di luar unitCakupan tetap terhitung", () => {
    // Daftar unit dan baris kalkulasi datang dari dua query berbeda; kalau
    // salah satunya tertinggal, nilainya tidak boleh menguap diam-diam.
    const hasil = rangkumMonitoringSatker(
      masukan({ unitCakupan: ["A"], tukin: [nilai("Unit Tak Terdaftar", 500)] })
    );
    expect(hasil).toHaveLength(2);
    expect(hasil.find((b) => b.satuanKerja === "Unit Tak Terdaftar")!.nilaiTukin).toBe(500);
  });

  it("masukan kosong menghasilkan daftar kosong, tanpa melempar", () => {
    expect(rangkumMonitoringSatker(masukan({ periodeCakupan: [] }))).toEqual([]);
  });
});

describe("nilaiKalkulasiTampil", () => {
  const baris = { nilaiTukin: 1000, nilaiUangMakan: 200, nilaiUangLembur: 50 };

  it("lembur TIDAK ikut selama saklarnya mati", () => {
    // TAMPILKAN_NOMINAL_LEMBUR = false menyebut "kartu ringkasan dashboard"
    // dan "total belanja unit" secara eksplisit. Total yang diam-diam memuat
    // lembur adalah angka belum final yang ikut dikutip ke notulen.
    expect(nilaiKalkulasiTampil(baris, false)).toBe(1200);
  });

  it("lembur ikut begitu saklarnya dinyalakan", () => {
    expect(nilaiKalkulasiTampil(baris, true)).toBe(1250);
  });
});

describe("saringMonitoring", () => {
  const baris = rangkumMonitoringSatker(
    masukan({
      unitCakupan: ["Biro Keuangan dan BMN", "Pusdatik", "Biro Umum"],
      petaKirim: new Map([[kunciMonitoring("Pusdatik", 8, 2026), "TERKIRIM"]]),
    })
  );

  it("mencari tanpa peduli huruf besar-kecil & cocok sebagian", () => {
    expect(saringMonitoring(baris, "keuangan", undefined).map((b) => b.satuanKerja)).toEqual([
      "Biro Keuangan dan BMN",
    ]);
  });

  it("pencarian kosong & spasi saja tidak menyaring apa pun", () => {
    expect(saringMonitoring(baris, "", undefined)).toHaveLength(3);
    expect(saringMonitoring(baris, "   ", undefined)).toHaveLength(3);
    expect(saringMonitoring(baris, undefined, undefined)).toHaveLength(3);
  });

  it("menyaring per status", () => {
    expect(saringMonitoring(baris, undefined, "TERKIRIM").map((b) => b.satuanKerja)).toEqual([
      "Pusdatik",
    ]);
    expect(saringMonitoring(baris, undefined, "BELUM_KIRIM")).toHaveLength(2);
  });

  it("status ngawur DIABAIKAN, bukan mengosongkan tabel", () => {
    // Tabel kosong terbaca sebagai "tidak ada data", bukan sebagai "filter
    // Anda tidak sah" - dan query string bisa diketik siapa saja.
    expect(saringMonitoring(baris, undefined, "ENTAH")).toHaveLength(3);
  });

  it("cari & status berlaku bersamaan", () => {
    expect(saringMonitoring(baris, "biro", "BELUM_KIRIM")).toHaveLength(2);
    expect(saringMonitoring(baris, "biro", "TERKIRIM")).toHaveLength(0);
  });
});
