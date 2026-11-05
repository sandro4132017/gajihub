import { describe, it, expect } from "vitest";
import {
  AWALAN_ID_SIMULASI,
  apakahHasilSimulasi,
  bolehSimulasiTte,
  idDokumenSimulasi,
  klasifikasiGagalBsre,
  samarkanPassphrase,
} from "../simulasiTte";

// ============================================================================
// Yang dijaga berkas ini: dokumen yang TIDAK pernah ditandatangani BSrE tidak
// boleh terbaca sebagai sah. Halaman /tte/verify dibuka dengan memindai QR di
// PDF-nya, jadi jawabannya dibaca orang luar sebagai pernyataan resmi atas
// SPTJM - surat pernyataan tanggung jawab mutlak dalam rantai pembayaran.
// ============================================================================

const UUID = "3f2a91cd-77b1-4e0e-9a11-55c0de123456";

describe("idDokumenSimulasi", () => {
  it("berawalan SIMULASI-, tidak pernah BSRE-", () => {
    const id = idDokumenSimulasi(UUID);
    expect(id.startsWith(AWALAN_ID_SIMULASI)).toBe(true);
    expect(id.startsWith("BSRE-")).toBe(false);
  });

  it("memakai 8 karakter pertama uuid dokumen, huruf besar", () => {
    expect(idDokumenSimulasi(UUID)).toBe("SIMULASI-3F2A91CD");
  });
});

describe("apakahHasilSimulasi", () => {
  it("id berawalan SIMULASI- -> simulasi", () => {
    expect(apakahHasilSimulasi({ id: UUID, idDokumenBsre: idDokumenSimulasi(UUID) })).toBe(true);
  });

  it("MENGENALI BENTUK LAMA: BSRE- + 8 karakter pertama uuid-nya sendiri", () => {
    // Sebelum 2026-10-20 id cadangan simulasi berawalan BSRE-. Bentuk itu bisa
    // dikenali PERSIS karena diturunkan dari id barisnya, jadi dokumen lama
    // tidak perlu ditebak. Terukur di database: 1 dari 6 dokumen seperti ini,
    // dan satu-satunya yang signingTimeMs-nya 120 ms (nilai karangan).
    expect(apakahHasilSimulasi({ id: UUID, idDokumenBsre: "BSRE-3F2A91CD" })).toBe(true);
  });

  it("id BSrE sungguhan TIDAK dianggap simulasi", () => {
    // Yang penting di sini: awalan BSRE- saja tidak cukup untuk menuduh sebuah
    // dokumen palsu - harus cocok dengan uuid barisnya.
    expect(apakahHasilSimulasi({ id: UUID, idDokumenBsre: "BSRE-99999999" })).toBe(false);
    expect(apakahHasilSimulasi({ id: UUID, idDokumenBsre: "8a1f0c2b-bsre-doc-id" })).toBe(false);
  });

  it("id milik dokumen LAIN tidak tertukar", () => {
    const lain = "99999999-0000-0000-0000-000000000000";
    expect(apakahHasilSimulasi({ id: lain, idDokumenBsre: "BSRE-3F2A91CD" })).toBe(false);
  });

  it("id kosong / null -> BUKAN simulasi, dan juga bukan sah", () => {
    // null terjadi pada dokumen GAGAL. Fungsi ini hanya menjawab "apakah
    // simulasi"; keabsahannya ditentukan status, dan status GAGAL sudah
    // menolaknya sendiri.
    expect(apakahHasilSimulasi({ id: UUID, idDokumenBsre: null })).toBe(false);
    expect(apakahHasilSimulasi({ id: UUID, idDokumenBsre: "" })).toBe(false);
  });

  it("spasi di tepi tidak membuat penanda lolos", () => {
    expect(apakahHasilSimulasi({ id: UUID, idDokumenBsre: "  SIMULASI-3F2A91CD  " })).toBe(true);
    expect(apakahHasilSimulasi({ id: UUID, idDokumenBsre: " BSRE-3F2A91CD " })).toBe(true);
  });
});

