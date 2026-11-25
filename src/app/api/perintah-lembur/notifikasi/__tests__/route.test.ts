import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { SPKL_AKTIF } from "../../../../../lib/lembur/gerbangSpkl";

const m = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { perintahLembur: { findMany: m.findMany } } }));
vi.mock("../../../../../lib/prisma", () => ({ prisma: { perintahLembur: { findMany: m.findMany } } }));

import { GET, BATAS_HARI_PER_RESPONS, BATAS_BARIS_PER_RESPONS } from "../route";

const PILOT = SPKL_AKTIF[0].satuanKerja;
const RAHASIA = "rahasia-uji-notifikasi";
// 15:05 WIB pada 2026-12-10: tanggal 10 sudah siap.
const SESUDAH_SIAP = new Date("2026-12-10T08:05:00Z");

const req = (query: string, secret: string | null = RAHASIA) =>
  new NextRequest(`http://localhost:3000/api/perintah-lembur/notifikasi?${query}`, {
    headers: secret === null ? {} : { "x-gajihub-secret": secret },
  });
const q = (o: Record<string, string> = {}) => new URLSearchParams({ satker: PILOT, ...o }).toString();

const baris = (tanggal: string, kepala: string, anggota: [string, number][], uraian = "Tugas uji") => ({
  tanggal: new Date(`${tanggal}T00:00:00Z`),
  satuanKerja: PILOT,
  uraianTugas: uraian,
  kepalaTim: { nama: kepala },
  anggota: anggota.map(([nama, jam]) => ({ jamDiperintahkan: jam, pegawai: { nama } })),
});

