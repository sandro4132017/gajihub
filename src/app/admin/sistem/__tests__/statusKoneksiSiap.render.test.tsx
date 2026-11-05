import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TampilanBadgeKoneksi, type JawabanKoneksi } from "@/components/shared/BadgeKoneksi";
import { ALASAN_OFFLINE_SIAP } from "../StatusKoneksiSiap";

const WAKTU = "2026-11-03T03:30:15.000Z";
const ON: JawabanKoneksi = { keadaan: "TERHUBUNG", diperiksaPada: WAKTU };
const OFF: JawabanKoneksi = { keadaan: "GANGGUAN", sebab: "TIDAK_TERJANGKAU", diperiksaPada: WAKTU };

function render(o: { memeriksa?: boolean; jawaban?: JawabanKoneksi | null; terbuka?: boolean }) {
  return renderToStaticMarkup(
    <TampilanBadgeKoneksi
      namaLayanan="SIAP"
      memeriksa={o.memeriksa ?? false}
      jawaban={o.jawaban ?? null}
      terbuka={o.terbuka ?? false}
      idPanel="p1"
      onToggle={() => {}}
      onPeriksaUlang={() => {}}
      alasanOffline={ALASAN_OFFLINE_SIAP}
    />
  );
}

describe("indikator SIAP", () => {
  it("label persis dan warna titik", () => {
    const on = render({ jawaban: ON });
    expect(on).toContain("SIAP: Connected");
    expect(on).toContain("bg-green");
    const off = render({ jawaban: OFF });
    expect(off).toContain("SIAP: Offline");
    expect(off).toContain("bg-red");
    expect(render({ memeriksa: true })).toContain("SIAP: Checking…");
    const unk = render({ jawaban: { keadaan: "TIDAK_DIKETAHUI", diperiksaPada: WAKTU } });
    expect(unk).toContain("SIAP: Unknown");
    expect(unk).toContain("bg-muted");
  });

  it("aria-label tombol detail", () => {
    expect(render({ jawaban: ON })).toContain('aria-label="Detail status SIAP"');
  });

  it("popover offline menampilkan alasan", () => {
    expect(render({ jawaban: OFF, terbuka: true })).toContain("SIAP tidak dapat dijangkau");
  });

  it("alasan tak memuat alamat atau kode HTTP", () => {
    for (const a of Object.values(ALASAN_OFFLINE_SIAP)) {
      expect(a).not.toMatch(/https?:|\d+\.\d+\.\d+|HTTP \d/);
    }
  });
});
