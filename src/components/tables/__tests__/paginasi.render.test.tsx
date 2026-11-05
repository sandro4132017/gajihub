import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Paginasi, hitungPaginasi } from "../Paginasi";

const href = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));

describe("Paginasi - nama parameter & anchor", () => {
  it("bawaan memakai hal/per tanpa anchor", () => {
    const html = renderToStaticMarkup(
      <Paginasi basePath="/x" params={new URLSearchParams("bulan=7")} info={hitungPaginasi(25, "1", "10")} totalBaris={25} />
    );
    expect(href(html)).toContain("/x?bulan=7&hal=2&per=10");
  });

  it("namaParam & anchor dipakai, query lain tetap terbawa", () => {
    const html = renderToStaticMarkup(
      <Paginasi
        basePath="/x"
        params={new URLSearchParams("bulan=7&hal=3&per=20")}
        info={hitungPaginasi(25, "1", "10")}
        totalBaris={25}
        namaParam={{ hal: "halLembur", per: "perLembur" }}
        anchor="tabel-lembur"
      />
    );
    const tautan = href(html);
    expect(tautan).toContain("/x?bulan=7&hal=3&per=20&halLembur=2&perLembur=10#tabel-lembur");
    // posisi tabel lain (hal/per) tidak ikut diubah
    expect(tautan.every((t) => t.includes("hal=3&per=20"))).toBe(true);
  });
});
