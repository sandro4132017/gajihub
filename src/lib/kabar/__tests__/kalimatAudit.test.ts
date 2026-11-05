import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ambilDataAman,
  jelaskanAudit,
  rapikanNamaEntitas,
  samarkanAngkaPanjang,
} from "../kalimatAudit";

describe("samarkanAngkaPanjang", () => {
  it("mengganti deret >= 9 digit dan membiarkan angka pendek", () => {
    expect(samarkanAngkaPanjang("NIP 198100000000000000 salah, bulan 9")).toBe("NIP … salah, bulan 9"); // sensitive-ok
    expect(samarkanAngkaPanjang("12345678 lolos")).toBe("12345678 lolos");
  });

  it("menyamarkan deret berpemisah yang total digitnya >= 9", () => {
    expect(samarkanAngkaPanjang("NIP 1990 0101 2015 01 1 001 salah")).toBe("NIP … salah"); // sensitive-ok
    expect(samarkanAngkaPanjang("rekening 123.456.789.0 keliru")).toBe("rekening … keliru"); // sensitive-ok
    expect(samarkanAngkaPanjang("NIP 1990-0101-2015-0110 salah")).toBe("NIP … salah"); // sensitive-ok
  });

  it("tidak menyentuh bulan-tahun, cacah, dan tanggal", () => {
    for (const aman of [
      "Rekap Oktober 2026",
      "47 pegawai diperiksa",
      "Tanggal 14/10/2026 libur",
      "Dibuat 2026-11-05 14.05 oleh sistem",
      "Periode 9 2026 selesai",
    ]) {
      expect(samarkanAngkaPanjang(aman), aman).toBe(aman);
    }
  });

  it("memotong pada 140 karakter dan menutup dengan elipsis", () => {
    const hasil = samarkanAngkaPanjang("a".repeat(300));
    expect(hasil.length).toBe(140);
    expect(hasil.endsWith("…")).toBe(true);
  });
});

describe("ambilDataAman", () => {
  it("hanya meloloskan kunci daftar putih bertipe skalar", () => {
    const hasil = ambilDataAman({
      periode: "9/2026",
      nip: "000000000000000001", // sensitive-ok
      nama: "Nama Palsu",
      honorarium: 12345,
      nipTanpaPredikat: ["x"],
      rekeningTukin: "abc",
      nomorSk: "SK/1",
      kelasJabatan: 9,
      jamMasuk: "07:00",
      hasilKalkulasi: { a: 1 },
      jumlahPegawai: 4,
      alasanKembali: "Cek 198100000000000000 lagi", // sensitive-ok
    });
    expect(Object.keys(hasil).sort()).toEqual(["alasanKembali", "jumlahPegawai", "periode"]);
    expect(hasil.alasanKembali).toBe("Cek … lagi");
  });

  it("menggabungkan dataSesudah lalu dataSebelum tanpa menimpa", () => {
    expect(ambilDataAman({ mode: "A" }, { mode: "B", periode: "1/2026" })).toEqual({ mode: "A", periode: "1/2026" });
  });

  it("aman terhadap null, array, dan tipe aneh", () => {
    expect(ambilDataAman(null, undefined, [1], "x", 5)).toEqual({});
  });
});

describe("jelaskanAudit", () => {
  const j = (entitas: string, aksi: string, entitasId: string, data: Record<string, unknown> = {}) =>
    jelaskanAudit({ entitas, aksi, entitasId, dataAman: ambilDataAman(data) });

  it("kirim rekap: periode dari dua segmen terakhir, unit tidak ikut di teks", () => {
    const h = j("PengirimanUnit", "KIRIM", "Biro Contoh|9|2026");
    expect(h.teks).toBe("Mengirim rekap September 2026 ke PPABP");
    expect(h.jenis).toBe("kirim");
    expect(h.periode).toEqual({ bulan: 9, tahun: 2026 });
  });

  it("kembalikan rekap menampilkan alasan yang disamarkan", () => {
    const h = j("PengirimanUnit", "KEMBALIKAN", "Biro Contoh|10|2026", {
      alasanKembali: "Periksa 198100000000000000 dulu", // sensitive-ok
    });
    expect(h.jenis).toBe("kembalikan");
    expect(h.teks).toBe("Mengembalikan rekap Oktober 2026 - alasan: Periksa … dulu");
  });

  it("verifikasi tabel: satker bertanda hubung tidak merusak periode, CREATE/DELETE satu kunci", () => {
    const a = j("verifikasi_tabel_unit", "CREATE", "Biro Sumber-Daya-9-2026-TUKIN");
    const b = j("verifikasi_tabel_unit", "DELETE", "Biro Sumber-Daya-9-2026-UANG_LEMBUR");
    expect(a.teks).toBe("Mencentang Tabel Tukin September 2026 sudah diperiksa");
    expect(b.teks).toBe("Mencabut centang Tabel Jam Lembur September 2026");
    expect(a.jenisTabel).toBe("TUKIN");
    expect(a.kunciGabung).toBe(b.kunciGabung);
  });

  it("pengecualian pegawai: NIP dibuang dari teks", () => {
    const h = j("pengecualian_pegawai", "CREATE", "198100000000000000|9|2026", { alasanLabel: "Cuti besar" }); // sensitive-ok
    expect(h.teks).toBe("Mengecualikan seorang pegawai dari perhitungan September 2026 - Cuti besar");
    expect(h.teks).not.toMatch(/\d{9,}/);
  });

  it("koreksi presensi: NIP dibuang, periode dari tanggal di ujung", () => {
    const h = j("koreksi_presensi_harian", "CREATE", "198100000000000000-2026-09-14"); // sensitive-ok
    expect(h.teks).toBe("Mengoreksi jam presensi September 2026");
    expect(h.periode).toEqual({ bulan: 9, tahun: 2026 });
  });

  it("predikat: unggah periode, hapus periode, dan satuan", () => {
    expect(j("predikat_kinerja", "CREATE", "9/2026").teks).toBe("Mengunggah predikat kinerja September 2026");
    expect(j("predikat_kinerja", "DELETE", "hapus-periode-Biro Contoh-8-2026").teks).toBe(
      "Menghapus predikat kinerja satu unit Agustus 2026"
    );
    expect(j("predikat_kinerja", "CREATE", "id-satu").teks).toBe("Menambah predikat kinerja");
  });

  it("ekspor ADK: jenis dari data, periode tanpa nol depan", () => {
    const h = j("export_adk", "EXPORT", "tukin-9-2026", { jenis: "Tukin" });
    expect(h.teks).toBe("Mengunduh berkas ADK Tukin September 2026");
    expect(h.jenis).toBe("ekspor");
  });

  it("SYNC otomatis berjenis sistem dan satu kunci per entitas", () => {
    const a = j("tukin_calculation", "SYNC", "id-1");
    const b = j("tukin_calculation", "SYNC", "id-2");
    expect(a.jenis).toBe("sistem");
    expect(a.kunciGabung).toBe(b.kunciGabung);
  });

  it("entitas tak dikenal jatuh ke kalimat manusiawi", () => {
    const h = j("PengirimanBaru", "CREATE", "x");
    expect(h.teks).toBe("Menambah pengiriman baru");
    expect(h.cadangan).toBe(true);
    expect(rapikanNamaEntitas("hari_libur")).toBe("hari libur");
  });
});

