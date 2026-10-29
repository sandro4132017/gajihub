import { describe, it, expect, beforeEach } from "vitest";
import {
  periksaKeBsre,
  kosongkanCachePeriksaBsre,
  jalurDisk,
  TTL_PERIKSA_MENIT,
} from "../periksaBsre";

const BERKAS = "/uploads/tte/abc/SPTJM.pdf";
const bacaBerkas = async () => Buffer.from("%PDF-1.7");

beforeEach(() => kosongkanCachePeriksaBsre());

describe("vonis diturunkan dari summary, BUKAN dari success", () => {
  // `success` hanya berarti panggilan API-nya berhasil. Kekeliruan ini pernah
  // terjadi sungguhan dan membuat dokumen tanpa tanda tangan terbaca sah.
  it("summary VALID -> VALID", async () => {
    const h = await periksaKeBsre("d1", BERKAS, {
      bacaBerkas,
      verifikasi: async () => ({ success: true, summary: "VALID" }),
    });
    expect(h.vonis).toBe("VALID");
  });

  it("summary NO_SIGNATURE -> TANPA_TANDA_TANGAN", async () => {
    const h = await periksaKeBsre("d2", BERKAS, {
      bacaBerkas,
      verifikasi: async () => ({ success: true, summary: "NO_SIGNATURE" }),
    });
    expect(h.vonis).toBe("TANPA_TANDA_TANGAN");
  });

  it("summary INVALID -> TIDAK_DISAHKAN, bukan VALID", async () => {
    const h = await periksaKeBsre("d3", BERKAS, {
      bacaBerkas,
      verifikasi: async () => ({ success: true, summary: "INVALID" }),
    });
    expect(h.vonis).toBe("TIDAK_DISAHKAN");
  });

  it("success true tanpa summary TIDAK dianggap sah", async () => {
    const h = await periksaKeBsre("d4", BERKAS, {
      bacaBerkas,
      verifikasi: async () => ({ success: true }),
    });
    expect(h.vonis).not.toBe("VALID");
  });
});

