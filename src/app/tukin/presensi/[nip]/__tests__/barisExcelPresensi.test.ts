import { describe, expect, it } from "vitest";
import { HEADER_EXCEL_PRESENSI_PEGAWAI, susunBarisExcelPresensiPegawai } from "../barisExcelPresensi";

const jam = (iso: string, hhmm: string) => new Date(`${iso}T${hhmm}:00Z`);
const hari = (iso: string, o: Partial<Parameters<typeof susunBarisExcelPresensiPegawai>[0][number]> = {}) => ({
  tanggal: new Date(`${iso}T00:00:00Z`),
  statusKehadiran: "WFO",
  jamMasuk: jam(iso, "07:20"),
  jamKeluar: jam(iso, "16:05"),
  menitTerlambat: 0,
  menitPulangCepat: 0,
  jamLembur: 0,
  ...o,
});

describe("susunBarisExcelPresensiPegawai", () => {
  it("kolom sama dengan tabel Rincian harian", () => {
    expect(HEADER_EXCEL_PRESENSI_PEGAWAI).toEqual([
      "Tanggal", "Hari", "Status", "Masuk", "Pulang", "Telat (menit)",
      "Kekurangan jam kerja (menit)", "Lembur", "Potongan (%)", "Keterangan potongan", "Uang makan", "Koreksi",
    ]);
  });

  it("hari biasa: jam, berhak uang makan, tanpa koreksi", () => {
    const [b] = susunBarisExcelPresensiPegawai([hari("2026-10-05")], new Map());
    expect(b.slice(1)).toEqual(["Senin", "WFO", "07:20", "16:05", "-", "-", "-", "-", "-", "berhak", "-"]);
    expect(b).toHaveLength(HEADER_EXCEL_PRESENSI_PEGAWAI.length);
  });

  it("telat, kekurangan, lembur, akhir pekan", () => {
    const [b, sabtu] = susunBarisExcelPresensiPegawai(
      [
        hari("2026-10-06", { menitTerlambat: 12, menitPulangCepat: 30, jamLembur: 2.5 }),
        hari("2026-10-10", { statusKehadiran: "LIBUR", jamMasuk: null, jamKeluar: null }),
      ],
      new Map()
    );
    expect(b[5]).toBe(12);
    expect(b[6]).toBe(30);
    expect(b[7]).toBe("2 jam");
    expect(sabtu[3]).toBe("-");
    expect(sabtu[10]).toBe("akhir pekan");
  });

  it("koreksi petugas menimpa jam dan menyebut jam aslinya", () => {
    const iso = "2026-10-07";
    const [b] = susunBarisExcelPresensiPegawai(
      [hari(iso, { jamMasuk: jam(iso, "09:40") })],
      new Map([[iso, { jamMasuk: jam(iso, "07:30"), jamKeluar: null, jamLembur: null }]])
    );
    expect(b[3]).toBe("07:30");
    expect(b[4]).toBe("16:05");
    expect(b[11]).toBe("Dikoreksi (masuk 09:40 -> 07:30)");
  });

  it("dua potongan berbeda di satu hari: persen total + keterangan per jenis", () => {
    const [b] = susunBarisExcelPresensiPegawai([hari("2026-10-08")], new Map(), [
      {
        potonganPersen: 0.016,
        bagianPotongan: [
          { teks: "Terlambat lewat 10.10", persen: 0.01 },
          { teks: "Kekurangan jam kerja 60 menit", persen: 0.006 },
        ],
      },
    ]);
    expect(b[8]).toBe(1.6);
    expect(b[9]).toBe("Terlambat lewat 10.10 (1%) + Kekurangan jam kerja 60 menit (0,6%)");
  });
});
