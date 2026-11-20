import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { SPKL_AKTIF } from "../../../../../lib/lembur/gerbangSpkl";

const m = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { perintahLembur: { findMany: m.findMany } } }));
vi.mock("../../../../../lib/prisma", () => ({ prisma: { perintahLembur: { findMany: m.findMany } } }));

import { GET, BATAS_PERINTAH_PER_RESPONS } from "../route";

const PILOT = SPKL_AKTIF[0].satuanKerja;
const RAHASIA = "rahasia-uji-notifikasi";

const req = (query: string, secret: string | null = RAHASIA) =>
  new NextRequest(`http://localhost:3000/api/perintah-lembur/notifikasi?${query}`, {
    headers: secret === null ? {} : { "x-gajihub-secret": secret },
  });

const baris = (id: string, dikirim: string) => ({
  id,
  tanggal: new Date("2026-12-10T00:00:00Z"),
  satuanKerja: PILOT,
  nomorSurat: "001/SPKL/2026",
  uraianTugas: "Tugas uji",
  dikirimPada: new Date(dikirim),
  kepalaTim: { nama: "KEPALA UJI" },
  anggota: [
    { jamDiperintahkan: 2, pegawai: { nama: "B UJI" } },
    { jamDiperintahkan: 3, pegawai: { nama: "A UJI" } },
  ],
});

describe("GET /api/perintah-lembur/notifikasi", () => {
  beforeEach(() => {
    vi.stubEnv("PERINTAH_LEMBUR_SECRET", RAHASIA);
    m.findMany.mockReset();
    m.findMany.mockResolvedValue([]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("503 bila env rahasia kosong, tanpa menyentuh database", async () => {
    vi.stubEnv("PERINTAH_LEMBUR_SECRET", "");
    const res = await GET(req(`satker=${encodeURIComponent(PILOT)}`));
    expect(res.status).toBe(503);
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it("503 juga bila env hanya spasi", async () => {
    vi.stubEnv("PERINTAH_LEMBUR_SECRET", "   ");
    expect((await GET(req(`satker=${encodeURIComponent(PILOT)}`, "   "))).status).toBe(503);
  });

  it("401 bila rahasia salah atau tidak ada", async () => {
    expect((await GET(req(`satker=${encodeURIComponent(PILOT)}`, "salah"))).status).toBe(401);
    expect((await GET(req(`satker=${encodeURIComponent(PILOT)}`, null))).status).toBe(401);
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it("400 tanpa satker atau dengan sejak tidak sah", async () => {
    expect((await GET(req(""))).status).toBe(400);
    expect((await GET(req(`satker=${encodeURIComponent(PILOT)}&sejak=bukan-waktu`))).status).toBe(400);
  });

  it("satker di luar gerbang SPKL -> daftar kosong tanpa query database", async () => {
    const res = await GET(req("satker=Biro%20Non%20Pilot"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it("hanya TERKIRIM, ber-kursor, urut naik, dibatasi, anggota hanya yang terkirim", async () => {
    const sejak = "2026-12-01T00:00:00.000Z";
    await GET(req(`satker=${encodeURIComponent(PILOT)}&sejak=${sejak}`));
    const arg = m.findMany.mock.calls[0][0];
    expect(arg.where.status).toBe("TERKIRIM");
    expect(arg.where.satuanKerja).toBe(PILOT);
    expect(arg.where.dikirimPada).toEqual({ gt: new Date(sejak) });
    expect(arg.orderBy[0]).toEqual({ dikirimPada: "asc" });
    expect(arg.take).toBe(BATAS_PERINTAH_PER_RESPONS);
    expect(arg.select.anggota.where).toEqual({ terkirim: true });
  });

  it("tanpa sejak: hanya yang dikirimPada tidak null", async () => {
    await GET(req(`satker=${encodeURIComponent(PILOT)}`));
    expect(m.findMany.mock.calls[0][0].where.dikirimPada).toEqual({ not: null });
  });

  it("respons: id, dikirimPada ISO, pesan; no-store; tanpa NIP; select tidak meminta NIP", async () => {
    m.findMany.mockResolvedValue([baris("id-1", "2026-12-09T03:00:00Z")]);
    const res = await GET(req(`satker=${encodeURIComponent(PILOT)}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const teks = await res.text();
    expect(teks).not.toMatch(/\d{18}/);
    const json = JSON.parse(teks);
    expect(json).toHaveLength(1);
    expect(Object.keys(json[0]).sort()).toEqual(["dikirimPada", "id", "pesan"]);
    expect(json[0].dikirimPada).toBe("2026-12-09T03:00:00.000Z");
    expect(json[0].pesan).toContain("Kamis, 10 Desember 2026");
    // nama terurut
    expect(json[0].pesan.indexOf("A UJI")).toBeLessThan(json[0].pesan.indexOf("B UJI"));
    expect(JSON.stringify(m.findMany.mock.calls[0][0].select)).not.toContain("nip");
  });

  it("error juga no-store", async () => {
    expect((await GET(req("satker=x", "salah"))).headers.get("Cache-Control")).toBe("private, no-store");
  });
});
