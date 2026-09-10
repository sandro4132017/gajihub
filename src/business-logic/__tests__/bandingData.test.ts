import { describe, expect, it } from "vitest";
import {
  JENIS_BANDING,
  REFERENSI_BANDING,
  bagianDataSah,
  isReferensiBanding,
  isReferensiData,
  labelReferensiBanding,
} from "../bandingData";

describe("isReferensiBanding", () => {
  it("menerima jenis lama maupun jenis data yang baru", () => {
    for (const t of REFERENSI_BANDING) expect(isReferensiBanding(t)).toBe(true);
  });

  it("menolak yang tidak dikenal", () => {
    expect(isReferensiBanding("GAJI_INDUK")).toBe(false);
    expect(isReferensiBanding("")).toBe(false);
    // Huruf kecil ditolak - nilainya masuk ke database apa adanya, dan dua
    // ejaan untuk hal yang sama membuat penyaringan per jenis meleset.
    expect(isReferensiBanding("tukin")).toBe(false);
  });
});

describe("isReferensiData", () => {
  it("memisahkan banding atas DATA dari banding atas ANGKA", () => {
    expect(isReferensiData("PRESENSI")).toBe(true);
    expect(isReferensiData("DATA_PEGAWAI")).toBe(true);
    expect(isReferensiData("PREDIKAT_KINERJA")).toBe(true);
    // Yang ini banding atas angka - tidak punya bagianData, dan tidak boleh
    // ikut kena kewajiban mengisi usulan perbaikan.
    expect(isReferensiData("TUKIN")).toBe(false);
    expect(isReferensiData("UANG_MAKAN")).toBe(false);
  });
});

describe("bagianDataSah", () => {
  it("menerima bagian yang memang ada di jenisnya", () => {
    expect(bagianDataSah("DATA_PEGAWAI", "Kelas jabatan")).toBe(true);
    expect(bagianDataSah("PRESENSI", "Jam masuk / jam pulang")).toBe(true);
  });

  it("MENOLAK bagian milik jenis lain", () => {
    // Inti pemeriksaan ini: <select> di halaman gampang diganti lewat
    // DevTools, dan bagian data menentukan ke sistem mana verifikator harus
    // melihat. "Kelas jabatan" pada banding presensi mengirim orang ke SIAP
    // untuk memeriksa sesuatu yang datanya ada di e-Presensi.
    expect(bagianDataSah("PRESENSI", "Kelas jabatan")).toBe(false);
    expect(bagianDataSah("DATA_PEGAWAI", "Jam lembur")).toBe(false);
  });

  it("menolak teks karangan", () => {
    expect(bagianDataSah("DATA_PEGAWAI", "apa saja")).toBe(false);
    expect(bagianDataSah("PREDIKAT_KINERJA", "")).toBe(false);
  });
});

describe("labelReferensiBanding", () => {
  it("memberi nama yang terbaca orang, bukan enum", () => {
    expect(labelReferensiBanding("TUKIN")).toBe("Tunjangan Kinerja");
    expect(labelReferensiBanding("UANG_MAKAN")).toBe("Uang Makan");
    expect(labelReferensiBanding("PREDIKAT_KINERJA")).toBe("Predikat kinerja");
  });

  it("mengembalikan nilai tak dikenal APA ADANYA", () => {
    // Baris banding lama tidak boleh hilang dari layar cuma karena jenisnya
    // sudah tidak dipakai - lebih baik tampil sebagai kode mentah daripada
    // kosong atau menghentikan render halamannya.
    expect(labelReferensiBanding("JENIS_LAMA")).toBe("JENIS_LAMA");
  });
});

describe("JENIS_BANDING", () => {
  it("tiap jenis menyebut sistem sumbernya - Gajihub tidak memperbaiki apa pun sendiri", () => {
    expect(JENIS_BANDING.DATA_PEGAWAI.sistemSumber).toBe("SIAP");
    expect(JENIS_BANDING.PRESENSI.sistemSumber).toBe("e-Presensi");
    expect(JENIS_BANDING.PREDIKAT_KINERJA.sistemSumber).toBe("e-Kinerja BKN");
  });

  it("tidak ada daftar bagian yang kosong", () => {
    for (const [jenis, isi] of Object.entries(JENIS_BANDING)) {
      expect(isi.bagian.length, jenis).toBeGreaterThan(0);
      expect(new Set(isi.bagian).size, `${jenis} punya bagian ganda`).toBe(isi.bagian.length);
    }
  });
});
