import { describe, expect, it } from "vitest";
import {
  JENIS_PEGAWAI_ADK,
  SEMUA_NILAI_JENIS,
  bacaJenisPegawai,
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

  it("PNS menyaring lewat identitas Web Gaji, bukan golongan", () => {
    // Golongan salah pada 14 orang (terukur 2026-09-02) - lihat catatan di
    // jenisPegawaiAdk.ts. Test ini yang menahan siapa pun yang tergoda
    // "menyederhanakannya" jadi penurunan dari golongan.
    const w = wherePegawaiJenis("PNS") as { identitasWebGaji: { jenisPegawai: { in: string[] } } };
    expect(w.identitasWebGaji.jenisPegawai.in).toEqual(["PNS", "CPNS"]);
    expect(JSON.stringify(w)).not.toContain("golongan");
  });
});

describe("wherePegawaiTanpaJenis", () => {
  it("menolak yang jenisnya dikenali - sisanya yang terhitung", () => {
    const w = wherePegawaiTanpaJenis() as { NOT: { identitasWebGaji: { jenisPegawai: { in: string[] } } } };
    expect(w.NOT.identitasWebGaji.jenisPegawai.in).toEqual([...SEMUA_NILAI_JENIS]);
  });
});
