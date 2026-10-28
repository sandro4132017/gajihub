import { describe, it, expect } from "vitest";
import {
  langkahTutupBulan,
  daftarLangkahTutupBulan,
  ringkasLangkah,
  daftarKartuKomponen,
  AWALAN_CATATAN_UANG_MAKAN,
  type KeadaanTutupBulan,
  type KeadaanDaftarLangkah,
} from "../langkahTutupBulan";
import { statusUnit, cekBolehKirim, TABEL_WAJIB_DIVERIFIKASI } from "../pengirimanUnit";

const lengkap: KeadaanTutupBulan = {
  totalPegawai: 47,
  jumlahRekapPresensi: 47,
  jumlahPredikat: 47,
  jumlahKalkulasi: 47,
};

describe("langkahTutupBulan", () => {
  it("menyarankan PRESENSI kalau rekap presensi belum lengkap", () => {
    const l = langkahTutupBulan({ ...lengkap, jumlahRekapPresensi: 30, jumlahPredikat: 0, jumlahKalkulasi: 0 });
    expect(l).toEqual({ jenis: "PRESENSI", sudah: 30, dari: 47 });
  });

  it("menyarankan PREDIKAT sesudah presensi lengkap", () => {
    const l = langkahTutupBulan({ ...lengkap, jumlahPredikat: 35, jumlahKalkulasi: 0 });
    expect(l).toEqual({ jenis: "PREDIKAT", sudah: 35, dari: 47 });
  });

  it("menyarankan HITUNG hanya setelah kedua bahan lengkap", () => {
    const l = langkahTutupBulan({ ...lengkap, jumlahKalkulasi: 12 });
    expect(l).toEqual({ jenis: "HITUNG", sudah: 12, dari: 47 });
  });

  /**
   * INI PENJAGA UTAMANYA, dan sebabnya nyata.
   *
   * Menghitung ulang mereset seluruh approval unit ke DRAFT. Kalau dashboard
   * menyarankan "Hitung unit" selagi presensi/predikat masih kurang, orang akan
   * menghitung, lalu bahannya lengkap, lalu menghitung lagi - dan approval yang
   * sudah dikumpulkan hilang. Biro Keuangan 7/2026: 278 baris ApprovalLog untuk
   * 47 pegawai, siklusnya terulang tiga kali.
   */
  it("TIDAK PERNAH menyarankan HITUNG selama masih ada bahan yang kurang", () => {
    const kurangPresensi = langkahTutupBulan({
      totalPegawai: 47,
      jumlahRekapPresensi: 46,
      jumlahPredikat: 47,
      jumlahKalkulasi: 0,
    });
    const kurangPredikat = langkahTutupBulan({
      totalPegawai: 47,
      jumlahRekapPresensi: 47,
      jumlahPredikat: 46,
      jumlahKalkulasi: 0,
    });
    expect(kurangPresensi?.jenis).not.toBe("HITUNG");
    expect(kurangPredikat?.jenis).not.toBe("HITUNG");
    // Presensi didahulukan karena ia yang lebih dulu di alur bulanan.
    expect(kurangPresensi?.jenis).toBe("PRESENSI");
    expect(kurangPredikat?.jenis).toBe("PREDIKAT");
  });

  it("null kalau semuanya sudah lengkap - tidak ada panel 'semua beres'", () => {
    expect(langkahTutupBulan(lengkap)).toBeNull();
  });

  it("null kalau unit tidak punya pegawai aktif", () => {
    expect(
      langkahTutupBulan({ totalPegawai: 0, jumlahRekapPresensi: 0, jumlahPredikat: 0, jumlahKalkulasi: 0 })
    ).toBeNull();
  });

  // Bisa terjadi betulan: pegawai pensiun sesudah rekapnya dibuat, jadi
  // pembaginya menyusut sementara jumlah barisnya tidak. Itu BUKAN alasan
  // menyuruh orang menarik presensi lagi.
  it("jumlah MELEBIHI total pegawai dianggap lengkap, bukan kurang", () => {
    expect(
      langkahTutupBulan({
        totalPegawai: 45,
        jumlahRekapPresensi: 47,
        jumlahPredikat: 47,
        jumlahKalkulasi: 47,
      })
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// daftarLangkahTutupBulan - lima langkah
// ---------------------------------------------------------------------------

const BELUM = statusUnit(null);
const siap: KeadaanDaftarLangkah = {
  totalPegawai: 10,
  jumlahPresensi: 10,
  jumlahPredikat: 10,
  jumlahTukin: 10,
  jumlahBasi: 0,
  jumlahUangMakan: 10,
  tabelDiverifikasi: [...TABEL_WAJIB_DIVERIFIKASI],
  status: BELUM,
};
const kosong: KeadaanDaftarLangkah = {
  ...siap,
  jumlahPresensi: 0,
  jumlahPredikat: 0,
  jumlahTukin: 0,
  jumlahUangMakan: 0,
  tabelDiverifikasi: [],
};
const status = (k: KeadaanDaftarLangkah) => daftarLangkahTutupBulan(k).map((l) => l.status);

describe("daftarLangkahTutupBulan", () => {
  it("lima langkah berurutan, presensi AKTIF, predikat boleh paralel", () => {
    const d = daftarLangkahTutupBulan(kosong);
    expect(d.map((l) => l.kode)).toEqual(["PRESENSI", "PREDIKAT", "HITUNG", "PERIKSA", "KIRIM"]);
    expect(d.map((l) => l.status)).toEqual(["AKTIF", "BISA_DIKERJAKAN", "TERKUNCI", "TERKUNCI", "TERKUNCI"]);
    expect(d[0].angka).toEqual({ x: 0, y: 10 });
    expect(d[3].angka).toEqual({ x: 0, y: TABEL_WAJIB_DIVERIFIKASI.length });
    expect(d[4].angka).toBeNull();
  });

  it("HITUNG terkunci selama presensi atau predikat kurang", () => {
    const a = daftarLangkahTutupBulan({ ...siap, jumlahPresensi: 9, jumlahTukin: 0, tabelDiverifikasi: [] });
    expect(a[2].status).toBe("TERKUNCI");
    expect(a[2].alasan).toContain("presensi");
    const b = daftarLangkahTutupBulan({ ...siap, jumlahPredikat: 9, jumlahTukin: 0, tabelDiverifikasi: [] });
    expect(b[2].status).toBe("TERKUNCI");
    expect(b[2].alasan).toContain("predikat kinerja");
    expect(b[0].status).toBe("SELESAI");
    expect(b[1].status).toBe("AKTIF");
  });

  it("HITUNG aktif begitu bahan lengkap", () => {
    const d = daftarLangkahTutupBulan({ ...siap, jumlahTukin: 4, tabelDiverifikasi: [] });
    expect(d.map((l) => l.status)).toEqual(["SELESAI", "SELESAI", "AKTIF", "TERKUNCI", "TERKUNCI"]);
  });

  it("angka basi menahan langkah 3 dan diberi catatan", () => {
    const d = daftarLangkahTutupBulan({ ...siap, jumlahBasi: 2, tabelDiverifikasi: [] });
    expect(d[2].status).toBe("AKTIF");
    expect(d[2].catatan).toEqual(["2 angka perlu dihitung ulang"]);
    expect(d[3].status).toBe("TERKUNCI");
  });

  it("PERIKSA terkunci sebelum HITUNG selesai, lalu AKTIF", () => {
    const terkunci = daftarLangkahTutupBulan({ ...siap, jumlahTukin: 5, tabelDiverifikasi: [] });
    expect(terkunci[3].status).toBe("TERKUNCI");
    expect(terkunci[3].alasan).toBeTruthy();
    const d = daftarLangkahTutupBulan({ ...siap, tabelDiverifikasi: ["TUKIN"] });
    expect(d[3].status).toBe("AKTIF");
    expect(d[3].angka).toEqual({ x: 1, y: TABEL_WAJIB_DIVERIFIKASI.length });
  });

  it("KIRIM memakai alasan cekBolehKirim apa adanya", () => {
    const k = { ...siap, tabelDiverifikasi: ["TUKIN" as const] };
    const d = daftarLangkahTutupBulan(k);
    const cek = cekBolehKirim(
      { totalPegawai: 10, jumlahKalkulasi: 10, jumlahBasi: 0, tabelDiverifikasi: k.tabelDiverifikasi },
      BELUM
    );
    expect(d[4].status).toBe("TERKUNCI");
    expect(d[4].alasan).toBe(cek.alasan);
    const basi = daftarLangkahTutupBulan({ ...siap, jumlahBasi: 3 });
    expect(basi[4].alasan).toContain("3 pegawai angkanya sudah basi");
  });

  it("semua selesai di sisi Kasubag -> KIRIM AKTIF", () => {
    const d = daftarLangkahTutupBulan(siap);
    expect(d.map((l) => l.status)).toEqual(["SELESAI", "SELESAI", "SELESAI", "SELESAI", "AKTIF"]);
    expect(d[4].alasan).toBeUndefined();
  });

  it("TERKIRIM -> semua SELESAI walau angka bergeser", () => {
    const d = daftarLangkahTutupBulan({
      ...kosong,
      jumlahBasi: 4,
      status: statusUnit({ status: "TERKIRIM", dikirimPada: new Date(), alasanKembali: null }),
    });
    expect(d.every((l) => l.status === "SELESAI")).toBe(true);
    expect(ringkasLangkah(d)).toMatchObject({ selesai: 5, total: 5, aktif: null });
  });

  it("DIKEMBALIKAN -> KIRIM AKTIF dengan alasan pengembalian di catatan", () => {
    const d = daftarLangkahTutupBulan({
      ...siap,
      status: statusUnit({ status: "DIKEMBALIKAN", dikirimPada: new Date(), alasanKembali: "Periksa ulang kelas" }),
    });
    expect(d[4].status).toBe("AKTIF");
    expect(d[4].catatan?.[0]).toContain("Periksa ulang kelas");
    const timpa = daftarLangkahTutupBulan({
      ...siap,
      alasanKembali: "Alasan lain",
      status: statusUnit({ status: "DIKEMBALIKAN", dikirimPada: new Date(), alasanKembali: "Periksa ulang kelas" }),
    });
    expect(timpa[4].catatan?.[0]).toContain("Alasan lain");
  });

  it("total 0 -> semua TIDAK_BERLAKU, nol AKTIF", () => {
    const d = daftarLangkahTutupBulan({ ...kosong, totalPegawai: 0 });
    expect(d.every((l) => l.status === "TIDAK_BERLAKU")).toBe(true);
    expect(ringkasLangkah(d)).toEqual({ selesai: 0, total: 0, aktif: null });
  });

  it("uang makan kurang dari tukin hanya catatan, tidak menahan selesai", () => {
    const d = daftarLangkahTutupBulan({ ...siap, jumlahUangMakan: 8 });
    expect(d[2].status).toBe("SELESAI");
    expect(d[2].catatan).toEqual(["uang makan 8/10 belum terhitung - periksa golongan"]);
    // Penampil menempelkan tautan uang makan lewat awalan ini - kalau bunyi
    // catatannya berubah, test ini yang patah, bukan tautannya yang hilang diam-diam.
    expect(d[2].catatan?.[0].startsWith(AWALAN_CATATAN_UANG_MAKAN)).toBe(true);
  });

  it("lembur bukan langkah sendiri; tabelnya hanya bagian PERIKSA", () => {
    const d = daftarLangkahTutupBulan(siap);
    expect(d).toHaveLength(5);
    expect(d.some((l) => /lembur/i.test(l.judul))).toBe(false);
    expect(TABEL_WAJIB_DIVERIFIKASI).toContain("UANG_LEMBUR");
  });

  it("tepat satu AKTIF di setiap tahap, nol bila semua selesai", () => {
    const tahap: KeadaanDaftarLangkah[] = [
      kosong,
      { ...kosong, jumlahPresensi: 10 },
      { ...kosong, jumlahPresensi: 10, jumlahPredikat: 10 },
      { ...siap, tabelDiverifikasi: [] },
      siap,
    ];
    for (const t of tahap) {
      expect(status(t).filter((s) => s === "AKTIF")).toHaveLength(1);
    }
    expect(ringkasLangkah(daftarLangkahTutupBulan(siap)).aktif?.kode).toBe("KIRIM");
  });

  it("ringkasLangkah menghitung selesai dan aktif", () => {
    const r = ringkasLangkah(daftarLangkahTutupBulan({ ...siap, tabelDiverifikasi: [] }));
    expect(r.selesai).toBe(3);
    expect(r.total).toBe(5);
    expect(r.aktif?.kode).toBe("PERIKSA");
  });
});

// ---------------------------------------------------------------------------
// daftarKartuKomponen - deret kartu di kartu sambutan
// ---------------------------------------------------------------------------

describe("daftarKartuKomponen", () => {
  const tambahan = { jumlahLembur: 3, tampilkanLembur: true };
  const belumSelesai = (k: KeadaanDaftarLangkah, t = tambahan) =>
    daftarKartuKomponen({ ...k, ...t }).filter((c) => !c.selesai).map((c) => c.kode);

  it("urutan tetap: presensi, kinerja, Tukin, uang makan, uang lembur", () => {
    expect(daftarKartuKomponen({ ...kosong, ...tambahan }).map((c) => c.kode)).toEqual([
      "PRESENSI",
      "KINERJA",
      "TUKIN",
      "UANG_MAKAN",
      "UANG_LEMBUR",
    ]);
  });

  it("yang selesai mundur dari antrean - presensi lengkap membuat kinerja maju ke depan", () => {
    expect(belumSelesai({ ...kosong, jumlahPresensi: 10 })).toEqual(["KINERJA", "TUKIN", "UANG_MAKAN", "UANG_LEMBUR"]);
  });

  it("angka basi menahan Tukin, uang makan, dan lembur", () => {
    expect(belumSelesai({ ...siap, jumlahBasi: 1 })).toEqual(["TUKIN", "UANG_MAKAN", "UANG_LEMBUR"]);
  });

  it("uang makan yang kurang (golongan tak dikenali) tetap tampil walau Tukin lengkap", () => {
    expect(belumSelesai({ ...siap, jumlahUangMakan: 8 })).toEqual(["UANG_MAKAN"]);
  });

  it("semua lengkap -> tidak ada kartu tersisa", () => {
    expect(belumSelesai(siap)).toEqual([]);
  });

  it("TERKIRIM -> semua selesai walau angkanya bergeser", () => {
    const terkirim = statusUnit({ status: "TERKIRIM", dikirimPada: new Date(), alasanKembali: null });
    expect(belumSelesai({ ...kosong, status: terkirim })).toEqual([]);
  });

  it("tanpa pegawai ikut -> tidak ada kartu", () => {
    expect(daftarKartuKomponen({ ...kosong, totalPegawai: 0, ...tambahan })).toEqual([]);
  });

  it("lembur tunduk saklar menu dan tidak punya pembagi", () => {
    expect(belumSelesai(kosong, { jumlahLembur: 0, tampilkanLembur: false })).not.toContain("UANG_LEMBUR");
    const lembur = daftarKartuKomponen({ ...kosong, ...tambahan }).find((c) => c.kode === "UANG_LEMBUR");
    expect(lembur?.y).toBeNull();
  });
});
