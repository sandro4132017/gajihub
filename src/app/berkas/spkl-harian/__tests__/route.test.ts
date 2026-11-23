import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { extractText } from "unpdf";
import { tambalMathSumPrecise } from "../../../../lib/pdfTeks";
import { SPKL_AKTIF } from "../../../../lib/lembur/gerbangSpkl";

const m = vi.hoisted(() => ({
  ambilUserSesi: vi.fn(),
  findMany: vi.fn(),
  pegawaiFindMany: vi.fn(),
  pegawaiFindUnique: vi.fn(),
}));
vi.mock("@/auth/getSessionAccount", () => ({ ambilUserSesi: m.ambilUserSesi }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    perintahLembur: { findMany: m.findMany },
    pegawai: { findMany: m.pegawaiFindMany, findUnique: m.pegawaiFindUnique },
  },
}));

import { GET } from "../route";

tambalMathSumPrecise();

const SATKER = SPKL_AKTIF[0].satuanKerja;
const TANGGAL = "2026-12-10";
// 15:02 WIB: sudah lewat 15.00 + tenggang 60 dtk.
const SESUDAH_SIAP = new Date("2026-12-10T08:02:00Z");
// 15:00:30 WIB: terkunci tetapi masih dalam tenggang.
const DALAM_TENGGANG = new Date("2026-12-10T08:00:30Z");
// 12:00 WIB: perintah masih bisa masuk.
const SEBELUM_BATAS = new Date("2026-12-10T05:00:00Z");

const sesi = (o: Record<string, unknown> = {}) => ({
  id: "u-1",
  nip: "199001010000000001", // sensitive-ok
  role: "KASUBAG_TU",
  satuanKerja: SATKER,
  aktif: true,
  ...o,
});

const req = (q: Record<string, string> = {}) =>
  new NextRequest(
    "http://localhost/berkas/spkl-harian?" + new URLSearchParams({ tanggal: TANGGAL, ...q }).toString(),
  );

const rowDb = {
  tanggal: new Date("2026-12-10T00:00:00Z"),
  uraianTugas: "Menyusun laporan uji",
  kepalaTim: { nama: "KEPALA UJI" },
  anggota: [
    {
      pegawaiId: "p-a",
      jamDiperintahkan: 3,
      pegawai: { nip: "199001010000000021", nama: "ANGGOTA SATU", golongan: "III/c" }, // sensitive-ok
    },
  ],
};

