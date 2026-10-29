import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  akarStorage,
  cocokTandaTangan,
  headerUnduh,
  jalurAman,
  FOLDER_UNIT_CADANGAN,
  folderPeriode,
  kunciBuktiDukung,
  kunciDraftTte,
  kunciPratinjauTte,
  kunciSignedTte,
  namaFolderUnit,
  tipeKonten,
  uraiReferensi,
} from "../berkasPrivat";

const AKAR = path.resolve("/tmp-akar-uji/uploads");

describe("uraiReferensi - format lama dan baru", () => {
  it("format lama dengan spasi ter-encode dipulihkan", () => {
    expect(uraiReferensi("/uploads/tte/abc/SPTJM%20-%20TUNKIN%20Agustus%202026.pdf")).toEqual({
      jenis: "tte",
      relatif: "abc/SPTJM - TUNKIN Agustus 2026.pdf",
    });
  });

  it("query dibuang", () => {
    expect(uraiReferensi("/uploads/tte/draft_x.pdf?t=123")).toEqual({
      jenis: "tte",
      relatif: "draft_x.pdf",
    });
    expect(uraiReferensi("/uploads/tte/x/a.pdf?v=9")?.relatif).toBe("x/a.pdf");
  });

  it("kunci baru tanpa slash depan dan tanpa decode", () => {
    expect(uraiReferensi("bukti-dukung/1700_ab_SK.pdf")).toEqual({
      jenis: "bukti-dukung",
      relatif: "1700_ab_SK.pdf",
    });
    expect(uraiReferensi("tte/abc/SPTJM - UM 100%.pdf")?.relatif).toBe("abc/SPTJM - UM 100%.pdf");
  });

  it("format lama bukti dukung", () => {
    expect(uraiReferensi("/uploads/bukti-dukung/1700_ab_SK.pdf")).toEqual({
      jenis: "bukti-dukung",
      relatif: "1700_ab_SK.pdf",
    });
  });
});

describe("uraiReferensi - penolakan", () => {
  it.each([
    ["traversal polos", "bukti-dukung/../tte/a.pdf"],
    ["traversal di awal", "tte/../../etc/x"],
    ["traversal ter-encode %2F", "/uploads/tte/..%2F..%2Fx.pdf"],
    ["traversal %2e%2e", "/uploads/tte/%2e%2e/x.pdf"],
    ["traversal %2E%2E%2F", "/uploads/tte/%2E%2E%2Fx.pdf"],
    ["backslash", "tte\\..\\x.pdf"],
    ["backslash ter-encode", "/uploads/tte/a%5Cb.pdf"],
    ["huruf drive", "tte/C:/Windows/x.pdf"],
    ["huruf drive ter-encode", "/uploads/tte/C%3A/x.pdf"],
    ["NUL", "tte/a\0.pdf"],
    ["NUL ter-encode", "/uploads/tte/a%00.pdf"],
    ["path absolut", "/etc/passwd"],
    ["absolut Windows", "C:\\berkas\\x.pdf"],
    ["URL placeholder seed", "http://placeholder.local/bukti/sk.pdf"],
    ["https", "https://placeholder.local/x.pdf"],
    ["jenis di luar daftar", "/uploads/lain/x.pdf"],
    ["jenis di luar daftar (baru)", "lain/x.pdf"],
    ["tanpa nama berkas", "tte"],
    ["tanpa nama berkas (lama)", "/uploads/tte/"],
    ["segmen kosong", "tte//x.pdf"],
    ["segmen titik", "tte/./x.pdf"],
    ["encoding cacat", "/uploads/tte/%E0%A4%A.pdf"],
    ["kosong", ""],
    ["hanya spasi", "   "],
  ])("%s -> null", (_n, ref) => {
    expect(uraiReferensi(ref)).toBeNull();
  });
});

