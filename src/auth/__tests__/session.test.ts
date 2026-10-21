import { describe, it, expect, beforeAll } from "vitest";
import { buatTokenSesi, verifikasiTokenSesi } from "../session";

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

    expect(hasil).toEqual(PAYLOAD);
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
      JSON.stringify({ ...PAYLOAD, exp: Date.now() - 1000 })
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
