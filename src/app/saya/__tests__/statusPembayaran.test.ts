import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { statusUnit } from "../../../business-logic/pengirimanUnit";
import { keteranganFinalitas } from "../statusPembayaran";

const tanggal = new Date("2026-08-10T03:00:00Z");

describe("keteranganFinalitas", () => {
  it("TERKIRIM final tanpa peringatan", () => {
    const k = keteranganFinalitas(statusUnit({ status: "TERKIRIM", dikirimPada: tanggal, alasanKembali: null }));
    expect(k).toEqual({ final: true, label: "Terkirim ke PPABP", peringatan: null });
  });

  it("belum ada baris pengiriman = estimasi", () => {
    const k = keteranganFinalitas(statusUnit(null));
    expect(k.final).toBe(false);
    expect(k.label).toBe("Estimasi - rekap unit belum dikirim");
    expect(k.peringatan).toContain("belum dikirim ke PPABP");
  });

  it("DIKEMBALIKAN = estimasi dan alasan kembali tidak bocor ke pegawai", () => {
    const k = keteranganFinalitas(
      statusUnit({ status: "DIKEMBALIKAN", dikirimPada: tanggal, alasanKembali: "CATATAN-RAHASIA-UJI" }),
    );
    expect(k.final).toBe(false);
    expect(k.label).toBe("Estimasi - dikembalikan ke unit");
    expect(k.peringatan).toContain("dikembalikan");
    expect(JSON.stringify(k)).not.toContain("CATATAN-RAHASIA-UJI");
  });
});

describe("sumber halaman", () => {
  it("tidak ada lagi pembacaan status APPROVED di /saya maupun slip gaji", () => {
    const berkas = [
      join(__dirname, "..", "page.tsx"),
      join(__dirname, "..", "slip-gaji", "[bulan]", "[tahun]", "page.tsx"),
    ];
    for (const f of berkas) expect(readFileSync(f, "utf8"), f).not.toContain("APPROVED");
  });
});