describe("tidak pernah melempar - halaman verify dibuka orang luar", () => {
  it("BSrE menjawab gagal -> TIDAK_BISA_DIPERIKSA", async () => {
    const h = await periksaKeBsre("g1", BERKAS, {
      bacaBerkas,
      verifikasi: async () => ({ success: false, error: "layanan mati" }),
    });
    expect(h.vonis).toBe("TIDAK_BISA_DIPERIKSA");
    expect(h.keterangan).toBe("layanan mati");
  });

  it("jaringan putus (melempar) -> TIDAK_BISA_DIPERIKSA", async () => {
    const h = await periksaKeBsre("g2", BERKAS, {
      bacaBerkas,
      verifikasi: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    expect(h.vonis).toBe("TIDAK_BISA_DIPERIKSA");
    expect(h.keterangan).toContain("ECONNREFUSED");
  });

  it("berkas hilang dari disk dilaporkan, tidak disembunyikan", async () => {
    const h = await periksaKeBsre("g3", BERKAS, {
      bacaBerkas: async () => {
        throw new Error("ENOENT");
      },
      verifikasi: async () => ({ success: true, summary: "VALID" }),
    });
    expect(h.vonis).toBe("TIDAK_BISA_DIPERIKSA");
    expect(h.keterangan).toMatch(/tidak ditemukan/i);
  });
});

describe("cache - halaman ini terbuka tanpa login", () => {
  it("pemindaian kedua dalam masa berlaku tidak memanggil BSrE lagi", async () => {
    let panggilan = 0;
    const dep = {
      bacaBerkas,
      verifikasi: async () => {
        panggilan++;
        return { success: true, summary: "VALID" };
      },
    };
    await periksaKeBsre("c1", BERKAS, dep);
    await periksaKeBsre("c1", BERKAS, dep);
    await periksaKeBsre("c1", BERKAS, dep);
    expect(panggilan).toBe(1);
  });

  it("sesudah masa berlakunya lewat, ditanyakan ulang", async () => {
    let panggilan = 0;
    let jam = 1_000_000;
    const dep = {
      bacaBerkas,
      sekarang: () => jam,
      verifikasi: async () => {
        panggilan++;
        return { success: true, summary: "VALID" };
      },
    };
    await periksaKeBsre("c2", BERKAS, dep);
    jam += TTL_PERIKSA_MENIT * 60_000 + 1;
    await periksaKeBsre("c2", BERKAS, dep);
    expect(panggilan).toBe(2);
  });

  it("pemindaian berbarengan menumpang satu panggilan yang sama", async () => {
    let panggilan = 0;
    const dep = {
      bacaBerkas,
      verifikasi: async () => {
        panggilan++;
        await new Promise((r) => setTimeout(r, 10));
        return { success: true, summary: "VALID" };
      },
    };
    const hasil = await Promise.all([
      periksaKeBsre("c3", BERKAS, dep),
      periksaKeBsre("c3", BERKAS, dep),
      periksaKeBsre("c3", BERKAS, dep),
    ]);
    expect(panggilan).toBe(1);
    expect(hasil.every((h) => h.vonis === "VALID")).toBe(true);
  });

  it("jawaban GAGAL ikut disimpan - BSrE yang mati tidak dipanggil tiap pindai", async () => {
    let panggilan = 0;
    const dep = {
      bacaBerkas,
      verifikasi: async () => {
        panggilan++;
        return { success: false, error: "mati" };
      },
    };
    await periksaKeBsre("c4", BERKAS, dep);
    await periksaKeBsre("c4", BERKAS, dep);
    expect(panggilan).toBe(1);
  });

  it("dokumen berbeda tidak saling menumpang hasil", async () => {
    const dep = (ringkas: string) => ({
      bacaBerkas,
      verifikasi: async () => ({ success: true, summary: ringkas }),
    });
    const a = await periksaKeBsre("c5a", BERKAS, dep("VALID"));
    const b = await periksaKeBsre("c5b", BERKAS, dep("NO_SIGNATURE"));
    expect(a.vonis).toBe("VALID");
    expect(b.vonis).toBe("TANPA_TANDA_TANGAN");
  });
});

describe("jalurDisk", () => {
  it("membuang query penanda versi", () => {
    expect(jalurDisk("/uploads/tte/x/a.pdf?v=9")).toMatch(/a\.pdf$/);
  });

  it("nama berkas ber-spasi yang ter-encode dikembalikan utuh", () => {
    expect(jalurDisk("/uploads/tte/x/SPTJM%20Tukin.pdf")).toContain("SPTJM Tukin.pdf");
  });

  it("format lama dipetakan ke penyimpanan privat, bukan public/", () => {
    const j = jalurDisk("/uploads/tte/x/a.pdf");
    expect(j).toMatch(/storage[\\/]uploads[\\/]tte[\\/]x[\\/]a\.pdf$/);
    expect(j).not.toMatch(/public/);
  });

  it("format lama di root tte/ (signed_<id>.pdf, SPTJM - ....pdf)", () => {
    expect(jalurDisk("/uploads/tte/signed_abc.pdf")).toMatch(/tte[\\/]signed_abc\.pdf$/);
    expect(jalurDisk("/uploads/tte/SPTJM%20-%20UM%20Agustus.pdf")).toContain("SPTJM - UM Agustus.pdf");
  });

  it("kunci baru berfolder unit dan periode terbaca utuh", () => {
    expect(jalurDisk("tte/Biro Umum/2026-08/abc/SPTJM - UM.pdf")).toMatch(
      /tte[\\/]Biro Umum[\\/]2026-08[\\/]abc[\\/]SPTJM - UM\.pdf$/
    );
  });

  it("MELEMPAR untuk traversal, jenis lain, dan URL luar", () => {
    expect(() => jalurDisk("/uploads/tte/../bukti-dukung/a.pdf")).toThrow();
    expect(() => jalurDisk("/uploads/tte/..%2F..%2Fx.pdf")).toThrow();
    expect(() => jalurDisk("bukti-dukung/a.pdf")).toThrow();
    expect(() => jalurDisk("https://placeholder.local/a.pdf")).toThrow();
  });
});

describe("periksaKeBsre dengan referensi tak sah", () => {
  it("TIDAK_BISA_DIPERIKSA, berkas tidak dibaca", async () => {
    let dibaca = false;
    const h = await periksaKeBsre("tak-sah", "tte/../x.pdf", {
      bacaBerkas: async () => {
        dibaca = true;
        return Buffer.from("%PDF");
      },
      verifikasi: async () => ({ success: true, summary: "VALID" }),
    });
    expect(h.vonis).toBe("TIDAK_BISA_DIPERIKSA");
    expect(dibaca).toBe(false);
  });
});
