import { describe, it, expect } from "vitest";
import {
  alamatVerifikasiTte,
  tautanVerifikasiDokumen,
} from "../alamatVerifikasi";

const env = (isi: Record<string, string>) => isi as NodeJS.ProcessEnv;

describe("alamatVerifikasiTte - sumber nilainya", () => {
  it("TTE_VERIFY_BASE_URL menang atas NEXT_PUBLIC_APP_URL", () => {
    expect(
      alamatVerifikasiTte(
        env({
          TTE_VERIFY_BASE_URL: "https://khusus.go.id",
          NEXT_PUBLIC_APP_URL: "https://umum.go.id",
        })
      )
    ).toBe("https://khusus.go.id");
  });

  it("jatuh ke NEXT_PUBLIC_APP_URL kalau yang pertama kosong", () => {
    expect(
      alamatVerifikasiTte(
        env({ TTE_VERIFY_BASE_URL: "   ", NEXT_PUBLIC_APP_URL: "https://umum.go.id" })
      )
    ).toBe("https://umum.go.id");
  });

  it("tanda kutip dari .env dibuang", () => {
    expect(
      alamatVerifikasiTte(env({ TTE_VERIFY_BASE_URL: '"http://192.168.221.44:3002"' }))
    ).toBe("http://192.168.221.44:3002");
  });

  it("garis miring di ujung dibuang supaya tidak jadi //tte/verify", () => {
    expect(
      alamatVerifikasiTte(env({ TTE_VERIFY_BASE_URL: "https://a.go.id///" }))
    ).toBe("https://a.go.id");
  });

  it("awalan path dipertahankan - sebagian pemasangan ada di subpath", () => {
    expect(
      alamatVerifikasiTte(env({ TTE_VERIFY_BASE_URL: "https://a.go.id/gajihub/" }))
    ).toBe("https://a.go.id/gajihub");
  });
});

describe("alamatVerifikasiTte - yang WAJIB menghentikan penandatanganan", () => {
  // Alamatnya terkunci permanen di dalam PDF bertanda tangan. Berhenti dengan
  // pesan jelas jauh lebih murah daripada dokumen sah yang QR-nya buntu.
  it("belum diatur sama sekali", () => {
    expect(() => alamatVerifikasiTte(env({}))).toThrow(/belum diatur/i);
  });

  it("localhost - di HP pemindai itu berarti HP-nya sendiri", () => {
    expect(() =>
      alamatVerifikasiTte(env({ TTE_VERIFY_BASE_URL: "http://localhost:3002" }))
    ).toThrow(/localhost/);
  });

  it("127.0.0.1 ditolak dengan alasan yang sama", () => {
    expect(() =>
      alamatVerifikasiTte(env({ TTE_VERIFY_BASE_URL: "http://127.0.0.1:3000" }))
    ).toThrow(/tidak akan menuju/i);
  });

  it("0.0.0.0 dan ::1 ikut ditolak", () => {
    expect(() =>
      alamatVerifikasiTte(env({ TTE_VERIFY_BASE_URL: "http://0.0.0.0:3002" }))
    ).toThrow();
    expect(() =>
      alamatVerifikasiTte(env({ TTE_VERIFY_BASE_URL: "http://[::1]:3002" }))
    ).toThrow();
  });

  it("tanpa skema bukan URL yang sah", () => {
    expect(() =>
      alamatVerifikasiTte(env({ TTE_VERIFY_BASE_URL: "192.168.221.44:3002" }))
    ).toThrow(/skema/i);
  });

  it("skema bukan web ditolak", () => {
    expect(() =>
      alamatVerifikasiTte(env({ TTE_VERIFY_BASE_URL: "file:///tmp/a" }))
    ).toThrow(/http/i);
  });

  it("pesannya selalu menyebut nama variabel yang harus diisi", () => {
    try {
      alamatVerifikasiTte(env({}));
      throw new Error("mestinya melempar");
    } catch (e) {
      expect((e as Error).message).toContain("TTE_VERIFY_BASE_URL");
    }
  });
});

describe("tautanVerifikasiDokumen", () => {
  it("bentuknya alamat + /tte/verify/<id>", () => {
    expect(
      tautanVerifikasiDokumen("abc-123", env({ TTE_VERIFY_BASE_URL: "https://a.go.id" }))
    ).toBe("https://a.go.id/tte/verify/abc-123");
  });

  it("tidak menghasilkan garis miring dobel", () => {
    expect(
      tautanVerifikasiDokumen("abc", env({ TTE_VERIFY_BASE_URL: "https://a.go.id/" }))
    ).not.toContain("//tte");
  });
});
