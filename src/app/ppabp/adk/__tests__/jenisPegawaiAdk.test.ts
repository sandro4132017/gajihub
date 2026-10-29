import { describe, expect, it } from "vitest";
import {
  JENIS_PEGAWAI_ADK,
  SEMUA_NILAI_JENIS,
  bacaJenisPegawai,
  kelompokDariNilaiData,
  labelJenisPegawai,
  wherePegawaiJenis,
  wherePegawaiTanpaJenis,
} from "../jenisPegawaiAdk";

describe("JENIS_PEGAWAI_ADK", () => {
  it("dua kelompok tidak boleh berbagi satu nilai pun", () => {
    // Nilai yang muncul di dua kelompok membuat satu pegawai masuk ADK PNS
    // DAN ADK P3K - dibayar dua kali, dan tidak ada satu layar pun di sistem
    // ini yang akan memperlihatkannya.
    const semua = JENIS_PEGAWAI_ADK.flatMap((j) => [...j.nilaiDiData]);
    expect(new Set(semua).size).toBe(semua.length);
  });

  it("SEMUA_NILAI_JENIS memuat nilai dari kedua kelompok", () => {
    expect(SEMUA_NILAI_JENIS).toContain("PNS");
    expect(SEMUA_NILAI_JENIS).toContain("PPPK");
  });

  it("CPNS masuk kelompok PNS", () => {
    // 2 orang pada data 7/2026. Kalau ini berubah, yang berubah bukan cuma
    // label - dua orang pindah berkas.
    expect(JENIS_PEGAWAI_ADK.find((j) => j.kode === "PNS")!.nilaiDiData).toContain("CPNS");
  });

  it("dua ejaan P3K dijaga sekaligus", () => {
    const p3k = JENIS_PEGAWAI_ADK.find((j) => j.kode === "P3K")!.nilaiDiData;
    expect(p3k).toContain("PPPK");
    expect(p3k).toContain("P3K");
  });
});

describe("bacaJenisPegawai", () => {
  it("nilai yang tidak dikenal jadi null - bukan dianggap PNS", () => {
    // Diam-diam jatuh ke PNS berarti `?jenis=pns` (huruf kecil) menghasilkan
    // berkas PNS tanpa ada yang meminta.
    expect(bacaJenisPegawai("pns")).toBeNull();
    expect(bacaJenisPegawai("ENTAH")).toBeNull();
    expect(bacaJenisPegawai("")).toBeNull();
    expect(bacaJenisPegawai(null)).toBeNull();
  });

  it("PNS & P3K dibaca apa adanya", () => {
    expect(bacaJenisPegawai("PNS")).toBe("PNS");
    expect(bacaJenisPegawai("P3K")).toBe("P3K");
  });
});

describe("labelJenisPegawai", () => {
  it("null berarti tanpa penyaringan", () => {
    expect(labelJenisPegawai(null)).toBe("Semua pegawai");
  });
});

describe("wherePegawaiJenis", () => {
  it("null menghasilkan filter KOSONG, bukan filter yang menolak semua", () => {
    // Kalau null menghasilkan `{ in: [] }`, "Semua pegawai" justru
    // mengosongkan berkasnya - kebalikan dari yang dimaksud.
    expect(wherePegawaiJenis(null)).toEqual({});
  });

  it("PNS menyaring lewat jenis kepegawaian SIAP, bukan golongan", () => {
    // Golongan salah pada belasan orang (terukur 2026-09-02) - lihat catatan
    // di jenisPegawaiAdk.ts. Test ini yang menahan siapa pun yang tergoda
    // "menyederhanakannya" jadi penurunan dari golongan.
    const w = wherePegawaiJenis("PNS") as { jenisPegawai: { in: string[] } };
    expect(w.jenisPegawai.in).toEqual(["PNS", "CPNS"]);
    expect(JSON.stringify(w)).not.toContain("golongan");
    expect(JSON.stringify(w)).not.toContain("identitasWebGaji");
  });
});

describe("wherePegawaiTanpaJenis", () => {
  it("menghitung yang jenisnya kosong DAN yang di luar daftar", () => {
    // `notIn` saja tidak menangkap NULL di SQL - tanpa cabang `null`, pegawai
    // yang belum tersinkron lolos dari hitungan "belum terpetakan".
    const w = wherePegawaiTanpaJenis() as { AND: [{ OR: [{ jenisPegawai: null }, { jenisPegawai: { notIn: string[] } }] }] };
    expect(w.AND[0].OR[0]).toEqual({ jenisPegawai: null });
    expect(w.AND[0].OR[1].jenisPegawai.notIn).toEqual([...SEMUA_NILAI_JENIS]);
  });

  it("tidak memakai OR di tingkat atas - aman disebar ke where yang punya OR", () => {
    expect(Object.keys(wherePegawaiTanpaJenis())).toEqual(["AND"]);
  });
});

describe("kelompokDariNilaiData", () => {
  it("nilai jenis dipetakan ke kelompok berkasnya", () => {
    expect(kelompokDariNilaiData("PNS")).toBe("PNS");
    expect(kelompokDariNilaiData("CPNS")).toBe("PNS");
    expect(kelompokDariNilaiData("PPPK")).toBe("P3K");
    expect(kelompokDariNilaiData("P3K")).toBe("P3K");
  });

  it("CPNS diterima DI SINI tapi tidak di bacaJenisPegawai - dua pertanyaan berbeda", () => {
    // Yang satu membaca nilai di data, yang satu membaca kode pilihan di
    // query string. Menukar keduanya membuat `?jenis=CPNS` seolah sah, atau
    // membuat 2 CPNS di data terbuang dari berkas PNS.
    expect(kelompokDariNilaiData("CPNS")).toBe("PNS");
    expect(bacaJenisPegawai("CPNS")).toBeNull();
  });

  it("nilai berpadding & berhuruf kecil tetap terbaca", () => {
    expect(kelompokDariNilaiData(" pppk ")).toBe("P3K");
    expect(kelompokDariNilaiData("Pns")).toBe("PNS");
  });

  it("yang di luar daftar jadi null - TIDAK dijatuhkan ke PNS", () => {
    // Menebaknya PNS berarti pegawai non-ASN ikut masuk berkas ADK PNS.
    expect(kelompokDariNilaiData("HONORER")).toBeNull();
    expect(kelompokDariNilaiData("")).toBeNull();
    expect(kelompokDariNilaiData(null)).toBeNull();
    expect(kelompokDariNilaiData(undefined)).toBeNull();
  });
});
