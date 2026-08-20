import { describe, it, expect } from "vitest";
import {
  bandingkanPotongan,
  PENJELASAN_SEBAB,
  type PelanggaranGajihubHarian,
  type PotonganEpresensiHarian,
} from "../bandingPotonganEpresensi";

/** Hari bersih - dipakai sebagai dasar lalu ditimpa seperlunya. */
function hari(tanggalIso: string, ubah: Partial<PelanggaranGajihubHarian> = {}): PelanggaranGajihubHarian {
  return {
    tanggalIso,
    hariAlpha: false,
    kejadianTidakPresensi: 0,
    menitTerlambat: 0,
    menitPulangCepat: 0,
    menitMeninggalkanKantor: 0,
    tidakIkutUpacara: false,
    ...ubah,
  };
}

/** e-Presensi menyimpan negatif & satuan persen; adapter membalikkannya. */
function ep(tanggalIso: string, persen: number, keterangan: string): PotonganEpresensiHarian {
  return { tanggalIso, persen, keterangan };
}

describe("bandingkanPotongan - klasifikasi sebab", () => {
  it("TARIF_LUPA_ABSEN: kedua sisi sepakat ada tap hilang, tarifnya yang beda", () => {
    // Kasus paling sering: e-Presensi 2% flat, Pasal 13 ayat (2) 1% per kejadian.
    const r = bandingkanPotongan({
      epresensi: [ep("2026-07-17", 0.02, "Potongan lupa presensi 2%")],
      gajihub: [hari("2026-07-17", { kejadianTidakPresensi: 1 })],
      bobotKehadiranRupiah: 1_000_000,
    });
    expect(r.baris[0].sebab).toBe("TARIF_LUPA_ABSEN");
    expect(r.baris[0].epresensiPersen).toBeCloseTo(0.02, 10);
    expect(r.baris[0].gajihubPersen).toBeCloseTo(0.01, 10);
    expect(r.baris[0].selisihPersen).toBeCloseTo(-0.01, 10);
    // Gajihub memotong LEBIH KECIL -> selisih rupiahnya negatif.
    expect(r.selisihRupiah).toBe(-10_000);
  });

  it("KLASIFIKASI_LUPA_ABSEN: e-Presensi menagih lupa absen, Gajihub tidak sama sekali", () => {
    // Kelompok menit_kerja 1-449: kedua tap ADA, yang kurang jam kerjanya.
    // Gajihub menagihnya lewat ayat (3) per menit, bukan ayat (2).
    const r = bandingkanPotongan({
      epresensi: [ep("2026-07-22", 0.02, "Potongan lupa presensi 2%")],
      gajihub: [hari("2026-07-22", { menitTerlambat: 246 })],
      bobotKehadiranRupiah: null,
    });
    expect(r.baris[0].sebab).toBe("KLASIFIKASI_LUPA_ABSEN");
    expect(r.baris[0].gajihubPersen).toBeCloseTo(0.0246, 10);
  });

  it("TARIF_TERLAMBAT: berjenjang lawan per menit", () => {
    // Telat 99 menit -> e-Presensi 1% (berjenjang), Gajihub 0,99%.
    const r = bandingkanPotongan({
      epresensi: [ep("2026-07-01", 0.01, "Potongan tukin harian 1%. Keterlambatan 99 menit.")],
      gajihub: [hari("2026-07-01", { menitTerlambat: 99 })],
      bobotKehadiranRupiah: null,
    });
    expect(r.baris[0].sebab).toBe("TARIF_TERLAMBAT");
    expect(r.baris[0].gajihubPersen).toBeCloseTo(0.0099, 10);
  });

  it("BATAS_HARIAN_EPRESENSI: e-Presensi mentok 2%, Gajihub jalan terus", () => {
    // Telat 269 menit: e-Presensi berhenti di batas maksimal harian, Gajihub 2,69%.
    const r = bandingkanPotongan({
      epresensi: [ep("2026-07-09", 0.02, "Potongan tukin harian 2%. Keterlambatan 269 menit.")],
      gajihub: [hari("2026-07-09", { menitTerlambat: 269 })],
      bobotKehadiranRupiah: null,
    });
    expect(r.baris[0].sebab).toBe("BATAS_HARIAN_EPRESENSI");
    expect(r.baris[0].selisihPersen).toBeCloseTo(0.0069, 10);
  });

  it("HANYA_GAJIHUB dan HANYA_EPRESENSI dibedakan", () => {
    const r = bandingkanPotongan({
      epresensi: [ep("2026-07-02", 0.005, "Potongan tukin harian 0.5%. Keterlambatan 62 menit.")],
      gajihub: [hari("2026-07-03", { menitTerlambat: 40 })],
      bobotKehadiranRupiah: null,
    });
    const per = new Map(r.baris.map((b) => [b.tanggalIso, b.sebab]));
    expect(per.get("2026-07-02")).toBe("HANYA_EPRESENSI");
    expect(per.get("2026-07-03")).toBe("HANYA_GAJIHUB");
  });

  it("tiap sebab punya judul & dasar hukum yang bisa ditampilkan", () => {
    for (const [sebab, teks] of Object.entries(PENJELASAN_SEBAB)) {
      expect(teks.judul.length, sebab).toBeGreaterThan(0);
      expect(teks.dasar.length, sebab).toBeGreaterThan(0);
    }
  });
});

