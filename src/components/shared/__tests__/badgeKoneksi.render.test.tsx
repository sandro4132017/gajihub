import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  TampilanBadgeKoneksi,
  labelBadgeKoneksi,
  tafsirkanRespons,
  type JawabanKoneksi,
} from "../BadgeKoneksi";

const ALASAN = {
  GALAT_SERVER: "alasan galat",
  KONFIGURASI: "alasan konfigurasi",
  SIBUK: "alasan sibuk",
  BATAS_WAKTU: "alasan batas waktu",
  TIDAK_TERJANGKAU: "alasan tak terjangkau",
};
const WAKTU = "2026-11-03T03:30:15.000Z"; // 10.30.15 WIB
const ON: JawabanKoneksi = { keadaan: "TERHUBUNG", diperiksaPada: WAKTU };
const OFF: JawabanKoneksi = { keadaan: "GANGGUAN", sebab: "SIBUK", diperiksaPada: WAKTU };

function render(o: { memeriksa?: boolean; jawaban?: JawabanKoneksi | null; terbuka?: boolean }) {
  return renderToStaticMarkup(
    <TampilanBadgeKoneksi
      namaLayanan="Layanan Contoh"
      memeriksa={o.memeriksa ?? false}
      jawaban={o.jawaban ?? null}
      terbuka={o.terbuka ?? false}
      idPanel="p1"
      onToggle={() => {}}
      onPeriksaUlang={() => {}}
      alasanOffline={ALASAN}
    />
  );
}

describe("TampilanBadgeKoneksi", () => {
  it("label empat keadaan memakai nama layanan", () => {
    expect(render({ jawaban: ON })).toContain("Layanan Contoh: Connected");
    expect(render({ jawaban: OFF })).toContain("Layanan Contoh: Offline");
    expect(render({ memeriksa: true })).toContain("Layanan Contoh: Checking…");
    expect(
      render({ jawaban: { keadaan: "TIDAK_DIKETAHUI", diperiksaPada: WAKTU } })
    ).toContain("Layanan Contoh: Unknown");
    expect(labelBadgeKoneksi("X", false, null)).toBe("X: Unknown");
  });

  it("warna titik dan aria", () => {
    expect(render({ jawaban: ON })).toContain("bg-green");
    expect(render({ jawaban: OFF })).toContain("bg-red");
    const h = render({ jawaban: ON });
    expect(h).toContain('aria-label="Detail status Layanan Contoh"');
    expect(h).toContain('aria-expanded="false"');
    expect(h).toContain('aria-controls="p1"');
    expect(h).toContain('role="status"');
  });

  it("popover terbuka: jam dan alasan dari peta alasan", () => {
    const h = render({ jawaban: OFF, terbuka: true });
    expect(h).toContain("10.30.15");
    expect(h).toContain("alasan sibuk");
    expect(render({ jawaban: ON, terbuka: true })).not.toContain("Alasan:");
  });

  it("Periksa ulang nonaktif saat memeriksa", () => {
    expect(render({ memeriksa: true, terbuka: true })).toMatch(
      /<button[^>]*disabled[^>]*>Periksa ulang/
    );
  });

  it("tafsirkanRespons menyembunyikan 401/403/pengalihan/login", () => {
    expect(tafsirkanRespons({ status: 403 })).toBe("sembunyi");
    expect(tafsirkanRespons({ status: 200, url: "http://h/login" })).toBe("sembunyi");
    expect(tafsirkanRespons({ status: 200 })).toBe("baca");
  });
});