describe("jalurAman", () => {
  it("menghasilkan path di bawah folder jenisnya", () => {
    const j = jalurAman("/uploads/tte/abc/SPTJM%20A.pdf", "tte", AKAR);
    expect(j).toBe(path.join(AKAR, "tte", "abc", "SPTJM A.pdf"));
  });

  it("jenis tidak cocok dengan yang diharapkan -> null", () => {
    expect(jalurAman("tte/abc/a.pdf", "bukti-dukung", AKAR)).toBeNull();
    expect(jalurAman("bukti-dukung/a.pdf", "tte", AKAR)).toBeNull();
  });

  it("referensi tak sah -> null", () => {
    expect(jalurAman("https://placeholder.local/x.pdf", "bukti-dukung", AKAR)).toBeNull();
    expect(jalurAman("tte/../bukti-dukung/a.pdf", "tte", AKAR)).toBeNull();
  });

  it("hasil selalu berada di dalam folder jenis", () => {
    const dir = path.join(AKAR, "bukti-dukung");
    const j = jalurAman("bukti-dukung/a/b/c.pdf", "bukti-dukung", AKAR)!;
    const rel = path.relative(dir, j);
    expect(rel.startsWith("..")).toBe(false);
    expect(path.isAbsolute(rel)).toBe(false);
  });
});