async function teksPdf(res: Response): Promise<string[]> {
  const { text } = await extractText(new Uint8Array(await res.arrayBuffer()), { mergePages: false });
  return (text as string[]).map((t) => t.replace(/\s+/g, " "));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(SESUDAH_SIAP);
  Object.values(m).forEach((f) => f.mockReset());
  m.ambilUserSesi.mockResolvedValue(sesi());
  m.findMany.mockResolvedValue([rowDb]);
  m.pegawaiFindMany.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe("GET /berkas/spkl-harian", () => {
  it("tanpa sesi -> 401, database tidak disentuh", async () => {
    m.ambilUserSesi.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it.each(["KEPALA_TIM", "PEGAWAI"])("role %s -> 403", async (role) => {
    m.ambilUserSesi.mockResolvedValue(sesi({ role }));
    expect((await GET(req({ satker: SATKER }))).status).toBe(403);
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it("Kasubag TU satker lain tidak bisa membaca satker pilot lewat ?satker= (dikunci ke akunnya)", async () => {
    m.ambilUserSesi.mockResolvedValue(sesi({ satuanKerja: "Biro Lain" }));
    expect((await GET(req({ satker: SATKER }))).status).toBe(404); // gerbang pilot: satker akunnya tidak terdaftar
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it("tanggal tidak sah -> 400", async () => {
    expect((await GET(req({ tanggal: "2026-13-40" }))).status).toBe(400);
    expect((await GET(req({ tanggal: "bukan" }))).status).toBe(400);
  });

  it("sebelum siap (sebelum 15.00 atau dalam tenggang) -> 200 SEMENTARA: inline, no-store, cap di tiap halaman, nama -SEMENTARA", async () => {
    for (const saat of [DALAM_TENGGANG, SEBELUM_BATAS]) {
      vi.setSystemTime(saat);
      const res = await GET(req());
      expect(res.status).toBe(200);
      const cd = res.headers.get("Content-Disposition") ?? "";
      expect(cd).toContain("inline");
      expect(cd).toContain("SEMENTARA");
      expect(res.headers.get("Cache-Control")).toBe("private, no-store");
      const halaman = await teksPdf(res);
      expect(halaman.every((t) => t.includes("SEMENTARA - masih bisa bertambah sampai 15.00 WIB"))).toBe(true);
    }
  });

  it("siap dan ada perintah -> 200 PDF final (tanpa cap), inline, no-store", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const cd = res.headers.get("Content-Disposition") ?? "";
    expect(cd).toContain("SPKL Harian");
    expect(cd).toContain("inline");
    expect(cd).not.toContain("SEMENTARA");
    const arg = m.findMany.mock.calls[0][0];
    expect(arg.where.status).toBe("TERKIRIM");
    expect(arg.where.satuanKerja).toBe(SATKER);
    expect(arg.where.tanggal).toEqual(new Date(Date.UTC(2026, 11, 10)));
    const halaman = await teksPdf(res);
    expect(halaman.join(" ")).not.toContain("SEMENTARA");
    expect(halaman.join(" ")).toContain("Biro Keuangan dan BMN");
  });

  it("?unduh=1 tetap inline (dibuka di tab, bukan diunduh paksa)", async () => {
    const res = await GET(req({ unduh: "1" }));
    expect(res.headers.get("Content-Disposition")).toContain("inline");
  });

  it("siap tetapi tidak ada perintah -> 404", async () => {
    m.findMany.mockResolvedValue([]);
    expect((await GET(req())).status).toBe(404);
  });

  it("PPABP: wajib memilih satker (400), dengan satker -> 200; satker di luar gerbang -> 404", async () => {
    m.ambilUserSesi.mockResolvedValue(sesi({ role: "PPABP", satuanKerja: null }));
    expect((await GET(req())).status).toBe(400);
    expect((await GET(req({ satker: SATKER }))).status).toBe(200);
    expect((await GET(req({ satker: "Biro Non Pilot" }))).status).toBe(404);
  });

  it("ADMIN dengan satker -> 200", async () => {
    m.ambilUserSesi.mockResolvedValue(sesi({ role: "ADMIN", satuanKerja: null }));
    expect((await GET(req({ satker: SATKER }))).status).toBe(200);
  });

  it("Kepala Biro dari Pegawai: tepat satu -> namanya tercetak; nol -> garis titik-titik", async () => {
    m.pegawaiFindMany.mockResolvedValue([
      { nip: "198001010000000009", nama: "KEPALA BIRO PALSU", jabatan: "Kepala Biro Uji" }, // sensitive-ok
    ]);
    const ada = (await teksPdf(await GET(req()))).join(" ");
    expect(ada).toContain("Kepala Biro Palsu");
    expect(ada).toContain("NIP. 198001010000000009");
    m.pegawaiFindMany.mockResolvedValue([]);
    const kosong = (await teksPdf(await GET(req()))).join(" ");
    expect(kosong).not.toContain("Kepala Biro Palsu");
    expect(kosong).toContain("....");
  });
});

describe("GET /berkas/spkl-harian - PIMPINAN (pengecualian lembur: unit sendiri saja)", () => {
  const pimpinan = (o: Record<string, unknown> = {}) =>
    sesi({ role: "PIMPINAN", satuanKerja: "Satker Akun Lain", ...o });

  it("satker dari tabel Pegawai; ?satker= diabaikan -> 200", async () => {
    m.ambilUserSesi.mockResolvedValue(pimpinan());
    m.pegawaiFindUnique.mockResolvedValue({ satuanKerja: SATKER });
    const res = await GET(req({ satker: "Biro Lain Sekali" }));
    expect(res.status).toBe(200);
    expect(m.findMany.mock.calls[0][0].where.satuanKerja).toBe(SATKER);
    expect(m.pegawaiFindUnique.mock.calls[0][0].where).toEqual({ nip: "199001010000000001" }); // sensitive-ok
  });

  it("tanpa baris Pegawai -> 403, perintah tidak dibaca", async () => {
    m.ambilUserSesi.mockResolvedValue(pimpinan());
    m.pegawaiFindUnique.mockResolvedValue(null);
    expect((await GET(req({ satker: SATKER }))).status).toBe(403);
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it("Pegawai di satker lain: tidak bisa membaca satker pilot lewat ?satker= (satker lain di luar gerbang -> 404)", async () => {
    m.ambilUserSesi.mockResolvedValue(pimpinan());
    m.pegawaiFindUnique.mockResolvedValue({ satuanKerja: "Biro Lain" });
    expect((await GET(req({ satker: SATKER }))).status).toBe(404);
    expect(m.findMany).not.toHaveBeenCalled();
  });
});
