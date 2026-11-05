import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GalatPengguna, GalatSumber } from "../../../../lib/koneksi/galatSumber";

const HOST_PALSU = "192.0.2.55"; // sensitive-ok
const USER_PALSU = "pengguna_palsu_x"; // sensitive-ok

const m = vi.hoisted(() => ({
  tarik: vi.fn(),
  simpan: vi.fn(),
  getSession: vi.fn(),
  ambilUser: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../../../lib/prisma", () => ({ prisma: { pegawai: { findMany: m.findMany } } }));
vi.mock("../../../../auth/getSessionAccount", () => ({
  getSessionAccount: m.getSession,
  ambilUserSesi: m.ambilUser,
}));
vi.mock("../../../dashboardScope", () => ({ satkerTerkunciUntukAkun: () => false }));
vi.mock("../../../../adapters/EpresensiAdapter", () => ({ tarikPresensiPeriode: m.tarik }));
vi.mock("../../../../jobs/simpanRekapPresensi", () => ({ simpanHasilPresensiMassal: m.simpan }));
vi.mock("../../../../lib/kendalaPresensi", () => ({
  muatKendalaPeriode: async () => ({ untukNip: () => [], penanda: [], jumlah: 0 }),
  muatKoreksiPeriode: async () => ({ untukNip: () => [], jumlah: 0 }),
}));
vi.mock("../../../../lib/hariLibur", () => ({ muatHariLiburPeriode: async () => new Map() }));

import { tarikPresensiEpresensiAction } from "../actionsSync";

const form = (bulan = "9", tahun = "2026") => {
  const f = new FormData();
  f.set("bulan", bulan);
  f.set("tahun", tahun);
  return f;
};

let spy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.getSession.mockResolvedValue({ id: "a" });
  m.ambilUser.mockResolvedValue({
    id: "u1",
    nip: "199001010000000001", // sensitive-ok
    role: "ADMIN",
    satuanKerja: null,
    aktif: true,
  });
  m.findMany.mockResolvedValue([]);
  spy = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("EPRESENSI_HOST", HOST_PALSU);
  vi.stubEnv("EPRESENSI_USER", USER_PALSU);
});
afterEach(() => {
  spy.mockRestore();
  vi.unstubAllEnvs();
});

describe("tarikPresensiEpresensiAction - galat", () => {
  it("e-Presensi tak terjangkau: pesan awam tanpa IP/user; satu baris log dengan ref yang sama", async () => {
    const asli = Object.assign(new Error(`connect ECONNREFUSED ${HOST_PALSU}:5432 user ${USER_PALSU}`), {
      code: "ECONNREFUSED",
    });
    m.tarik.mockRejectedValue(new GalatSumber("EPRESENSI", asli));
    const r = await tarikPresensiEpresensiAction({}, form());
    expect(r.error).toContain("e-Presensi sedang tidak bisa dihubungi");
    expect(r.error).toContain("kode rujukan");
    expect(r.error).not.toContain(HOST_PALSU);
    expect(r.error).not.toContain(USER_PALSU);
    expect(spy).toHaveBeenCalledTimes(1);
    const baris = String(spy.mock.calls[0][0]);
    const ref = /ref=([0-9a-f]{8})/.exec(baris)![1];
    expect(r.error).toContain(ref);
    expect(baris).not.toContain(HOST_PALSU);
    expect(baris).not.toContain(USER_PALSU);
  });

  it("SIAP dilabel SIAP, bukan e-Presensi", async () => {
    m.tarik.mockRejectedValue(
      new GalatSumber("SIAP", Object.assign(new Error(`Failed to connect to ${HOST_PALSU}`), { code: "ESOCKET" }))
    );
    const r = await tarikPresensiEpresensiAction({}, form());
    expect(r.error).toContain("SIAP sedang tidak bisa dihubungi");
    expect(r.error).not.toContain("e-Presensi");
    expect(r.error).not.toContain(HOST_PALSU);
  });

  it("GalatPengguna tampil apa adanya dan tidak dicatat sebagai galat", async () => {
    m.tarik.mockRejectedValue(new GalatPengguna("Pesan buatan aplikasi."));
    const r = await tarikPresensiEpresensiAction({}, form());
    expect(r.error).toBe("Pesan buatan aplikasi.");
    expect(spy).not.toHaveBeenCalled();
  });

  it("validasi periode tetap tampil apa adanya", async () => {
    const r = await tarikPresensiEpresensiAction({}, form("13", "2026"));
    expect(r.error).toBe("Periode tidak valid - pilih bulan 1-12 dan tahun yang benar.");
    expect(m.tarik).not.toHaveBeenCalled();
  });

  it("gagal simpan: alasan dikelompokkan, tanpa pesan mentah, satu log per kelompok", async () => {
    m.tarik.mockResolvedValue({ totalPegawaiSumber: 2, pegawai: [], dilewati: [] });
    const g = () =>
      Object.assign(new Error(`Cannot reach database server at ${HOST_PALSU}:5432`), { code: "P1001" });
    m.simpan.mockResolvedValue({ tersimpan: 0, gagal: [g(), g()] });
    const r = await tarikPresensiEpresensiAction({}, form());
    expect(r.error).toBeUndefined();
    const dilewati = r.ringkasan!.dilewati;
    expect(dilewati).toHaveLength(1);
    expect(dilewati[0].jumlah).toBe(2);
    expect(dilewati[0].alasan).toContain("Gagal disimpan di Gajihub");
    expect(dilewati[0].alasan).toContain("kode rujukan");
    expect(dilewati[0].alasan).not.toContain(HOST_PALSU);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toContain(" jumlah=2 ");
  });
});
