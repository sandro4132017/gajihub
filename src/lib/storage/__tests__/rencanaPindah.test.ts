import { describe, expect, it } from "vitest";
import {
  hitungTidakCocokDb,
  layakDipindah,
  ringkasRencana,
  susunRencanaPindah,
} from "../rencanaPindah";

const H1 = "a".repeat(64);
const H2 = "b".repeat(64);

describe("susunRencanaPindah", () => {
  it("belum ada di tujuan -> SALIN", () => {
    const r = susunRencanaPindah([{ relatif: "tte/draft_x.pdf", sha256: H1 }], new Map());
    expect(r).toEqual([{ relatif: "tte/draft_x.pdf", status: "SALIN" }]);
  });

  it("hash identik -> SUDAH_SAMA", () => {
    const r = susunRencanaPindah(
      [{ relatif: "tte/a/b.pdf", sha256: H1 }],
      new Map([["tte/a/b.pdf", H1]])
    );
    expect(r[0].status).toBe("SUDAH_SAMA");
  });

  it("hash berbeda -> BENTROK, tidak ditimpa", () => {
    const r = susunRencanaPindah(
      [{ relatif: "bukti-dukung/a.pdf", sha256: H1 }],
      new Map([["bukti-dukung/a.pdf", H2]])
    );
    expect(r[0].status).toBe("BENTROK");
  });

  it("jenis di luar daftar, traversal, dan .gitkeep -> LEWATI", () => {
    const r = susunRencanaPindah(
      [
        { relatif: "lain/a.pdf", sha256: H1 },
        { relatif: "tte/../a.pdf", sha256: H1 },
        { relatif: "bukti-dukung/.gitkeep", sha256: H1 },
      ],
      new Map()
    );
    expect(r.map((x) => x.status)).toEqual(["LEWATI", "LEWATI", "LEWATI"]);
  });

  it("ringkasan menghitung tiap status", () => {
    const r = susunRencanaPindah(
      [
        { relatif: "tte/1.pdf", sha256: H1 },
        { relatif: "tte/2.pdf", sha256: H1 },
        { relatif: "tte/3.pdf", sha256: H1 },
        { relatif: "tte/4.pdf", sha256: H1 },
        { relatif: "x/5.pdf", sha256: H1 },
      ],
      new Map([
        ["tte/2.pdf", H1],
        ["tte/3.pdf", H2],
      ])
    );
    expect(ringkasRencana(r)).toEqual({ salin: 2, sudahSama: 1, bentrok: 1, lewati: 1 });
  });
});

describe("layakDipindah", () => {
  it("berkas TTE bersubfolder dan bernama berspasi layak", () => {
    expect(layakDipindah("tte/abc/SPTJM - TUNKIN Agustus 2026 Unit.pdf")).toBe(true);
  });
});

describe("hitungTidakCocokDb", () => {
  it("hanya menghitung yang punya hash di database dan berbeda", () => {
    const asal = [
      { relatif: "tte/a/1.pdf", sha256: H1 },
      { relatif: "tte/a/2.pdf", sha256: H1 },
      { relatif: "tte/a/3.pdf", sha256: H1 },
    ];
    const db = new Map([
      ["tte/a/1.pdf", H1.toUpperCase()],
      ["tte/a/2.pdf", H2],
    ]);
    expect(hitungTidakCocokDb(asal, db)).toBe(1);
  });
});