describe("namaFolderUnit", () => {
  it("nama biasa utuh", () => {
    expect(namaFolderUnit("Biro Keuangan dan Barang Milik Negara")).toBe(
      "Biro Keuangan dan Barang Milik Negara"
    );
  });

  it("dua unit berawalan sama (>32 huruf) menghasilkan folder berbeda", () => {
    const a = namaFolderUnit("Biro Keuangan dan Barang Milik Negara");
    const b = namaFolderUnit("Biro Keuangan dan Barang Milik Negara Wilayah II");
    expect(a).not.toBe(b);
  });

  it("karakter terlarang diganti, spasi dirapikan", () => {
    const n = namaFolderUnit('  Biro  A/B\\C:D*E?F"G<H>I|J\u0001K  ');
    expect(n).toBe("Biro A B C D E F G H I J K");
    expect(n).not.toMatch(/[\/\\:*?"<>|]/);
  });

  it("titik dan spasi di ujung dibuang", () => {
    expect(namaFolderUnit("Biro Umum. . ")).toBe("Biro Umum");
    expect(namaFolderUnit("..Biro Umum")).toBe("Biro Umum");
  });

  it("'..', '.', kosong, null, undefined -> folder cadangan", () => {
    for (const v of ["..", ".", "", "   ", "///", null, undefined, "...", ". ."]) {
      expect(namaFolderUnit(v as string | null)).toBe(FOLDER_UNIT_CADANGAN);
    }
  });

  it("traversal tidak lolos menjadi segmen path", () => {
    const n = namaFolderUnit("../../etc/passwd");
    expect(n).not.toContain("/");
    expect(n).not.toContain("..");
    expect(uraiReferensi(`tte/${n}/x.pdf`)).not.toBeNull();
  });

  it("nama sangat panjang dipotong dengan akhiran hash dan tetap unik", () => {
    const dasar = "Unit ".repeat(40);
    const a = namaFolderUnit(dasar + "A");
    const b = namaFolderUnit(dasar + "B");
    expect(a.length).toBeLessThanOrEqual(120);
    expect(b.length).toBeLessThanOrEqual(120);
    expect(a).not.toBe(b);
    expect(a).toMatch(/-[0-9a-f]{8}$/);
    expect(namaFolderUnit(dasar + "A")).toBe(a); // deterministik
  });

  it("nama reserved Windows diberi awalan", () => {
    expect(namaFolderUnit("CON")).toBe("_CON");
  });
});

describe("kunci berkas berfolder unit dan periode", () => {
  it("bentuk kunci TTE", () => {
    expect(kunciDraftTte("Biro Umum", 2026, 8, "id1")).toBe("tte/Biro Umum/2026-08/draft_id1.pdf");
    expect(kunciSignedTte("Biro Umum", 2026, 8, "id1", "SPTJM - UM.pdf")).toBe(
      "tte/Biro Umum/2026-08/id1/SPTJM - UM.pdf"
    );
    expect(kunciPratinjauTte("Biro Umum", 2026, 12, "SPTJM - UM.pdf")).toBe(
      "tte/Biro Umum/2026-12/Draft - SPTJM - UM.pdf"
    );
  });

  it("bentuk kunci bukti dukung", () => {
    expect(kunciBuktiDukung("Biro Umum", "1700_ab_SK.pdf")).toBe("bukti-dukung/Biro Umum/1700_ab_SK.pdf");
  });

  it("kunci yang dibentuk lolos resolver dan berada di dalam folder jenisnya", () => {
    const k = kunciSignedTte("Biro Keuangan dan Barang Milik Negara", 2026, 8, "id1", "SPTJM - UM.pdf");
    const j = jalurAman(k, "tte", AKAR)!;
    expect(j).toBe(
      path.join(AKAR, "tte", "Biro Keuangan dan Barang Milik Negara", "2026-08", "id1", "SPTJM - UM.pdf")
    );
    expect(uraiReferensi(k)?.relatif).toBe(
      "Biro Keuangan dan Barang Milik Negara/2026-08/id1/SPTJM - UM.pdf"
    );
  });

  it("periode tidak sah melempar", () => {
    expect(() => folderPeriode(2026, 13)).toThrow();
    expect(() => folderPeriode(2026, 0)).toThrow();
    expect(() => folderPeriode(26, 8)).toThrow();
    expect(() => folderPeriode(2026, 1.5)).toThrow();
  });
});

describe("akarStorage", () => {
  const asli = process.env.GAJIHUB_STORAGE_DIR;
  afterEach(() => {
    if (asli === undefined) delete process.env.GAJIHUB_STORAGE_DIR;
    else process.env.GAJIHUB_STORAGE_DIR = asli;
  });

  it("bawaan <cwd>/storage/uploads", () => {
    delete process.env.GAJIHUB_STORAGE_DIR;
    expect(akarStorage()).toBe(path.join(process.cwd(), "storage", "uploads"));
  });

  it("env absolut menimpa; env relatif diabaikan", () => {
    process.env.GAJIHUB_STORAGE_DIR = AKAR;
    expect(akarStorage()).toBe(AKAR);
    process.env.GAJIHUB_STORAGE_DIR = "relatif/saja";
    expect(akarStorage()).toBe(path.join(process.cwd(), "storage", "uploads"));
  });
});

describe("tipeKonten", () => {
  it("daftar putih", () => {
    expect(tipeKonten("a.PDF")).toBe("application/pdf");
    expect(tipeKonten("a.png")).toBe("image/png");
    expect(tipeKonten("a.jpg")).toBe("image/jpeg");
    expect(tipeKonten("a.jpeg")).toBe("image/jpeg");
    expect(tipeKonten("a.webp")).toBe("image/webp");
  });

  it("selain itu null", () => {
    expect(tipeKonten("a.html")).toBeNull();
    expect(tipeKonten("a.svg")).toBeNull();
    expect(tipeKonten("tanpa-ekstensi")).toBeNull();
  });
});

describe("headerUnduh", () => {
  it("nama berspasi dan beraksen: filename ASCII + filename* ter-encode", () => {
    const h = headerUnduh("Surat Sakit Budi é.pdf", { inline: true, panjang: 42 });
    expect(h["Content-Disposition"]).toBe(
      `inline; filename="Surat Sakit Budi _.pdf"; filename*=UTF-8''Surat%20Sakit%20Budi%20%C3%A9.pdf`
    );
    expect(h["Content-Type"]).toBe("application/pdf");
    expect(h["Content-Length"]).toBe("42");
    expect(h["Cache-Control"]).toBe("private, no-store");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("attachment bila diminta", () => {
    const h = headerUnduh("a.png", { inline: false, panjang: 1 });
    expect(h["Content-Disposition"].startsWith("attachment;")).toBe(true);
  });

  it("karakter yang bisa menyuntik header dibuang", () => {
    const h = headerUnduh('a"b\r\nSet-Cookie: x.pdf', { inline: true, panjang: 1 });
    expect(h["Content-Disposition"]).not.toMatch(/[\r\n]/);
    expect(h["Content-Disposition"]).toContain('filename="a_b__Set-Cookie: x.pdf"');
  });

  it("apostrof dan tanda kurung di-encode di filename*", () => {
    const h = headerUnduh("a(1)'.pdf", { inline: true, panjang: 1 });
    expect(h["Content-Disposition"]).toContain("filename*=UTF-8''a%281%29%27.pdf");
  });

  it("tipe di luar daftar putih dipaksa attachment octet-stream", () => {
    const h = headerUnduh("a.html", { inline: true, panjang: 1 });
    expect(h["Content-Type"]).toBe("application/octet-stream");
    expect(h["Content-Disposition"].startsWith("attachment;")).toBe(true);
  });
});

describe("cocokTandaTangan", () => {
  const b = (...x: number[]) => Uint8Array.from(x);

  it("PDF", () => {
    expect(cocokTandaTangan(Buffer.from("%PDF-1.7 ..."), "pdf")).toBe(true);
    expect(cocokTandaTangan(Buffer.from("<html>"), "pdf")).toBe(false);
  });

  it("PNG", () => {
    expect(cocokTandaTangan(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0), ".png")).toBe(true);
    expect(cocokTandaTangan(b(0x89, 0x50, 0x4e, 0x47), "png")).toBe(false);
  });

  it("JPEG untuk jpg dan jpeg", () => {
    expect(cocokTandaTangan(b(0xff, 0xd8, 0xff, 0xe0), "jpg")).toBe(true);
    expect(cocokTandaTangan(b(0xff, 0xd8, 0xff, 0xe1), "JPEG")).toBe(true);
    expect(cocokTandaTangan(b(0xff, 0xd8), "jpg")).toBe(false);
  });

  it("WebP", () => {
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([1, 2, 3, 4]), Buffer.from("WEBP")]);
    expect(cocokTandaTangan(webp, "webp")).toBe(true);
    const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.from([1, 2, 3, 4]), Buffer.from("WAVE")]);
    expect(cocokTandaTangan(wav, "webp")).toBe(false);
  });

  it("isi PDF berekstensi png ditolak, dan ekstensi asing ditolak", () => {
    expect(cocokTandaTangan(Buffer.from("%PDF-1.4"), "png")).toBe(false);
    expect(cocokTandaTangan(Buffer.from("%PDF-1.4"), "exe")).toBe(false);
    expect(cocokTandaTangan(new Uint8Array(0), "pdf")).toBe(false);
  });
});

