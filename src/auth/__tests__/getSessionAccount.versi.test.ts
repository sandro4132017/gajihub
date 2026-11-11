import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ cookieGet: vi.fn(), findUnique: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: m.cookieGet }) }));
vi.mock("../../lib/prisma", () => ({ prisma: { user: { findUnique: m.findUnique } } }));

import { ambilUserSesi, getSessionAccount, periksaSesiRinci } from "../getSessionAccount";
import { buatTokenSesi } from "../session";

const NIP = "199000000000000001"; // sensitive-ok
const PAYLOAD = {
  userId: "u-1",
  nip: NIP,
  nama: "Pegawai Uji",
  role: "PEGAWAI" as const,
  satuanKerja: null,
  jabatan: "Pegawai",
};

const barisUser = (o: Record<string, unknown> = {}) => ({
  id: "u-1",
  nip: NIP,
  nama: "Pegawai Uji",
  role: "PEGAWAI",
  rolesTambahan: [],
  satuanKerja: null,
  aktif: true,
  sesiVersi: 2,
  ...o,
});

async function pasangToken(v: number) {
  m.cookieGet.mockReturnValue({ value: await buatTokenSesi({ ...PAYLOAD, v }) });
}

beforeEach(() => {
  m.cookieGet.mockReset();
  m.findUnique.mockReset();
  vi.stubEnv("SESSION_SECRET", "rahasia-uji-palsu-untuk-test-saja-32"); // sensitive-ok
});

describe("versi sesi di getSessionAccount & ambilUserSesi", () => {
  it("versi sama: sesi sah", async () => {
    await pasangToken(2);
    m.findUnique.mockResolvedValue(barisUser());
    const sesi = await getSessionAccount();
    expect(sesi?.nip).toBe(NIP);
    expect(sesi?.v).toBe(2);
    expect((await ambilUserSesi())?.nip).toBe(NIP);
  });

  it("versi token tertinggal (sesiVersi naik): null di keduanya", async () => {
    await pasangToken(1);
    m.findUnique.mockResolvedValue(barisUser({ sesiVersi: 2 }));
    expect(await getSessionAccount()).toBeNull();
    expect(await ambilUserSesi()).toBeNull();
  });

  it("sesiVersi ikut di select yang SAMA (satu query, tanpa query tambahan)", async () => {
    await pasangToken(2);
    m.findUnique.mockResolvedValue(barisUser());
    await getSessionAccount();
    expect(m.findUnique).toHaveBeenCalledTimes(1);
    expect(m.findUnique.mock.calls[0][0].select.sesiVersi).toBe(true);
  });
});

describe("periksaSesiRinci - alasan penolakan", () => {
  it("tanpa cookie: tidak-ada", async () => {
    m.cookieGet.mockReturnValue(undefined);
    expect(await periksaSesiRinci()).toEqual({ ok: false, alasan: "tidak-ada" });
  });

  it("versi beda: dicabut", async () => {
    await pasangToken(0);
    m.findUnique.mockResolvedValue(barisUser({ sesiVersi: 1 }));
    expect(await periksaSesiRinci()).toEqual({ ok: false, alasan: "dicabut" });
  });

  it("akun nonaktif: nonaktif (didahulukan dari versi)", async () => {
    await pasangToken(0);
    m.findUnique.mockResolvedValue(barisUser({ aktif: false, sesiVersi: 1 }));
    expect(await periksaSesiRinci()).toEqual({ ok: false, alasan: "nonaktif" });
  });

  it("cookie sah tetapi akun hilang: dicabut (cookie harus dibuang)", async () => {
    await pasangToken(0);
    m.findUnique.mockResolvedValue(null);
    expect(await periksaSesiRinci()).toEqual({ ok: false, alasan: "dicabut" });
  });

  it("sah: ok dengan role aktif tervalidasi", async () => {
    await pasangToken(2);
    m.findUnique.mockResolvedValue(barisUser());
    const h = await periksaSesiRinci();
    expect(h.ok).toBe(true);
  });
});
