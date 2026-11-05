import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Yang dijaga: teks galat mentah (host, kredensial, passphrase) tidak sampai ke
// layar; log_gagal_tte tetap ditulis tanpa passphrase (Kriteria BSrE V/VIII/IX).

const m = vi.hoisted(() => ({
  ambilUserSesi: vi.fn(),
  findUniquePegawai: vi.fn(),
  dokumenCreate: vi.fn(),
  dokumenUpdate: vi.fn(),
  logCreate: vi.fn(),
  checkUserStatus: vi.fn(),
  signPdf: vi.fn(),
  generateDraftSptjm: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth/getSessionAccount", () => ({ ambilUserSesi: m.ambilUserSesi }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    pegawai: { findUnique: m.findUniquePegawai },
    dokumenTte: { create: m.dokumenCreate, update: m.dokumenUpdate },
    logGagalTte: { create: m.logCreate },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));
vi.mock("@/lib/tte/esignClient", () => ({ checkUserStatus: m.checkUserStatus, signPdf: m.signPdf }));
vi.mock("@/lib/tte/spesimenTte", () => ({
  buatSpesimenQr: vi.fn(() => ({ png: Buffer.from("png") })),
  ambilTemplateSpesimen: vi.fn(),
}));
vi.mock("@/lib/tte/sptjmPdf", async () => {
  const tipe = await import("@/lib/tte/sptjmTypes");
  return {
    generateDraftSptjm: m.generateDraftSptjm,
    generateNomorSptjmDefault: tipe.generateNomorSptjmDefault,
    generateNamaFileSptjm: tipe.generateNamaFileSptjm,
    terapkanStempelTteSimulasi: vi.fn(),
  };
});
vi.mock("fs/promises", () => ({
  default: { writeFile: m.writeFile, mkdir: m.mkdir },
  writeFile: m.writeFile,
  mkdir: m.mkdir,
}));

import { buatDraftSptjmAction, signSptjmUnitAction } from "../actions";

const NIP = "199001010000000001"; // sensitive-ok
const PASS = "RAHASIA-uji-123";
const HOST = "192.0.2.77"; // sensitive-ok

function form() {
  const f = new FormData();
  f.set("jenis", "SPTJM_TUKIN");
  f.set("bulan", "8");
  f.set("tahun", "2026");
  f.set("nik", "1234567890123456"); // sensitive-ok
  f.set("passphrase", PASS);
  return f;
}

let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  log = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("NODE_ENV", "production");
  m.ambilUserSesi.mockResolvedValue({ id: "u1", nip: NIP, role: "KASUBAG_TU", satuanKerja: "Biro Umum", aktif: true });
  m.findUniquePegawai.mockResolvedValue({ nama: "Nama Palsu", nip: NIP, jabatan: "Kasubag TU", sidikNik: null });
  m.dokumenCreate.mockResolvedValue({ id: "abcdef12-0000-0000-0000-000000000000" });
  m.dokumenUpdate.mockResolvedValue({});
  m.logCreate.mockResolvedValue({});
  m.checkUserStatus.mockResolvedValue({ success: true, statusCode: 1111, status: "ISSUE", message: "" });
  m.generateDraftSptjm.mockResolvedValue(Buffer.from("%PDF-"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  log.mockRestore();
});

describe("galat TTE tidak membocorkan teks mentah", () => {
  it("buatDraft: galat generator berisi host -> layar tanpa host, ada kode rujukan", async () => {
    m.generateDraftSptjm.mockRejectedValue(new Error(`gagal tulis ke ${HOST}`));
    const r = await buatDraftSptjmAction({ jenis: "SPTJM_TUKIN", bulan: 8, tahun: 2026 });
    expect(r.error).toBeTruthy();
    expect(r.error).not.toContain(HOST);
    expect(r.error).toMatch(/kode rujukan/);
  });

  it("sign: exception berisi passphrase -> layar & log server tanpa passphrase, log_gagal_tte tetap ditulis", async () => {
    m.signPdf.mockRejectedValue(new Error(`boom ${PASS} di ${HOST}`));
    const r = await signSptjmUnitAction({}, form());
    expect(r.error).not.toContain(PASS);
    expect(r.error).not.toContain(HOST);
    expect(r.error).toMatch(/kode rujukan/);
    expect(JSON.stringify(log.mock.calls)).not.toContain(PASS);
    expect(m.logCreate).toHaveBeenCalled();
    expect(JSON.stringify(m.logCreate.mock.calls)).not.toContain(PASS);
  });

  it("sign: pencatatan log_gagal_tte yang gagal tidak menggantikan jawaban layar", async () => {
    m.signPdf.mockRejectedValue(new Error("boom"));
    m.logCreate.mockRejectedValue(new Error("db mati"));
    const r = await signSptjmUnitAction({}, form());
    expect(r.error).toMatch(/kode rujukan/);
  });
});
