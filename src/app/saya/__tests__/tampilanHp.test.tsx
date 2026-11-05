import React from "react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModalPreviewBerkas } from "../ModalPreviewBerkas";

const FOLDER = join(__dirname, "..");
const BERKAS_TSX = readdirSync(FOLDER).filter((f) => f.endsWith(".tsx"));

describe("tampilan HP /saya", () => {
  it("pratinjau PDF memakai dvh dan tautan cadangan terbaca (text-xs)", () => {
    const html = renderToStaticMarkup(
      <ModalPreviewBerkas berkas={{ id: "b1", namaFile: "contoh.pdf", tipeMime: "application/pdf" }} onClose={() => {}} />,
    );
    expect(html).toContain("max-h-[92dvh]");
    expect(html).toContain("h-[65dvh]");
    expect(html).not.toMatch(/\d(?:vh)\b/);
    expect(html).not.toContain("text-[11px] text-muted\">Jika dokumen");
  });

  it("pratinjau gambar memakai dvh", () => {
    const html = renderToStaticMarkup(
      <ModalPreviewBerkas berkas={{ id: "b2", namaFile: "contoh.png", tipeMime: "image/png" }} onClose={() => {}} />,
    );
    expect(html).toContain("max-h-[68dvh]");
    expect(html).not.toMatch(/\d(?:vh)\b/);
  });

  it("tombol tutup modal punya area sentuh 44px di HP", () => {
    const html = renderToStaticMarkup(
      <ModalPreviewBerkas berkas={{ id: "b3", namaFile: "contoh.pdf" }} onClose={() => {}} />,
    );
    expect(html).toContain("size-11");
  });

  it("tidak ada kelas btn-outline (tidak terdefinisi di globals.css)", () => {
    for (const f of [...BERKAS_TSX, "page.tsx"]) {
      expect(readFileSync(join(FOLDER, f), "utf8"), f).not.toContain("btn-outline");
    }
  });

  it("paragraf penjelas BandingForm tidak lagi text-[11px]", () => {
    expect(readFileSync(join(FOLDER, "BandingForm.tsx"), "utf8")).not.toMatch(/<p className="[^"]*text-\[11px\]/);
  });
});