describe("uraiReferensi - segmen berakhiran titik atau spasi", () => {
  it("ditolak, karena Win32 membuangnya diam-diam (\".. \" dibaca \"..\")", () => {
    expect(uraiReferensi("tte/.. /rahasia.pdf")).toBeNull();
    expect(uraiReferensi("tte/... /x.pdf")).toBeNull();
    expect(uraiReferensi("tte/unit./x.pdf")).toBeNull();
    expect(uraiReferensi("tte/unit /x.pdf")).toBeNull();
    expect(uraiReferensi("/uploads/tte/x.pdf%20")).toBeNull();
  });

  it("spasi & titik di TENGAH nama tetap sah", () => {
    expect(uraiReferensi("tte/Biro Umum/2026-08/SPTJM - UM Agustus 2026.pdf")).not.toBeNull();
  });

  it("nama folder bentukan namaFolderUnit tidak pernah tertolak aturan ini", () => {
    for (const unit of ["Biro Umum.", "Biro Umum  ", "Pusat Data dan Teknologi Informasi ..."]) {
      expect(uraiReferensi(`tte/${namaFolderUnit(unit)}/2026-08/x.pdf`)).not.toBeNull();
    }
  });
});

describe("headerUnduh - Content-Security-Policy sandbox", () => {
  it("gambar diberi sandbox", () => {
    const h = headerUnduh("bukti.png", { inline: true, panjang: 10 });
    expect(h["Content-Security-Policy"]).toContain("sandbox");
    expect(h["Content-Security-Policy"]).toContain("default-src 'none'");
  });

  it("tipe di luar daftar putih (diunduh) juga diberi sandbox", () => {
    expect(headerUnduh("x.exe", { inline: true, panjang: 1 })["Content-Security-Policy"]).toContain("sandbox");
  });

  it("PDF TIDAK diberi sandbox - penampil PDF peramban tidak jalan di dokumen ber-sandbox", () => {
    expect(headerUnduh("SPTJM.pdf", { inline: true, panjang: 10 })["Content-Security-Policy"]).toBeUndefined();
  });
});
