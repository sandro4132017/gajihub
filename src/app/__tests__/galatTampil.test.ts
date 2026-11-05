import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Wakil tiga batch penampung `catch`: pesan galat database (host) tidak boleh
// sampai ke layar; Server Action mengembalikan kalimat awam + kode rujukan.

const m = vi.hoisted(() => ({
  getSessionAccount: vi.fn(),
  ambilUserSesi: vi.fn(),
  upsert: vi.fn(),
  findPegawai: vi.fn(),
  skCreate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    anggaranRealisasi: { upsert: m.upsert },
    pegawai: { findUnique: m.findPegawai },
    skKgb: { create: m.skCreate },
  },
}));
vi.mock("../../lib/prisma", () => ({
  prisma: {
    anggaranRealisasi: { upsert: m.upsert },
    pegawai: { findUnique: m.findPegawai },
    skKgb: { create: m.skCreate },
  },
}));
vi.mock("../../auth/getSessionAccount", () => ({
  getSessionAccount: m.getSessionAccount,
  ambilUserSesi: m.ambilUserSesi,
}));

import { uploadAnggaranRealisasiAction } from "../ppabp/anggaran/actions";
import { ajukanSkKgbAction } from "../kasubag/sk-kgb/actions";

const HOST = "192.0.2.31"; // sensitive-ok
const galatDb = () =>
  Object.assign(new Error(`Can't reach database server at ${HOST}:5432`), { code: "P1001" });

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  log = vi.spyOn(console, "error").mockImplementation(() => {});
  m.getSessionAccount.mockResolvedValue({ nip: "199001010000000001" }); // sensitive-ok
});
afterEach(() => log.mockRestore());

function cek(r: { error?: string }) {
  expect(r.error).toMatch(/Gajihub sedang tidak bisa membaca atau menyimpan data/);
  expect(r.error).toMatch(/kode rujukan/);
  expect(r.error).not.toContain(HOST);
  expect(JSON.stringify(log.mock.calls)).not.toContain(HOST);
}

describe("penampung catch Server Action", () => {
  it("batch 3b - ppabp/anggaran", async () => {
    m.ambilUserSesi.mockResolvedValue({ id: "u1", nip: "199001010000000001", role: "PPABP", satuanKerja: null, aktif: true }); // sensitive-ok
    m.upsert.mockRejectedValue(galatDb());
    const f = new FormData();
    f.set("satuanKerja", "Biro Umum");
    f.set("periodeBulan", "8");
    f.set("periodeTahun", "2026");
    f.set("pagu", "100");
    f.set("realisasi", "50");
    cek(await uploadAnggaranRealisasiAction({}, f));
  });

  it("batch 3a - kasubag/sk-kgb", async () => {
    m.ambilUserSesi.mockResolvedValue({ id: "u1", nip: "199001010000000001", role: "KASUBAG_TU", satuanKerja: "Biro Umum", aktif: true }); // sensitive-ok
    m.findPegawai.mockResolvedValue({ id: "p1", nama: "Nama Palsu", satuanKerja: "Biro Umum" });
    m.skCreate.mockRejectedValue(galatDb());
    const f = new FormData();
    for (const [k, v] of Object.entries({
      pegawaiId: "p1",
      nomorSk: "SK-1",
      tanggalSk: "2026-08-01",
      tmtKgb: "2026-08-01",
      golonganLama: "III/a",
      golonganBaru: "III/b",
    }))
      f.set(k, v);
    cek(await ajukanSkKgbAction({}, f));
  });

  it("batch 3c - kegagalan getSessionAccount juga tidak membocorkan teks mentah", async () => {
    m.getSessionAccount.mockRejectedValue(galatDb());
    cek(await uploadAnggaranRealisasiAction({}, new FormData()));
  });
});
