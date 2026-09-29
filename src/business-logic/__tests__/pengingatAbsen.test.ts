import { describe, it, expect } from "vitest";
import {
  BATAS_NAMA_PER_PESAN,
  STATUS_BERKETERANGAN,
  jamTeksDariMenit,
  pesanCheckin,
  pesanCheckout,
  susunDaftarPengingat,
  type KetukanPegawai,
  type PegawaiUnit,
} from "../pengingatAbsen";

const TANGGAL = "Selasa, 29 September 2026";
const RABU = 3;
const JUMAT = 5;
const SABTU = 6;

const jm = (j: number, m: number) => j * 60 + m;

function orang(n: number): PegawaiUnit[] {
  return Array.from({ length: n }, (_, i) => ({ nip: `nip${i}`, nama: `Pegawai ${i}` }));
}

function ketukan(p: Partial<KetukanPegawai> = {}): KetukanPegawai {
  return { status: "WFO", jamMasukMenit: null, jamKeluarMenit: null, ...p };
}

describe("susunDaftarPengingat", () => {
  it("tidak punya baris sama sekali -> masuk belumCheckin", () => {
    const d = susunDaftarPengingat({ roster: orang(3), perNip: new Map(), indeksHari: RABU });
    expect(d.belumCheckin).toEqual(["Pegawai 0", "Pegawai 1", "Pegawai 2"]);
    expect(d.sudahCheckin).toBe(0);
  });

  it("punya baris tapi jam masuk kosong -> tetap belumCheckin", () => {
    const perNip = new Map([["nip0", ketukan({ jamMasukMenit: null })]]);
    const d = susunDaftarPengingat({ roster: orang(1), perNip, indeksHari: RABU });
    expect(d.belumCheckin).toEqual(["Pegawai 0"]);
  });

  it("berstatus cuti/dinas/diklat DILEWATI, tidak masuk daftar mana pun", () => {
    const perNip = new Map<string, KetukanPegawai>([
      ["nip0", ketukan({ status: "Cuti" })],
      ["nip1", ketukan({ status: "Dinas Keluar" })],
      ["nip2", ketukan({ status: "Diklat" })],
      ["nip3", ketukan({ status: "Tugas Belajar" })],
      ["nip4", ketukan({ status: "Izin" })],
    ]);
    const d = susunDaftarPengingat({ roster: orang(5), perNip, indeksHari: RABU });
    expect(d.belumCheckin).toEqual([]);
    expect(d.belumCheckout).toEqual([]);
    expect(d.berketerangan).toBe(5);
  });

  it("sudah masuk belum pulang -> belumCheckout, dengan jam boleh pulang", () => {
    // Masuk 07:30 + 7,5 jam + 60 menit istirahat = 16:00.
    const perNip = new Map([["nip0", ketukan({ jamMasukMenit: jm(7, 30) })]]);
    const d = susunDaftarPengingat({ roster: orang(1), perNip, indeksHari: RABU });
    expect(d.belumCheckout).toEqual([{ nama: "Pegawai 0", bolehPulang: "16:00" }]);
    expect(d.belumCheckin).toEqual([]);
    expect(d.sudahCheckin).toBe(1);
  });

  it("jam boleh pulang BERGESER mengikuti jam kedatangan", () => {
    const perNip = new Map([["nip0", ketukan({ jamMasukMenit: jm(9, 10) })]]);
    const d = susunDaftarPengingat({ roster: orang(1), perNip, indeksHari: RABU });
    // Datang 09:10 -> harus pulang 17:40, tapi dicap di 16:00 + toleransi 60.
    expect(d.belumCheckout[0].bolehPulang).toBe("17:00");
  });

  it("Jumat istirahatnya 90 menit, jadi jam boleh pulangnya berbeda", () => {
    const perNip = new Map([["nip0", ketukan({ jamMasukMenit: jm(7, 30) })]]);
    const d = susunDaftarPengingat({ roster: orang(1), perNip, indeksHari: JUMAT });
    expect(d.belumCheckout[0].bolehPulang).toBe("16:30");
  });

  it("sudah masuk DAN sudah pulang -> tidak masuk daftar mana pun", () => {
    const perNip = new Map([["nip0", ketukan({ jamMasukMenit: jm(7, 30), jamKeluarMenit: jm(16, 5) })]]);
    const d = susunDaftarPengingat({ roster: orang(1), perNip, indeksHari: RABU });
    expect(d.belumCheckin).toEqual([]);
    expect(d.belumCheckout).toEqual([]);
  });

  it("hari libur: yang sudah tap TIDAK ditagih checkout - tidak ada kewajibannya", () => {
    const perNip = new Map([["nip0", ketukan({ status: "Lembur", jamMasukMenit: jm(9, 0) })]]);
    const d = susunDaftarPengingat({ roster: orang(1), perNip, indeksHari: SABTU });
    expect(d.belumCheckout).toEqual([]);
    expect(d.sudahCheckin).toBe(1);
  });

  it("status di luar daftar berketerangan tetap ditagih - mis. Lembur di hari kerja", () => {
    const perNip = new Map([["nip0", ketukan({ status: "Lembur", jamMasukMenit: jm(7, 30) })]]);
    const d = susunDaftarPengingat({ roster: orang(1), perNip, indeksHari: RABU });
    expect(d.belumCheckout).toHaveLength(1);
  });

  it("sekarangMenit MENYARING yang belum boleh pulang - tidak menamai orang tanpa sebab", () => {
    const perNip = new Map([
      ["nip0", ketukan({ jamMasukMenit: jm(7, 30) })], // boleh pulang 16:00
      ["nip1", ketukan({ jamMasukMenit: jm(9, 10) })], // boleh pulang 17:00
    ]);
    // Pukul 16:05 - yang pertama sudah boleh pulang, yang kedua belum.
    const d = susunDaftarPengingat({
      roster: orang(2),
      perNip,
      indeksHari: RABU,
      sekarangMenit: jm(16, 5),
    });
    expect(d.belumCheckout.map((b) => b.nama)).toEqual(["Pegawai 0"]);
  });

  it("tanpa sekarangMenit, semua yang belum tap pulang ikut", () => {
    const perNip = new Map([
      ["nip0", ketukan({ jamMasukMenit: jm(7, 30) })],
      ["nip1", ketukan({ jamMasukMenit: jm(9, 10) })],
    ]);
    const d = susunDaftarPengingat({ roster: orang(2), perNip, indeksHari: RABU });
    expect(d.belumCheckout).toHaveLength(2);
  });

  it("tepat pada jam boleh pulang sudah IKUT - bukan harus lewat dulu", () => {
    const perNip = new Map([["nip0", ketukan({ jamMasukMenit: jm(7, 30) })]]);
    const d = susunDaftarPengingat({
      roster: orang(1),
      perNip,
      indeksHari: RABU,
      sekarangMenit: jm(16, 0),
    });
    expect(d.belumCheckout).toHaveLength(1);
  });

  it("STATUS_BERKETERANGAN memuat semua status yang tidak boleh ditagih", () => {
    // Kalau salah satu hilang, orangnya masuk daftar nama di grup padahal
    // sedang cuti atau dinas resmi.
    expect([...STATUS_BERKETERANGAN]).toEqual(["Cuti", "Dinas Keluar", "Diklat", "Tugas Belajar", "Izin"]);
  });
});