// Pagar: setiap entitas yang ditulis ke AuditTrail di src/ harus punya kalimat
// berlabel. Entitas baru tanpa label membuat test ini gagal, bukan diam-diam
// tampil sebagai "Mengubah <nama tabel>".
const PASANGAN_BERLABEL: Record<string, string[]> = {
  PengirimanUnit: ["KIRIM", "KEMBALIKAN"],
  verifikasi_tabel_unit: ["CREATE", "DELETE"],
  tukin_calculation: ["SYNC", "CREATE", "UPDATE"],
  uang_makan: ["SYNC", "UPDATE"],
  uang_lembur: ["SYNC", "UPDATE"],
  pegawai: ["UPDATE", "DELETE"],
  app_user: ["UPDATE", "CREATE"],
  sk_grade: ["CREATE", "DELETE"],
  sinkronisasi_pegawai: ["SYNC"],
  pengecualian_pegawai: ["CREATE", "DELETE"],
  rekening_pegawai: ["CREATE"],
  reconciliation_status: ["UPDATE"],
  mode_jaringan: ["UPDATE"],
  identitas_web_gaji: ["IMPORT"],
  dokumen_tte: ["DELETE"],
  predikat_kinerja: ["CREATE", "UPDATE", "DELETE"],
  koreksi_presensi_harian: ["CREATE", "UPDATE", "DELETE"],
  kendala_epresensi: ["CREATE", "DELETE"],
  hari_libur_nasional: ["CREATE", "UPDATE", "DELETE"],
  gaji_induk: ["CREATE", "UPDATE"],
  export_adk: ["EXPORT"],
};

function kumpulkanBerkas(dir: string, hasil: string[] = []): string[] {
  for (const nama of readdirSync(dir)) {
    if (nama === "node_modules" || nama === "__tests__") continue;
    const p = join(dir, nama);
    if (statSync(p).isDirectory()) kumpulkanBerkas(p, hasil);
    else if (/\.(ts|tsx)$/.test(nama)) hasil.push(p);
  }
  return hasil;
}

describe("pagar entitas AuditTrail", () => {
  const ditulis = new Set<string>();
  for (const berkas of kumpulkanBerkas(join(__dirname, "..", "..", ".."))) {
    const isi = readFileSync(berkas, "utf8");
    if (!/auditTrail\.(create|createMany)/.test(isi)) continue;
    for (const m of isi.matchAll(/entitas:\s*"([A-Za-z_]+)"/g)) ditulis.add(m[1]);
  }

  it("menemukan entitas yang ditulis", () => {
    expect(ditulis.size).toBeGreaterThan(10);
  });

  it("setiap entitas yang ditulis punya label di daftar pasangan", () => {
    const tanpaLabel = [...ditulis].filter((e) => !(e in PASANGAN_BERLABEL));
    expect(tanpaLabel).toEqual([]);
  });

  it("setiap pasangan berlabel tidak jatuh ke kalimat cadangan", () => {
    for (const [entitas, daftarAksi] of Object.entries(PASANGAN_BERLABEL)) {
      for (const aksi of daftarAksi) {
        const h = jelaskanAudit({ entitas, aksi, entitasId: "x", dataAman: {} });
        expect(h.cadangan, `${entitas}/${aksi} -> ${h.teks}`).toBeUndefined();
      }
    }
  });
});