describe("bandingkanPotongan - perakitan", () => {
  it("beberapa baris e-Presensi di tanggal yang sama DIJUMLAHKAN, bukan ditimpa", () => {
    // Penyesuaian manual ditulis sebagai baris tersendiri di sumbernya.
    const r = bandingkanPotongan({
      epresensi: [
        ep("2026-07-17", 0.02, "Potongan lupa presensi 2%"),
        ep("2026-07-17", -0.01, "penyesuaian potongan lupa presensi"),
      ],
      gajihub: [hari("2026-07-17", { kejadianTidakPresensi: 1 })],
      bobotKehadiranRupiah: null,
    });
    expect(r.baris).toHaveLength(1);
    expect(r.baris[0].epresensiPersen).toBeCloseTo(0.01, 10);
    // Sesudah penyesuaian keduanya sama - tidak lagi masuk daftar beda.
    expect(r.beda).toHaveLength(0);
  });

  it("hari yang kedua sisinya SAMA tidak masuk daftar beda", () => {
    const r = bandingkanPotongan({
      epresensi: [ep("2026-07-06", 0.01, "Potongan lupa presensi 1%")],
      gajihub: [hari("2026-07-06", { kejadianTidakPresensi: 1 })],
      bobotKehadiranRupiah: null,
    });
    expect(r.baris).toHaveLength(1);
    expect(r.beda).toHaveLength(0);
  });

  it("daftar beda diurutkan dari selisih MUTLAK terbesar", () => {
    const r = bandingkanPotongan({
      epresensi: [
        ep("2026-07-01", 0.005, "Potongan tukin harian 0.5%. Keterlambatan 62 menit."),
        ep("2026-07-02", 0.02, "Potongan lupa presensi 2%"),
      ],
      gajihub: [hari("2026-07-01", { menitTerlambat: 2 }), hari("2026-07-02", { menitTerlambat: 300 })],
      bobotKehadiranRupiah: null,
    });
    // 02/07: 3% lawan 2% -> selisih 1%. 01/07: 0,02% lawan 0,5% -> 0,48%.
    expect(r.beda[0].tanggalIso).toBe("2026-07-02");
  });

  it("rincian Gajihub memakai keluaran mesin yang membayar, lengkap dengan pasalnya", () => {
    const r = bandingkanPotongan({
      epresensi: [],
      gajihub: [hari("2026-07-20", { menitTerlambat: 30, kejadianTidakPresensi: 1 })],
      bobotKehadiranRupiah: null,
    });
    const jenis = r.baris[0].rincianGajihub.map((x) => x.dasarHukum);
    expect(jenis).toContain("Pasal 13 ayat (2)");
    expect(jenis).toContain("Pasal 13 ayat (3)");
    expect(r.baris[0].gajihubPersen).toBeCloseTo(0.013, 10);
  });

  it("total sebulan dijumlah dari kedua sisi, dan rupiahnya null tanpa kelas jabatan", () => {
    const r = bandingkanPotongan({
      epresensi: [ep("2026-07-01", 0.02, "Potongan lupa presensi 2%")],
      gajihub: [hari("2026-07-01", { kejadianTidakPresensi: 1 }), hari("2026-07-02", { menitTerlambat: 50 })],
      bobotKehadiranRupiah: null,
    });
    expect(r.totalEpresensiPersen).toBeCloseTo(0.02, 10);
    expect(r.totalGajihubPersen).toBeCloseTo(0.015, 10);
    expect(r.selisihRupiah).toBeNull();
  });
});