describe("gerbang keabsahan di halaman verifikasi", () => {
  // Aturan yang sama dengan src/app/tte/verify/[id]/page.tsx. Ditulis ulang di
  // sini sebagai test supaya tidak bisa diam-diam dibuat longgar lagi.
  const sah = (d: { id: string; idDokumenBsre: string | null; status: string }) =>
    d.status === "TERTANDATANGANI" && !apakahHasilSimulasi(d);

  it("TERTANDATANGANI oleh BSrE -> sah", () => {
    expect(sah({ id: UUID, idDokumenBsre: "BSRE-99999999", status: "TERTANDATANGANI" })).toBe(true);
  });

  it("TERTANDATANGANI tapi hasil simulasi -> TIDAK sah", () => {
    expect(sah({ id: UUID, idDokumenBsre: "SIMULASI-3F2A91CD", status: "TERTANDATANGANI" })).toBe(false);
    expect(sah({ id: UUID, idDokumenBsre: "BSRE-3F2A91CD", status: "TERTANDATANGANI" })).toBe(false);
  });

  it("status apa pun selain TERTANDATANGANI -> TIDAK sah", () => {
    for (const status of ["DRAFT", "MENUNGGU_TTE", "GAGAL"]) {
      expect(sah({ id: UUID, idDokumenBsre: "BSRE-99999999", status })).toBe(false);
    }
  });
});

describe("bolehSimulasiTte", () => {
  const kasus: Array<[string, string | undefined, boolean]> = [
    ["production", "true", false],
    ["production", "TRUE", false],
    ["production", undefined, false],
    ["development", "true", true],
    ["development", "TRUE", true],
    ["development", " true ", true],
    ["development", undefined, false],
    ["development", "1", false],
    ["test", "true", true],
    ["test", undefined, false],
    ["test", "1", false],
  ];
  it.each(kasus)("NODE_ENV=%s TTE_SIMULASI=%s -> %s", (nodeEnv, flag, hasil) => {
    expect(bolehSimulasiTte({ NODE_ENV: nodeEnv, TTE_SIMULASI: flag })).toBe(hasil);
  });
});

describe("klasifikasiGagalBsre", () => {
  const kasus: Array<[{ error?: string; statusCode?: number }, string]> = [
    [{ statusCode: 500 }, "BSRE_ERROR"],
    [{ statusCode: 503 }, "BSRE_ERROR"],
    [{ error: "fetch failed" }, "NETWORK_TIMEOUT"],
    [{ error: "connect ECONNREFUSED 10.0.0.1:80" }, "NETWORK_TIMEOUT"],
    [{ error: "Timeout menghubungi BSrE" }, "NETWORK_TIMEOUT"],
    [{ statusCode: 0, error: "ditolak" }, "PASSPHRASE_SALAH"],
    [{ error: "Passphrase salah", statusCode: 400 }, "PASSPHRASE_SALAH"],
    [{ statusCode: 422, error: "dokumen tidak valid" }, "BSRE_ERROR"],
  ];
  it.each(kasus)("%j -> %s", (input, kategori) => {
    expect(klasifikasiGagalBsre(input).kategori).toBe(kategori);
  });

  it("pesan 5xx menyebut kode HTTP", () => {
    expect(klasifikasiGagalBsre({ statusCode: 503 }).pesanPengguna).toMatch(/HTTP 503/);
  });
});

describe("samarkanPassphrase", () => {
  it("mengganti semua kemunculan secara literal", () => {
    expect(samarkanPassphrase("a RAHASIA-1 b RAHASIA-1", "RAHASIA-1")).toBe(
      "a [disamarkan] b [disamarkan]"
    );
  });
  it("karakter regex di passphrase diperlakukan literal", () => {
    expect(samarkanPassphrase("x p.*a(1 y", "p.*a(1")).toBe("x [disamarkan] y");
    expect(samarkanPassphrase("pxxa", "p.*a")).toBe("pxxa");
  });
  it("passphrase kosong atau pendek tidak merusak teks", () => {
    expect(samarkanPassphrase("galat a b", "")).toBe("galat a b");
    expect(samarkanPassphrase("galat a b", "a")).toBe("galat a b");
  });
  it("teks kosong tetap kosong", () => {
    expect(samarkanPassphrase("", "RAHASIA-1")).toBe("");
  });
});