describe("GET /api/perintah-lembur/notifikasi", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(SESUDAH_SIAP);
    vi.stubEnv("PERINTAH_LEMBUR_SECRET", RAHASIA);
    m.findMany.mockReset();
    m.findMany.mockResolvedValue([]);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("503 bila env rahasia kosong atau hanya spasi, tanpa menyentuh database", async () => {
    vi.stubEnv("PERINTAH_LEMBUR_SECRET", "");
    expect((await GET(req(q()))).status).toBe(503);
    vi.stubEnv("PERINTAH_LEMBUR_SECRET", "   ");
    expect((await GET(req(q(), "   "))).status).toBe(503);
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it("401 bila rahasia salah atau tidak ada", async () => {
    expect((await GET(req(q(), "salah"))).status).toBe(401);
    expect((await GET(req(q(), null))).status).toBe(401);
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it("400 tanpa satker atau dengan sejak tidak sah (bukan YYYY-MM-DD / tanggal kalender)", async () => {
    expect((await GET(req(""))).status).toBe(400);
    expect((await GET(req(q({ sejak: "bukan-waktu" })))).status).toBe(400);
    expect((await GET(req(q({ sejak: "2026-12-01T00:00:00Z" })))).status).toBe(400);
    expect((await GET(req(q({ sejak: "2026-13-45" })))).status).toBe(400);
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it("satker di luar gerbang SPKL -> daftar kosong tanpa query database", async () => {
    const res = await GET(req("satker=Biro%20Non%20Pilot"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it("tanpa sejak: hanya hari ini WIB; hanya TERKIRIM, anggota hanya yang terkirim", async () => {
    await GET(req(q()));
    const arg = m.findMany.mock.calls[0][0];
    expect(arg.where.status).toBe("TERKIRIM");
    expect(arg.where.satuanKerja).toBe(PILOT);
    expect(arg.where.tanggal).toEqual(new Date("2026-12-10T00:00:00Z"));
    expect(arg.select.anggota.where).toEqual({ terkirim: true });
  });

  it("hari ini dihitung menurut WIB, bukan UTC (00:30 WIB = 17:30 UTC hari sebelumnya)", async () => {
    vi.setSystemTime(new Date("2026-12-09T17:30:00Z")); // 10 Des 00:30 WIB
    await GET(req(q()));
    expect(m.findMany.mock.calls[0][0].where.tanggal).toEqual(new Date("2026-12-10T00:00:00Z"));
  });

  it("dengan sejak: tanggal > sejak (eksklusif) sampai hari ini", async () => {
    await GET(req(q({ sejak: "2026-12-05" })));
    expect(m.findMany.mock.calls[0][0].where.tanggal).toEqual({
      gt: new Date("2026-12-05T00:00:00Z"),
      lte: new Date("2026-12-10T00:00:00Z"),
    });
  });

  it("satu pesan gabungan per tanggal, dikelompokkan per kepala tim; item {id, tanggal, pesan}; no-store; tanpa NIP", async () => {
    m.findMany.mockResolvedValue([
      baris("2026-12-10", "KEPALA SATU", [["B UJI", 2], ["A UJI", 3]]),
      baris("2026-12-10", "KEPALA DUA", [["C UJI", 1]], "Tugas dua"),
    ]);
    const res = await GET(req(q()));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const teks = await res.text();
    expect(teks).not.toMatch(/\d{18}/);
    const json = JSON.parse(teks);
    expect(json).toHaveLength(1);
    expect(Object.keys(json[0]).sort()).toEqual(["id", "pesan", "tanggal"]);
    expect(json[0].id).toBe("spkl-harian:2026-12-10");
    expect(json[0].tanggal).toBe("2026-12-10");
    const p: string = json[0].pesan;
    expect(p).toContain("Kamis, 10 Desember 2026");
    expect(p).toContain("Jumlah pegawai: 3");
    expect(p).toContain("KEPALA SATU");
    expect(p).toContain("KEPALA DUA");
    expect(p).toContain("Tugas dua");
    expect(p.indexOf("A UJI")).toBeLessThan(p.indexOf("B UJI"));
    // Sementara tanpa TTE: tidak mengaku sudah ditandatangani.
    expect(p).not.toContain("ditandatangani secara elektronik");
    expect(JSON.stringify(m.findMany.mock.calls[0][0].select)).not.toContain("nip");
  });

  it("hari ini belum siap (sebelum 15.00 atau dalam tenggang 60 dtk) -> kosong", async () => {
    m.findMany.mockResolvedValue([baris("2026-12-10", "K", [["A UJI", 1]])]);
    vi.setSystemTime(new Date("2026-12-10T07:00:00Z")); // 14:00 WIB
    expect(await (await GET(req(q()))).json()).toEqual([]);
    vi.setSystemTime(new Date("2026-12-10T08:00:30Z")); // 15:00:30 WIB
    expect(await (await GET(req(q()))).json()).toEqual([]);
    vi.setSystemTime(new Date("2026-12-10T08:01:01Z"));
    expect(await (await GET(req(q()))).json()).toHaveLength(1);
  });

  it("beberapa tanggal urut naik, tanggal tanpa anggota dilewati, dibatasi maks hari", async () => {
    vi.setSystemTime(new Date("2026-12-31T10:00:00Z"));
    const banyak = Array.from({ length: 31 }, (_, i) => {
      const t = new Date(Date.UTC(2026, 11, 1 + i)).toISOString().slice(0, 10);
      return baris(t, "K", [["A UJI", 1]]);
    });
    banyak.push(baris("2026-12-02", "K", [])); // perintah tanpa anggota: dilewati
    m.findMany.mockResolvedValue([...banyak].reverse());
    const json = await (await GET(req(q({ sejak: "2026-11-30" })))).json();
    expect(json).toHaveLength(BATAS_HARI_PER_RESPONS);
    expect(json[0].tanggal).toBe("2026-12-01");
    expect(json[json.length - 1].tanggal).toBe("2026-12-31");
    const urut = json.map((j: { tanggal: string }) => j.tanggal);
    expect([...urut].sort()).toEqual(urut);
  });

  it("dibatasi maks hari: lebih dari BATAS_HARI_PER_RESPONS tanggal dipotong, sisanya diambil lewat kursor", async () => {
    vi.setSystemTime(new Date("2027-02-15T10:00:00Z"));
    const banyak = Array.from({ length: 35 }, (_, i) => {
      const t = new Date(Date.UTC(2026, 11, 1 + i)).toISOString().slice(0, 10);
      return baris(t, "K", [["A UJI", 1]]);
    });
    m.findMany.mockResolvedValue(banyak);
    const json = await (await GET(req(q({ sejak: "2026-11-30" })))).json();
    expect(json).toHaveLength(BATAS_HARI_PER_RESPONS);
    expect(json[json.length - 1].tanggal).toBe("2026-12-31");
  });

  it("query dibatasi take; bila batas baris tercapai, tanggal terakhir (mungkin terpotong) ditunda", async () => {
    vi.setSystemTime(new Date("2026-12-31T10:00:00Z"));
    const penuh = [
      ...Array.from({ length: BATAS_BARIS_PER_RESPONS - 1 }, () => baris("2026-12-03", "K", [["A UJI", 1]])),
      baris("2026-12-04", "K", [["B UJI", 1]]),
    ];
    m.findMany.mockResolvedValue(penuh);
    const json = await (await GET(req(q({ sejak: "2026-12-01" })))).json();
    expect(m.findMany.mock.calls[0][0].take).toBe(BATAS_BARIS_PER_RESPONS);
    expect(json.map((j: { tanggal: string }) => j.tanggal)).toEqual(["2026-12-03"]);
  });

  it("tanggal sebelum gerbang SPKL berlaku dibuang", async () => {
    vi.setSystemTime(new Date("2026-11-30T10:00:00Z"));
    m.findMany.mockResolvedValue([baris("2026-11-29", "K", [["A UJI", 1]])]);
    // Satker pilot berlaku mulai 2026-12-01.
    expect(await (await GET(req(q({ sejak: "2026-11-01" })))).json()).toEqual([]);
  });

  it("error juga no-store", async () => {
    expect((await GET(req("satker=x", "salah"))).headers.get("Cache-Control")).toBe("private, no-store");
  });
});