describe("jamTeksDariMenit", () => {
  it("dua digit, dan lewat tengah malam dibungkus", () => {
    expect(jamTeksDariMenit(jm(8, 5))).toBe("08:05");
    expect(jamTeksDariMenit(jm(16, 0))).toBe("16:00");
    expect(jamTeksDariMenit(jm(24, 30))).toBe("00:30");
  });
});

describe("pesanCheckin - bentuknya dikunci template user", () => {
  const d = susunDaftarPengingat({ roster: orang(3), perNip: new Map(), indeksHari: RABU });

  it("kepala, tanggal, daftar berbintang, batas, penutup", () => {
    const teks = pesanCheckin({ tanggalTeks: TANGGAL, batasJam: "08:30", d })!;
    expect(teks).toContain("*Pengingat Absen Harian by Gajihub*");
    expect(teks).toContain(TANGGAL);
    expect(teks).toContain("Pegawai yang belum melakukan jam checkin:");
    expect(teks).toContain("* Pegawai 0");
    expect(teks).toContain("Batas tap masuk *08:30*.");
  });

  it("kalimat penutup WAJIB ADA - tanpanya daftar nama ini jadi tuduhan", () => {
    // Orang yang cuti resmi tapi cutinya belum masuk e-Presensi akan terbaca
    // membolos di depan seluruh unitnya.
    const teks = pesanCheckin({ tanggalTeks: TANGGAL, batasJam: "08:30", d })!;
    expect(teks).toContain("Bagi yang sedang cuti, dinas, atau diklat silakan abaikan pesan ini.");
  });

  it("daftar KOSONG -> null, tidak ada pesan yang dikirim", () => {
    // Pesan berisi daftar kosong mengajari orang mengabaikan pengingat ini.
    const kosong = susunDaftarPengingat({ roster: [], perNip: new Map(), indeksHari: RABU });
    expect(pesanCheckin({ tanggalTeks: TANGGAL, batasJam: "08:30", d: kosong })).toBeNull();
  });

  it(`lebih dari ${BATAS_NAMA_PER_PESAN} nama dipotong, sisanya DISEBUT jumlahnya`, () => {
    const banyak = susunDaftarPengingat({
      roster: orang(BATAS_NAMA_PER_PESAN + 7),
      perNip: new Map(),
      indeksHari: RABU,
    });
    const teks = pesanCheckin({ tanggalTeks: TANGGAL, batasJam: "08:30", d: banyak })!;
    expect(teks).toContain("_...dan 7 pegawai lainnya_");
    expect(teks.split("\n").filter((b) => b.startsWith("* "))).toHaveLength(BATAS_NAMA_PER_PESAN);
  });

  it("hanya memakai penanda format yang DIKENALI WhatsApp", () => {
    const teks = pesanCheckin({ tanggalTeks: TANGGAL, batasJam: "08:30", d })!;
    expect(teks).not.toMatch(/^#/m);
    expect(teks).not.toMatch(/\[.+\]\(.+\)/);
  });
});

describe("pesanCheckout", () => {
  const perNip = new Map([
    ["nip0", ketukan({ jamMasukMenit: jm(7, 30) })],
    ["nip1", ketukan({ jamMasukMenit: jm(8, 0) })],
  ]);
  const d = susunDaftarPengingat({ roster: orang(2), perNip, indeksHari: RABU });

  it("menyebut nama beserta jam boleh pulangnya", () => {
    const teks = pesanCheckout({ tanggalTeks: TANGGAL, d })!;
    expect(teks).toContain("Pegawai yang belum melakukan jam checkout:");
    expect(teks).toContain("* Pegawai 0 - boleh pulang 16:00");
    // Datang 08:00 -> 08:00 + 7,5 jam + 60 menit istirahat = 16:30. Jam boleh
    // pulang memang BERGESER mengikuti kedatangan, tidak tetap 16:00.
    expect(teks).toContain("* Pegawai 1 - boleh pulang 16:30");
  });

  it("TIDAK memuat baris batas tap masuk - itu urusan pesan checkin", () => {
    const teks = pesanCheckout({ tanggalTeks: TANGGAL, d })!;
    expect(teks).not.toContain("Batas tap masuk");
  });

  it("penutupnya sama, dan tetap wajib", () => {
    const teks = pesanCheckout({ tanggalTeks: TANGGAL, d })!;
    expect(teks).toContain("Bagi yang sedang cuti, dinas, atau diklat silakan abaikan pesan ini.");
  });

  it("semua sudah tap pulang -> null", () => {
    const beres = susunDaftarPengingat({
      roster: orang(1),
      perNip: new Map([["nip0", ketukan({ jamMasukMenit: jm(7, 30), jamKeluarMenit: jm(16, 10) })]]),
      indeksHari: RABU,
    });
    expect(pesanCheckout({ tanggalTeks: TANGGAL, d: beres })).toBeNull();
  });
});
