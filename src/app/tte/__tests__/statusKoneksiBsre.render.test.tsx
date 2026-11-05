import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ALASAN_OFFLINE,
  TampilanStatusBsre,
  formatJamPeriksa,
  tafsirkanRespons,
  type JawabanKoneksi,
} from "../StatusKoneksiBsre";

// Interaksi (klik di luar, Escape) tidak teruji di sini: proyek hanya punya
// render statis (tanpa jsdom/testing-library). Yang diuji: badge, isi rincian
// saat terbuka, dan peringatan modal.

const NOP = () => {};
const OFF: JawabanKoneksi = {
  keadaan: "GANGGUAN",
  sebab: "BATAS_WAKTU",
  diperiksaPada: "2026-11-03T03:30:15.000Z", // 10.30.15 WIB
};
const ON: JawabanKoneksi = { keadaan: "TERHUBUNG", diperiksaPada: OFF.diperiksaPada };

function render(o: {
  memeriksa?: boolean;
  jawaban?: JawabanKoneksi | null;
  terbuka?: boolean;
  denganPeringatan?: boolean;
}) {
  return renderToStaticMarkup(
    <TampilanStatusBsre
      memeriksa={o.memeriksa ?? false}
      jawaban={o.jawaban ?? null}
      terbuka={o.terbuka ?? false}
      idPanel="p1"
      onToggle={NOP}
      onPeriksaUlang={NOP}
      denganPeringatan={o.denganPeringatan}
    />
  );
}

describe("TampilanStatusBsre", () => {
  it("badge Connected hijau, Offline merah, memeriksa/unknown abu", () => {
    const on = render({ jawaban: ON });
    expect(on).toContain("BSrE: Connected");
    expect(on).toContain("bg-green");
    const off = render({ jawaban: OFF });
    expect(off).toContain("BSrE: Offline");
    expect(off).toContain("bg-red");
    expect(render({ memeriksa: true })).toContain("BSrE: Checking…");
    const unk = render({ jawaban: { keadaan: "TIDAK_DIKETAHUI", diperiksaPada: OFF.diperiksaPada } });
    expect(unk).toContain("BSrE: Unknown");
    expect(unk).toContain("bg-muted");
  });

  it("tombol i punya aria-label, aria-expanded, aria-controls; role=status ada", () => {
    const h = render({ jawaban: ON });
    expect(h).toContain('aria-label="Detail status BSrE"');
    expect(h).toContain('aria-expanded="false"');
    expect(h).toContain('aria-controls="p1"');
    expect(h).toContain('role="status"');
    expect(h).not.toContain("Diperiksa pukul");
  });

  it("terbuka: jam diperiksa dan alasan bila offline", () => {
    const h = render({ jawaban: OFF, terbuka: true });
    expect(h).toContain('aria-expanded="true"');
    expect(h).toContain("Diperiksa pukul");
    expect(h).toContain(formatJamPeriksa(OFF.diperiksaPada));
    expect(h).toContain("10.30.15");
    expect(h).toContain(`Alasan: <span class="text-ink">${ALASAN_OFFLINE.BATAS_WAKTU}</span>`);
    expect(h).toContain("Periksa ulang");
  });

  it("terbuka saat terhubung: tanpa alasan; belum diperiksa disebut", () => {
    expect(render({ jawaban: ON, terbuka: true })).not.toContain("Alasan:");
    expect(render({ memeriksa: true, terbuka: true })).toContain("Belum pernah diperiksa");
  });

  it("tombol Periksa ulang nonaktif selama memeriksa", () => {
    expect(render({ memeriksa: true, terbuka: true })).toMatch(/<button[^>]*disabled[^>]*>Periksa ulang/);
  });

  it("peringatan modal hanya saat Offline", () => {
    const teks = "Penandatanganan kemungkinan besar gagal";
    expect(render({ jawaban: OFF, denganPeringatan: true })).toContain(teks);
    expect(render({ jawaban: OFF, denganPeringatan: true })).toContain('role="alert"');
    expect(render({ jawaban: ON, denganPeringatan: true })).not.toContain(teks);
    expect(render({ jawaban: OFF })).not.toContain(teks);
  });

  it("alasan tidak memuat alamat atau kode mentah", () => {
    for (const a of Object.values(ALASAN_OFFLINE)) {
      expect(a).not.toMatch(/https?:|\d+\.\d+\.\d+|HTTP \d/);
    }
  });
});

describe("tafsirkanRespons", () => {
  it("401, 403, pengalihan, dan url /login -> sembunyi", () => {
    expect(tafsirkanRespons({ status: 401 })).toBe("sembunyi");
    expect(tafsirkanRespons({ status: 403 })).toBe("sembunyi");
    expect(tafsirkanRespons({ status: 200, redirected: true })).toBe("sembunyi");
    expect(tafsirkanRespons({ status: 200, url: "http://h/login?next=%2Fx" })).toBe("sembunyi");
  });
  it("respons biasa -> baca", () => {
    expect(tafsirkanRespons({ status: 200, redirected: false, url: "http://h/api/tte/koneksi" })).toBe("baca");
    expect(tafsirkanRespons({ status: 500 })).toBe("baca");
  });
});
