import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Yang dijaga: stempel simulasi TIDAK PERNAH terbit di production, dan setiap
// kegagalan BSrE tercatat di log_gagal_tte tanpa passphrase (Kriteria BSrE IX).

const m = vi.hoisted(() => ({
  ambilUserSesi: vi.fn(),
  findUniquePegawai: vi.fn(),
  dokumenCreate: vi.fn(),
  dokumenUpdate: vi.fn(),
  logCreate: vi.fn(),
  checkUserStatus: vi.fn(),
  signPdf: vi.fn(),
  generateDraftSptjm: vi.fn(),
  stempel: vi.fn(),
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
vi.mock("@/lib/tte/esignClient", () => ({
  checkUserStatus: m.checkUserStatus,
  signPdf: m.signPdf,
}));
vi.mock("@/lib/tte/spesimenTte", () => ({
  buatSpesimenQr: vi.fn(() => ({ png: Buffer.from("png") })),
  ambilTemplateSpesimen: vi.fn(),
}));
vi.mock("@/lib/tte/alamatVerifikasi", () => ({
  tautanVerifikasiDokumen: (id: string) => `https://contoh.test/tte/verify/${id}`,
}));
vi.mock("@/lib/tte/sptjmPdf", async () => {
  const tipe = await import("@/lib/tte/sptjmTypes");
  return {
    generateDraftSptjm: m.generateDraftSptjm,
    generateNomorSptjmDefault: tipe.generateNomorSptjmDefault,
    generateNamaFileSptjm: tipe.generateNamaFileSptjm,
    terapkanStempelTteSimulasi: m.stempel,
  };
});
vi.mock("fs/promises", () => ({
  default: { writeFile: m.writeFile, mkdir: m.mkdir },
  writeFile: m.writeFile,
  mkdir: m.mkdir,
}));

import { signSptjmUnitAction } from "../actions";

const UNIT = "Biro Umum";
const NIP = "199001010000000001"; // sensitive-ok
const PASS = "RAHASIA-uji-123";
const NIK_UJI = "1234567890123456"; // sensitive-ok

function form() {
  const f = new FormData();
  f.set("jenis", "SPTJM_TUKIN");
  f.set("bulan", "8");
  f.set("tahun", "2026");
  f.set("nik", NIK_UJI);
  f.set("passphrase", PASS);
  return f;
}

const jalankan = () => signSptjmUnitAction({}, form());

function setEnv(nodeEnv: string, mode: string, simulasi?: string) {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("TEST_NETWORK_MODE", mode);
  vi.stubEnv("TTE_SIMULASI", simulasi ?? "");
}

function kategoriLog(): string[] {
  return m.logCreate.mock.calls.map((c) => c[0].data.kategoriError);
}

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.ambilUserSesi.mockResolvedValue({
    id: "u1",
    nip: NIP,
    role: "KASUBAG_TU",
    satuanKerja: UNIT,
    aktif: true,
  });
  m.findUniquePegawai.mockResolvedValue({ nama: "Nama Palsu", nip: NIP, jabatan: "Kasubag TU", sidikNik: null });
  m.dokumenCreate.mockResolvedValue({ id: "abcdef12-0000-0000-0000-000000000000" });
  m.dokumenUpdate.mockResolvedValue({});
  m.logCreate.mockResolvedValue({});
  m.checkUserStatus.mockResolvedValue({ success: true, statusCode: 1111, status: "ISSUE", message: "" });
  m.generateDraftSptjm.mockResolvedValue(Buffer.from("%PDF-"));
  m.stempel.mockResolvedValue(Buffer.from("%PDF-stempel"));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function pastiTanpaPassphraseDiLog() {
  for (const c of m.logCreate.mock.calls) {
    expect(JSON.stringify(c[0])).not.toContain(PASS);
  }
}

function pastiGagalTanpaStempel() {
  expect(m.stempel).not.toHaveBeenCalled();
  const statuses = m.dokumenUpdate.mock.calls.map((c) => c[0].data.status);
  expect(statuses).toContain("GAGAL");
  expect(statuses).not.toContain("TERTANDATANGANI");
}

describe("signSptjmUnitAction - production tidak pernah simulasi", () => {
  beforeEach(() => setEnv("production", "INTERNAL", "true"));

  it("HTTP 500 -> GAGAL, BSRE_ERROR, tanpa stempel", async () => {
    m.signPdf.mockResolvedValue({ success: false, statusCode: 500 });
    const r = await jalankan();
    expect(r.error).toBeTruthy();
    expect(r.success).toBeUndefined();
    pastiGagalTanpaStempel();
    expect(kategoriLog()).toEqual(["BSRE_ERROR"]);
    pastiTanpaPassphraseDiLog();
  });

  it.each(["fetch failed", "timeout"])("'%s' -> GAGAL, NETWORK_TIMEOUT", async (pesan) => {
    m.signPdf.mockResolvedValue({ success: false, error: pesan });
    const r = await jalankan();
    expect(r.error).toMatch(/tidak dapat dihubungi/);
    pastiGagalTanpaStempel();
    expect(kategoriLog()).toEqual(["NETWORK_TIMEOUT"]);
    pastiTanpaPassphraseDiLog();
  });

  it("sertifikat NOT_REGISTERED -> ditolak, dicatat SERTIFIKAT_BELUM_SIAP tanpa dokumen", async () => {
    m.checkUserStatus.mockResolvedValue({ success: false, statusCode: 2011, status: "NOT_REGISTERED", message: "" });
    const r = await jalankan();
    expect(r.error).toMatch(/belum siap/);
    expect(m.signPdf).not.toHaveBeenCalled();
    expect(m.dokumenCreate).not.toHaveBeenCalled();
    expect(m.logCreate.mock.calls[0][0].data.dokumenTteId).toBeNull();
    expect(kategoriLog()).toEqual(["SERTIFIKAT_BELUM_SIAP"]);
    pastiTanpaPassphraseDiLog();
    expect(JSON.stringify(m.logCreate.mock.calls)).not.toContain(NIK_UJI);
  });

  it("sertifikat NETWORK_ERROR -> ditolak, NETWORK_TIMEOUT", async () => {
    m.checkUserStatus.mockResolvedValue({ success: false, statusCode: 500, status: "NETWORK_ERROR", message: "" });
    const r = await jalankan();
    expect(r.error).toMatch(/tidak dapat dihubungi/);
    expect(m.signPdf).not.toHaveBeenCalled();
    expect(kategoriLog()).toEqual(["NETWORK_TIMEOUT"]);
  });

  it("passphrase salah (statusCode 0) -> PASSPHRASE_SALAH", async () => {
    m.signPdf.mockResolvedValue({ success: false, statusCode: 0, error: "Passphrase salah" });
    const r = await jalankan();
    expect(r.error).toBeTruthy();
    pastiGagalTanpaStempel();
    expect(kategoriLog()).toEqual(["PASSPHRASE_SALAH"]);
    pastiTanpaPassphraseDiLog();
  });
});

describe("signSptjmUnitAction - non-production", () => {
  it("development + TTE_SIMULASI=true + 500 -> stempel simulasi, dicatat SIMULASI_DITERAPKAN", async () => {
    setEnv("development", "PUBLIC", "true");
    m.signPdf.mockResolvedValue({ success: false, statusCode: 500 });
    const r = await jalankan();
    expect(r.success).toBe(true);
    expect(r.isSimulasi).toBe(true);
    expect(r.idDokumenBsre?.startsWith("SIMULASI-")).toBe(true);
    expect(m.stempel).toHaveBeenCalledTimes(1);
    expect(kategoriLog()).toEqual(["SIMULASI_DITERAPKAN"]);
    pastiTanpaPassphraseDiLog();
  });

  it("development tanpa flag + 500 -> GAGAL", async () => {
    setEnv("development", "INTERNAL");
    m.signPdf.mockResolvedValue({ success: false, statusCode: 500 });
    const r = await jalankan();
    expect(r.success).toBeUndefined();
    pastiGagalTanpaStempel();
    expect(kategoriLog()).toEqual(["BSRE_ERROR"]);
  });

  it.each(["PUBLIC", "INTERNAL"])("mode jaringan %s tidak mengubah hasil", async (mode) => {
    setEnv("production", mode, "true");
    m.signPdf.mockResolvedValue({ success: false, statusCode: 500 });
    expect((await jalankan()).success).toBeUndefined();
    expect(m.stempel).not.toHaveBeenCalled();

    setEnv("development", mode, "true");
    expect((await jalankan()).isSimulasi).toBe(true);
  });
});

describe("signSptjmUnitAction - passphrase tidak bocor lewat teks galat BSrE", () => {
  beforeEach(() => setEnv("production", "PUBLIC"));

  it.each([
    [{ success: false, statusCode: 0, error: `passphrase ${PASS} salah` }, "PASSPHRASE_SALAH"],
    [{ success: false, statusCode: 500, error: `HTTP 500 gema ${PASS}` }, "BSRE_ERROR"],
    [{ success: false, statusCode: 422, error: `ditolak: ${PASS}` }, "BSRE_ERROR"],
  ])("%j", async (hasil, kategori) => {
    m.signPdf.mockResolvedValue(hasil);
    const r = await jalankan();
    expect(r.error).toBeTruthy();
    expect(r.error).not.toContain(PASS);
    expect(kategoriLog()).toEqual([kategori]);
    expect(JSON.stringify(m.logCreate.mock.calls)).not.toContain(PASS);
  });

  it("simulasi non-prod: log tidak memuat passphrase", async () => {
    setEnv("development", "PUBLIC", "true");
    m.signPdf.mockResolvedValue({ success: false, statusCode: 500, error: `gema ${PASS}` });
    const r = await jalankan();
    expect(r.isSimulasi).toBe(true);
    expect(JSON.stringify(m.logCreate.mock.calls)).not.toContain(PASS);
  });

  it("exception umum: log dan respons tidak memuat passphrase", async () => {
    m.signPdf.mockRejectedValue(new Error(`boom ${PASS}`));
    const r = await jalankan();
    expect(r.error).not.toContain(PASS);
    expect(JSON.stringify(m.logCreate.mock.calls)).not.toContain(PASS);
  });
});

describe("signSptjmUnitAction - kasus tambahan", () => {
  it("development + TTE_SIMULASI=true + passphrase salah -> tetap GAGAL, tanpa stempel", async () => {
    setEnv("development", "PUBLIC", "true");
    m.signPdf.mockResolvedValue({ success: false, statusCode: 0, error: "Passphrase salah" });
    const r = await jalankan();
    expect(r.success).toBeUndefined();
    pastiGagalTanpaStempel();
    expect(kategoriLog()).toEqual(["PASSPHRASE_SALAH"]);
  });

  it("production: BSrE sukses -> TERTANDATANGANI, bukan simulasi, tanpa log gagal", async () => {
    setEnv("production", "INTERNAL", "true");
    m.signPdf.mockResolvedValue({
      success: true,
      signedPdfBuffer: Buffer.from("%PDF-signed"),
      idDokumen: "BSRE-ID-1",
      signingTimeMs: 120,
    });
    const r = await jalankan();
    expect(r.success).toBe(true);
    expect(r.isSimulasi).toBeFalsy();
    expect(m.stempel).not.toHaveBeenCalled();
    expect(m.logCreate).not.toHaveBeenCalled();
    const statuses = m.dokumenUpdate.mock.calls.map((c) => c[0].data.status);
    expect(statuses).toContain("TERTANDATANGANI");
  });

  it("sertifikat SERVER_ERROR -> BSRE_ERROR, dokumenTteId null, signPdf tidak dipanggil", async () => {
    setEnv("production", "PUBLIC");
    m.checkUserStatus.mockResolvedValue({ success: false, statusCode: 502, status: "SERVER_ERROR", message: "" });
    const r = await jalankan();
    expect(r.error).toBeTruthy();
    expect(m.signPdf).not.toHaveBeenCalled();
    expect(m.logCreate.mock.calls[0][0].data.dokumenTteId).toBeNull();
    expect(kategoriLog()).toEqual(["BSRE_ERROR"]);
  });

  it("pencatatan log gagal melempar pada penolakan sertifikat -> jawaban sama, tidak melempar", async () => {
    setEnv("production", "PUBLIC");
    m.checkUserStatus.mockResolvedValue({ success: false, statusCode: 2011, status: "NOT_REGISTERED", message: "" });
    const normal = await jalankan();
    m.logCreate.mockRejectedValue(new Error("db mati"));
    const r = await jalankan();
    expect(r.error).toBe(normal.error);
  });
});

