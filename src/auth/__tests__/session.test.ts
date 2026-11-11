import { describe, it, expect, beforeAll } from "vitest";
import {
  buatTokenSesi,
  nilaiTokenSesi,
  perluPerpanjang,
  terbitkanUlang,
  verifikasiTokenSesi,
  batasMenganggurMs,
  SESSION_MAX_AGE_DETIK,
} from "../session";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-buat-unit-test-saja-32";
});

const PAYLOAD = {
  userId: "user-1",
  nip: "111",
  nama: "Atasan Langsung",
  role: "KASUBAG_TU" as const,
  satuanKerja: "Sekretariat Jenderal",
  jabatan: "Kepala Subbagian",
};

describe("buatTokenSesi & verifikasiTokenSesi", () => {
  it("gagal eksplisit jika SESSION_SECRET tidak tersedia", async () => {
    const secretSebelumnya = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;

    try {
      await expect(buatTokenSesi(PAYLOAD)).rejects.toThrow(/SESSION_SECRET/);
      await expect(verifikasiTokenSesi("payload.signature")).rejects.toThrow(
        /SESSION_SECRET/
      );
    } finally {
      if (secretSebelumnya === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = secretSebelumnya;
    }
  });

  it("menolak SESSION_SECRET yang terlalu pendek", async () => {
    const secretSebelumnya = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "secret-pendek";

    try {
      await expect(buatTokenSesi(PAYLOAD)).rejects.toThrow(/minimal 32 byte/);
    } finally {
      if (secretSebelumnya === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = secretSebelumnya;
    }
  });

  it("token yang baru dibuat bisa diverifikasi dan isinya sama", async () => {
    const token = await buatTokenSesi(PAYLOAD);
    const hasil = await verifikasiTokenSesi(token);

    expect(hasil).toMatchObject(PAYLOAD);
    expect(hasil?.v).toBe(0);
    expect(hasil?.ak).toBe(hasil?.lp);
  });

  it("token yang di-utak-atik (tamper) ditolak", async () => {
    const token = await buatTokenSesi(PAYLOAD);
    const [payloadB64, signatureB64] = token.split(".");

    // Ganti isi payload tapi signature tetap yang lama - simulasi orang
    // coba ubah nip/jabatan sendiri lewat cookie tanpa tahu SESSION_SECRET.
    const payloadDiubah = Buffer.from(
      JSON.stringify({ ...PAYLOAD, jabatan: "Sekjen", exp: Date.now() + 100000 })
    ).toString("base64url");
    const tokenPalsu = `${payloadDiubah}.${signatureB64}`;

    const hasil = await verifikasiTokenSesi(tokenPalsu);
    expect(hasil).toBeNull();
  });

  it("token acak/bukan format yang benar ditolak", async () => {
    expect(await verifikasiTokenSesi("bukan-token-valid")).toBeNull();
    expect(await verifikasiTokenSesi("")).toBeNull();
  });

  it("token yang sudah kedaluwarsa ditolak", async () => {
    // Buat token dengan exp di masa lalu secara manual (bypass buatTokenSesi
    // yang selalu set exp di masa depan).
    const payloadKedaluwarsa = Buffer.from(
      JSON.stringify({ ...PAYLOAD, v: 0, lp: Date.now() - 9e7, ak: Date.now() - 1000, exp: Date.now() - 1000 })
    ).toString("base64url");

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(process.env.SESSION_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(payloadKedaluwarsa)
    );
    const signatureB64 = Buffer.from(signature).toString("base64url");

    const hasil = await verifikasiTokenSesi(`${payloadKedaluwarsa}.${signatureB64}`);
    expect(hasil).toBeNull();
  });
});

// ============================================================================
// COOKIE CACAT TIDAK BOLEH MELEMPAR.
//
// verifikasiTokenSesi dipanggil dari src/middleware.ts, dan lemparan di
// middleware jadi HTTP 500 untuk SETIAP halaman - /login ikut, sehingga tidak
// ada jalan untuk membuang cookie penyebabnya. Pernah terjadi sungguhan:
// `atob` di dalam base64UrlDecode melempar "Invalid character" untuk cookie
// yang bukan base64url.
//
// Yang TETAP melempar: SESSION_SECRET belum diatur - itu salah konfigurasi
// server, bukan cookie pengunjung, dan dijaga test di atas.
// ============================================================================

describe("verifikasiTokenSesi menghadapi cookie cacat", () => {
  const CACAT = [
    ["bukan base64url", "aaa.!!!bukan-base64!!!"],
    ["tanda tangan berisi karakter terlarang", "YWJj.@@@@"],
    ["payload berisi karakter terlarang", "@@@@.YWJj"],
    ["cuma titik", "."],
    ["titik di tengah teks acak", "halo.dunia"],
    ["payload base64 tapi bukan JSON", "YWJj.YWJj"],
    ["tiga bagian", "YWJj.YWJj.YWJj"],
  ] as const;

  for (const [label, token] of CACAT) {
    it(`mengembalikan null, tidak melempar - ${label}`, async () => {
      await expect(verifikasiTokenSesi(token)).resolves.toBeNull();
    });
  }

  it("token sah yang dipotong di tengah juga null", async () => {
    const token = await buatTokenSesi(PAYLOAD);
    await expect(
      verifikasiTokenSesi(token.slice(0, token.length - 5))
    ).resolves.toBeNull();
  });

  it("token sah yang bagian payload-nya diganti juga null", async () => {
    const token = await buatTokenSesi(PAYLOAD);
    const tandaTangan = token.split(".")[1];
    await expect(
      verifikasiTokenSesi("ZGlnYW50aQ." + tandaTangan)
    ).resolves.toBeNull();
  });
});

// ============================================================================
// BATAS MENGANGGUR 30 MENIT + BATAS MUTLAK 8 JAM SEJAK LOGIN
// ============================================================================

const MENIT = 60 * 1000;
const JAM = 60 * MENIT;
const T0 = 1_800_000_000_000;

async function tokenMentah(isi: Record<string, unknown>): Promise<string> {
  const payloadB64 = Buffer.from(JSON.stringify(isi)).toString("base64url");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(process.env.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${Buffer.from(sig).toString("base64url")}`;
}

describe("nilaiTokenSesi", () => {
  it("token baru: ok, lp = ak = waktu terbit", async () => {
    const token = await buatTokenSesi({ ...PAYLOAD, v: 3 }, T0);
    const h = await nilaiTokenSesi(token, T0 + 1000);
    expect(h.status).toBe("ok");
    expect(h.payload).toMatchObject({ v: 3, lp: T0, ak: T0 });
    expect(h.payload).not.toHaveProperty("exp");
  });

  it("tanpa token / cookie cacat -> tidak-ada", async () => {
    expect((await nilaiTokenSesi(undefined)).status).toBe("tidak-ada");
    expect((await nilaiTokenSesi("")).status).toBe("tidak-ada");
    expect((await nilaiTokenSesi("halo.dunia")).status).toBe("tidak-ada");
  });

  it("menganggur: tepat 30 menit sejak aktivitas terakhir ditolak, 29:59 masih ok", async () => {
    const token = await buatTokenSesi(PAYLOAD, T0);
    expect((await nilaiTokenSesi(token, T0 + 30 * MENIT - 1)).status).toBe("ok");
    const h = await nilaiTokenSesi(token, T0 + 30 * MENIT);
    expect(h.status).toBe("menganggur");
    expect(h.payload).toBeNull();
  });

  it("batas mutlak 8 jam sejak LOGIN walau aktivitas terus berjalan", async () => {
    let token = await buatTokenSesi(PAYLOAD, T0);
    for (let t = 10 * MENIT; t <= 8 * JAM - 10 * MENIT; t += 10 * MENIT) {
      const h = await nilaiTokenSesi(token, T0 + t);
      expect(h.status).toBe("ok");
      token = await terbitkanUlang(h.payload!, T0 + t);
    }
    expect((await nilaiTokenSesi(token, T0 + 8 * JAM - 1)).status).toBe("ok");
    expect((await nilaiTokenSesi(token, T0 + 8 * JAM)).status).toBe("kedaluwarsa");
    expect(SESSION_MAX_AGE_DETIK).toBe(8 * 3600);
  });

  it("kedaluwarsa didahulukan di atas menganggur", async () => {
    const token = await buatTokenSesi(PAYLOAD, T0);
    expect((await nilaiTokenSesi(token, T0 + 9 * JAM)).status).toBe("kedaluwarsa");
  });

  it("format lama (tanpa v/lp/ak): ditolak walau tanda tangan sah dan belum habis", async () => {
    const token = await tokenMentah({ ...PAYLOAD, exp: T0 + 8 * JAM });
    const h = await nilaiTokenSesi(token, T0);
    expect(h.status).toBe("format-lama");
    expect(h.payload).toBeNull();
    expect(await verifikasiTokenSesi(token, T0)).toBeNull();
  });

  it("override SESI_MENGANGGUR_MENIT dibaca; nilai tak valid jatuh ke 30", () => {
    expect(batasMenganggurMs({ SESI_MENGANGGUR_MENIT: "1" })).toBe(MENIT);
    expect(batasMenganggurMs({})).toBe(30 * MENIT);
    expect(batasMenganggurMs({ SESI_MENGANGGUR_MENIT: "abc" })).toBe(30 * MENIT);
    expect(batasMenganggurMs({ SESI_MENGANGGUR_MENIT: "0" })).toBe(30 * MENIT);
  });
});

describe("perluPerpanjang & terbitkanUlang", () => {
  const p = { ...PAYLOAD, v: 2, lp: T0, ak: T0 + 10 * MENIT };

  it("perlu bila ak sudah >= 60 detik lalu; tidak bila kurang", () => {
    expect(perluPerpanjang(p, p.ak + 59_999)).toBe(false);
    expect(perluPerpanjang(p, p.ak + 60_000)).toBe(true);
  });

  it("terbitkanUlang: ak = now; lp/v/identitas dipertahankan", async () => {
    const sekarang = T0 + 20 * MENIT;
    const token = await terbitkanUlang(p, sekarang);
    const h = await nilaiTokenSesi(token, sekarang);
    expect(h.payload).toMatchObject({ ...p, ak: sekarang });
  });

  it("terbitkanUlang tidak menggeser batas mutlak", async () => {
    const dekat = await terbitkanUlang(p, T0 + 7 * JAM + 50 * MENIT);
    expect((await nilaiTokenSesi(dekat, T0 + 7 * JAM + 55 * MENIT)).status).toBe("ok");
    expect((await nilaiTokenSesi(dekat, T0 + 8 * JAM)).status).toBe("kedaluwarsa");
  });
});
