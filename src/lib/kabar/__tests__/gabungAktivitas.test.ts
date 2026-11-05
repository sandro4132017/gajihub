import { describe, expect, it } from "vitest";
import { gabungBerurutan, potongBatasHalaman, rekapMenungguProses } from "../gabungAktivitas";
import type { BarisAktivitasMentah } from "../gabungAktivitas";

const dasar = new Date("2026-11-05T05:00:00Z").getTime(); // 12.00 WIB

function baris(i: number, menitLalu: number, o: Partial<BarisAktivitasMentah> = {}): BarisAktivitasMentah {
  return {
    id: `id-${i}`,
    entitas: "verifikasi_tabel_unit",
    teks: "Mencentang Tabel Tukin September 2026 sudah diperiksa",
    jenis: "ubah",
    kunciGabung: "verifikasi_tabel_unit:9/2026",
    aktor: "Aktor Palsu",
    satuanKerja: "Biro Contoh",
    waktu: new Date(dasar - menitLalu * 60_000),
    href: null,
    periode: { bulan: 9, tahun: 2026 },
    jenisTabel: "TUKIN",
    ...o,
  };
}

describe("gabungBerurutan", () => {
  it("menggabungkan verifikasi bersebelahan dan menghitung tabel berbeda", () => {
    const g = gabungBerurutan([
      baris(1, 0, { jenisTabel: "TUKIN" }),
      baris(2, 2, { jenisTabel: "UANG_LEMBUR" }),
      baris(3, 4, { jenisTabel: "TUKIN" }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].jumlah).toBe(3);
    expect(g[0].teks).toBe("Memeriksa 2 tabel rekap September 2026 · 3 kali ubah centang");
    expect(g[0].id).toBe("id-1");
    expect(g[0].idTertua).toBe("id-3");
  });

  it("batas jarak 15 menit", () => {
    expect(gabungBerurutan([baris(1, 0), baris(2, 16)])).toHaveLength(2);
    expect(gabungBerurutan([baris(1, 0), baris(2, 15)])).toHaveLength(1);
  });

  it("tidak menggabungkan beda aktor, beda unit, atau beda kunci objek", () => {
    expect(gabungBerurutan([baris(1, 0), baris(2, 1, { aktor: "Lain" })])).toHaveLength(2);
    expect(gabungBerurutan([baris(1, 0), baris(2, 1, { satuanKerja: "Biro Lain" })])).toHaveLength(2);
    expect(gabungBerurutan([baris(1, 0), baris(2, 1, { kunciGabung: "verifikasi_tabel_unit:8/2026" })])).toHaveLength(2);
  });

  it("tidak menggabungkan baris yang tidak bersebelahan", () => {
    const g = gabungBerurutan([baris(1, 0), baris(2, 1, { entitas: "x", kunciGabung: "x" }), baris(3, 2)]);
    expect(g).toHaveLength(3);
  });

  it("tidak menggabungkan lintas hari WIB walau selisihnya semenit", () => {
    // 17.00 UTC = 00.00 WIB hari berikutnya; 16.59 UTC = 23.59 WIB.
    const a = baris(1, 0, { waktu: new Date("2026-11-05T17:00:00Z") });
    const b = baris(2, 0, { waktu: new Date("2026-11-05T16:59:00Z") });
    expect(gabungBerurutan([a, b])).toHaveLength(2);
  });

  it("PengirimanUnit tidak pernah digabung", () => {
    const k = (i: number, m: number) =>
      baris(i, m, { entitas: "PengirimanUnit", kunciGabung: "PengirimanUnit:KIRIM:9/2026", teks: "Mengirim rekap" });
    expect(gabungBerurutan([k(1, 0), k(2, 1)])).toHaveLength(2);
  });

  it("entitas lain diberi akhiran jumlah kali", () => {
    const k = (i: number, m: number) =>
      baris(i, m, { entitas: "tukin_calculation", kunciGabung: "s", teks: "Menyinkronkan hasil kalkulasi Tukin", jenis: "sistem" });
    const g = gabungBerurutan([k(1, 0), k(2, 1), k(3, 2)]);
    expect(g[0].teks).toBe("Menyinkronkan hasil kalkulasi Tukin · 3 kali");
    expect(g[0].jenis).toBe("sistem");
  });

  it("baris tunggal memakai teks apa adanya", () => {
    expect(gabungBerurutan([baris(1, 0)])[0].teks).toBe("Mencentang Tabel Tukin September 2026 sudah diperiksa");
  });
});

describe("potongBatasHalaman", () => {
  const grup = gabungBerurutan([
    baris(1, 0, { kunciGabung: "a" }),
    baris(2, 60, { kunciGabung: "b" }),
    baris(3, 120, { kunciGabung: "c" }),
  ]);

  it("batch tidak penuh: semua grup, tanpa kursor", () => {
    const h = potongBatasHalaman(grup, false);
    expect(h.grup).toHaveLength(3);
    expect(h.kursorBerikut).toBeNull();
  });

  it("batch penuh: grup terakhir dibuang, kursor = baris tertua grup yang dipakai", () => {
    const h = potongBatasHalaman(grup, true);
    expect(h.grup.map((g) => g.id)).toEqual(["id-1", "id-2"]);
    expect(h.kursorBerikut).toEqual({ waktu: grup[1].waktuAwal, id: "id-2" });
  });

  it("batch satu grup tetap maju", () => {
    const satu = gabungBerurutan([baris(1, 0), baris(2, 1)]);
    const h = potongBatasHalaman(satu, true);
    expect(h.grup).toHaveLength(1);
    expect(h.kursorBerikut).toEqual({ waktu: satu[0].waktuAwal, id: "id-2" });
  });

  it("kosong aman", () => {
    expect(potongBatasHalaman([], true)).toEqual({ grup: [], kursorBerikut: null });
  });
});

describe("rekapMenungguProses", () => {
  const kirim = new Date("2026-11-01T01:00:00Z");
  const sesudah = new Date("2026-11-02T01:00:00Z");
  const sebelum = new Date("2026-10-31T01:00:00Z");
  const k = (satuanKerja: string, bulan = 9) => ({ satuanKerja, bulan, tahun: 2026, dikirimPada: kirim });

  it("tanpa ekspor: semua unit menunggu, dikelompokkan per periode", () => {
    expect(rekapMenungguProses([k("A"), k("B"), k("C", 8)], [])).toEqual([
      { bulan: 9, tahun: 2026, jumlahUnit: 2 },
      { bulan: 8, tahun: 2026, jumlahUnit: 1 },
    ]);
  });

  it("ekspor semua unit terkirim sesudah kirim menuntaskan semua unit periode itu", () => {
    const e = [{ entitasId: "tukin-9-2026", satuanKerja: "semua unit terkirim", timestamp: sesudah }];
    expect(rekapMenungguProses([k("A"), k("B")], e)).toEqual([]);
  });

  it("ekspor persis satu unit hanya menuntaskan unit itu", () => {
    const e = [{ entitasId: "uang-makan-9-2026", satuanKerja: "A", timestamp: sesudah }];
    expect(rekapMenungguProses([k("A"), k("B")], e)).toEqual([{ bulan: 9, tahun: 2026, jumlahUnit: 1 }]);
  });

  it("ekspor Uang Lembur tidak dianggap memproses (ditunda)", () => {
    const e = [{ entitasId: "uang-lembur-9-2026", satuanKerja: "semua unit terkirim", timestamp: sesudah }];
    expect(rekapMenungguProses([k("A")], e)).toEqual([{ bulan: 9, tahun: 2026, jumlahUnit: 1 }]);
  });

  it("ekspor sebelum kirim atau periode lain tidak dihitung; bulan 12 tidak tertukar dengan 2", () => {
    const e = [
      { entitasId: "tukin-9-2026", satuanKerja: "semua unit terkirim", timestamp: sebelum },
      { entitasId: "tukin-8-2026", satuanKerja: "semua unit terkirim", timestamp: sesudah },
      { entitasId: "tukin-12-2026", satuanKerja: "semua unit terkirim", timestamp: sesudah },
    ];
    expect(rekapMenungguProses([k("A"), k("B", 2)], e)).toHaveLength(2);
  });
});
