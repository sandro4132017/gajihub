import { describe, it, expect } from "vitest";
import {
  kelompokkanKeputusan,
  saringStatusBanding,
  labelKeputusan,
  adalahKeputusanValid,
  type ReconInput,
  type BandingInput,
  type PembayaranInput,
} from "../keputusanPembayaran";

const recon = (o: Partial<ReconInput> = {}): ReconInput => ({
  id: "r1",
  pegawaiId: "p1",
  periodeBulan: 6,
  periodeTahun: 2026,
  status: "SANGGAH",
  keputusanAkhir: null,
  ...o,
});
const banding = (o: Partial<BandingInput> = {}): BandingInput => ({
  id: "b1",
  pegawaiId: "p1",
  periodeBulan: 6,
  periodeTahun: 2026,
  status: "DIAJUKAN",
  ...o,
});
const bayar = (o: Partial<PembayaranInput> = {}): PembayaranInput => ({
  pegawaiId: "p1",
  periodeBulan: 6,
  periodeTahun: 2026,
  jenis: "Tukin",
  status: "DRAFT",
  ...o,
});

describe("kelompokkanKeputusan", () => {
  it("dua banding untuk satu pasangan menghasilkan satu keputusan", () => {
    const h = kelompokkanKeputusan(
      [recon()],
      [banding({ id: "b1" }), banding({ id: "b2", status: "MENUNGGU_APPROVAL_FINAL" })],
      []
    );
    expect(h.perluDiputuskan).toHaveLength(1);
    expect(h.perluDiputuskan[0].bandingTerkait.map((b) => b.id)).toEqual(["b1", "b2"]);
  });

  it("recon tanpa banding tetap masuk", () => {
    const h = kelompokkanKeputusan([recon({ status: "SELISIH" })], [], []);
    expect(h.perluDiputuskan).toHaveLength(1);
    expect(h.perluDiputuskan[0].bandingTerkait).toEqual([]);
  });

  it("banding pasangan lain tidak ikut tercampur", () => {
    const h = kelompokkanKeputusan([recon()], [banding({ pegawaiId: "p2" }), banding({ periodeBulan: 5 })], []);
    expect(h.perluDiputuskan[0].bandingTerkait).toEqual([]);
  });

  it("SANGGAH/SELISIH dengan keputusanAkhir terisi ditandai dibukaUlang", () => {
    const h = kelompokkanKeputusan(
      [recon({ id: "a", keputusanAkhir: "HOLD_PEMBAYARAN" }), recon({ id: "c", pegawaiId: "p9" })],
      [],
      []
    );
    expect(h.perluDiputuskan.find((i) => i.recon.id === "a")?.dibukaUlang).toBe(true);
    expect(h.perluDiputuskan.find((i) => i.recon.id === "c")?.dibukaUlang).toBe(false);
  });

  it("DIPUTUSKAN masuk riwayat, bukan perlu diputuskan", () => {
    const h = kelompokkanKeputusan(
      [recon({ status: "DIPUTUSKAN", keputusanAkhir: "KOREKSI_SIKLUS_BERIKUTNYA" })],
      [],
      []
    );
    expect(h.perluDiputuskan).toHaveLength(0);
    expect(h.riwayat).toHaveLength(1);
    expect(h.riwayat[0].dibukaUlang).toBe(false);
  });

  it("DRAFT dan COCOK diabaikan", () => {
    const h = kelompokkanKeputusan([recon({ status: "DRAFT" }), recon({ id: "x", status: "COCOK" })], [], []);
    expect(h.perluDiputuskan).toHaveLength(0);
    expect(h.riwayat).toHaveLength(0);
  });

  it("pembayaranSudahBergerak true bila ada APPROVED atau DIKIRIM", () => {
    const a = kelompokkanKeputusan([recon()], [], [bayar({ status: "DRAFT" }), bayar({ jenis: "Uang Makan", status: "DIKIRIM" })]);
    expect(a.perluDiputuskan[0].pembayaranSudahBergerak).toBe(true);
    expect(a.perluDiputuskan[0].pembayaran).toHaveLength(2);

    const b = kelompokkanKeputusan([recon()], [], [bayar({ status: "DRAFT" })]);
    expect(b.perluDiputuskan[0].pembayaranSudahBergerak).toBe(false);

    const c = kelompokkanKeputusan([recon()], [], [bayar({ status: "APPROVED" })]);
    expect(c.perluDiputuskan[0].pembayaranSudahBergerak).toBe(true);
  });
});

describe("saringStatusBanding", () => {
  it("memetakan PERLU_REKONSILIASI lama ke PERLU_KEPUTUSAN", () => {
    expect(saringStatusBanding("PERLU_REKONSILIASI")).toBe("PERLU_KEPUTUSAN");
  });
  it("kosong menjadi SEMUA, nilai lain diteruskan", () => {
    expect(saringStatusBanding(undefined)).toBe("SEMUA");
    expect(saringStatusBanding("")).toBe("SEMUA");
    expect(saringStatusBanding("SELESAI")).toBe("SELESAI");
    expect(saringStatusBanding("DIAJUKAN")).toBe("DIAJUKAN");
  });
});

describe("keputusan pembayaran", () => {
  it("whitelist hanya dua nilai lama", () => {
    expect(adalahKeputusanValid("HOLD_PEMBAYARAN")).toBe(true);
    expect(adalahKeputusanValid("KOREKSI_SIKLUS_BERIKUTNYA")).toBe(true);
    expect(adalahKeputusanValid("BATAL")).toBe(false);
  });
  it("label jujur: menyebut 'Catat'", () => {
    expect(labelKeputusan("HOLD_PEMBAYARAN")).toBe("Catat: tahan pembayaran");
    expect(labelKeputusan("KOREKSI_SIKLUS_BERIKUTNYA")).toBe("Catat: koreksi siklus berikutnya");
    expect(labelKeputusan(null)).toBe("Belum ada keputusan");
  });
});
