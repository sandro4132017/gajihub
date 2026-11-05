import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TampilanBadgeKoneksi, type JawabanKoneksi } from "@/components/shared/BadgeKoneksi";
import { ALASAN_OFFLINE_EPRESENSI } from "../StatusKoneksiEpresensi";

const WAKTU = "2026-11-03T03:30:15.000Z";
const ON: JawabanKoneksi = { keadaan: "TERHUBUNG", diperiksaPada: WAKTU };
const OFF: JawabanKoneksi = { keadaan: "GANGGUAN", sebab: "TIDAK_TERJANGKAU", diperiksaPada: WAKTU };

function render(o: { memeriksa?: boolean; jawaban?: JawabanKoneksi | null; terbuka?: boolean }) {
  return renderToStaticMarkup(
    <TampilanBadgeKoneksi
      namaLayanan="e-Presensi"
      memeriksa={o.memeriksa ?? false}
      jawaban={o.jawaban ?? null}
      terbuka={o.terbuka ?? false}
      idPanel="p1"
      onToggle={() => {}}
      onPeriksaUlang={() => {}}
      alasanOffline={ALASAN_OFFLINE_EPRESENSI}
    />
  );
}

describe("indikator e-Presensi", () => {
  it("label persis dan warna titik", () => {
    const on = render({ jawaban: ON });
    expect(on).toContain("e-Presensi: Connected");
    expect(on).toContain("bg-green");
    const off = render({ jawaban: OFF });
    expect(off).toContain("e-Presensi: Offline");
    expect(off).toContain("bg-red");
    expect(render({ memeriksa: true })).toContain("e-Presensi: Checking…");
    const unk = render({ jawaban: { keadaan: "TIDAK_DIKETAHUI", diperiksaPada: WAKTU } });
    expect(unk).toContain("e-Presensi: Unknown");
    expect(unk).toContain("bg-muted");
  });

  it("aria-label tombol detail", () => {
    expect(render({ jawaban: ON })).toContain('aria-label="Detail status e-Presensi"');
  });

  it("popover offline menampilkan alasan", () => {
    expect(render({ jawaban: OFF, terbuka: true })).toContain(
      "database e-Presensi tidak dapat dijangkau"
    );
  });

  it("alasan tak memuat alamat, kode HTTP, atau kode galat mentah", () => {
    for (const a of Object.values(ALASAN_OFFLINE_EPRESENSI)) {
      expect(a).not.toMatch(/https?:|\d+\.\d+\.\d+|HTTP \d|[0-9A-Z]{5}/);
    }
  });
});
