import { describe, it, expect } from "vitest";
import { judulkanNama, namaCetakPegawai } from "../namaPegawai";

// Seluruh contoh di bawah DIAMBIL DARI SIAP, bukan dikarang - itu sebabnya
// bentuknya tidak seragam.

describe("judulkanNama", () => {
  it("huruf besar semua dijudulkan", () => {
    expect(judulkanNama("ALPHA SANDRO ADITHYASWARA")).toBe("Alpha Sandro Adithyaswara");
    expect(judulkanNama("SUMARDOKO")).toBe("Sumardoko");
    expect(judulkanNama("NUR ASIAH")).toBe("Nur Asiah");
  });

  it("nama yang SUDAH rapi dibiarkan - menjudulkannya ulang justru merusak", () => {
    expect(judulkanNama("Yassierli")).toBe("Yassierli");
    expect(judulkanNama("Immanuel Ebenezer Gereungan")).toBe("Immanuel Ebenezer Gereungan");
    // Huruf kecil di tengah adalah tanda penulisan yang disengaja.
    expect(judulkanNama("Siti binti Abdullah")).toBe("Siti binti Abdullah");
  });

  it("tanda hubung ikut jadi pemisah kata", () => {
    expect(judulkanNama("ABDUL-RAHMAN")).toBe("Abdul-Rahman");
  });

  it("apostrof TIDAK memicu kapital - bentuk lazimnya Nur'aini", () => {
    expect(judulkanNama("SITI NUR'AINI")).toBe("Siti Nur'aini");
  });

  it("spasi berlebih dirapikan", () => {
    expect(judulkanNama("  Y   MACHYAR  ")).toBe("Y Machyar");
  });
});

describe("namaCetakPegawai", () => {
  it("nama saja, TANPA gelar", () => {
    // Keputusan user 2026-10-20. Gelar tetap tersimpan di tabel pegawai,
    // tapi tidak ikut tercetak - bentuknya di SIAP tidak seragam dan
    // merapikannya berarti menebak maksud penulisnya.
    expect(namaCetakPegawai({ nama: "ALPHA SANDRO ADITHYASWARA" })).toBe(
      "Alpha Sandro Adithyaswara"
    );
  });

  it("nama yang sudah rapi diteruskan apa adanya", () => {
    expect(namaCetakPegawai({ nama: "Yassierli" })).toBe("Yassierli");
  });

  it("nama kosong tidak melempar", () => {
    expect(namaCetakPegawai({ nama: "" })).toBe("");
  });
});
