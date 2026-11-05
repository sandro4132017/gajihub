import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ findUser: vi.fn(), findPegawai: vi.fn(), createUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: m.findUser, create: m.createUser }, pegawai: { findUnique: m.findPegawai } },
}));
vi.mock("../../../../lib/prisma", () => ({
  prisma: { user: { findUnique: m.findUser, create: m.createUser }, pegawai: { findUnique: m.findPegawai } },
}));

import { POST } from "../login/route";
import { buatHashPenguji, pembatasPenguji } from "../../../../auth/akunPenguji";

const NIP_UJI = "999900000000000001"; // sensitive-ok
const NIP = "199001010000000001"; // sensitive-ok
const SANDI = "sandi-penguji-palsu"; // sensitive-ok
const SANDI_DEV = "sandi-dev-palsu"; // sensitive-ok

const userUji = { id: "u1", nip: NIP_UJI, nama: "Tim Pusdatik", role: "ADMIN", satuanKerja: "UNIT UJI COBA PUSDATIK", rolesTambahan: [], aktif: true };
const pegawaiUji = { nip: NIP_UJI, jabatan: "Tim Pusdatik", sourceSystem: "DUMMY_UJI" };

function kirim(username: string, password: string) {
  return POST(
    new Request("http://x/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }) as never
  );
}

beforeEach(() => {
  pembatasPenguji.reset();
  m.findUser.mockReset();
  m.findPegawai.mockReset();
  m.createUser.mockReset();
  vi.stubEnv("SESSION_SECRET", "rahasia-uji-palsu-untuk-test-saja-32"); // sensitive-ok
  vi.stubEnv("PENGUJI_USER", "penguji-uji");
  vi.stubEnv("PENGUJI_PASS_HASH", buatHashPenguji(SANDI));
  vi.stubEnv("DEV_AUTH_USER", "akun-uji");
  vi.stubEnv("DEV_AUTH_PASS", SANDI_DEV);
  vi.stubEnv("DEV_AUTH_NIP", NIP);
  vi.stubEnv("ALLOW_NIP_LOGIN", "true");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/auth/login - akun penguji", () => {
  it("sandi benar + data uji ada -> 200 dan cookie sesi", async () => {
    m.findUser.mockResolvedValue(userUji);
    m.findPegawai.mockResolvedValue(pegawaiUji);
    const res = await kirim("penguji-uji", SANDI);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("sandi benar tapi data uji belum disiapkan di server itu -> 401, tidak membuat akun", async () => {
    m.findUser.mockResolvedValue(null);
    m.findPegawai.mockResolvedValue(null);
    const res = await kirim("penguji-uji", SANDI);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Akun penguji belum disiapkan di server ini.");
    expect(m.createUser).not.toHaveBeenCalled();
  });

  it("pegawai ber-NIP penguji bukan DUMMY_UJI -> ditolak", async () => {
    m.findUser.mockResolvedValue(userUji);
    m.findPegawai.mockResolvedValue({ ...pegawaiUji, sourceSystem: "SIAP" });
    const res = await kirim("penguji-uji", SANDI);
    expect(res.status).toBe(401);
  });

  it("akun dinonaktifkan -> 403", async () => {
    m.findUser.mockResolvedValue({ ...userUji, aktif: false });
    m.findPegawai.mockResolvedValue(pegawaiUji);
    const res = await kirim("penguji-uji", SANDI);
    expect(res.status).toBe(403);
  });

  it("sandi salah -> 401 pesan lama; terkunci tampil sama persis (401, pesan sama)", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await kirim("penguji-uji", "salah");
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe("Username/NIP atau password salah.");
    }
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const terkunci = await kirim("penguji-uji", SANDI);
    expect(terkunci.status).toBe(401);
    expect((await terkunci.json()).error).toBe("Username/NIP atau password salah.");
    expect(m.findUser).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("konfigurasi tidak diisi -> akun penguji tidak ada", async () => {
    vi.stubEnv("PENGUJI_PASS_HASH", "");
    const res = await kirim("penguji-uji", SANDI);
    expect(res.status).toBe(401);
    expect(m.findUser).not.toHaveBeenCalled();
  });

  it("kedaluwarsa -> akun penguji tidak ada", async () => {
    vi.stubEnv("PENGUJI_BERLAKU_SAMPAI", "2020-01-01");
    const res = await kirim("penguji-uji", SANDI);
    expect(res.status).toBe(401);
    expect(m.findUser).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/login - sandi induk dicabut", () => {
  it("sandi akun dev tidak lagi membuka NIP siapa pun", async () => {
    const res = await kirim(NIP, SANDI_DEV);
    expect(res.status).toBe(401);
    expect(m.findUser).not.toHaveBeenCalled();
  });

  it("akun dev tetap bisa masuk", async () => {
    m.findUser.mockResolvedValue({ ...userUji, nip: NIP, role: "ADMIN" });
    m.findPegawai.mockResolvedValue(null);
    const res = await kirim("akun-uji", SANDI_DEV);
    expect(res.status).toBe(200);
  });

  it("login NIP=sandi NIP tetap jalan; NIP 9999 ditolak", async () => {
    m.findUser.mockResolvedValue({ ...userUji, nip: NIP, role: "PEGAWAI" });
    m.findPegawai.mockResolvedValue({ nip: NIP, jabatan: null });
    expect((await kirim(NIP, NIP)).status).toBe(200);
    m.findUser.mockClear();
    expect((await kirim(NIP_UJI, NIP_UJI)).status).toBe(401);
    expect(m.findUser).not.toHaveBeenCalled();
  });
});
