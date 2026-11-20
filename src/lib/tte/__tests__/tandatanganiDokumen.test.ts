import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Inti penandatanganan bersama (SPTJM + dokumen lembur), dengan BSrE dan
// database dipalsukan. Yang dijaga: passphrase tidak pernah muncul di hasil,
// log, maupun galat; SETIAP kegagalan tercatat di log_gagal_tte; NIK demo
// tidak berlaku di jalur non-SPTJM.

const m = vi.hoisted(() => ({
  findUniquePegawai: vi.fn(),
  dokumenCreate: vi.fn(),
  dokumenUpdate: vi.fn(),
  logCreate: vi.fn(),
  checkUserStatus: vi.fn(),
  signPdf: vi.fn(),
  stempel: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
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
vi.mock("@/lib/tte/sptjmPdf", () => ({ terapkanStempelTteSimulasi: m.stempel }));
vi.mock("fs/promises", () => ({
  default: { writeFile: m.writeFile, mkdir: m.mkdir },
  writeFile: m.writeFile,
  mkdir: m.mkdir,
}));

import { tandatanganiDokumen, type ParamTandatangani } from "../tandatanganiDokumen";
import { sidikNik } from "@/auth/sidikNik";
import { NIK_DEMO_BSRE } from "../simulasiTte";

const NIP = "199001010000000011"; // sensitive-ok
const PASS = "RAHASIA-uji-987";
const NIK_PEGAWAI = "1234567890123456"; // sensitive-ok
const NIK_ORANG_LAIN = "6543210987654321"; // sensitive-ok
const KUNCI = "kunci-uji-sidik-nik-0123456789abcdef-xyz";
const ID_DOK = "abcdef12-0000-0000-0000-000000000000";

function param(o: Partial<ParamTandatangani> = {}): ParamTandatangani {
  return {
    user: { id: "u1", nip: NIP },
    jenisDokumen: "SURAT_TUGAS_LEMBUR",
    satuanKerja: "Biro Uji Coba",
    periodeBulan: 10,
    periodeTahun: 2026,
    nomorDokumen: "1/1000/KP.08.01/X/2026",
    judulDokumen: "Surat Tugas Lembur 2026-10-14 Biro Uji Coba",
    labelDokumen: "dokumen lembur",
    namaBerkasResmi: "Surat Tugas Lembur 2026-10-14 Biro Uji Coba.pdf",
    namaBerkasKirim: "surat_tugas_lembur.pdf",
    nik: NIK_PEGAWAI,
    passphrase: PASS,
    izinkanNikDemoBsre: false,
    buatPdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-draft")),
    pathRevalidasi: ["/kepala-tim"],
    ...o,
  };
}

function setEnv(nodeEnv: string, simulasi?: string) {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("TTE_SIMULASI", simulasi ?? "");
}

const kategoriLog = () => m.logCreate.mock.calls.map((c) => c[0].data.kategoriError);

function pastiTanpaPassphrase(hasil: unknown) {
  expect(JSON.stringify(hasil ?? null)).not.toContain(PASS);
  for (const c of m.logCreate.mock.calls) expect(JSON.stringify(c[0])).not.toContain(PASS);
  for (const c of m.dokumenCreate.mock.calls) expect(JSON.stringify(c[0])).not.toContain(PASS);
  for (const c of m.dokumenUpdate.mock.calls) expect(JSON.stringify(c[0])).not.toContain(PASS);
}

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.findUniquePegawai.mockResolvedValue({
    nama: "Kepala Tim Uji",
    nip: NIP,
    jabatan: "Ketua Tim Kerja Uji",
    sidikNik: null,
  });
  m.dokumenCreate.mockResolvedValue({ id: ID_DOK });
  m.dokumenUpdate.mockResolvedValue({});
  m.logCreate.mockResolvedValue({});
  m.checkUserStatus.mockResolvedValue({ success: true, statusCode: 1111, status: "ISSUE", message: "" });
  m.stempel.mockResolvedValue(Buffer.from("%PDF-stempel"));
  setEnv("production");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("tandatanganiDokumen - sukses", () => {
  it("BSrE menjawab: TERTANDATANGANI, hash terisi, tanpa log gagal, tanpa passphrase di mana pun", async () => {
    m.signPdf.mockResolvedValue({
      success: true,
      signedPdfBuffer: Buffer.from("%PDF-signed"),
      idDokumen: "BSRE-ID-1",
      signingTimeMs: 321,
    });
    const p = param();
    const r = await tandatanganiDokumen(p);

    expect(r.success).toBe(true);
    expect(r.isSimulasi).toBe(false);
    expect(r.idDokumenBsre).toBe("BSRE-ID-1");
    expect(r.downloadUrl).toBe(`/berkas/tte/${ID_DOK}`);
    expect(r.penandatanganNama).toBeTruthy();
    expect(m.logCreate).not.toHaveBeenCalled();

    const akhir = m.dokumenUpdate.mock.calls.at(-1)![0].data;
    expect(akhir.status).toBe("TERTANDATANGANI");
    expect(akhir.hashBerkas).toMatch(/^[0-9a-f]{64}$/);
    expect(akhir.signingTimeMs).toBe(321);

    // identitas diturunkan dari Pegawai, bukan dari parameter
    expect(m.dokumenCreate.mock.calls[0][0].data.penandatanganJabatan).toBe("Ketua Tim Kerja Uji");
    expect(m.dokumenCreate.mock.calls[0][0].data.jenisDokumen).toBe("SURAT_TUGAS_LEMBUR");
    expect(p.buatPdf).toHaveBeenCalledWith(expect.objectContaining({ nip: NIP, jabatan: "Ketua Tim Kerja Uji" }));
    expect(m.revalidatePath).toHaveBeenCalledWith("/kepala-tim");
    pastiTanpaPassphrase(r);
  });

  it("passphrase diteruskan ke BSrE hanya lewat argumen signPdf", async () => {
    m.signPdf.mockResolvedValue({ success: true, signedPdfBuffer: Buffer.from("%PDF-s"), idDokumen: "X" });
    await tandatanganiDokumen(param());
    expect(m.signPdf.mock.calls[0][0].passphrase).toBe(PASS);
    expect(m.signPdf.mock.calls[0][0].fileName).toBe("surat_tugas_lembur.pdf");
  });
});

describe("tandatanganiDokumen - kegagalan tercatat tanpa passphrase", () => {
  it("passphrase salah, BSrE menggemakan passphrase -> PASSPHRASE_SALAH, tersamar di hasil dan log", async () => {
    m.signPdf.mockResolvedValue({ success: false, statusCode: 0, error: `Passphrase ${PASS} salah` });
    const r = await tandatanganiDokumen(param());
    expect(r.error).toBeTruthy();
    expect(m.dokumenUpdate.mock.calls.map((c) => c[0].data.status)).toContain("GAGAL");
    expect(kategoriLog()).toEqual(["PASSPHRASE_SALAH"]);
    pastiTanpaPassphrase(r);
  });

  it("production + BSrE 500 -> GAGAL, BSRE_ERROR, tanpa stempel, label dokumen lembur di pesan", async () => {
    setEnv("production", "true");
    m.signPdf.mockResolvedValue({ success: false, statusCode: 500 });
    const r = await tandatanganiDokumen(param());
    expect(r.success).toBeUndefined();
    expect(m.stempel).not.toHaveBeenCalled();
    expect(kategoriLog()).toEqual(["BSRE_ERROR"]);
    expect(r.error).not.toMatch(/SPTJM/);
    pastiTanpaPassphrase(r);
  });

  it("jaringan putus -> NETWORK_TIMEOUT", async () => {
    m.signPdf.mockResolvedValue({ success: false, error: "fetch failed" });
    await tandatanganiDokumen(param());
    expect(kategoriLog()).toEqual(["NETWORK_TIMEOUT"]);
  });

  it("non-production + TTE_SIMULASI=true -> stempel simulasi dan dicatat SIMULASI_DITERAPKAN", async () => {
    setEnv("development", "true");
    m.signPdf.mockResolvedValue({ success: false, statusCode: 500 });
    const r = await tandatanganiDokumen(param());
    expect(r.success).toBe(true);
    expect(r.isSimulasi).toBe(true);
    expect(r.idDokumenBsre?.startsWith("SIMULASI-")).toBe(true);
    expect(m.stempel).toHaveBeenCalledTimes(1);
    expect(kategoriLog()).toEqual(["SIMULASI_DITERAPKAN"]);
    expect(m.dokumenUpdate.mock.calls.at(-1)![0].data.signingTimeMs).toBeNull();
    pastiTanpaPassphrase(r);
  });

  it("galat tak terduga yang memuat passphrase -> SYSTEM_EXCEPTION tersamar, tidak bocor ke layar", async () => {
    const r = await tandatanganiDokumen(
      param({ buatPdf: vi.fn().mockRejectedValue(new Error(`gagal render ${PASS}`)) }),
    );
    expect(r.error).toBeTruthy();
    expect(kategoriLog()).toEqual(["SYSTEM_EXCEPTION"]);
    expect(m.signPdf).not.toHaveBeenCalled();
    pastiTanpaPassphrase(r);
  });

  it("sertifikat belum terdaftar -> ditolak sebelum BSrE dipanggil, tercatat tanpa dokumen", async () => {
    m.checkUserStatus.mockResolvedValue({ success: false, statusCode: 2011, status: "NOT_REGISTERED", message: "" });
    const r = await tandatanganiDokumen(param());
    expect(r.error).toMatch(/belum siap/);
    expect(m.signPdf).not.toHaveBeenCalled();
    expect(m.dokumenCreate).not.toHaveBeenCalled();
    expect(kategoriLog()).toEqual(["SERTIFIKAT_BELUM_SIAP"]);
    expect(JSON.stringify(m.logCreate.mock.calls)).not.toContain(NIK_PEGAWAI);
    pastiTanpaPassphrase(r);
  });

  it("layanan BSrE mati saat pemeriksaan sertifikat -> pesan memakai label dokumen", async () => {
    m.checkUserStatus.mockResolvedValue({ success: false, statusCode: 500, status: "NETWORK_ERROR", message: "" });
    const r = await tandatanganiDokumen(param());
    expect(r.error).toMatch(/Dokumen lembur belum ditandatangani/);
    expect(kategoriLog()).toEqual(["NETWORK_TIMEOUT"]);
  });
});

describe("tandatanganiDokumen - penjagaan identitas", () => {
  it("passphrase kosong ditolak tanpa membuat dokumen", async () => {
    const r = await tandatanganiDokumen(param({ passphrase: "" }));
    expect(r.error).toMatch(/Passphrase wajib/);
    expect(m.dokumenCreate).not.toHaveBeenCalled();
  });

  it("jabatan kosong ditolak sebelum BSrE", async () => {
    m.findUniquePegawai.mockResolvedValue({ nama: "X", nip: NIP, jabatan: "  ", sidikNik: null });
    const r = await tandatanganiDokumen(param());
    expect(r.error).toMatch(/Jabatan/);
    expect(m.checkUserStatus).not.toHaveBeenCalled();
  });

  it("periode tidak sah ditolak sebelum menyentuh database", async () => {
    const r = await tandatanganiDokumen(param({ periodeBulan: 13 }));
    expect(r.error).toBe("Periode tidak sah.");
    expect(m.findUniquePegawai).not.toHaveBeenCalled();
  });

  it("NIK bukan milik pemegang sesi ditolak (sidik tidak cocok)", async () => {
    vi.stubEnv("SIDIK_NIK_SECRET", KUNCI);
    m.findUniquePegawai.mockResolvedValue({
      nama: "X",
      nip: NIP,
      jabatan: "Ketua",
      sidikNik: sidikNik(NIK_PEGAWAI, KUNCI),
    });
    const r = await tandatanganiDokumen(param({ nik: NIK_ORANG_LAIN }));
    expect(r.error).toMatch(/bukan milik akun/);
    expect(m.signPdf).not.toHaveBeenCalled();
  });

  it("NIK demo TIDAK lolos di jalur lembur walau sakelar TTE_IZINKAN_NIK_DEMO hidup", async () => {
    vi.stubEnv("SIDIK_NIK_SECRET", KUNCI);
    vi.stubEnv("TTE_IZINKAN_NIK_DEMO", "true");
    m.findUniquePegawai.mockResolvedValue({
      nama: "X",
      nip: NIP,
      jabatan: "Ketua",
      sidikNik: sidikNik(NIK_PEGAWAI, KUNCI),
    });
    const r = await tandatanganiDokumen(param({ nik: NIK_DEMO_BSRE, izinkanNikDemoBsre: false }));
    expect(r.error).toMatch(/demo BSrE/);
    expect(m.signPdf).not.toHaveBeenCalled();
  });

  it("NIK demo ditolak eksplisit walau sidikNik pegawai kosong (jembatan sidik tidak siap)", async () => {
    vi.stubEnv("SIDIK_NIK_SECRET", KUNCI);
    vi.stubEnv("TTE_IZINKAN_NIK_DEMO", "true");
    // sidikNik null dari beforeEach
    const r = await tandatanganiDokumen(param({ nik: NIK_DEMO_BSRE, izinkanNikDemoBsre: false }));
    expect(r.error).toMatch(/demo BSrE/);
    expect(m.signPdf).not.toHaveBeenCalled();
    expect(m.checkUserStatus).not.toHaveBeenCalled();
    expect(m.dokumenCreate).not.toHaveBeenCalled();
    expect(kategoriLog()).toEqual(["NIK_DEMO_DITOLAK"]);
    pastiTanpaPassphrase(r);
  });

  it("NIK demo ditolak eksplisit walau SIDIK_NIK_SECRET kosong", async () => {
    vi.stubEnv("SIDIK_NIK_SECRET", "");
    vi.stubEnv("TTE_IZINKAN_NIK_DEMO", "true");
    m.findUniquePegawai.mockResolvedValue({
      nama: "X",
      nip: NIP,
      jabatan: "Ketua",
      sidikNik: sidikNik(NIK_PEGAWAI, KUNCI),
    });
    const r = await tandatanganiDokumen(param({ nik: NIK_DEMO_BSRE, izinkanNikDemoBsre: false }));
    expect(r.error).toMatch(/demo BSrE/);
    expect(m.signPdf).not.toHaveBeenCalled();
    expect(kategoriLog()).toEqual(["NIK_DEMO_DITOLAK"]);
    pastiTanpaPassphrase(r);
  });

  it("jalur SPTJM (izinkan true) dengan sidikNik kosong tetap berjalan seperti dulu", async () => {
    vi.stubEnv("TTE_IZINKAN_NIK_DEMO", "true");
    m.signPdf.mockResolvedValue({ success: true, signedPdfBuffer: Buffer.from("%PDF-s"), idDokumen: "X" });
    const r = await tandatanganiDokumen(param({ nik: NIK_DEMO_BSRE, izinkanNikDemoBsre: true }));
    expect(r.success).toBe(true);
    expect(m.logCreate).not.toHaveBeenCalled();
  });

  it("NIK demo tetap lolos HANYA bila pemanggil (jalur SPTJM) mengizinkan", async () => {
    vi.stubEnv("SIDIK_NIK_SECRET", KUNCI);
    vi.stubEnv("TTE_IZINKAN_NIK_DEMO", "true");
    m.findUniquePegawai.mockResolvedValue({
      nama: "X",
      nip: NIP,
      jabatan: "Ketua",
      sidikNik: sidikNik(NIK_PEGAWAI, KUNCI),
    });
    m.signPdf.mockResolvedValue({ success: true, signedPdfBuffer: Buffer.from("%PDF-s"), idDokumen: "X" });
    const r = await tandatanganiDokumen(param({ nik: NIK_DEMO_BSRE, izinkanNikDemoBsre: true }));
    expect(r.success).toBe(true);
  });
});

describe("tandatanganiDokumen - batas waktu sign (jalur lembur)", () => {
  it("timeout BSrE (production): GAGAL, NETWORK_TIMEOUT tercatat, tidak ada TERTANDATANGANI, batas diteruskan", async () => {
    m.signPdf.mockResolvedValue({
      success: false,
      statusCode: 500,
      error: "Batas waktu (timeout) menunggu jawaban Esign Client BSrE terlampaui.",
    });
    const r = await tandatanganiDokumen(param({ batasWaktuSignMs: 60_000 }));
    expect(m.signPdf.mock.calls[0][0].batasWaktuMs).toBe(60_000);
    expect(r.success).toBeUndefined();
    expect(r.error).toBeTruthy();
    expect(kategoriLog()).toEqual(["NETWORK_TIMEOUT"]);
    const status = m.dokumenUpdate.mock.calls.map((c) => c[0].data.status);
    expect(status).toContain("GAGAL");
    expect(status).not.toContain("TERTANDATANGANI");
    pastiTanpaPassphrase(r);
  });

  it("tanpa batasWaktuSignMs (SPTJM): signPdf dipanggil TANPA kunci batasWaktuMs", async () => {
    m.signPdf.mockResolvedValue({ success: true, signedPdfBuffer: Buffer.from("%PDF-s"), idDokumen: "X" });
    await tandatanganiDokumen(param());
    expect(m.signPdf.mock.calls[0][0]).not.toHaveProperty("batasWaktuMs");
  });
});
